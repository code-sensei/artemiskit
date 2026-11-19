import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  type ExperimentAttemptDemand,
  type ExperimentAttemptEvidence,
  type ExperimentAttemptStatus,
  type ExperimentCompletionCode,
  type ExperimentCoordinate,
  type ExperimentCoordinateResult,
  type ExperimentCostLimit,
  type ExperimentManifest,
  type ExperimentRemainingBudget,
  type ExperimentRunResult,
  type ExperimentStopReason,
  type ExperimentSummary,
  type ExperimentSummaryGroup,
  type ExperimentTarget,
  type ExperimentTaskKind,
  buildExperimentMatrix,
  experimentUncertaintyAssumptions,
  parseExperimentManifest,
  targetCostApplies,
} from '@artemiskit/core';
import type {
  ExperimentReport,
  ExperimentReportEvidence,
  ExperimentReportFinding,
  ExperimentReportSection,
  ExperimentReportSummary,
} from './types';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 48;
const MAX_NODES = 150_000;
const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const invalid = () => new Error('Invalid, unsupported or ambiguous experiment report evidence');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

const same = (left: unknown, right: unknown) => canonical(left) === canonical(right);
const digest = (value: unknown) => hash(canonical(value));

interface InspectionState {
  nodes: number;
  bytes: number;
}

function inspectAndClone(value: unknown, state: InspectionState, depth = 0): unknown {
  if (depth > MAX_DEPTH || ++state.nodes > MAX_NODES) throw invalid();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    state.bytes += Buffer.byteLength(value);
    if (state.bytes > MAX_BYTES) throw invalid();
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalid();
    return value;
  }
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || types.isProxy(value)) throw invalid();

  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length
    )
      throw invalid();
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== value.length + 1 || value.length > MAX_NODES) throw invalid();
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw invalid();
      const cloned = inspectAndClone(descriptor.value, state, depth + 1);
      if (cloned === undefined) throw invalid();
      result.push(cloned);
    }
    return result;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') throw invalid();
    state.bytes += Buffer.byteLength(key);
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw invalid();
    if (state.bytes > MAX_BYTES) throw invalid();
    result[key] = inspectAndClone(descriptor.value, state, depth + 1);
  }
  return result;
}

function inputObject(input: unknown): Record<string, unknown> {
  let value = input;
  if (typeof input === 'string') {
    if (Buffer.byteLength(input) > MAX_BYTES) throw invalid();
    value = JSON.parse(input);
  }
  const clone = inspectAndClone(value, { nodes: 0, bytes: 0 });
  return object(clone);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalid();
  return value;
}

function keys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): void {
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !actual.includes(key)) || actual.some((key) => !allowed.has(key))) {
    throw invalid();
  }
}

function text(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || (pattern && !pattern.test(value))) throw invalid();
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw invalid();
  return value;
}

function datetime(value: unknown): string {
  const candidate = text(value);
  const match =
    /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d+))?(?:Z|[+-]\d\d(?::?\d\d))$/.exec(
      candidate
    );
  if (!match) throw invalid();
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const days =
    month === 2
      ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 29
        : 28
      : [4, 6, 9, 11].includes(month)
        ? 30
        : 31;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days ||
    Number(hourText) > 23 ||
    Number(minuteText) > 59 ||
    Number(secondText) > 59
  )
    throw invalid();
  return candidate;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalid();
  return value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw invalid();
  return value as T;
}

function contentIdentity(value: unknown): void {
  const identity = object(value);
  keys(identity, ['schema_version', 'algorithm', 'digest']);
  if (identity.schema_version !== '1' || identity.algorithm !== 'sha256') throw invalid();
  text(identity.digest, DIGEST);
}

const STATUSES = [
  'passed',
  'task_failed',
  'policy_failed',
  'invalid',
  'incomplete',
  'infrastructure_failed',
  'unsupported',
  'excluded',
] as const;
const EXECUTED = STATUSES.slice(0, 6) as readonly Exclude<
  ExperimentAttemptStatus,
  'unsupported' | 'excluded'
>[];
const COMPLETION_CODES = [
  'terminal',
  'capability_unsupported',
  'declared_exclusion',
  'budget_exhausted',
  'usage_unreported',
  'usage_invalid',
  'budget_exceeded',
] as const;
const STOP_REASONS = [
  'request_budget_exhausted',
  'token_budget_exhausted',
  'cost_budget_exhausted',
  'usage_unreported',
  'usage_invalid',
  'budget_exceeded',
] as const;

function costValue(value: unknown): void {
  const cost = object(value);
  keys(cost, ['amount', 'currency']);
  if (typeof cost.amount !== 'number' || !Number.isFinite(cost.amount) || cost.amount < 0)
    throw invalid();
  text(cost.currency, /^[A-Z]{3}$/);
}

/** Shape of saved admission evidence; its values are checked by the budget replay. */
function validateAdmission(value: unknown): void {
  const admission = object(value);
  keys(admission, ['admitted_at', 'settled_at', 'granted_budget']);
  integer(admission.admitted_at);
  integer(admission.settled_at);
  const granted = object(admission.granted_budget);
  keys(granted, ['requests'], ['tokens', 'cost']);
  integer(granted.requests);
  if (granted.tokens !== undefined) integer(granted.tokens);
  if (granted.cost !== undefined) costValue(granted.cost);
}

