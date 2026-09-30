import { createHash } from 'node:crypto';
import { types } from 'node:util';
import {
  type ExperimentAttemptEvidence,
  type ExperimentAttemptStatus,
  type ExperimentCoordinateResult,
  type ExperimentManifest,
  type ExperimentRunResult,
  type ExperimentStopReason,
  type ExperimentSummary,
  type ExperimentSummaryGroup,
  buildExperimentMatrix,
  parseExperimentManifest,
} from '@artemiskit/core';
import type {
  ExperimentReport,
  ExperimentReportEvidence,
  ExperimentReportFinding,
  ExperimentReportSection,
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

function validateAttempt(value: unknown) {
  const attempt = object(value);
  keys(
    attempt,
    ['status', 'usage', 'evidence', 'attempt_id', 'retry_chain_id', 'attempt_number'],
    ['error_code']
  );
  oneOf(attempt.status, EXECUTED);
  text(attempt.attempt_id, DIGEST);
  text(attempt.retry_chain_id, DIGEST);
  integer(attempt.attempt_number);
  if (attempt.error_code !== undefined) text(attempt.error_code, IDENTIFIER);

  const usage = object(attempt.usage);
  keys(usage, ['requests'], ['tokens', 'cost']);
  if (integer(usage.requests) > 1_000_000) throw invalid();
  if (usage.tokens !== undefined && integer(usage.tokens) > 10_000_000_000) throw invalid();
  if (usage.cost !== undefined) {
    const cost = object(usage.cost);
    keys(cost, ['amount', 'currency']);
    if (typeof cost.amount !== 'number' || !Number.isFinite(cost.amount) || cost.amount < 0)
      throw invalid();
    text(cost.currency, /^[A-Z]{3}$/);
  }

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

interface BudgetState {
  invocations: number;
  reserved: number;
  requests: number;
  tokens: number;
  cost: number;
  currency?: string;
  sawCost: boolean;
  mixedCost: boolean;
  halt?: ExperimentStopReason;
}

function budgetReason(manifest: ExperimentManifest, state: BudgetState) {
  if (state.halt) return state.halt;
  const requests =
    manifest.mode === 'live' ? Math.max(state.requests, state.reserved) : state.requests;
  if (requests >= manifest.budgets.max_requests) return 'request_budget_exhausted' as const;
  if (manifest.budgets.max_tokens !== undefined && state.tokens >= manifest.budgets.max_tokens)
    return 'token_budget_exhausted' as const;
  if (manifest.budgets.max_cost !== undefined && state.cost >= manifest.budgets.max_cost.amount)
    return 'cost_budget_exhausted' as const;
  return undefined;
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
    ['live_authorization', 'stop_reason']
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
  const results: ExperimentCoordinateResult[] = [];
  const state: BudgetState = {
    invocations: 0,
    reserved: 0,
    requests: 0,
    tokens: 0,
    cost: 0,
    sawCost: false,
    mixedCost: false,
  };
  const runtimeExclusions: { coordinate_id: string; reason: ExperimentStopReason }[] = [];
  let stopReason: ExperimentStopReason | undefined;

  for (let index = 0; index < expectedCoordinates.length; index += 1) {
    const expected = expectedCoordinates[index];
    const raw = object(rawResults[index]);
    keys(raw, ['coordinate', 'status', 'completion_code', 'attempts']);
    if (!same(raw.coordinate, expected)) throw invalid();
    const status = oneOf(raw.status, STATUSES);
    const completionCode = oneOf(raw.completion_code, COMPLETION_CODES);
    const attempts = array(raw.attempts).map(validateAttempt);
    if (attempts.length > manifest.retry_policy.max_attempts) throw invalid();
    attempts.forEach((attempt, attemptIndex) => {
      const number = attemptIndex + 1;
      if (
        attempt.attempt_number !== number ||
        attempt.retry_chain_id !== expected.coordinate_id ||
        attempt.attempt_id !== hash(`${expected.coordinate_id}:${String(number)}`)
      )
        throw invalid();
      const missingLiveUsage =
        manifest.mode === 'live' &&
        (attempt.usage.tokens === undefined || attempt.usage.cost === undefined);
      const usageHaltPreemptedEvidenceNormalization =
        completionCode === 'usage_unreported' &&
        attemptIndex === attempts.length - 1 &&
        attempt.status === 'incomplete' &&
        missingLiveUsage;
      if (attempt.evidence.kind !== expected.task_kind && !usageHaltPreemptedEvidenceNormalization)
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
      const beforeCoordinate = budgetReason(manifest, state);
      if (beforeCoordinate) {
        if (status !== 'incomplete' || completionCode !== 'budget_exhausted' || attempts.length)
          throw invalid();
        runtimeExclusions.push({ coordinate_id: expected.coordinate_id, reason: beforeCoordinate });
        stopReason ??= beforeCoordinate;
      } else {
        let lastExceeded = false;
        for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
          const beforeAttempt = budgetReason(manifest, state);
          if (beforeAttempt) throw invalid();
          const attempt = attempts[attemptIndex];
          const effectiveBefore =
            manifest.mode === 'live' ? Math.max(state.requests, state.reserved) : state.requests;
          const remainingRequests = manifest.budgets.max_requests - effectiveBefore;
          const remainingTokens =
            manifest.budgets.max_tokens === undefined
              ? undefined
              : manifest.budgets.max_tokens - state.tokens;
          const remainingCost =
            manifest.budgets.max_cost === undefined
              ? undefined
              : manifest.budgets.max_cost.amount - state.cost;
          state.invocations += 1;
          if (manifest.mode === 'live') state.reserved += 1;
          if (
            attempt.usage.cost !== undefined &&
            manifest.budgets.max_cost !== undefined &&
            attempt.usage.cost.currency !== manifest.budgets.max_cost.currency
          )
            throw invalid();
          const exceeded =
            attempt.usage.requests > remainingRequests ||
            (remainingTokens !== undefined && (attempt.usage.tokens ?? 0) > remainingTokens) ||
            (remainingCost !== undefined && (attempt.usage.cost?.amount ?? 0) > remainingCost);
          const isLastAttempt = attemptIndex === attempts.length - 1;
          const missingLiveUsage =
            manifest.mode === 'live' &&
            (attempt.usage.tokens === undefined || attempt.usage.cost === undefined);
          if (
            missingLiveUsage &&
            (!isLastAttempt || !['usage_unreported', 'usage_invalid'].includes(completionCode))
          )
            throw invalid();
          if (exceeded && (!isLastAttempt || completionCode !== 'budget_exceeded')) throw invalid();
          lastExceeded = exceeded;
          state.requests += attempt.usage.requests;
          state.tokens += attempt.usage.tokens ?? 0;
          if (attempt.usage.cost) {
            state.sawCost = true;
            state.currency ??= attempt.usage.cost.currency;
            state.mixedCost ||= state.currency !== attempt.usage.cost.currency;
            state.cost += attempt.usage.cost.amount;
          }
        }
        if (!attempts.length) throw invalid();
        const afterAttempts = budgetReason(manifest, state);
        const last = attempts[attempts.length - 1];
        const lastIsRetryable = manifest.retry_policy.retry_on.includes(last.status as never);
        if (completionCode === 'budget_exhausted') {
          if (
            !afterAttempts ||
            state.halt !== undefined ||
            status !== 'incomplete' ||
            !lastIsRetryable ||
            attempts.length >= manifest.retry_policy.max_attempts
          )
            throw invalid();
          runtimeExclusions.push({ coordinate_id: expected.coordinate_id, reason: afterAttempts });
          stopReason ??= afterAttempts;
        } else {
          const missingLiveUsage =
            manifest.mode === 'live' &&
            (last.usage.tokens === undefined || last.usage.cost === undefined);
          if (completionCode === 'usage_unreported') {
            if (
              !missingLiveUsage ||
              last.status !== 'incomplete' ||
              last.error_code !== 'usage_unreported'
            )
              throw invalid();
            state.halt = 'usage_unreported';
          } else if (completionCode === 'usage_invalid') {
            const normalizedInvalidEvidence =
              last.evidence.kind === expected.task_kind &&
              last.evidence.availability === 'unavailable';
            const invalidExecutorResult =
              last.error_code === 'invalid_executor_result' &&
              last.usage.requests === 0 &&
              last.usage.tokens === undefined &&
              last.usage.cost === undefined;
            const costCurrencyMismatch =
              last.error_code === 'cost_currency_mismatch' &&
              manifest.budgets.max_cost !== undefined &&
              last.usage.tokens !== undefined &&
              last.usage.cost === undefined;
            if (
              !missingLiveUsage ||
              last.status !== 'invalid' ||
              !normalizedInvalidEvidence ||
              (!invalidExecutorResult && !costCurrencyMismatch)
            )
              throw invalid();
            state.halt = 'usage_invalid';
          } else if (completionCode === 'budget_exceeded') {
            if (
              !lastExceeded ||
              last.status !== 'incomplete' ||
              last.error_code !== 'budget_exceeded'
            )
              throw invalid();
            state.halt = 'budget_exceeded';
          } else if (completionCode !== 'terminal' || missingLiveUsage || lastExceeded) {
            throw invalid();
          }
          if (
            status !== last.status ||
            (lastIsRetryable &&
              attempts.length < manifest.retry_policy.max_attempts &&
              state.halt === undefined)
          )
            throw invalid();
          if (state.halt) stopReason ??= state.halt;
        }
      }
    }
    results.push({
      coordinate: expected,
      status,
      completion_code: completionCode,
      attempts,
    });
  }

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
    ...(state.sawCost && !state.mixedCost
      ? { cost: { amount: state.cost, currency: state.currency as string } }
      : {}),
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
    !same(uncertainty.assumptions, [
      'No statistical independence is assumed across repetitions or tasks.',
      'No confidence interval is estimated.',
    ])
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
        'Valid outcome rate is passed / (passed + task failed + policy failed). Invalid, unsupported, excluded, incomplete, and infrastructure-failed coordinates are outside that denominator.',
        `Uncertainty method is ${run.uncertainty.method}; sample size is ${run.uncertainty.sample_size}; task clustering is ${run.uncertainty.task_clustering}.`,
        ...run.uncertainty.assumptions,
      ],
      summary: {
        ...run.summaries.overall,
        executorInvocations: operational.executor_invocations,
        reservedLiveRequests: operational.reserved_live_requests,
        attempts: operational.attempts,
        retries: operational.retry_attempts,
        requests: operational.requests,
        tokens: operational.tokens,
        cost: operational.cost ?? null,
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
      'Provider, model, settings, and capability labels are declarations supplied by the host.',
      ['Target', 'Provider', 'Model', 'Capabilities', 'Settings']
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
    if (run.manifest.live)
      row(
        controls,
        '/manifest/live',
        run.manifest.live,
        [
          'live controls',
          `concurrency ceiling ${run.manifest.live.concurrency_ceiling}; stop conditions ${run.manifest.live.stop_conditions.join(', ')}`,
          'declared controls enforced by the V1 live runner',
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
        `invocations ${operational.executor_invocations}; attempts ${operational.attempts}; retries ${operational.retry_attempts}; requests ${operational.requests}; reserved live requests ${operational.reserved_live_requests}; tokens ${operational.tokens}; cost ${operational.cost ? `${operational.cost.amount} ${operational.cost.currency}` : 'unavailable'}`,
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
