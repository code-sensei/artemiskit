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
  ExperimentTarget,
  ExperimentTask,
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
  /** Grants held by in-flight attempts, keyed by admission ticket in admission order. */
  inFlight: Map<number, ExperimentRemainingBudget>;
}

interface NormalizedOutput {
  output: ExperimentAttemptOutput;
  completionCode: ExperimentCompletionCode;
  haltReason?: ExperimentStopReason;
}

/** Budget not yet consumed and not granted to an in-flight attempt. May be negative. */
interface UncommittedBudget {
  requests: number;
  tokens?: number;
  cost?: number;
}

/** One executable coordinate moving through the admission queue. */
interface CoordinateRun {
  index: number;
  coordinate: ExperimentCoordinate;
  task: ExperimentTask;
  target: ExperimentTarget;
  attempts: ExperimentAttemptEvidence[];
}

/** Mutable scheduler state shared by admissions and settlements of one run. */
interface RunState {
  manifest: ExperimentManifest;
  execute: RunExperimentOptions['execute_attempt'];
  budget: BudgetState;
  queue: CoordinateRun[];
  results: (ExperimentCoordinateResult | undefined)[];
  nextEvent: number;
  nextTicket: number;
  stopReason?: ExperimentStopReason;
}

/** Build the complete deterministic task × target × repetition matrix. */
export function buildExperimentMatrix(value: ExperimentManifest): ExperimentCoordinate[] {
  const manifest = parseExperimentManifest(value);
  return buildMatrix(manifest);
}

/**
 * Uncertainty assumptions recorded on every result. Concurrent runs add a reproducibility
 * caveat that names the declared parallel level.
 */
export function experimentUncertaintyAssumptions(concurrency: number): string[] {
  const assumptions = [
    'No statistical independence is assumed across repetitions or tasks.',
    'No confidence interval is estimated.',
  ];
  if (concurrency > 1) {
    assumptions.push(
      `Up to ${concurrency} coordinates ran concurrently: completion order is not reproducible, results are stored in matrix order, and sampled outputs can differ from a serial run because the serving runtime may batch parallel requests, even with fixed seeds.`
    );
  }
  return assumptions;
}

/**
 * Run an experiment through a caller-supplied adapter boundary. This function
 * never discovers providers or credentials and cannot enter live mode without
 * a positive, bounded host authorization decision.
 *
 * At most `manifest.concurrency` coordinates are in flight; attempts of one coordinate stay
 * serial, and `results` keep matrix order. Budget admission rule: the uncommitted budget is
 * the declared limit minus everything consumed and minus every grant held by an in-flight
 * attempt (live requests count the larger of reported requests plus in-flight request grants
 * and one reservation per invocation). An attempt is admitted only while no halt is recorded
 * and at least one request, a positive token amount and a positive cost amount remain
 * uncommitted. It is granted an equal share of the uncommitted budget, divided by the number
 * of attempts that could start now (free slots, capped by queued coordinates), with integer
 * request and token shares rounded down to at least 1. The grant is the executor's
 * `remaining_budget`; reported use above it halts the run as `budget_exceeded`. Consumed use
 * plus outstanding grants therefore never exceed a declared budget. The rule is conservative:
 * a grant can be smaller than the budget a serial run would offer, and a share left idle by
 * one attempt returns to the pool only when that attempt settles. With concurrency 1 the
 * single grant is the whole uncommitted budget, exactly the serial behaviour.
 */
export async function runExperiment(
  value: ExperimentManifest,
  options: RunExperimentOptions
): Promise<ExperimentRunResult> {
  const manifest = parseExperimentManifest(value);
  assertExecutor(options.execute_attempt);
  const authorization =
    manifest.mode === 'live' ? parseLiveAuthorization(options.live_authorization) : undefined;

  const matrix = buildMatrix(manifest);
  const state: RunState = {
    manifest,
    execute: options.execute_attempt,
    budget: {
      executorInvocations: 0,
      reservedLiveRequests: 0,
      reportedRequests: 0,
      tokens: 0,
      cost: 0,
      inFlight: new Map(),
    },
    queue: [],
    results: new Array(matrix.length).fill(undefined),
    nextEvent: 0,
    nextTicket: 0,
  };
  enqueueCoordinates(state, matrix);
  await executeQueue(state);
  const runtimeExclusions = excludeUnadmitted(state);

  const results = state.results.map((result) => {
    if (!result) throw new Error('Experiment scheduler left a coordinate without a result');
    return result;
  });
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
    stop_reason: state.stopReason,
    runtime_exclusions: structuredClone(runtimeExclusions),
    complete: completion.valid_measurement_coverage_complete,
    results,
    summaries: {
      overall,
      targets: groupSummaries(results, (result) => result.coordinate.target_id),
      tasks: groupSummaries(results, (result) => result.coordinate.task_id),
      languages: groupSummaries(results, (result) => result.coordinate.language ?? 'und'),
      policies: groupSummaries(results, (result) => result.coordinate.policy ?? 'unclassified'),
      operational: operationalSummary(results, state.budget),
    },
    uncertainty: {
      method: 'none',
      sample_size: overall.valid,
      assumptions: experimentUncertaintyAssumptions(manifest.concurrency),
      task_clustering: 'not_estimated',
    },
  };
}