function validateAttempt(value: unknown, concurrent: boolean) {
  const attempt = object(value);
  keys(
    attempt,
    ['status', 'usage', 'evidence', 'attempt_id', 'retry_chain_id', 'attempt_number'],
    ['error_code', 'admission']
  );
  // Concurrent results carry admission evidence on every attempt; serial results never do.
  if (concurrent) validateAdmission(attempt.admission);
  else if (attempt.admission !== undefined) throw invalid();
  oneOf(attempt.status, EXECUTED);
  text(attempt.attempt_id, DIGEST);
  text(attempt.retry_chain_id, DIGEST);
  integer(attempt.attempt_number);
  if (attempt.error_code !== undefined) text(attempt.error_code, IDENTIFIER);

  const usage = object(attempt.usage);
  keys(usage, ['requests'], ['tokens', 'cost']);
  if (integer(usage.requests) > 1_000_000) throw invalid();
  if (usage.tokens !== undefined && integer(usage.tokens) > 10_000_000_000) throw invalid();
  if (usage.cost !== undefined) costValue(usage.cost);

  const evidence = object(attempt.evidence);
  keys(evidence, ['kind', 'availability'], ['artifact']);
  oneOf(evidence.kind, ['scenario_evaluation', 'agent_workflow'] as const);
  oneOf(evidence.availability, ['available', 'unavailable'] as const);
  if (evidence.availability === 'available') {
    if (evidence.artifact === undefined) throw invalid();
    contentIdentity(evidence.artifact);
  } else if (evidence.artifact !== undefined) throw invalid();
  if (
    ['passed', 'task_failed', 'policy_failed'].includes(attempt.status as string) &&
    evidence.availability !== 'available'
  )
    throw invalid();
  return attempt as unknown as ExperimentAttemptEvidence;
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
    if (result.attempts.length) summary.attempted += 1;
    else summary.unattempted += 1;
    summary[result.status] += 1;
  }
  summary.valid = summary.passed + summary.task_failed + summary.policy_failed;
  summary.failed = summary.task_failed + summary.policy_failed + summary.infrastructure_failed;
  return summary;
}

function grouped(
  results: ExperimentCoordinateResult[],
  getKey: (result: ExperimentCoordinateResult) => string
): ExperimentSummaryGroup[] {
  const groups = new Map<string, ExperimentCoordinateResult[]>();
  for (const result of results) {
    const key = getKey(result);
    const values = groups.get(key) ?? [];
    values.push(result);
    groups.set(key, values);
  }
  return [...groups].map(([key, values]) => ({ key, summary: summarize(values) }));
}

const EVIDENCE_NORMALIZATION_CODES = ['evidence_kind_mismatch', 'evidence_unavailable'];

/**
 * Return the completion codes the core runner could have assigned to a saved attempt.
 *
 * Mirrors core's normalization precedence: malformed executor output, missing live usage,
 * evidence kind, evidence availability, cost currency, then budget overrun. Each earlier step
 * keeps the usage it received, so a later condition (a foreign currency or an overrun) can
 * legitimately remain in its evidence. An empty set means no core path produces the attempt.
 */
function coreCompletions(
  attempt: ExperimentAttemptEvidence,
  manifest: ExperimentManifest,
  expectedKind: ExperimentTaskKind,
  exceeded: boolean,
  costApplies: boolean
): Set<ExperimentCompletionCode> {
  const { status, usage, evidence, error_code: errorCode } = attempt;
  const isLive = manifest.mode === 'live';
  const maxCost = manifest.budgets.max_cost;
  // Core rejects any cost reported by a target that declared cost as not applicable.
  if (!costApplies && usage.cost !== undefined) return new Set();
  const usageComplete = usage.tokens !== undefined && (!costApplies || usage.cost !== undefined);
  const runnerInvalidCompletion = isLive ? 'usage_invalid' : 'terminal';
  const completions = new Set<ExperimentCompletionCode>();

  if (
    status === 'invalid' &&
    evidence.kind === expectedKind &&
    evidence.availability === 'unavailable'
  ) {
    if (
      errorCode === 'invalid_executor_result' &&
      usage.requests === 0 &&
      usage.tokens === undefined &&
      usage.cost === undefined
    )
      completions.add(runnerInvalidCompletion);
    if (EVIDENCE_NORMALIZATION_CODES.includes(errorCode ?? '') && (!isLive || usageComplete))
      completions.add('terminal');
    if (
      errorCode === 'cost_currency_mismatch' &&
      maxCost !== undefined &&
      usage.cost === undefined &&
      (!isLive || usage.tokens !== undefined)
    )
      completions.add(runnerInvalidCompletion);
  }
  if (isLive && !usageComplete) {
    if (status === 'incomplete' && errorCode === 'usage_unreported')
      completions.add('usage_unreported');
    return completions;
  }

  // Executor output that reached the budget check unchanged.
  const currencyMatches =
    usage.cost === undefined || maxCost === undefined || usage.cost.currency === maxCost.currency;
  if (!currencyMatches || evidence.kind !== expectedKind) return completions;
  if (!exceeded) completions.add('terminal');
  else if (status === 'incomplete' && errorCode === 'budget_exceeded')
    completions.add('budget_exceeded');
  return completions;
}

function costStatus(
  manifest: ExperimentManifest,
  reported: boolean
): ExperimentReportSummary['costStatus'] {
  if (reported) return 'reported';
  return manifest.targets.every((target) => !targetCostApplies(target))
    ? 'not_applicable'
    : 'unavailable';
}

function weightsLabel(target: ExperimentTarget): string {
  if (!target.weights) return 'undeclared';
  const kind = target.weights.availability === 'open' ? 'open weights' : 'closed weights';
  return target.weights.license ? `${kind} (${target.weights.license})` : kind;
}

function deploymentLabel(target: ExperimentTarget): string {
  const deployment = target.deployment;
  if (!deployment) return 'undeclared';
  const place = deployment.locality === 'local' ? 'local' : 'remote';
  const runtime = deployment.runtime ? `${place} via ${deployment.runtime}` : place;
  return deployment.cost_basis === 'not_applicable'
    ? `${runtime}; cost not applicable (no metered spend)`
    : `${runtime}; metered cost`;
}

/** Target settings that change what each target request carries, in display order. */
const GENERATION_LABEL_KEYS = [
  'temperature',
  'top_p',
  'presence_penalty',
  'max_output_tokens',
  'reasoning_effort',
] as const;

/** Declared generation settings and the seed every request to this target carries. */
function generationLabel(target: ExperimentTarget, manifest: ExperimentManifest): string {
  const declared = GENERATION_LABEL_KEYS.filter((key) => target.settings?.[key] !== undefined).map(
    (key) => `${key} ${target.settings?.[key]}`
  );
  return [declared.length > 0 ? declared.join('; ') : 'task values', seedLabel(manifest)].join(
    '; '
  );
}

function seedLabel(manifest: ExperimentManifest): string {
  const seed = manifest.seed;
  if (!seed) return 'no seed';
  if (seed.strategy === 'fixed' || manifest.repetitions === 1) return `seed ${seed.value}`;
  return `seeds ${seed.value}-${seed.value + manifest.repetitions - 1} by repetition`;
}

