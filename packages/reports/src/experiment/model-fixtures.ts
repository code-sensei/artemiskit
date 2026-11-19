import {
  type ExecutedExperimentAttemptStatus,
  type ExperimentAttemptExecutor,
  type ExperimentAttemptInput,
  type ExperimentAttemptOutput,
  type ExperimentConcurrency,
  type ExperimentManifest,
  type ExperimentRunResult,
  type ExperimentTaskKind,
  runExperiment,
} from '@artemiskit/core';

const sha = (character: string) => character.repeat(64);

export function experimentManifest(
  overrides: Partial<ExperimentManifest> = {}
): ExperimentManifest {
  return {
    schema_version: '1',
    id: 'report-fixture',
    mode: 'fixture',
    identities: {
      schema_version: '1',
      workload: { schema_version: '1', algorithm: 'sha256', digest: sha('1') },
      rubric: { schema_version: '1', algorithm: 'sha256', digest: sha('2') },
      policy: { schema_version: '1', algorithm: 'sha256', digest: sha('3') },
    },
    tasks: [
      {
        id: 'scenario',
        kind: 'scenario_evaluation',
        source: {
          kind: 'scenario_evaluation',
          path: 'experiments/scenario.yaml',
          artifact: { schema_version: '1', algorithm: 'sha256', digest: sha('4') },
        },
        required_capabilities: ['tools'],
        language: 'en',
        policy: 'strict',
      },
      {
        id: 'workflow',
        kind: 'agent_workflow',
        source: {
          kind: 'agent_workflow',
          path: 'experiments/workflow.json',
          artifact: { schema_version: '1', algorithm: 'sha256', digest: sha('5') },
        },
        required_capabilities: [],
        language: 'fr',
      },
    ],
    targets: [
      {
        id: 'alpha',
        provider: 'Fixture <Alpha>',
        model: 'alpha|model',
        capabilities: ['tools', 'seed'],
        settings: { temperature: 0 },
      },
      {
        id: 'beta',
        provider: 'Fixture Beta',
        model: 'beta-model',
        capabilities: ['seed'],
      },
    ],
    repetitions: 2,
    concurrency: 1,
    seed: { value: 40, strategy: 'increment_by_repetition', require_support: true },
    exclusions: [
      {
        id: 'skip-workflow-beta',
        reason: 'Declared fixture exclusion',
        task_id: 'workflow',
        target_id: 'beta',
      },
    ],
    retry_policy: {
      max_attempts: 2,
      retry_on: ['invalid', 'incomplete', 'infrastructure_failed'],
    },
    budgets: { max_requests: 100, max_tokens: 100_000 },
    ...overrides,
  };
}

function evidence(kind: ExperimentTaskKind, available = true) {
  return available
    ? {
        kind,
        availability: 'available' as const,
        artifact: { schema_version: '1' as const, algorithm: 'sha256' as const, digest: sha('a') },
      }
    : { kind, availability: 'unavailable' as const };
}

export async function mixedExperimentResult(): Promise<ExperimentRunResult> {
  return runExperiment(experimentManifest(), {
    execute_attempt: async (input) => {
      const coordinate = input.coordinate;
      if (coordinate.task_id === 'scenario' && coordinate.repetition_index === 1) {
        if (input.attempt_number === 1)
          return {
            status: 'infrastructure_failed',
            usage: { requests: 1, tokens: 4 },
            evidence: evidence(coordinate.task_kind, false),
            error_code: 'fixture_transport',
          };
        return {
          status: 'passed',
          usage: { requests: 1, tokens: 5 },
          evidence: evidence(coordinate.task_kind),
        };
      }
      if (coordinate.task_id === 'scenario')
        return {
          status: 'task_failed',
          usage: { requests: 1, tokens: 6 },
          evidence: evidence(coordinate.task_kind),
        };
      if (coordinate.repetition_index === 1)
        return {
          status: 'policy_failed',
          usage: { requests: 1, tokens: 7 },
          evidence: evidence(coordinate.task_kind),
        };
      return {
        status: 'invalid',
        usage: { requests: 1, tokens: 8 },
        evidence: evidence(coordinate.task_kind, false),
        error_code: 'fixture_invalid',
      };
    },
  });
}

