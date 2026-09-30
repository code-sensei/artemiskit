import {
  type ExecutedExperimentAttemptStatus,
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

export function reverseKeys(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reverseKeys);
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseKeys(item)])
  );
}