function targetById(manifest: ExperimentManifest, id: string): ExperimentTarget {
  const target = manifest.targets.find((item) => item.id === id);
  if (!target) throw invalid();
  return target;
}

/** An admission grant as replayed; `cost` is the amount in the manifest's cost currency. */
interface ReplayedGrant {
  requests: number;
  tokens?: number;
  cost?: number;
}

interface BudgetState {
  invocations: number;
  reserved: number;
  requests: number;
  tokens: number;
  /** Consumed cost amount, summed in settlement order as the runner's ledger sums it. */
  cost: number;
  /** Consumed cost in micro-units, each amount rounded up, as core's concurrent ledger. */
  costMicro: number;
  halt?: ExperimentStopReason;
  /** Grants of in-flight attempts keyed by admission ticket, in admission order. */
  inFlight: Map<number, ReplayedGrant>;
  peak: number;
}

/** One executable coordinate moving through the replayed admission queue. */
interface CoordinateReplay {
  index: number;
  coordinate: ExperimentCoordinate;
  status: ExperimentAttemptStatus;
  completionCode: ExperimentCompletionCode;
  attempts: ExperimentAttemptEvidence[];
  costApplies: boolean;
  /** Recorded demand of the coordinate's task × target pair (concurrent results only). */
  demand?: ExperimentAttemptDemand;
  /** Index of the next attempt to admit. */
  next: number;
}

type ReplayDecision = { kind: 'admit'; grant: ReplayedGrant } | { kind: 'wait' } | { kind: 'skip' };

const MICRO = 1_000_000;
const ceilMicro = (amount: number) => (amount <= 0 ? 0 : Math.floor(amount * MICRO) + 1);
const floorMicro = (amount: number) => Math.floor(amount * MICRO) - 1;

/**
 * Mirrors core's admission ledger: declared limits minus consumed use and minus every
 * in-flight grant, summed in admission order. Live requests take the larger of reported
 * requests plus request grants and one reservation per invocation.
 */
function uncommitted(manifest: ExperimentManifest, state: BudgetState): ReplayedGrant {
  let grantedRequests = 0;
  let grantedTokens = 0;
  let grantedCost = 0;
  for (const grant of state.inFlight.values()) {
    grantedRequests += grant.requests;
    grantedTokens += grant.tokens ?? 0;
    grantedCost += grant.cost ?? 0;
  }
  const committedRequests =
    manifest.mode === 'live'
      ? Math.max(state.requests + grantedRequests, state.reserved)
      : state.requests + grantedRequests;
  const { max_tokens: maxTokens, max_cost: maxCost } = manifest.budgets;
  return {
    requests: manifest.budgets.max_requests - committedRequests,
    tokens: maxTokens === undefined ? undefined : maxTokens - state.tokens - grantedTokens,
    cost: maxCost === undefined ? undefined : maxCost.amount - state.cost - grantedCost,
  };
}

function budgetReason(manifest: ExperimentManifest, state: BudgetState) {
  if (state.halt) return state.halt;
  const available = uncommitted(manifest, state);
  if (available.requests < 1) return 'request_budget_exhausted' as const;
  if (available.tokens !== undefined && available.tokens <= 0)
    return 'token_budget_exhausted' as const;
  if (available.cost !== undefined && available.cost <= 0) return 'cost_budget_exhausted' as const;
  const maxCost = manifest.budgets.max_cost;
  if (manifest.concurrency > 1 && maxCost && state.costMicro >= floorMicro(maxCost.amount))
    return 'cost_budget_exhausted' as const;
  return undefined;
}

/** Core's grant of the whole uncommitted budget (cost from micro-units when concurrent). */
function serialGrant(manifest: ExperimentManifest, state: BudgetState): ReplayedGrant {
  const available = uncommitted(manifest, state);
  const maxCost = manifest.budgets.max_cost;
  return {
    requests: available.requests,
    tokens: available.tokens,
    cost:
      maxCost && manifest.concurrency > 1
        ? (floorMicro(maxCost.amount) - state.costMicro) / MICRO
        : available.cost,
  };
}

function demandFits(
  manifest: ExperimentManifest,
  state: BudgetState,
  demand: ExperimentAttemptDemand
): boolean {
  let grantedRequests = 0;
  let grantedTokens = 0;
  let grantedCostMicro = 0;
  for (const grant of state.inFlight.values()) {
    grantedRequests += grant.requests;
    grantedTokens += grant.tokens ?? 0;
    grantedCostMicro += ceilMicro(grant.cost ?? 0);
  }
  const requests = state.requests + grantedRequests + demand.requests;
  const committedRequests =
    manifest.mode === 'live' ? Math.max(requests, state.reserved + 1) : requests;
  if (committedRequests > manifest.budgets.max_requests) return false;
  const { max_tokens: maxTokens, max_cost: maxCost } = manifest.budgets;
  if (maxTokens !== undefined && state.tokens + grantedTokens + (demand.tokens ?? 0) > maxTokens)
    return false;
  return (
    maxCost === undefined ||
    state.costMicro + grantedCostMicro + ceilMicro(demand.cost?.amount ?? 0) <=
      floorMicro(maxCost.amount)
  );
}

/** Core's admission decision for the queue head; see `runExperiment` in core. */
function admissionDecision(
  manifest: ExperimentManifest,
  state: BudgetState,
  demand: ExperimentAttemptDemand | undefined
): ReplayDecision {
  if (manifest.concurrency > 1 && demand) {
    if (demandFits(manifest, state, demand))
      return {
        kind: 'admit',
        grant: { requests: demand.requests, tokens: demand.tokens, cost: demand.cost?.amount },
      };
    if (state.inFlight.size > 0) return { kind: 'wait' };
    if (demand.requests > uncommitted(manifest, state).requests) return { kind: 'skip' };
  } else if (state.inFlight.size > 0) {
    return { kind: 'wait' };
  }
  return { kind: 'admit', grant: serialGrant(manifest, state) };
}

function grantEvidence(
  manifest: ExperimentManifest,
  grant: ReplayedGrant
): ExperimentRemainingBudget {
  const maxCost = manifest.budgets.max_cost;
  return {
    requests: grant.requests,
    ...(grant.tokens === undefined ? {} : { tokens: grant.tokens }),
    ...(grant.cost === undefined || !maxCost
      ? {}
      : { cost: { amount: grant.cost, currency: maxCost.currency } }),
  };
}