export async function statusExperimentResult(
  status: ExecutedExperimentAttemptStatus
): Promise<ExperimentRunResult> {
  const manifest = experimentManifest({
    tasks: [experimentManifest().tasks[1]],
    repetitions: 1,
    exclusions: [],
    retry_policy: { max_attempts: 1, retry_on: [] },
  });
  return runExperiment(manifest, {
    execute_attempt: async (input) => ({
      status,
      usage: { requests: 1 },
      evidence: evidence(
        input.coordinate.task_kind,
        status === 'passed' || status === 'task_failed' || status === 'policy_failed'
      ),
      ...(status === 'invalid' || status === 'incomplete' || status === 'infrastructure_failed'
        ? { error_code: `fixture_${status}` }
        : {}),
    }),
  });
}

export async function liveBudgetResult(): Promise<ExperimentRunResult> {
  const base = experimentManifest();
  const manifest = experimentManifest({
    mode: 'live',
    tasks: [base.tasks[1]],
    repetitions: 2,
    exclusions: [],
    seed: undefined,
    budgets: { max_requests: 1, max_tokens: 100, max_cost: { amount: 1, currency: 'USD' } },
    live: {
      concurrency_ceiling: 1,
      stop_conditions: [
        'request_budget_exhausted',
        'token_budget_exhausted',
        'cost_budget_exhausted',
        'usage_unreported',
        'usage_invalid',
        'budget_exceeded',
      ],
    },
  });
  return runExperiment(manifest, {
    live_authorization: {
      approved: true,
      decision_id: 'approval-1',
      decided_at: '2026-09-30T12:00:00Z',
      approved_by: 'fixture operator',
      reason: 'Bounded report fixture',
    },
    execute_attempt: async (input) => ({
      status: 'passed',
      usage: { requests: 1, tokens: 10, cost: { amount: 0.1, currency: 'USD' } },
      evidence: evidence(input.coordinate.task_kind),
    }),
  });
}

/** Live run against two local open-weight targets that declare cost as not applicable. */
export async function localOpenWeightResult(): Promise<ExperimentRunResult> {
  const base = experimentManifest();
  const localTarget = (id: string, model: string) => ({
    id,
    provider: 'openai',
    model,
    capabilities: ['text', 'tools'],
    deployment: {
      locality: 'local' as const,
      runtime: 'ollama',
      cost_basis: 'not_applicable' as const,
    },
    publisher: { id: 'qwen', name: 'Qwen' },
    weights: { availability: 'open' as const, license: 'Apache-2.0' },
  });
  const manifest = experimentManifest({
    mode: 'live',
    tasks: [base.tasks[1]],
    targets: [localTarget('local-small', 'qwen3.5:4b'), localTarget('local-large', 'qwen3.5:9b')],
    repetitions: 1,
    exclusions: [],
    seed: undefined,
    budgets: { max_requests: 4, max_tokens: 1_000 },
    live: {
      concurrency_ceiling: 1,
      stop_conditions: [
        'request_budget_exhausted',
        'token_budget_exhausted',
        'cost_budget_exhausted',
        'usage_unreported',
        'usage_invalid',
        'budget_exceeded',
      ],
    },
  });
  return runExperiment(manifest, {
    live_authorization: {
      approved: true,
      decision_id: 'local-approval',
      decided_at: '2026-11-19T12:00:00Z',
      approved_by: 'fixture operator',
      reason: 'Local open-weight report fixture',
    },
    execute_attempt: async (input) => ({
      status: 'passed',
      usage: { requests: 1, tokens: 20 },
      evidence: evidence(input.coordinate.task_kind),
    }),
  });
}