/** Resolve planned non-executions and queue executable coordinates in matrix order. */
function enqueueCoordinates(state: RunState, matrix: ExperimentCoordinate[]): void {
  const tasks = new Map(state.manifest.tasks.map((task) => [task.id, task]));
  const targets = new Map(state.manifest.targets.map((target) => [target.id, target]));
  for (const [index, coordinate] of matrix.entries()) {
    if (coordinate.declared_exclusion) {
      state.results[index] = {
        coordinate,
        status: 'excluded',
        completion_code: 'declared_exclusion',
        attempts: [],
      };
      continue;
    }
    if (coordinate.missing_capabilities.length > 0) {
      state.results[index] = {
        coordinate,
        status: 'unsupported',
        completion_code: 'capability_unsupported',
        attempts: [],
      };
      continue;
    }
    const task = tasks.get(coordinate.task_id);
    const target = targets.get(coordinate.target_id);
    if (!task || !target) throw new Error('Experiment matrix references an unknown task or target');
    state.queue.push({ index, coordinate, task, target, attempts: [] });
  }
}

/**
 * Admit queued attempts while slots and uncommitted budget allow, then wait for any
 * in-flight attempt to settle. Returns once nothing is in flight and nothing more can start.
 *
 * Slots are counted from the budget ledger, which changes exactly at admission and settlement
 * events, never from promise bookkeeping that can lag a settlement by a microtask; saved
 * admission evidence then replays to the same slot counts and grant divisors.
 */
async function executeQueue(state: RunState): Promise<void> {
  const running = new Set<Promise<void>>();
  const concurrency = state.manifest.concurrency;
  const inFlight = state.budget.inFlight;
  for (;;) {
    while (
      inFlight.size < concurrency &&
      state.queue.length > 0 &&
      admissionBlock(state.manifest, state.budget) === undefined
    ) {
      const divisor = Math.min(concurrency - inFlight.size, state.queue.length);
      const run = state.queue.shift() as CoordinateRun;
      const attempt: Promise<void> = admitAttempt(state, run, divisor).then(() => {
        running.delete(attempt);
      });
      running.add(attempt);
    }
    if (inFlight.size === 0) {
      await Promise.all(running);
      return;
    }
    await Promise.race(running);
  }
}

async function admitAttempt(state: RunState, run: CoordinateRun, divisor: number): Promise<void> {
  const { manifest, budget } = state;
  const granted = grantBudget(manifest, budget, divisor);
  const ticket = state.nextTicket++;
  budget.inFlight.set(ticket, granted);
  budget.executorInvocations += 1;
  if (manifest.mode === 'live') budget.reservedLiveRequests += 1;
  const attemptNumber = run.attempts.length + 1;
  const admittedAt = state.nextEvent++;
  const raw = await invokeExecutor(
    state.execute,
    structuredClone({
      experiment_id: manifest.id,
      coordinate: structuredClone(run.coordinate),
      task: structuredClone(run.task),
      target: structuredClone(run.target),
      retry_chain_id: run.coordinate.coordinate_id,
      attempt_number: attemptNumber,
      remaining_budget: structuredClone(granted),
    })
  );
  budget.inFlight.delete(ticket);
  const settledAt = state.nextEvent++;
  const normalized = normalizeOutput(raw, manifest, granted, run.task.kind, run.target);
  consumeUsage(budget, normalized.output.usage);
  if (normalized.haltReason) {
    budget.haltReason ??= normalized.haltReason;
    state.stopReason ??= normalized.haltReason;
  }

  run.attempts.push({
    ...normalized.output,
    attempt_id: attemptId(run.coordinate.coordinate_id, attemptNumber),
    retry_chain_id: run.coordinate.coordinate_id,
    attempt_number: attemptNumber,
    ...(manifest.concurrency > 1
      ? {
          admission: {
            admitted_at: admittedAt,
            settled_at: settledAt,
            granted_budget: grantEvidence(granted),
          },
        }
      : {}),
  });

  if (
    normalized.haltReason === undefined &&
    isRetryable(normalized.output.status, manifest.retry_policy.retry_on) &&
    attemptNumber < manifest.retry_policy.max_attempts
  ) {
    // A retry takes the next admission, so a coordinate's attempts stay close together.
    state.queue.unshift(run);
    return;
  }
  state.results[run.index] = {
    coordinate: run.coordinate,
    status: normalized.output.status,
    completion_code: normalized.completionCode,
    attempts: run.attempts,
  };
}