function consume(state: BudgetState, attempt: ExperimentAttemptEvidence): void {
  state.requests += attempt.usage.requests;
  state.tokens += attempt.usage.tokens ?? 0;
  state.cost += attempt.usage.cost?.amount ?? 0;
  state.costMicro += ceilMicro(attempt.usage.cost?.amount ?? 0);
}

/**
 * Reported cost total in matrix order, as core's operational summary computes it. It can
 * differ in the last floating-point digits from the settlement-order budget ledger.
 */
function reportedCost(results: ExperimentCoordinateResult[]): ExperimentCostLimit | undefined {
  let currency: string | undefined;
  let amount = 0;
  let mixed = false;
  for (const attempt of results.flatMap((result) => result.attempts)) {
    if (!attempt.usage.cost) continue;
    currency ??= attempt.usage.cost.currency;
    mixed ||= currency !== attempt.usage.cost.currency;
    amount += attempt.usage.cost.amount;
  }
  return currency && !mixed ? { amount, currency } : undefined;
}

/** Validate the recorded per-pair reservations of a concurrent result and attach demands. */
function validateExecution(
  value: unknown,
  manifest: ExperimentManifest,
  executable: CoordinateReplay[]
): number {
  const execution = object(value);
  keys(execution, ['peak_in_flight', 'reservations']);
  const peak = integer(execution.peak_in_flight);
  const reservations = array(execution.reservations);
  const pairs = new Map<string, CoordinateReplay[]>();
  for (const replay of executable) {
    const key = JSON.stringify([replay.coordinate.task_id, replay.coordinate.target_id]);
    pairs.set(key, [...(pairs.get(key) ?? []), replay]);
  }
  if (reservations.length !== pairs.size) throw invalid();
  const { max_tokens: maxTokens, max_cost: maxCost } = manifest.budgets;
  [...pairs.values()].forEach((replays, position) => {
    const reservation = object(reservations[position]);
    keys(reservation, ['task_id', 'target_id'], ['demand']);
    const first = replays[0] as CoordinateReplay;
    if (
      reservation.task_id !== first.coordinate.task_id ||
      reservation.target_id !== first.coordinate.target_id
    )
      throw invalid();
    if (reservation.demand === undefined) return;
    const demand = object(reservation.demand);
    keys(demand, ['requests'], ['tokens', 'cost']);
    const requests = integer(demand.requests);
    if (requests < 1 || requests > 1_000_000) throw invalid();
    if ((maxTokens === undefined) !== (demand.tokens === undefined)) throw invalid();
    if (demand.tokens !== undefined) {
      const tokens = integer(demand.tokens);
      if (tokens < 1 || tokens > 10_000_000_000) throw invalid();
    }
    if ((maxCost === undefined) !== (demand.cost === undefined)) throw invalid();
    if (demand.cost !== undefined) {
      costValue(demand.cost);
      const cost = demand.cost as ExperimentCostLimit;
      if (cost.currency !== maxCost?.currency || (!first.costApplies && cost.amount !== 0))
        throw invalid();
    }
    for (const replay of replays) replay.demand = demand as unknown as ExperimentAttemptDemand;
  });
  return peak;
}

/**
 * Re-run core's scheduler against saved evidence. The only input taken from the evidence is
 * which in-flight attempt settled next (forced for serial results); every admission, skip,
 * grant and exclusion is predicted and must match the record exactly. A concurrent result's
 * admission and settlement positions must therefore be the run-wide event sequence the
 * greedy runner produces, never merely a permitted one. Returns runtime exclusions in matrix
 * order and the first stop reason.
 */
function replayAdmissions(
  manifest: ExperimentManifest,
  executable: CoordinateReplay[],
  state: BudgetState
): {
  runtimeExclusions: ExperimentRunResult['runtime_exclusions'];
  stopReason?: ExperimentStopReason;
} {
  const concurrent = manifest.concurrency > 1;
  const maxAttempts = manifest.retry_policy.max_attempts;
  const queue = [...executable];
  const running = new Map<
    number,
    { replay: CoordinateReplay; attempt: ExperimentAttemptEvidence }
  >();
  const excluded: { index: number; coordinate_id: string; reason: ExperimentStopReason }[] = [];
  let event = 0;
  let nextTicket = 0;
  let stopReason: ExperimentStopReason | undefined;

  const exclude = (replay: CoordinateReplay, reason: ExperimentStopReason) => {
    if (replay.status !== 'incomplete' || replay.completionCode !== 'budget_exhausted')
      throw invalid();
    stopReason ??= reason;
    excluded.push({ index: replay.index, coordinate_id: replay.coordinate.coordinate_id, reason });
  };

  const pump = () => {
    while (queue.length) {
      if (state.inFlight.size >= manifest.concurrency || budgetReason(manifest, state)) return;
      const head = queue[0] as CoordinateReplay;
      const decision = admissionDecision(manifest, state, head.demand);
      if (decision.kind === 'wait') return;
      queue.shift();
      if (decision.kind === 'skip') {
        exclude(head, 'request_budget_exhausted');
        continue;
      }
      // The runner admits here, so the coordinate must record this attempt.
      const attempt = head.attempts[head.next];
      if (!attempt) throw invalid();
      if (
        concurrent &&
        (attempt.admission?.admitted_at !== event ||
          !same(attempt.admission.granted_budget, grantEvidence(manifest, decision.grant)))
      )
        throw invalid();
      event += 1;
      const ticket = nextTicket++;
      state.inFlight.set(ticket, decision.grant);
      running.set(ticket, { replay: head, attempt });
      state.peak = Math.max(state.peak, state.inFlight.size);
      state.invocations += 1;
      if (manifest.mode === 'live') state.reserved += 1;
    }
  };

  const settle = (ticket: number) => {
    const { replay, attempt } = running.get(ticket) as {
      replay: CoordinateReplay;
      attempt: ExperimentAttemptEvidence;
    };
    const granted = state.inFlight.get(ticket) as ReplayedGrant;
    state.inFlight.delete(ticket);
    running.delete(ticket);
    const exceeded =
      attempt.usage.requests > granted.requests ||
      (granted.tokens !== undefined && (attempt.usage.tokens ?? 0) > granted.tokens) ||
      (granted.cost !== undefined && (attempt.usage.cost?.amount ?? 0) > granted.cost);
    const completions = coreCompletions(
      attempt,
      manifest,
      replay.coordinate.task_kind,
      exceeded,
      replay.costApplies
    );
    consume(state, attempt);
    replay.next += 1;

    // Only the final attempt can carry a halting completion; earlier ones were retried.
    if (replay.next < replay.attempts.length) {
      if (!completions.has('terminal')) throw invalid();
      queue.unshift(replay);
      return;
    }
    const lastIsRetryable = manifest.retry_policy.retry_on.includes(attempt.status as never);
    if (replay.completionCode === 'budget_exhausted') {
      // The runner queued a retry; it must never be admitted (see `pump`).
      if (
        !completions.has('terminal') ||
        replay.status !== 'incomplete' ||
        !lastIsRetryable ||
        replay.attempts.length >= maxAttempts
      )
        throw invalid();
      queue.unshift(replay);
      return;
    }
    if (!completions.has(replay.completionCode) || replay.status !== attempt.status)
      throw invalid();
    if (replay.completionCode === 'terminal') {
      if (lastIsRetryable && replay.attempts.length < maxAttempts) throw invalid();
    } else {
      const halt = replay.completionCode as ExperimentStopReason;
      state.halt ??= halt;
      stopReason ??= halt;
    }
  };

  pump();
  while (state.inFlight.size) {
    let ticket: number | undefined;
    for (const [candidate, { attempt }] of running)
      if (!concurrent || attempt.admission?.settled_at === event) {
        ticket = candidate;
        break;
      }
    if (ticket === undefined) throw invalid();
    event += 1;
    settle(ticket);
    pump();
  }

  // Every recorded attempt must have been admitted by the replayed scheduler.
  if (executable.some((replay) => replay.next !== replay.attempts.length)) throw invalid();
  if (queue.length) {
    // Execution stops only once nothing is in flight and the budget admits nothing more.
    const reason = budgetReason(manifest, state);
    if (!reason) throw invalid();
    for (const replay of queue) exclude(replay, reason);
  }
  return {
    runtimeExclusions: excluded
      .sort((left, right) => left.index - right.index)
      .map(({ coordinate_id, reason }) => ({ coordinate_id, reason })),
    stopReason,
  };
}