export async function adapterErrorCollisionResult(
  mode: 'fixture' | 'live',
  errorCode: string
): Promise<ExperimentRunResult> {
  const base = experimentManifest();
  const live = mode === 'live';
  const manifest = experimentManifest({
    mode,
    tasks: [base.tasks[1]],
    repetitions: 1,
    exclusions: [],
    seed: undefined,
    retry_policy: { max_attempts: 1, retry_on: [] },
    budgets: live
      ? { max_requests: 10, max_tokens: 100, max_cost: { amount: 1, currency: 'USD' } }
      : { max_requests: 10 },
    live: live
      ? {
          concurrency_ceiling: 1,
          stop_conditions: [
            'request_budget_exhausted',
            'token_budget_exhausted',
            'cost_budget_exhausted',
            'usage_unreported',
            'usage_invalid',
            'budget_exceeded',
          ],
        }
      : undefined,
  });
  return runExperiment(manifest, {
    live_authorization: live
      ? {
          approved: true,
          decision_id: 'collision-approval',
          decided_at: '2026-09-30T12:00:00Z',
          approved_by: 'fixture operator',
          reason: 'Test unrestricted adapter error codes',
        }
      : undefined,
    execute_attempt: async (input) => ({
      status: 'invalid',
      usage: live
        ? { requests: 1, tokens: 1, cost: { amount: 0.01, currency: 'USD' } }
        : { requests: 1 },
      evidence: evidence(input.coordinate.task_kind, false),
      error_code: errorCode,
    }),
  });
}

/** A structurally consistent reproduction of the live missing-usage result emitted before core cycle 3. */
export async function preFixLiveMissingUsageResult(): Promise<ExperimentRunResult> {
  const result = await statusExperimentResult('invalid');
  result.mode = 'live';
  result.manifest.mode = 'live';
  result.manifest.budgets = {
    max_requests: 10,
    max_tokens: 100,
    max_cost: { amount: 1, currency: 'USD' },
  };
  result.manifest.live = {
    concurrency_ceiling: 1,
    stop_conditions: [
      'request_budget_exhausted',
      'token_budget_exhausted',
      'cost_budget_exhausted',
      'usage_unreported',
      'usage_invalid',
      'budget_exceeded',
    ],
  };
  result.live_authorization = {
    approved: true,
    decision_id: 'pre-fix-approval',
    decided_at: '2026-09-30T12:00:00Z',
    approved_by: 'fixture operator',
    reason: 'Reproduce pre-fix saved evidence',
  };
  result.summaries.operational.reserved_live_requests =
    result.summaries.operational.executor_invocations;
  return result;
}

/** A cycle-3 result where live usage enforcement precedes evidence-kind normalization. */
export async function liveUsageUnreportedResult(): Promise<ExperimentRunResult> {
  const base = experimentManifest();
  const manifest = experimentManifest({
    mode: 'live',
    tasks: [base.tasks[1]],
    repetitions: 1,
    exclusions: [],
    seed: undefined,
    retry_policy: { max_attempts: 1, retry_on: [] },
    budgets: { max_requests: 10, max_tokens: 100, max_cost: { amount: 1, currency: 'USD' } },
    live: {
      concurrency_ceiling: 1,
      stop_conditions: [
        'request_budget_exhausted',
        'token_budget_exhausted',
        'cost_budget_exhausted',
        'usage_unreported',
        'usage_invalid',
        'budget_exceeded',
      ],
    },
  });
  const result = await runExperiment(manifest, {
    live_authorization: {
      approved: true,
      decision_id: 'usage-unreported-approval',
      decided_at: '2026-09-30T12:00:00Z',
      approved_by: 'fixture operator',
      reason: 'Exercise live usage enforcement order',
    },
    execute_attempt: async (input) => ({
      status: 'passed',
      usage: { requests: 0 },
      evidence: evidence(input.coordinate.task_kind),
    }),
  });

  // Core cycle 3 preserves the raw evidence when usage enforcement halts normalization first.
  result.results[0].attempts[0].evidence.kind = 'scenario_evaluation';
  return result;
}

