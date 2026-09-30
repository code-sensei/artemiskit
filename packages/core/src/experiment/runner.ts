import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseExperimentManifest } from './parser';
import type {
  ExperimentAttemptEvidence,
  ExperimentAttemptOutput,
  ExperimentAttemptUsage,
  ExperimentCompletionCode,
  ExperimentCoordinate,
  ExperimentCoordinateResult,
  ExperimentLiveAuthorization,
  ExperimentManifest,
  ExperimentOperationalSummary,
  ExperimentRemainingBudget,
  ExperimentRunResult,
  ExperimentSummary,
  ExperimentSummaryGroup,
  RunExperimentOptions,
} from './types';

const errorCode = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,63}$/);
const cost = z
  .object({
    amount: z.number().finite().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
const usage = z
  .object({
    requests: z.number().int().nonnegative().max(1_000_000),
    tokens: z.number().int().nonnegative().max(10_000_000_000).optional(),
    cost: cost.optional(),
  })
  .strict();
const output = z
  .object({
    status: z.enum([
      'passed',
      'task_failed',
      'policy_failed',
      'invalid',
      'incomplete',
      'infrastructure_failed',
    ]),
    usage,
    error_code: errorCode.optional(),
  })
  .strict();
const liveAuthorization = z
  .object({
    approved: z.literal(true),
    decision_id: errorCode,
    decided_at: z.string().datetime({ offset: true }),
  })
  .strict();

interface BudgetState {
  requests: number;
  tokens: number;
  cost: number;
  halted: boolean;
}

interface NormalizedOutput {
  output: ExperimentAttemptOutput;
  completionCode: ExperimentCompletionCode;
  halt: boolean;
}

/** Build the complete deterministic task × target × repetition matrix. */
export function buildExperimentMatrix(value: ExperimentManifest): ExperimentCoordinate[] {
  const manifest = parseExperimentManifest(value);
  return buildMatrix(manifest);
}

/**
 * Run an experiment through a caller-supplied adapter boundary. This function
 * never discovers providers or credentials and cannot enter live mode without
 * a positive, bounded host authorization decision.
 */
export async function runExperiment(
  value: ExperimentManifest,
  options: RunExperimentOptions
): Promise<ExperimentRunResult> {
  const manifest = parseExperimentManifest(value);
  assertExecutor(options.execute_attempt);
  const authorization =
    manifest.mode === 'live' ? parseLiveAuthorization(options.live_authorization) : undefined;

  const tasks = new Map(manifest.tasks.map((task) => [task.id, task]));
  const targets = new Map(manifest.targets.map((target) => [target.id, target]));
  const budget: BudgetState = { requests: 0, tokens: 0, cost: 0, halted: false };
  const results: ExperimentCoordinateResult[] = [];

  for (const coordinate of buildMatrix(manifest)) {
    if (coordinate.missing_capabilities.length > 0) {
      results.push({
        coordinate,
        status: 'unsupported',
        completion_code: 'capability_unsupported',
        attempts: [],
      });
      continue;
    }

    const task = tasks.get(coordinate.task_id);
    const target = targets.get(coordinate.target_id);
    if (!task || !target) throw new Error('Experiment matrix references an unknown task or target');

    if (!hasRemainingBudget(manifest, budget)) {
      results.push(incompleteWithoutAttempt(coordinate));
      continue;
    }

    const attempts: ExperimentAttemptEvidence[] = [];
    let terminalStatus: ExperimentCoordinateResult['status'] = 'incomplete';
    let completionCode: ExperimentCompletionCode = 'terminal';

    for (
      let attemptNumber = 1;
      attemptNumber <= manifest.retry_policy.max_attempts;
      attemptNumber += 1
    ) {
      if (!hasRemainingBudget(manifest, budget)) {
        terminalStatus = 'incomplete';
        completionCode = 'budget_exhausted';
        break;
      }

      const remaining = remainingBudget(manifest, budget);
      const raw = await invokeExecutor(options.execute_attempt, {
        experiment_id: manifest.id,
        coordinate,
        task,
        target,
        retry_chain_id: coordinate.coordinate_id,
        attempt_number: attemptNumber,
        remaining_budget: remaining,
      });
      const normalized = normalizeOutput(raw, manifest, remaining);
      consumeUsage(budget, normalized.output.usage);
      if (normalized.halt) budget.halted = true;

      attempts.push({
        ...normalized.output,
        attempt_id: attemptId(coordinate.coordinate_id, attemptNumber),
        retry_chain_id: coordinate.coordinate_id,
        attempt_number: attemptNumber,
      });
      terminalStatus = normalized.output.status;
      completionCode = normalized.completionCode;

      if (
        normalized.halt ||
        !isRetryable(normalized.output.status, manifest.retry_policy.retry_on) ||
        attemptNumber === manifest.retry_policy.max_attempts
      ) {
        break;
      }
    }

    results.push({ coordinate, status: terminalStatus, completion_code: completionCode, attempts });
  }

  const overall = summarize(results);
  return {
    schema_version: '1',
    experiment_id: manifest.id,
    mode: manifest.mode,
    manifest,
    identities: manifest.identities,
    live_authorization: authorization,
    complete: overall.incomplete === 0,
    results,
    summaries: {
      overall,
      targets: groupSummaries(results, (result) => result.coordinate.target_id),
      tasks: groupSummaries(results, (result) => result.coordinate.task_id),
      languages: groupSummaries(results, (result) => result.coordinate.language ?? 'und'),
      policies: groupSummaries(results, (result) => result.coordinate.policy ?? 'unclassified'),
      operational: operationalSummary(results),
    },
    uncertainty: {
      method: 'none',
      sample_size: overall.valid,
      assumptions: [
        'No statistical independence is assumed across repetitions or tasks.',
        'No confidence interval is estimated.',
      ],
      task_clustering: 'not_estimated',
    },
  };
}

function buildMatrix(manifest: ExperimentManifest): ExperimentCoordinate[] {
  const coordinates: ExperimentCoordinate[] = [];
  for (const task of manifest.tasks) {
    for (const target of manifest.targets) {
      const capabilities = new Set(target.capabilities);
      const missing = task.required_capabilities.filter(
        (capability) => !capabilities.has(capability)
      );
      for (let repetition = 1; repetition <= manifest.repetitions; repetition += 1) {
        coordinates.push({
          coordinate_id: coordinateId(manifest.id, task.id, target.id, repetition),
          task_id: task.id,
          task_kind: task.kind,
          target_id: target.id,
          repetition_index: repetition,
          language: task.language,
          policy: task.policy,
          missing_capabilities: missing,
        });
      }
    }
  }
  return coordinates;
}

function coordinateId(experimentId: string, taskId: string, targetId: string, repetition: number) {
  return createHash('sha256')
    .update(JSON.stringify([experimentId, taskId, targetId, repetition]))
    .digest('hex');
}

function attemptId(coordinate: string, attempt: number) {
  return createHash('sha256')
    .update(`${coordinate}:${String(attempt)}`)
    .digest('hex');
}

function isRetryable(
  status: ExperimentAttemptOutput['status'],
  retryOn: ExperimentManifest['retry_policy']['retry_on']
): boolean {
  return (
    (status === 'incomplete' || status === 'invalid' || status === 'infrastructure_failed') &&
    retryOn.includes(status)
  );
}

function assertExecutor(value: unknown): asserts value is RunExperimentOptions['execute_attempt'] {
  if (typeof value !== 'function')
    throw new Error('Experiment execution requires an attempt executor');
}

function parseLiveAuthorization(
  value: ExperimentLiveAuthorization | undefined
): ExperimentLiveAuthorization {
  const parsed = liveAuthorization.safeParse(value);
  if (!parsed.success) {
    throw new Error('Live experiment execution requires an approved host authorization decision');
  }
  return parsed.data;
}

async function invokeExecutor(
  execute: RunExperimentOptions['execute_attempt'],
  input: Parameters<RunExperimentOptions['execute_attempt']>[0]
): Promise<unknown> {
  try {
    return await execute(input);
  } catch {
    return {
      status: 'infrastructure_failed',
      usage: { requests: 0 },
      error_code: 'executor_error',
    };
  }
}

function normalizeOutput(
  raw: unknown,
  manifest: ExperimentManifest,
  remaining: ExperimentRemainingBudget
): NormalizedOutput {
  const parsed = output.safeParse(raw);
  if (!parsed.success) return invalidOutput('invalid_executor_result', manifest.mode === 'live');

  const result = parsed.data;
  if (
    manifest.mode === 'live' &&
    (result.usage.tokens === undefined || result.usage.cost === undefined)
  ) {
    return {
      output: { status: 'incomplete', usage: result.usage, error_code: 'usage_unreported' },
      completionCode: 'usage_unreported',
      halt: true,
    };
  }
  if (result.usage.cost && manifest.budgets.max_cost) {
    if (result.usage.cost.currency !== manifest.budgets.max_cost.currency) {
      return invalidOutput('cost_currency_mismatch', manifest.mode === 'live', {
        requests: result.usage.requests,
        tokens: result.usage.tokens,
      });
    }
  }
  if (
    result.usage.requests > remaining.requests ||
    (remaining.tokens !== undefined && (result.usage.tokens ?? 0) > remaining.tokens) ||
    (remaining.cost !== undefined && (result.usage.cost?.amount ?? 0) > remaining.cost.amount)
  ) {
    return {
      output: { status: 'incomplete', usage: result.usage, error_code: 'budget_exceeded' },
      completionCode: 'budget_exceeded',
      halt: true,
    };
  }
  return { output: result, completionCode: 'terminal', halt: false };
}

function invalidOutput(
  code: string,
  halt: boolean,
  invalidUsage: ExperimentAttemptUsage = { requests: 0 }
): NormalizedOutput {
  return {
    output: { status: 'invalid', usage: invalidUsage, error_code: code },
    completionCode: halt ? 'usage_unreported' : 'terminal',
    halt,
  };
}

function hasRemainingBudget(manifest: ExperimentManifest, used: BudgetState): boolean {
  return (
    !used.halted &&
    used.requests < manifest.budgets.max_requests &&
    (manifest.budgets.max_tokens === undefined || used.tokens < manifest.budgets.max_tokens) &&
    (manifest.budgets.max_cost === undefined || used.cost < manifest.budgets.max_cost.amount)
  );
}

function remainingBudget(
  manifest: ExperimentManifest,
  used: BudgetState
): ExperimentRemainingBudget {
  const maxCost = manifest.budgets.max_cost;
  return {
    requests: manifest.budgets.max_requests - used.requests,
    tokens:
      manifest.budgets.max_tokens === undefined
        ? undefined
        : manifest.budgets.max_tokens - used.tokens,
    cost: maxCost
      ? { amount: Math.max(0, maxCost.amount - used.cost), currency: maxCost.currency }
      : undefined,
  };
}

function consumeUsage(used: BudgetState, attemptUsage: ExperimentAttemptUsage): void {
  used.requests += attemptUsage.requests;
  used.tokens += attemptUsage.tokens ?? 0;
  used.cost += attemptUsage.cost?.amount ?? 0;
}

function incompleteWithoutAttempt(coordinate: ExperimentCoordinate): ExperimentCoordinateResult {
  return {
    coordinate,
    status: 'incomplete',
    completion_code: 'budget_exhausted',
    attempts: [],
  };
}

function emptySummary(): ExperimentSummary {
  return {
    planned: 0,
    attempted: 0,
    unattempted: 0,
    valid: 0,
    invalid: 0,
    unsupported: 0,
    incomplete: 0,
    failed: 0,
    passed: 0,
    task_failed: 0,
    policy_failed: 0,
    infrastructure_failed: 0,
  };
}

function summarize(results: ExperimentCoordinateResult[]): ExperimentSummary {
  const summary = emptySummary();
  for (const result of results) {
    summary.planned += 1;
    if (result.attempts.length > 0) summary.attempted += 1;
    else summary.unattempted += 1;
    summary[result.status] += 1;
  }
  summary.valid = summary.passed + summary.task_failed + summary.policy_failed;
  summary.failed = summary.task_failed + summary.policy_failed + summary.infrastructure_failed;
  return summary;
}

function groupSummaries(
  results: ExperimentCoordinateResult[],
  key: (result: ExperimentCoordinateResult) => string
): ExperimentSummaryGroup[] {
  const groups = new Map<string, ExperimentCoordinateResult[]>();
  for (const result of results) {
    const groupKey = key(result);
    const group = groups.get(groupKey) ?? [];
    group.push(result);
    groups.set(groupKey, group);
  }
  return [...groups].map(([groupKey, group]) => ({ key: groupKey, summary: summarize(group) }));
}

function operationalSummary(results: ExperimentCoordinateResult[]): ExperimentOperationalSummary {
  const summary: ExperimentOperationalSummary = {
    ...summarize(results),
    attempts: 0,
    retry_attempts: 0,
    requests: 0,
    tokens: 0,
    attempt_statuses: {
      passed: 0,
      task_failed: 0,
      policy_failed: 0,
      invalid: 0,
      incomplete: 0,
      infrastructure_failed: 0,
    },
  };
  let currency: string | undefined;
  let amount = 0;
  let mixedCurrency = false;
  for (const result of results) {
    summary.attempts += result.attempts.length;
    summary.retry_attempts += Math.max(0, result.attempts.length - 1);
    for (const attempt of result.attempts) {
      summary.attempt_statuses[attempt.status] += 1;
      summary.requests += attempt.usage.requests;
      summary.tokens += attempt.usage.tokens ?? 0;
      if (attempt.usage.cost) {
        currency ??= attempt.usage.cost.currency;
        mixedCurrency ||= currency !== attempt.usage.cost.currency;
        amount += attempt.usage.cost.amount;
      }
    }
  }
  if (currency && !mixedCurrency) summary.cost = { amount, currency };
  return summary;
}
