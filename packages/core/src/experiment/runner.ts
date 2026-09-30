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
  ExperimentStopReason,
  ExperimentSummary,
  ExperimentSummaryGroup,
  ExperimentTaskKind,
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
const contentIdentity = z
  .object({
    schema_version: z.literal('1'),
    algorithm: z.literal('sha256'),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const taskEvidence = z.union([
  z
    .object({
      kind: z.literal('scenario_evaluation'),
      availability: z.literal('available'),
      artifact: contentIdentity,
    })
    .strict(),
  z
    .object({
      kind: z.literal('scenario_evaluation'),
      availability: z.literal('unavailable'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('agent_workflow'),
      availability: z.literal('available'),
      artifact: contentIdentity,
    })
    .strict(),
  z
    .object({
      kind: z.literal('agent_workflow'),
      availability: z.literal('unavailable'),
    })
    .strict(),
]);
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
    evidence: taskEvidence,
    error_code: errorCode.optional(),
  })
  .strict();
const liveAuthorization = z
  .object({
    approved: z.literal(true),
    decision_id: errorCode,
    decided_at: z.string().datetime({ offset: true }),
    approved_by: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(1).max(256),
  })
  .strict();

interface BudgetState {
  executorInvocations: number;
  reservedLiveRequests: number;
  reportedRequests: number;
  tokens: number;
  cost: number;
  haltReason?: ExperimentStopReason;
}

interface NormalizedOutput {
  output: ExperimentAttemptOutput;
  completionCode: ExperimentCompletionCode;
  haltReason?: ExperimentStopReason;
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
  const budget: BudgetState = {
    executorInvocations: 0,
    reservedLiveRequests: 0,
    reportedRequests: 0,
    tokens: 0,
    cost: 0,
  };
  const results: ExperimentCoordinateResult[] = [];
  const runtimeExclusions: ExperimentRunResult['runtime_exclusions'] = [];
  let runStopReason: ExperimentStopReason | undefined;

  for (const coordinate of buildMatrix(manifest)) {
    if (coordinate.declared_exclusion) {
      results.push({
        coordinate,
        status: 'excluded',
        completion_code: 'declared_exclusion',
        attempts: [],
      });
      continue;
    }
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

    const initialStopReason = budgetStopReason(manifest, budget);
    if (initialStopReason) {
      results.push(incompleteWithoutAttempt(coordinate));
      runtimeExclusions.push({
        coordinate_id: coordinate.coordinate_id,
        reason: initialStopReason,
      });
      runStopReason ??= initialStopReason;
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
      const retryStopReason = budgetStopReason(manifest, budget);
      if (retryStopReason) {
        terminalStatus = 'incomplete';
        completionCode = 'budget_exhausted';
        runtimeExclusions.push({
          coordinate_id: coordinate.coordinate_id,
          reason: retryStopReason,
        });
        runStopReason ??= retryStopReason;
        break;
      }

      const remaining = remainingBudget(manifest, budget);
      budget.executorInvocations += 1;
      if (manifest.mode === 'live') budget.reservedLiveRequests += 1;
      const raw = await invokeExecutor(
        options.execute_attempt,
        structuredClone({
          experiment_id: manifest.id,
          coordinate: structuredClone(coordinate),
          task: structuredClone(task),
          target: structuredClone(target),
          retry_chain_id: coordinate.coordinate_id,
          attempt_number: attemptNumber,
          remaining_budget: structuredClone(remaining),
        })
      );
      const normalized = normalizeOutput(raw, manifest, remaining, task.kind);
      consumeUsage(budget, normalized.output.usage);
      if (normalized.haltReason) {
        budget.haltReason = normalized.haltReason;
        runStopReason ??= normalized.haltReason;
      }

      attempts.push({
        ...normalized.output,
        attempt_id: attemptId(coordinate.coordinate_id, attemptNumber),
        retry_chain_id: coordinate.coordinate_id,
        attempt_number: attemptNumber,
      });
      terminalStatus = normalized.output.status;
      completionCode = normalized.completionCode;

      if (
        normalized.haltReason !== undefined ||
        !isRetryable(normalized.output.status, manifest.retry_policy.retry_on) ||
        attemptNumber === manifest.retry_policy.max_attempts
      ) {
        break;
      }
    }

    results.push({ coordinate, status: terminalStatus, completion_code: completionCode, attempts });
  }

  const overall = summarize(results);
  const completion = {
    matrix_complete:
      results.length === manifest.tasks.length * manifest.targets.length * manifest.repetitions,
    execution_complete: overall.incomplete === 0,
    valid_measurement_coverage_complete: overall.valid === overall.planned,
  };
  return {
    schema_version: '1',
    experiment_id: manifest.id,
    mode: manifest.mode,
    manifest: structuredClone(manifest),
    identities: structuredClone(manifest.identities),
    live_authorization: authorization ? structuredClone(authorization) : undefined,
    completion,
    stop_reason: runStopReason,
    runtime_exclusions: structuredClone(runtimeExclusions),
    complete: completion.valid_measurement_coverage_complete,
    results,
    summaries: {
      overall,
      targets: groupSummaries(results, (result) => result.coordinate.target_id),
      tasks: groupSummaries(results, (result) => result.coordinate.task_id),
      languages: groupSummaries(results, (result) => result.coordinate.language ?? 'und'),
      policies: groupSummaries(results, (result) => result.coordinate.policy ?? 'unclassified'),
      operational: operationalSummary(results, budget),
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
      if (manifest.seed?.require_support && !capabilities.has('seed')) missing.push('seed');
      const declaredExclusion = manifest.exclusions.find(
        (item) =>
          (item.task_id === undefined || item.task_id === task.id) &&
          (item.target_id === undefined || item.target_id === target.id)
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
          seed:
            manifest.seed === undefined
              ? undefined
              : manifest.seed.strategy === 'fixed'
                ? manifest.seed.value
                : manifest.seed.value + repetition - 1,
          missing_capabilities: [...missing],
          declared_exclusion: declaredExclusion ? structuredClone(declaredExclusion) : undefined,
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
      evidence: { kind: input.task.kind, availability: 'unavailable' },
      error_code: 'executor_error',
    };
  }
}

function normalizeOutput(
  raw: unknown,
  manifest: ExperimentManifest,
  remaining: ExperimentRemainingBudget,
  expectedKind: ExperimentTaskKind
): NormalizedOutput {
  const parsed = output.safeParse(raw);
  if (!parsed.success) {
    return invalidOutput(
      'invalid_executor_result',
      expectedKind,
      manifest.mode === 'live' ? 'usage_invalid' : undefined
    );
  }

  const result = parsed.data;
  if (result.evidence.kind !== expectedKind) {
    return invalidOutput('evidence_kind_mismatch', expectedKind, undefined, result.usage);
  }
  if (
    (result.status === 'passed' ||
      result.status === 'task_failed' ||
      result.status === 'policy_failed') &&
    result.evidence.availability !== 'available'
  ) {
    return invalidOutput('evidence_unavailable', expectedKind, undefined, result.usage);
  }
  if (
    manifest.mode === 'live' &&
    (result.usage.tokens === undefined || result.usage.cost === undefined)
  ) {
    return {
      output: {
        status: 'incomplete',
        usage: result.usage,
        evidence: result.evidence,
        error_code: 'usage_unreported',
      },
      completionCode: 'usage_unreported',
      haltReason: 'usage_unreported',
    };
  }
  if (result.usage.cost && manifest.budgets.max_cost) {
    if (result.usage.cost.currency !== manifest.budgets.max_cost.currency) {
      return invalidOutput(
        'cost_currency_mismatch',
        expectedKind,
        manifest.mode === 'live' ? 'usage_invalid' : undefined,
        {
          requests: result.usage.requests,
          tokens: result.usage.tokens,
        }
      );
    }
  }
  if (
    result.usage.requests > remaining.requests ||
    (remaining.tokens !== undefined && (result.usage.tokens ?? 0) > remaining.tokens) ||
    (remaining.cost !== undefined && (result.usage.cost?.amount ?? 0) > remaining.cost.amount)
  ) {
    return {
      output: {
        status: 'incomplete',
        usage: result.usage,
        evidence: result.evidence,
        error_code: 'budget_exceeded',
      },
      completionCode: 'budget_exceeded',
      haltReason: 'budget_exceeded',
    };
  }
  return { output: result, completionCode: 'terminal' };
}

function invalidOutput(
  code: string,
  expectedKind: ExperimentTaskKind,
  haltReason?: ExperimentStopReason,
  invalidUsage: ExperimentAttemptUsage = { requests: 0 }
): NormalizedOutput {
  return {
    output: {
      status: 'invalid',
      usage: invalidUsage,
      evidence: { kind: expectedKind, availability: 'unavailable' },
      error_code: code,
    },
    completionCode: haltReason === 'usage_invalid' ? 'usage_invalid' : 'terminal',
    haltReason,
  };
}

function effectiveRequests(manifest: ExperimentManifest, used: BudgetState): number {
  return manifest.mode === 'live'
    ? Math.max(used.reportedRequests, used.reservedLiveRequests)
    : used.reportedRequests;
}

function budgetStopReason(
  manifest: ExperimentManifest,
  used: BudgetState
): ExperimentStopReason | undefined {
  if (used.haltReason) return used.haltReason;
  if (effectiveRequests(manifest, used) >= manifest.budgets.max_requests) {
    return 'request_budget_exhausted';
  }
  if (manifest.budgets.max_tokens !== undefined && used.tokens >= manifest.budgets.max_tokens) {
    return 'token_budget_exhausted';
  }
  if (manifest.budgets.max_cost !== undefined && used.cost >= manifest.budgets.max_cost.amount) {
    return 'cost_budget_exhausted';
  }
  return undefined;
}

function remainingBudget(
  manifest: ExperimentManifest,
  used: BudgetState
): ExperimentRemainingBudget {
  const maxCost = manifest.budgets.max_cost;
  return {
    requests: Math.max(0, manifest.budgets.max_requests - effectiveRequests(manifest, used)),
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
  used.reportedRequests += attemptUsage.requests;
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
    excluded: 0,
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

function operationalSummary(
  results: ExperimentCoordinateResult[],
  budget: BudgetState
): ExperimentOperationalSummary {
  const summary: ExperimentOperationalSummary = {
    ...summarize(results),
    executor_invocations: budget.executorInvocations,
    reserved_live_requests: budget.reservedLiveRequests,
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