export type LiveRunnerHalt =
  | 'usage_unreported'
  | 'invalid_executor_result'
  | 'cost_currency_mismatch'
  | 'budget_exceeded';

/** Produce each runner-owned live halt through the public core executor boundary. */
export async function liveRunnerHaltResult(cause: LiveRunnerHalt): Promise<ExperimentRunResult> {
  const base = experimentManifest();
  const manifest = experimentManifest({
    mode: 'live',
    tasks: [base.tasks[1]],
    repetitions: 1,
    exclusions: [],
    seed: undefined,
    retry_policy: { max_attempts: 1, retry_on: [] },
    budgets: { max_requests: 10, max_tokens: 100, max_cost: { amount: 1, currency: 'USD' } },
    live: {
      concurrency_ceiling: 1,
      stop_conditions: [
        'request_budget_exhausted',
        'token_budget_exhausted',
        'cost_budget_exhausted',
        'usage_unreported',
        'usage_invalid',
        'budget_exceeded',
      ],
    },
  });
  return runExperiment(manifest, {
    live_authorization: {
      approved: true,
      decision_id: `runner-${cause}`,
      decided_at: '2026-09-30T12:00:00Z',
      approved_by: 'fixture operator',
      reason: 'Exercise an exact runner-owned halt shape',
    },
    execute_attempt: async (input) => {
      if (cause === 'invalid_executor_result') return null as never;
      if (cause === 'usage_unreported') {
        return {
          status: 'passed',
          usage: { requests: 0 },
          evidence: evidence(input.coordinate.task_kind),
        };
      }
      return {
        status: 'passed',
        usage:
          cause === 'cost_currency_mismatch'
            ? { requests: 1, tokens: 1, cost: { amount: 0.01, currency: 'EUR' } }
            : { requests: 11, tokens: 1, cost: { amount: 0.01, currency: 'USD' } },
        evidence: evidence(input.coordinate.task_kind),
      };
    },
  });
}

const STOP_CONDITIONS: NonNullable<ExperimentManifest['live']>['stop_conditions'] = [
  'request_budget_exhausted',
  'token_budget_exhausted',
  'cost_budget_exhausted',
  'usage_unreported',
  'usage_invalid',
  'budget_exceeded',
];

const CONCURRENT_AUTHORIZATION = {
  approved: true as const,
  decision_id: 'concurrent-fixture',
  decided_at: '2026-11-19T12:00:00Z',
  approved_by: 'fixture operator',
  reason: 'Bounded concurrent report fixture',
  approved_concurrency: 8 as const,
};

/** Deterministic 32-bit PRNG so a failing seed reproduces exactly. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  return { next, int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)) };
}

async function yieldTurns(turns: number): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

/**
 * A concurrent run whose three in-flight coordinates overlap and retry, with ample budgets.
 * Every attempt settles in a deterministic but non-matrix order.
 */
export async function concurrentExperimentResult(): Promise<ExperimentRunResult> {
  const base = experimentManifest();
  const manifest = experimentManifest({
    tasks: [base.tasks[1]],
    exclusions: [],
    repetitions: 3,
    concurrency: 3,
    budgets: { max_requests: 40, max_tokens: 400, max_cost: { amount: 2, currency: 'USD' } },
  });
  const execute: ExperimentAttemptExecutor = async (input) => {
    const { repetition_index: repetition, target_id: target } = input.coordinate;
    await yieldTurns((repetition * 5 + (target === 'alpha' ? 3 : 0)) % 7);
    const retry = repetition === 2 && target === 'alpha' && input.attempt_number === 1;
    return {
      status: retry ? 'infrastructure_failed' : 'passed',
      usage: { requests: 1, tokens: 7, cost: { amount: 0.05, currency: 'USD' } },
      evidence: evidence(input.coordinate.task_kind, !retry),
      ...(retry ? { error_code: 'fixture_transport' } : {}),
    };
  };
  execute.reserve = () => ({
    requests: 1,
    tokens: 10,
    cost: { amount: 0.1, currency: 'USD' },
  });
  return runExperiment(manifest, { execute_attempt: execute });
}