/** Record every coordinate still queued after execution stopped as a runtime exclusion. */
function excludeUnadmitted(state: RunState): ExperimentRunResult['runtime_exclusions'] {
  if (state.queue.length === 0) return [];
  const reason = admissionBlock(state.manifest, state.budget);
  if (!reason) throw new Error('Experiment scheduler stopped while budget remained admissible');
  state.stopReason ??= reason;
  const unadmitted = [...state.queue].sort((left, right) => left.index - right.index);
  state.queue = [];
  return unadmitted.map((run) => {
    state.results[run.index] =
      run.attempts.length > 0
        ? {
            coordinate: run.coordinate,
            status: 'incomplete',
            completion_code: 'budget_exhausted',
            attempts: run.attempts,
          }
        : incompleteWithoutAttempt(run.coordinate);
    return { coordinate_id: run.coordinate.coordinate_id, reason };
  });
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
  expectedKind: ExperimentTaskKind,
  target: ExperimentTarget
): NormalizedOutput {
  const parsed = output.safeParse(raw);
  const costApplies = targetCostApplies(target);
  if (!parsed.success || (!costApplies && parsed.data.usage.cost !== undefined)) {
    return invalidOutput(
      'invalid_executor_result',
      expectedKind,
      manifest.mode === 'live' ? 'usage_invalid' : undefined
    );
  }

  const result = parsed.data;
  if (
    manifest.mode === 'live' &&
    (result.usage.tokens === undefined || (costApplies && result.usage.cost === undefined))
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

/** Local targets that declare cost as not applicable must never report a cost. */
export function targetCostApplies(target: ExperimentTarget): boolean {
  return target.deployment?.cost_basis !== 'not_applicable';
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

/**
 * Declared budget minus consumed use and minus every in-flight grant. Grants are summed in
 * admission order so the arithmetic is reproducible from saved admission evidence.
 */
function uncommittedBudget(manifest: ExperimentManifest, used: BudgetState): UncommittedBudget {
  let grantedRequests = 0;
  let grantedTokens = 0;
  let grantedCost = 0;
  for (const grant of used.inFlight.values()) {
    grantedRequests += grant.requests;
    grantedTokens += grant.tokens ?? 0;
    grantedCost += grant.cost?.amount ?? 0;
  }
  const committedRequests =
    manifest.mode === 'live'
      ? Math.max(used.reportedRequests + grantedRequests, used.reservedLiveRequests)
      : used.reportedRequests + grantedRequests;
  const { max_tokens: maxTokens, max_cost: maxCost } = manifest.budgets;
  return {
    requests: manifest.budgets.max_requests - committedRequests,
    tokens: maxTokens === undefined ? undefined : maxTokens - used.tokens - grantedTokens,
    cost: maxCost === undefined ? undefined : maxCost.amount - used.cost - grantedCost,
  };
}

/**
 * Why no new attempt may start now, if anything blocks it. With nothing in flight this is
 * the run's budget stop reason; otherwise a budget block only means waiting for settlements.
 */
function admissionBlock(
  manifest: ExperimentManifest,
  used: BudgetState
): ExperimentStopReason | undefined {
  if (used.haltReason) return used.haltReason;
  const uncommitted = uncommittedBudget(manifest, used);
  if (uncommitted.requests < 1) return 'request_budget_exhausted';
  if (uncommitted.tokens !== undefined && uncommitted.tokens <= 0) return 'token_budget_exhausted';
  if (uncommitted.cost !== undefined && uncommitted.cost <= 0) return 'cost_budget_exhausted';
  return undefined;
}

/** Equal share of the uncommitted budget for one of `divisor` attempts that could start now. */
function grantBudget(
  manifest: ExperimentManifest,
  used: BudgetState,
  divisor: number
): ExperimentRemainingBudget {
  const uncommitted = uncommittedBudget(manifest, used);
  const maxCost = manifest.budgets.max_cost;
  return {
    requests: Math.max(1, Math.floor(uncommitted.requests / divisor)),
    tokens:
      uncommitted.tokens === undefined
        ? undefined
        : Math.max(1, Math.floor(uncommitted.tokens / divisor)),
    cost:
      maxCost && uncommitted.cost !== undefined
        ? { amount: uncommitted.cost / divisor, currency: maxCost.currency }
        : undefined,
  };
}

/** The grant as saved evidence, without absent optional dimensions. */
function grantEvidence(granted: ExperimentRemainingBudget): ExperimentRemainingBudget {
  return {
    requests: granted.requests,
    ...(granted.tokens === undefined ? {} : { tokens: granted.tokens }),
    ...(granted.cost === undefined ? {} : { cost: { ...granted.cost } }),
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