function validateResult(input: Record<string, unknown>): ExperimentRunResult {
  keys(
    input,
    [
      'schema_version',
      'experiment_id',
      'mode',
      'manifest',
      'identities',
      'completion',
      'runtime_exclusions',
      'complete',
      'results',
      'summaries',
      'uncertainty',
    ],
    ['live_authorization', 'stop_reason', 'execution']
  );
  if (input.schema_version !== '1') throw invalid();
  text(input.experiment_id, IDENTIFIER);
  oneOf(input.mode, ['fixture', 'live'] as const);
  const manifest = parseExperimentManifest(input.manifest);
  if (
    !same(input.manifest, manifest) ||
    input.experiment_id !== manifest.id ||
    input.mode !== manifest.mode ||
    !same(input.identities, manifest.identities)
  )
    throw invalid();

  if (manifest.mode === 'live') {
    const authorization = object(input.live_authorization);
    keys(authorization, ['approved', 'decision_id', 'decided_at', 'approved_by', 'reason']);
    if (authorization.approved !== true) throw invalid();
    text(authorization.decision_id, IDENTIFIER);
    datetime(authorization.decided_at);
    const approvedBy = text(authorization.approved_by);
    const reason = text(authorization.reason);
    if (
      approvedBy !== approvedBy.trim() ||
      !approvedBy ||
      approvedBy.length > 128 ||
      reason !== reason.trim() ||
      !reason ||
      reason.length > 256
    )
      throw invalid();
  } else if (input.live_authorization !== undefined) throw invalid();

  const expectedCoordinates = buildExperimentMatrix(manifest);
  const rawResults = array(input.results);
  if (rawResults.length !== expectedCoordinates.length) throw invalid();
  const concurrent = manifest.concurrency > 1;
  const results: ExperimentCoordinateResult[] = [];
  const executable: CoordinateReplay[] = [];

  for (let index = 0; index < expectedCoordinates.length; index += 1) {
    const expected = expectedCoordinates[index];
    const raw = object(rawResults[index]);
    keys(raw, ['coordinate', 'status', 'completion_code', 'attempts']);
    if (!same(raw.coordinate, expected)) throw invalid();
    const status = oneOf(raw.status, STATUSES);
    const completionCode = oneOf(raw.completion_code, COMPLETION_CODES);
    const attempts = array(raw.attempts).map((attempt) => validateAttempt(attempt, concurrent));
    if (attempts.length > manifest.retry_policy.max_attempts) throw invalid();
    attempts.forEach((attempt, attemptIndex) => {
      const number = attemptIndex + 1;
      if (
        attempt.attempt_number !== number ||
        attempt.retry_chain_id !== expected.coordinate_id ||
        attempt.attempt_id !== hash(`${expected.coordinate_id}:${String(number)}`)
      )
        throw invalid();
      if (
        attemptIndex > 0 &&
        !manifest.retry_policy.retry_on.includes(attempts[attemptIndex - 1].status as never)
      )
        throw invalid();
    });

    if (expected.declared_exclusion) {
      if (status !== 'excluded' || completionCode !== 'declared_exclusion' || attempts.length)
        throw invalid();
    } else if (expected.missing_capabilities.length) {
      if (
        status !== 'unsupported' ||
        completionCode !== 'capability_unsupported' ||
        attempts.length
      )
        throw invalid();
    } else {
      executable.push({
        index,
        coordinate: expected,
        status,
        completionCode,
        attempts,
        costApplies: targetCostApplies(targetById(manifest, expected.target_id)),
        next: 0,
      });
    }
    results.push({
      coordinate: expected,
      status,
      completion_code: completionCode,
      attempts,
    });
  }

  // Concurrent results record per-pair reservations and the peak; serial results never do.
  let peak: number | undefined;
  if (concurrent) peak = validateExecution(input.execution, manifest, executable);
  else if (input.execution !== undefined) throw invalid();
  const state: BudgetState = {
    invocations: 0,
    reserved: 0,
    requests: 0,
    tokens: 0,
    cost: 0,
    costMicro: 0,
    inFlight: new Map(),
    peak: 0,
  };
  const { runtimeExclusions, stopReason } = replayAdmissions(manifest, executable, state);
  if (concurrent && peak !== state.peak) throw invalid();

  const rawRuntime = array(input.runtime_exclusions).map((entry) => {
    const item = object(entry);
    keys(item, ['coordinate_id', 'reason']);
    return {
      coordinate_id: text(item.coordinate_id, DIGEST),
      reason: oneOf(item.reason, STOP_REASONS),
    };
  });
  if (!same(rawRuntime, runtimeExclusions)) throw invalid();
  if (input.stop_reason !== undefined) oneOf(input.stop_reason, STOP_REASONS);
  if (input.stop_reason !== stopReason) throw invalid();

  const overall = summarize(results);
  const completion = object(input.completion);
  keys(completion, [
    'matrix_complete',
    'execution_complete',
    'valid_measurement_coverage_complete',
  ]);
  const expectedCompletion = {
    matrix_complete: results.length === expectedCoordinates.length,
    execution_complete: overall.incomplete === 0,
    valid_measurement_coverage_complete: overall.valid === overall.planned,
  };
  boolean(completion.matrix_complete);
  boolean(completion.execution_complete);
  boolean(completion.valid_measurement_coverage_complete);
  if (
    !same(completion, expectedCompletion) ||
    input.complete !== expectedCompletion.valid_measurement_coverage_complete
  )
    throw invalid();

  const cost = reportedCost(results);
  const operational = {
    ...overall,
    executor_invocations: state.invocations,
    reserved_live_requests: state.reserved,
    attempts: results.reduce((sum, result) => sum + result.attempts.length, 0),
    retry_attempts: results.reduce(
      (sum, result) => sum + Math.max(0, result.attempts.length - 1),
      0
    ),
    requests: state.requests,
    tokens: state.tokens,
    ...(cost ? { cost } : {}),
    attempt_statuses: Object.fromEntries(
      EXECUTED.map((attemptStatus) => [
        attemptStatus,
        results
          .flatMap((result) => result.attempts)
          .filter((attempt) => attempt.status === attemptStatus).length,
      ])
    ),
  };
  const expectedSummaries = {
    overall,
    targets: grouped(results, (result) => result.coordinate.target_id),
    tasks: grouped(results, (result) => result.coordinate.task_id),
    languages: grouped(results, (result) => result.coordinate.language ?? 'und'),
    policies: grouped(results, (result) => result.coordinate.policy ?? 'unclassified'),
    operational,
  };
  if (!same(input.summaries, expectedSummaries)) throw invalid();
  const uncertainty = object(input.uncertainty);
  keys(uncertainty, ['method', 'sample_size', 'assumptions', 'task_clustering']);
  if (
    uncertainty.method !== 'none' ||
    uncertainty.sample_size !== overall.valid ||
    uncertainty.task_clustering !== 'not_estimated' ||
    !same(uncertainty.assumptions, experimentUncertaintyAssumptions(manifest.concurrency))
  )
    throw invalid();

  return input as unknown as ExperimentRunResult;
}