/**
 * A concurrent run whose executor under-declares its demand: each attempt uses twice its
 * reservation, which the pool covers, so the exactly sufficient budget measures everything.
 */
export async function underDeclaredConcurrentResult(): Promise<ExperimentRunResult> {
  const base = experimentManifest();
  const manifest = experimentManifest({
    tasks: [base.tasks[1]],
    exclusions: [],
    repetitions: 3,
    concurrency: 3,
    retry_policy: { max_attempts: 1, retry_on: [] },
    budgets: { max_requests: 24, max_tokens: 120 },
  });
  const execute: ExperimentAttemptExecutor = async (input) => {
    await yieldTurns(input.target.id === 'alpha' ? 9 : 2);
    return {
      status: 'passed',
      usage: { requests: 4, tokens: 20 },
      evidence: evidence(input.coordinate.task_kind),
    };
  };
  execute.reserve = () => ({ requests: 2, tokens: 10 });
  return runExperiment(manifest, { execute_attempt: execute });
}

/** Random executor output within, or occasionally outside, the attempt's grant. */
function randomOutput(
  rng: ReturnType<typeof seededRandom>,
  input: Parameters<Parameters<typeof runExperiment>[1]['execute_attempt']>[0]
): ExperimentAttemptOutput {
  const grant = input.remaining_budget;
  const roll = rng.next();
  const usage: ExperimentAttemptOutput['usage'] = {
    requests: roll < 0.04 ? grant.requests + 1 : rng.int(0, grant.requests),
    ...(roll >= 0.04 && roll < 0.07 ? {} : { tokens: rng.int(0, grant.tokens ?? 0) }),
    cost: {
      amount: (rng.next() < 0.3 ? 1 : rng.next()) * (grant.cost?.amount ?? 0),
      currency: roll >= 0.07 && roll < 0.1 ? 'EUR' : 'USD',
    },
  };
  const status = (
    [
      'passed',
      'task_failed',
      'policy_failed',
      'invalid',
      'incomplete',
      'infrastructure_failed',
    ] as const
  )[rng.int(0, 5)];
  const kind =
    roll >= 0.1 && roll < 0.12
      ? input.coordinate.task_kind === 'agent_workflow'
        ? 'scenario_evaluation'
        : 'agent_workflow'
      : input.coordinate.task_kind;
  return { status, usage, evidence: evidence(kind, rng.next() < 0.9) };
}

/**
 * One seeded random concurrent run: mode, concurrency 2..8, budgets, retries, completion
 * interleaving, and executor outputs (including overruns, missing usage, foreign currency and
 * mismatched evidence) all vary by seed. Every result is an authoritative core output.
 */
export async function randomConcurrentResult(seed: number): Promise<ExperimentRunResult> {
  const rng = seededRandom(seed);
  const live = rng.next() < 0.5;
  const concurrency = rng.int(2, 8) as ExperimentConcurrency;
  const manifest = experimentManifest({
    mode: live ? 'live' : 'fixture',
    concurrency,
    repetitions: rng.int(1, 4),
    retry_policy: {
      max_attempts: rng.int(1, 3),
      retry_on: ['invalid', 'incomplete', 'infrastructure_failed'],
    },
    budgets: {
      max_requests: rng.int(1, 30),
      max_tokens: rng.int(1, 300),
      max_cost: { amount: rng.int(1, 200) / 100, currency: 'USD' },
    },
    ...(live
      ? { live: { concurrency_ceiling: concurrency, stop_conditions: STOP_CONDITIONS } }
      : {}),
  });
  return runExperiment(manifest, {
    ...(live ? { live_authorization: CONCURRENT_AUTHORIZATION } : {}),
    execute_attempt: Object.assign(
      async (input: ExperimentAttemptInput) => {
        await yieldTurns(rng.int(0, 40));
        return randomOutput(rng, input);
      },
      {
        // Most pairs declare a demand (sometimes too small, which overruns truthfully).
        reserve: () =>
          rng.next() < 0.2
            ? undefined
            : {
                requests: rng.int(1, 6),
                tokens: rng.int(1, 60),
                cost: { amount: rng.int(1, 60) / 100, currency: 'USD' },
              },
      }
    ),
  });
}

export interface CoreOutputCase {
  label: string;
  result: ExperimentRunResult;
}

const MATRIX_TOKENS = [undefined, 1, 101] as const;
const MATRIX_COSTS = [
  undefined,
  { amount: 0.1, currency: 'USD' },
  { amount: 2, currency: 'USD' },
  { amount: 0.1, currency: 'EUR' },
  { amount: 2, currency: 'EUR' },
] as const;

/**
 * Run every combination of executor usage, currency, budget overrun, evidence kind, evidence
 * availability, status, mode and retry policy through the public core runner. Each result is an
 * authoritative core output that a saved-evidence report must accept.
 */
export async function coreOutputMatrix(): Promise<CoreOutputCase[]> {
  const base = experimentManifest();
  const cases: CoreOutputCase[] = [];
  for (const mode of ['fixture', 'live'] as const)
    for (const maxAttempts of [1, 2])
      for (const status of ['passed', 'invalid'] as const)
        for (const kindMatches of [true, false])
          for (const available of [true, false])
            for (const tokens of MATRIX_TOKENS)
              for (const cost of MATRIX_COSTS)
                for (const requests of [1, 11]) {
                  const label = JSON.stringify({
                    mode,
                    maxAttempts,
                    status,
                    kindMatches,
                    available,
                    tokens,
                    cost,
                    requests,
                  });
                  const manifest = experimentManifest({
                    mode,
                    tasks: [base.tasks[1]],
                    repetitions: 1,
                    exclusions: [],
                    seed: undefined,
                    retry_policy: {
                      max_attempts: maxAttempts,
                      retry_on: ['invalid', 'incomplete'],
                    },
                    budgets: {
                      max_requests: 10,
                      max_tokens: 100,
                      max_cost: { amount: 1, currency: 'USD' },
                    },
                    ...(mode === 'live'
                      ? {
                          live: {
                            concurrency_ceiling: 1,
                            stop_conditions: [
                              'request_budget_exhausted',
                              'token_budget_exhausted',
                              'cost_budget_exhausted',
                              'usage_unreported',
                              'usage_invalid',
                              'budget_exceeded',
                            ],
                          },
                        }
                      : {}),
                  });
                  const result = await runExperiment(manifest, {
                    ...(mode === 'live'
                      ? {
                          live_authorization: {
                            approved: true,
                            decision_id: 'core-output-matrix',
                            decided_at: '2026-10-08T12:00:00Z',
                            approved_by: 'fixture operator',
                            reason: 'Exercise every core normalization precedence path',
                          },
                        }
                      : {}),
                    execute_attempt: async (input) => {
                      const expectedKind = input.coordinate.task_kind;
                      const kind = kindMatches
                        ? expectedKind
                        : expectedKind === 'agent_workflow'
                          ? 'scenario_evaluation'
                          : 'agent_workflow';
                      return {
                        status,
                        usage: {
                          requests,
                          ...(tokens === undefined ? {} : { tokens }),
                          ...(cost === undefined ? {} : { cost: { ...cost } }),
                        },
                        evidence: evidence(kind, available),
                      };
                    },
                  });
                  cases.push({ label, result });
                }
  return cases;
}

export function reverseKeys(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reverseKeys);
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseKeys(item)])
  );
}