/** Validate one saved V1 result and project only deterministic presentation facts. */
export function createExperimentReport(input: unknown): ExperimentReport {
  try {
    const source = inputObject(input);
    const run = validateResult(source);
    const operational = run.summaries.operational;
    const report: ExperimentReport = {
      schemaVersion: '1',
      reportId: '',
      title: `Comparative experiment: ${run.experiment_id}`,
      scope: [
        `One saved ${run.mode} experiment with ${operational.planned} planned coordinates across ${run.manifest.tasks.length} tasks, ${run.manifest.targets.length} targets, and ${run.manifest.repetitions} repetitions.`,
        'The selected result is a complete declared task × target × repetition matrix. Unsupported, excluded, incomplete, invalid, and infrastructure-only coordinates remain visible and are not valid outcomes.',
        'Target provider, model, and configuration labels are declared host metadata. They are not independently authenticated.',
      ],
      methodology: [
        'Strict V1 saved-result validation, complete matrix reconciliation, retry-chain validation, budget-accounting checks, canonical key ordering, SHA-256 local evidence identities, and deterministic findings. No task or provider is executed.',
        ...(run.execution
          ? [
              `Concurrency is a declared limit of ${run.manifest.concurrency} coordinates in flight; the recorded peak was ${run.execution.peak_in_flight}. The validator re-ran the runner's admission rule over the recorded settlement order: every admission, grant, skip and exclusion had to match it exactly, and no admission could exceed a declared budget. This proves the recorded schedule is the one the runner produces for that settlement order under the declared limit, budgets and reservations. It does not prove wall-clock timing or that attempts overlapped in time, which the result does not record.`,
            ]
          : []),
        'Valid outcome rate is passed / (passed + task failed + policy failed). Invalid, unsupported, excluded, incomplete, and infrastructure-failed coordinates are outside that denominator.',
        `Uncertainty method is ${run.uncertainty.method}; sample size is ${run.uncertainty.sample_size}; task clustering is ${run.uncertainty.task_clustering}.`,
        ...run.uncertainty.assumptions,
      ],
      summary: {
        ...run.summaries.overall,
        concurrency: run.manifest.concurrency,
        peakInFlight: run.execution?.peak_in_flight ?? null,
        executorInvocations: operational.executor_invocations,
        reservedLiveRequests: operational.reserved_live_requests,
        attempts: operational.attempts,
        retries: operational.retry_attempts,
        requests: operational.requests,
        tokens: operational.tokens,
        cost: operational.cost ?? null,
        costStatus: costStatus(run.manifest, operational.cost !== undefined),
        validOutcomeRate: operational.valid === 0 ? null : operational.passed / operational.valid,
        completion: { ...run.completion },
      },
      findings: [],
      sections: [],
      evidence: [],
      limitations: [
        'This report describes selected saved evidence. It does not establish a universal target ranking, statistical independence, confidence interval, certification, deployment readiness, or pricing claim.',
        'SHA-256 workload, rubric, policy, profile, source, and result identities identify selected content; they do not authenticate its author, provenance, or execution.',
        'Repetitions from the same tasks can be clustered and are not treated as independent samples. The saved contract estimates no task-level clustering.',
        'A missing optional policy or profile identity remains unavailable. Missing reported cost remains unavailable rather than zero.',
      ],
    };
    const evidenceMap = new Map<string, ExperimentReportEvidence>();
    const evidence = (path: string, value: unknown, description: string) => {
      const id = `e-${hash(`${path}:${digest(value)}`)}`;
      evidenceMap.set(id, { id, path, sha256: digest(value), description });
      return id;
    };
    const section = (id: string, title: string, description: string, columns: string[]) => {
      const item: ExperimentReportSection = { id, title, description, columns, rows: [] };
      report.sections.push(item);
      return item;
    };
    const row = (
      target: ExperimentReportSection,
      path: string,
      value: unknown,
      cells: string[],
      description: string
    ) => {
      const ref = evidence(path, value, description);
      target.rows.push({ id: `row-${hash(`${target.id}:${ref}`)}`, cells, evidenceIds: [ref] });
      return ref;
    };
    const finding = (
      level: ExperimentReportFinding['level'],
      title: string,
      detail: string,
      recommendation: string,
      refs: string[]
    ) =>
      report.findings.push({
        id: `f-${digest([level, title, detail, refs])}`,
        level,
        title,
        detail,
        recommendation,
        evidenceIds: refs,
      });

    const coordinates = section(
      'coordinates',
      'Coordinate outcomes',
      'Every declared task × target × repetition coordinate appears once. Attempts are transport/execution retries inside a coordinate and are not repetitions.',
      ['Coordinate', 'Task', 'Target', 'Repetition', 'Status', 'Completion', 'Attempts']
    );
    const attempts = section(
      'attempts',
      'Attempt and retry evidence',
      'Scenario-evaluation and agent-workflow artifacts remain distinct evidence kinds.',
      ['Attempt', 'Coordinate', 'Ordinal', 'Status', 'Evidence', 'Requests', 'Tokens', 'Cost']
    );
    for (const [index, result] of run.results.entries()) {
      const resultRef = row(
        coordinates,
        `/results/${index}`,
        result,
        [
          result.coordinate.coordinate_id,
          result.coordinate.task_id,
          result.coordinate.target_id,
          String(result.coordinate.repetition_index),
          result.status,
          result.completion_code,
          String(result.attempts.length),
        ],
        'Validated coordinate result'
      );
      if (!['passed', 'task_failed', 'policy_failed'].includes(result.status))
        finding(
          result.status === 'unsupported' || result.status === 'excluded' ? 'limitation' : 'risk',
          `Coordinate ${result.status}`,
          `${result.coordinate.task_id} on ${result.coordinate.target_id}, repetition ${result.coordinate.repetition_index}, ended ${result.status} (${result.completion_code}).`,
          'Review the linked coordinate and attempt evidence before changing the declared workload, controls, or target.',
          [resultRef]
        );
      for (const [attemptIndex, attempt] of result.attempts.entries()) {
        row(
          attempts,
          `/results/${index}/attempts/${attemptIndex}`,
          attempt,
          [
            attempt.attempt_id,
            attempt.retry_chain_id,
            String(attempt.attempt_number),
            attempt.status,
            `${attempt.evidence.kind}: ${attempt.evidence.availability}${attempt.evidence.availability === 'available' ? `; sha256:${attempt.evidence.artifact.digest}` : ''}`,
            String(attempt.usage.requests),
            attempt.usage.tokens === undefined ? 'unavailable' : String(attempt.usage.tokens),
            attempt.usage.cost
              ? `${attempt.usage.cost.amount} ${attempt.usage.cost.currency}`
              : 'unavailable',
          ],
          'Validated attempt evidence'
        );
      }
    }

    const tasks = section(
      'tasks',
      'Tasks and source identities',
      'Source paths are declared workload references; artifact digests identify selected content.',
      ['Task', 'Kind', 'Source', 'Source identity', 'Language', 'Policy', 'Capabilities']
    );
    run.manifest.tasks.forEach((task, index) =>
      row(
        tasks,
        `/manifest/tasks/${index}`,
        task,
        [
          task.id,
          task.kind,
          task.source.path,
          `sha256:${task.source.artifact.digest}`,
          task.language ?? 'unavailable',
          task.policy ?? 'unavailable',
          task.required_capabilities.join(', ') || 'none',
        ],
        'Declared task and source identity'
      )
    );
    const targets = section(
      'targets',
      'Targets and declared host metadata',
      'Provider, model, publisher, weights, deployment, settings, and capability labels are declarations supplied by the host.',
      [
        'Target',
        'Provider',
        'Model',
        'Publisher',
        'Weights',
        'Deployment',
        'Capabilities',
        'Settings',
      ]
    );
    run.manifest.targets.forEach((target, index) =>
      row(
        targets,
        `/manifest/targets/${index}`,
        target,
        [
          target.id,
          target.provider,
          target.model,
          target.publisher?.name ?? 'undeclared',
          weightsLabel(target),
          deploymentLabel(target),
          target.capabilities.join(', ') || 'none',
          target.settings ? canonical(target.settings) : 'none',
        ],
        'Declared target metadata'
      )
    );

    const controls = section(
      'controls',
      'Compatibility identities and execution controls',
      'Content digests identify selected inputs but do not authenticate them. Optional absent identities stay unavailable.',
      ['Control', 'Declared value', 'Meaning']
    );
    for (const name of ['workload', 'rubric', 'policy', 'profile'] as const) {
      const identity = run.identities[name];
      row(
        controls,
        `/identities/${name}`,
        identity ?? null,
        [
          `${name} identity`,
          identity ? `sha256:${identity.digest}` : 'unavailable',
          identity ? 'selected content identity; authenticity not established' : 'not declared',
        ],
        `${name} compatibility identity`
      );
    }
    row(
      controls,
      '/manifest',
      run.manifest,
      [
        'matrix controls',
        `repetitions ${run.manifest.repetitions}; retry attempts ${run.manifest.retry_policy.max_attempts}; concurrency ${run.manifest.concurrency}; seed ${run.manifest.seed ? `${run.manifest.seed.value} (${run.manifest.seed.strategy})` : 'unavailable'}`,
        `${run.manifest.mode} execution with ${run.manifest.exclusions.length} declared exclusions`,
      ],
      'Manifest controls'
    );
    run.manifest.targets.forEach((target, index) =>
      row(
        controls,
        `/manifest/targets/${index}`,
        target,
        [
          `generation: ${target.id}`,
          generationLabel(target, run.manifest),
          "sent with every request to this target; unset values follow each task and values never sent use the serving runtime's defaults. Each attempt's run evidence records the values sent (resolved_config)",
        ],
        'Declared target metadata'
      )
    );
    if (run.manifest.live)
      row(
        controls,
        '/manifest/live',
        run.manifest.live,
        [
          'live controls',
          `concurrency ceiling ${run.manifest.live.concurrency_ceiling}; stop conditions ${run.manifest.live.stop_conditions.join(', ')}`,
          'declared controls enforced by the V1 live runner; concurrency must not exceed the ceiling',
        ],
        'Declared live execution controls'
      );
    if (run.live_authorization)
      row(
        controls,
        '/live_authorization',
        run.live_authorization,
        [
          'live authorization',
          `${run.live_authorization.decision_id}; ${run.live_authorization.decided_at}; approved by ${run.live_authorization.approved_by}; reason ${run.live_authorization.reason}`,
          'saved host authorization decision for this bounded live run',
        ],
        'Live authorization decision'
      );

    const summaries = section(
      'summaries',
      'Selected-evidence aggregation',
      'Counts are descriptive for this selected evidence. They are not a universal ranking or confidence estimate.',
      ['Dimension', 'Key', 'Passed', 'Valid denominator', 'Planned', 'Observed valid outcome rate']
    );
    const groups: [string, string, ExperimentSummaryGroup[]][] = [
      ['target', 'targets', run.summaries.targets],
      ['task', 'tasks', run.summaries.tasks],
      ['language', 'languages', run.summaries.languages],
      ['policy', 'policies', run.summaries.policies],
    ];
    for (const [dimension, path, values] of groups)
      values.forEach((group, index) =>
        row(
          summaries,
          `/summaries/${path}/${index}`,
          group,
          [
            dimension,
            group.key,
            String(group.summary.passed),
            String(group.summary.valid),
            String(group.summary.planned),
            group.summary.valid ? `${group.summary.passed}/${group.summary.valid}` : 'unavailable',
          ],
          `Validated ${dimension} summary`
        )
      );

    const budgets = section(
      'budgets',
      'Budget and stop evidence',
      'Reported use and live request reservations are distinct. Missing cost is unavailable rather than zero.',
      ['Measure', 'Limit or observed value']
    );
    row(
      budgets,
      '/manifest/budgets',
      run.manifest.budgets,
      [
        'Declared limits',
        `requests ${run.manifest.budgets.max_requests}; tokens ${run.manifest.budgets.max_tokens ?? 'unavailable'}; cost ${run.manifest.budgets.max_cost ? `${run.manifest.budgets.max_cost.amount} ${run.manifest.budgets.max_cost.currency}` : 'unavailable'}`,
      ],
      'Declared execution budgets'
    );
    row(
      budgets,
      '/summaries/operational',
      operational,
      [
        'Observed use',
        `invocations ${operational.executor_invocations}; attempts ${operational.attempts}; retries ${operational.retry_attempts}; requests ${operational.requests}; reserved live requests ${operational.reserved_live_requests}; tokens ${operational.tokens}; cost ${operational.cost ? `${operational.cost.amount} ${operational.cost.currency}` : costStatus(run.manifest, false).replace('_', ' ')}`,
      ],
      'Recomputed operational totals'
    );
    row(
      budgets,
      '/completion',
      run.completion,
      [
        'Completion dimensions',
        `matrix ${run.completion.matrix_complete}; execution ${run.completion.execution_complete}; valid measurement coverage ${run.completion.valid_measurement_coverage_complete}; stop ${run.stop_reason ?? 'none'}`,
      ],
      'Validated completion and stop metadata'
    );

    const exclusions = section(
      'exclusions',
      'Declared and runtime exclusions',
      'Declared exclusions are planned matrix outcomes. Runtime exclusions record coordinates that were not executed after a stop condition.',
      ['Kind', 'Identity', 'Coordinate or selector', 'Reason']
    );
    run.manifest.exclusions.forEach((item, index) =>
      row(
        exclusions,
        `/manifest/exclusions/${index}`,
        item,
        [
          'declared',
          item.id,
          `task ${item.task_id ?? '*'}; target ${item.target_id ?? '*'}`,
          item.reason,
        ],
        'Declared exclusion'
      )
    );
    run.runtime_exclusions.forEach((item, index) =>
      row(
        exclusions,
        `/runtime_exclusions/${index}`,
        item,
        ['runtime', `runtime-${index + 1}`, item.coordinate_id, item.reason],
        'Runtime stop exclusion'
      )
    );

    const rootRef = evidence('', run, 'Validated saved V1 experiment result');
    if (run.completion.valid_measurement_coverage_complete)
      finding(
        'strength',
        'All declared coordinates have valid measurements',
        `${operational.passed} passed and ${operational.task_failed + operational.policy_failed} failed within a valid denominator of ${operational.valid}.`,
        'Use the linked coordinate evidence and declared identities when interpreting the selected results.',
        [rootRef]
      );
    else
      finding(
        'limitation',
        'Valid measurement coverage is incomplete',
        `${operational.valid} of ${operational.planned} planned coordinates are valid outcomes.`,
        'Resolve unsupported, excluded, invalid, incomplete, or infrastructure-only coordinates before making broader comparisons.',
        [rootRef]
      );
    if (run.stop_reason)
      finding(
        'risk',
        'Experiment stopped under a declared control',
        `Stop reason: ${run.stop_reason}; ${run.runtime_exclusions.length} coordinates carry runtime exclusions.`,
        'Review observed use, live request reservations, and the declared stop conditions before rerunning.',
        [rootRef]
      );
    const targetRates = run.summaries.targets.map((group) =>
      group.summary.valid ? group.summary.passed / group.summary.valid : null
    );
    if (new Set(targetRates.filter((rate) => rate !== null)).size > 1)
      finding(
        'information',
        'Observed target counts differ',
        'Pass counts and valid denominators differ within this selected evidence. No universal winner or statistical confidence is inferred.',
        'Inspect target rows together with task, language, policy, and coordinate evidence.',
        [rootRef]
      );

    report.evidence = [...evidenceMap.values()];
    report.reportId = `experiment-report-${digest({ ...report, reportId: '' })}`;
    return report;
  } catch {
    throw invalid();
  }
}
