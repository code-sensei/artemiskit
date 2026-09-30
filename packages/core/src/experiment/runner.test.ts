import { describe, expect, test } from 'bun:test';
import { parseExperimentManifest } from './parser';
import { buildExperimentMatrix, runExperiment } from './runner';
import type { ExperimentAttemptInput, ExperimentAttemptOutput, ExperimentManifest } from './types';

const identity = (digit: string) => ({
  schema_version: '1' as const,
  algorithm: 'sha256' as const,
  digest: digit.repeat(64),
});

const LIVE_CONTROLS = {
  concurrency_ceiling: 1 as const,
  stop_conditions: [
    'request_budget_exhausted',
    'token_budget_exhausted',
    'cost_budget_exhausted',
    'usage_unreported',
    'usage_invalid',
    'budget_exceeded',
  ] as const,
};

const MANIFEST: ExperimentManifest = {
  schema_version: '1',
  id: 'fixture-comparison',
  mode: 'fixture',
  identities: {
    schema_version: '1',
    workload: identity('a'),
    rubric: identity('b'),
    policy: identity('c'),
  },
  tasks: [
    {
      id: 'answer',
      kind: 'scenario_evaluation',
      source: {
        kind: 'scenario_evaluation',
        path: 'scenarios/answer.yaml',
        artifact: identity('1'),
      },
      required_capabilities: ['text'],
      language: 'en-NG',
      policy: 'safety',
    },
    {
      id: 'resolve',
      kind: 'agent_workflow',
      source: {
        kind: 'agent_workflow',
        path: 'workflows/resolve.yaml',
        artifact: identity('2'),
      },
      required_capabilities: ['text', 'tools'],
      language: 'ha-NG',
      policy: 'operations',
    },
  ],
  targets: [
    {
      id: 'fixture-alpha',
      provider: 'fixture',
      model: 'alpha',
      capabilities: ['text'],
    },
    {
      id: 'fixture-beta',
      provider: 'fixture',
      model: 'beta',
      capabilities: ['text', 'tools', 'seed'],
    },
  ],
  repetitions: 2,
  concurrency: 1,
  exclusions: [],
  retry_policy: {
    max_attempts: 2,
    retry_on: ['incomplete', 'invalid', 'infrastructure_failed'],
  },
  budgets: { max_requests: 30 },
};

const response = (
  kind: ExperimentAttemptInput['task']['kind'],
  status: ExperimentAttemptOutput['status'],
  error_code?: string
): ExperimentAttemptOutput => ({
  status,
  usage: { requests: 1, tokens: 10 },
  evidence: { kind, availability: 'available', artifact: identity('e') },
  error_code,
});

const authorization = (decision_id: string) => ({
  approved: true as const,
  decision_id,
  decided_at: '2026-09-30T12:00:00Z',
  approved_by: 'release-operator',
  reason: 'Bounded comparative evaluation approved',
});

describe('buildExperimentMatrix', () => {
  test('constructs a stable complete matrix and marks unsupported capabilities', () => {
    const first = buildExperimentMatrix(MANIFEST);
    const second = buildExperimentMatrix(MANIFEST);

    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
    expect(
      first.map(({ task_id, target_id, repetition_index }) => ({
        task_id,
        target_id,
        repetition_index,
      }))
    ).toEqual([
      { task_id: 'answer', target_id: 'fixture-alpha', repetition_index: 1 },
      { task_id: 'answer', target_id: 'fixture-alpha', repetition_index: 2 },
      { task_id: 'answer', target_id: 'fixture-beta', repetition_index: 1 },
      { task_id: 'answer', target_id: 'fixture-beta', repetition_index: 2 },
      { task_id: 'resolve', target_id: 'fixture-alpha', repetition_index: 1 },
      { task_id: 'resolve', target_id: 'fixture-alpha', repetition_index: 2 },
      { task_id: 'resolve', target_id: 'fixture-beta', repetition_index: 1 },
      { task_id: 'resolve', target_id: 'fixture-beta', repetition_index: 2 },
    ]);
    expect(first[4].missing_capabilities).toEqual(['tools']);
    expect(new Set(first.map((coordinate) => coordinate.coordinate_id)).size).toBe(8);
  });

  test('projects declared seeds and exclusions without sharing coordinate arrays', () => {
    const matrix = buildExperimentMatrix({
      ...MANIFEST,
      seed: { value: 40, strategy: 'increment_by_repetition', require_support: true },
      exclusions: [
        {
          id: 'exclude-alpha-answer',
          reason: 'Adapter is outside the approved task envelope',
          task_id: 'answer',
          target_id: 'fixture-alpha',
        },
      ],
    });

    expect(matrix.map((coordinate) => coordinate.seed)).toEqual([40, 41, 40, 41, 40, 41, 40, 41]);
    expect(matrix[0].declared_exclusion?.id).toBe('exclude-alpha-answer');
    expect(matrix[0].missing_capabilities).toEqual(['seed']);
    expect(matrix[6].missing_capabilities).toEqual([]);
    expect(matrix[0].missing_capabilities).not.toBe(matrix[1].missing_capabilities);
    expect(matrix[0].declared_exclusion).not.toBe(matrix[1].declared_exclusion);
  });
});

describe('runExperiment', () => {
  test('preserves status distinctions, retries, stable ordering, and denominator integrity', async () => {
    const seen: ExperimentAttemptInput[] = [];
    const execute = async (input: ExperimentAttemptInput): Promise<ExperimentAttemptOutput> => {
      seen.push(input);
      const key = `${input.task.id}:${input.target.id}:${String(input.coordinate.repetition_index)}`;
      if (key === 'answer:fixture-alpha:1') {
        return input.attempt_number === 1
          ? response(input.task.kind, 'infrastructure_failed', 'temporary')
          : response(input.task.kind, 'passed');
      }
      if (key === 'answer:fixture-alpha:2') return response(input.task.kind, 'task_failed');
      if (key === 'answer:fixture-beta:1') return response(input.task.kind, 'policy_failed');
      if (key === 'answer:fixture-beta:2')
        return response(input.task.kind, 'invalid', 'judge_invalid');
      if (key === 'resolve:fixture-beta:1') {
        return input.attempt_number === 1
          ? response(input.task.kind, 'incomplete', 'partial')
          : response(input.task.kind, 'passed');
      }
      return response(input.task.kind, 'infrastructure_failed', 'unavailable');
    };

    const result = await runExperiment(MANIFEST, { execute_attempt: execute });

    expect(result.results.map((item) => item.status)).toEqual([
      'passed',
      'task_failed',
      'policy_failed',
      'invalid',
      'unsupported',
      'unsupported',
      'passed',
      'infrastructure_failed',
    ]);
    expect(seen).toHaveLength(10);
    expect(result.results[0].attempts.map((attempt) => attempt.attempt_number)).toEqual([1, 2]);
    expect(result.results[0].attempts[0].retry_chain_id).toBe(
      result.results[0].attempts[1].retry_chain_id
    );
    expect(result.results[0].coordinate.repetition_index).toBe(1);
    expect(result.results[4].attempts).toEqual([]);
    expect(result.results[4].coordinate.missing_capabilities).toEqual(['tools']);

    expect(result.summaries.overall).toEqual({
      planned: 8,
      attempted: 6,
      unattempted: 2,
      valid: 4,
      invalid: 1,
      unsupported: 2,
      excluded: 0,
      incomplete: 0,
      failed: 3,
      passed: 2,
      task_failed: 1,
      policy_failed: 1,
      infrastructure_failed: 1,
    });
    expect(result.summaries.overall.valid).toBe(
      result.summaries.overall.passed +
        result.summaries.overall.task_failed +
        result.summaries.overall.policy_failed
    );
    expect(result.summaries.overall.planned).toBe(
      result.summaries.overall.attempted + result.summaries.overall.unattempted
    );
    expect(result.summaries.operational).toMatchObject({
      executor_invocations: 10,
      reserved_live_requests: 0,
      attempts: 10,
      retry_attempts: 4,
      requests: 10,
      tokens: 100,
      attempt_statuses: {
        passed: 2,
        task_failed: 1,
        policy_failed: 1,
        invalid: 2,
        incomplete: 1,
        infrastructure_failed: 3,
      },
    });
    expect(result.summaries.targets.map((group) => group.key)).toEqual([
      'fixture-alpha',
      'fixture-beta',
    ]);
    expect(result.summaries.tasks.map((group) => group.key)).toEqual(['answer', 'resolve']);
    expect(result.summaries.languages.map((group) => group.key)).toEqual(['en-NG', 'ha-NG']);
    expect(result.summaries.policies.map((group) => group.key)).toEqual(['safety', 'operations']);
    expect(result.uncertainty).toEqual({
      method: 'none',
      sample_size: 4,
      assumptions: [
        'No statistical independence is assumed across repetitions or tasks.',
        'No confidence interval is estimated.',
      ],
      task_clustering: 'not_estimated',
    });
    expect(result.completion).toEqual({
      matrix_complete: true,
      execution_complete: true,
      valid_measurement_coverage_complete: false,
    });
    expect(result.complete).toBe(false);
  });

  test('isolates every executor input from the retained manifest and later coordinates', async () => {
    const isolated = parseExperimentManifest({
      ...MANIFEST,
      tasks: [MANIFEST.tasks[0]],
      targets: MANIFEST.targets.map((target) => ({ ...target, settings: { temperature: 0 } })),
      repetitions: 1,
    });
    const seenTaskIds: string[] = [];
    const seenModels: string[] = [];
    let calls = 0;
    const result = await runExperiment(isolated, {
      execute_attempt: async (input) => {
        calls += 1;
        seenTaskIds.push(input.task.id);
        seenModels.push(input.target.model);
        if (calls === 1) {
          input.coordinate.missing_capabilities.push('mutated');
          input.task.id = 'mutated-task';
          input.task.source.path = 'mutated.yaml';
          input.target.model = 'mutated-model';
          input.target.capabilities.push('mutated');
          if (input.target.settings) input.target.settings.temperature = 1;
          input.remaining_budget.requests = 0;
        }
        return response('scenario_evaluation', 'passed');
      },
    });

    expect(calls).toBe(2);
    expect(seenTaskIds).toEqual(['answer', 'answer']);
    expect(seenModels).toEqual(['alpha', 'beta']);
    expect(result.results.map((item) => item.status)).toEqual(['passed', 'passed']);
    expect(result.results.map((item) => item.coordinate.missing_capabilities)).toEqual([[], []]);
    expect(result.results[0].coordinate.missing_capabilities).not.toBe(
      result.results[1].coordinate.missing_capabilities
    );
    expect(result.manifest.tasks[0]).toMatchObject({
      id: 'answer',
      source: { path: 'scenarios/answer.yaml' },
    });
    expect(result.manifest.targets[0]).toMatchObject({
      model: 'alpha',
      capabilities: ['text'],
      settings: { temperature: 0 },
    });
    expect(result.completion.valid_measurement_coverage_complete).toBe(true);
    expect(result.complete).toBe(true);
  });

  test('rejects evidence whose kind does not match the declared task source', async () => {
    let calls = 0;
    const result = await runExperiment(
      {
        ...MANIFEST,
        tasks: [MANIFEST.tasks[0]],
        repetitions: 1,
        retry_policy: { max_attempts: 1, retry_on: ['invalid'] },
      },
      {
        execute_attempt: async () => {
          calls += 1;
          return response('agent_workflow', 'passed');
        },
      }
    );

    expect(calls).toBe(2);
    expect(result.results[0].attempts[0]).toMatchObject({
      status: 'invalid',
      error_code: 'evidence_kind_mismatch',
      evidence: { kind: 'scenario_evaluation', availability: 'unavailable' },
    });
    expect(result.complete).toBe(false);
  });

  test('requires positive host authorization before invoking a live executor', async () => {
    let calls = 0;
    const live = parseExperimentManifest({
      ...MANIFEST,
      mode: 'live',
      tasks: [MANIFEST.tasks[0]],
      repetitions: 1,
      budgets: {
        max_requests: 1,
        max_tokens: 100,
        max_cost: { amount: 1, currency: 'USD' },
      },
      live: LIVE_CONTROLS,
    });
    const execute = async () => {
      calls += 1;
      return response('scenario_evaluation', 'passed');
    };

    await expect(runExperiment(live, { execute_attempt: execute })).rejects.toThrow(
      'Live experiment execution requires an approved host authorization decision'
    );
    await expect(
      runExperiment(live, {
        execute_attempt: execute,
        live_authorization: {
          approved: false,
          decision_id: 'review-1',
          decided_at: '2026-09-30T12:00:00Z',
          approved_by: 'release-operator',
          reason: 'Bounded comparative evaluation approved',
        } as never,
      })
    ).rejects.toThrow('approved host authorization');
    await expect(
      runExperiment(live, {
        execute_attempt: execute,
        live_authorization: {
          ...authorization('review-1'),
          credential: 'must-not-be-retained',
        } as never,
      })
    ).rejects.toThrow('approved host authorization');
    expect(calls).toBe(0);
  });

  test('enforces live request boundaries and leaves unattempted coordinates incomplete', async () => {
    let calls = 0;
    const live = parseExperimentManifest({
      ...MANIFEST,
      mode: 'live',
      tasks: [MANIFEST.tasks[0]],
      repetitions: 1,
      budgets: {
        max_requests: 1,
        max_tokens: 100,
        max_cost: { amount: 1, currency: 'USD' },
      },
      live: LIVE_CONTROLS,
    });
    const result = await runExperiment(live, {
      live_authorization: authorization('review-1'),
      execute_attempt: async ({ remaining_budget }) => {
        calls += 1;
        expect(remaining_budget).toEqual({
          requests: 1,
          tokens: 100,
          cost: { amount: 1, currency: 'USD' },
        });
        return {
          status: 'passed',
          usage: { requests: 1, tokens: 50, cost: { amount: 0.25, currency: 'USD' } },
          evidence: {
            kind: 'scenario_evaluation',
            availability: 'available',
            artifact: identity('f'),
          },
        };
      },
    });

    expect(calls).toBe(1);
    expect(
      result.results.map(({ status, completion_code }) => ({ status, completion_code }))
    ).toEqual([
      { status: 'passed', completion_code: 'terminal' },
      { status: 'incomplete', completion_code: 'budget_exhausted' },
    ]);
    expect(result.summaries.overall).toMatchObject({
      planned: 2,
      attempted: 1,
      unattempted: 1,
      valid: 1,
      incomplete: 1,
    });
    expect(result.stop_reason).toBe('request_budget_exhausted');
    expect(result.runtime_exclusions).toEqual([
      {
        coordinate_id: result.results[1].coordinate.coordinate_id,
        reason: 'request_budget_exhausted',
      },
    ]);
    expect(result.summaries.operational).toMatchObject({
      executor_invocations: 1,
      reserved_live_requests: 1,
      requests: 1,
    });
    expect(result.live_authorization).toEqual(authorization('review-1'));
    expect(result.complete).toBe(false);
  });

  test('keeps a retry inside its coordinate when the shared budget is exhausted', async () => {
    const bounded = parseExperimentManifest({
      ...MANIFEST,
      tasks: [MANIFEST.tasks[0]],
      repetitions: 1,
      budgets: { max_requests: 1 },
    });
    let calls = 0;
    const result = await runExperiment(bounded, {
      execute_attempt: async () => {
        calls += 1;
        return response('scenario_evaluation', 'infrastructure_failed', 'temporary');
      },
    });

    expect(calls).toBe(1);
    expect(result.results[0]).toMatchObject({
      status: 'incomplete',
      completion_code: 'budget_exhausted',
    });
    expect(result.results[0].attempts).toHaveLength(1);
    expect(result.results[0].attempts[0]).toMatchObject({
      attempt_number: 1,
      status: 'infrastructure_failed',
    });
    expect(result.results[1]).toMatchObject({
      status: 'incomplete',
      completion_code: 'budget_exhausted',
      attempts: [],
    });
    expect(result.summaries.operational.attempt_statuses.infrastructure_failed).toBe(1);
    expect(result.stop_reason).toBe('request_budget_exhausted');
    expect(result.runtime_exclusions).toEqual([
      {
        coordinate_id: result.results[0].coordinate.coordinate_id,
        reason: 'request_budget_exhausted',
      },
      {
        coordinate_id: result.results[1].coordinate.coordinate_id,
        reason: 'request_budget_exhausted',
      },
    ]);
  });

  test('reserves live requests per executor invocation even when reported usage is zero', async () => {
    const live = parseExperimentManifest({
      ...MANIFEST,
      mode: 'live',
      tasks: [MANIFEST.tasks[0]],
      repetitions: 1,
      retry_policy: { max_attempts: 3, retry_on: ['infrastructure_failed'] },
      budgets: {
        max_requests: 1,
        max_tokens: 100,
        max_cost: { amount: 1, currency: 'USD' },
      },
      live: LIVE_CONTROLS,
    });
    let calls = 0;
    const result = await runExperiment(live, {
      live_authorization: authorization('zero-usage-review'),
      execute_attempt: async () => {
        calls += 1;
        return {
          status: 'infrastructure_failed',
          usage: { requests: 0, tokens: 0, cost: { amount: 0, currency: 'USD' } },
          evidence: { kind: 'scenario_evaluation', availability: 'unavailable' },
          error_code: 'temporary',
        };
      },
    });

    expect(calls).toBe(1);
    expect(result.results.map((item) => item.status)).toEqual(['incomplete', 'incomplete']);
    expect(result.results[0].attempts).toHaveLength(1);
    expect(result.summaries.operational).toMatchObject({
      executor_invocations: 1,
      reserved_live_requests: 1,
      requests: 0,
      retry_attempts: 0,
    });
    expect(result.stop_reason).toBe('request_budget_exhausted');
    expect(result.runtime_exclusions).toEqual([
      {
        coordinate_id: result.results[0].coordinate.coordinate_id,
        reason: 'request_budget_exhausted',
      },
      {
        coordinate_id: result.results[1].coordinate.coordinate_id,
        reason: 'request_budget_exhausted',
      },
    ]);
    expect(result.complete).toBe(false);
  });

  test('separates matrix execution from valid measurement coverage', async () => {
    const single = {
      ...MANIFEST,
      tasks: [MANIFEST.tasks[0]],
      repetitions: 1,
      retry_policy: { max_attempts: 1 as const, retry_on: [] },
    };
    const invalid = await runExperiment(single, {
      execute_attempt: async () =>
        response('scenario_evaluation', 'invalid', 'invalid_measurement'),
    });
    const infrastructure = await runExperiment(single, {
      execute_attempt: async () =>
        response('scenario_evaluation', 'infrastructure_failed', 'target_unavailable'),
    });
    const unsupported = await runExperiment(
      {
        ...single,
        targets: MANIFEST.targets.map((target) => ({ ...target, capabilities: [] })),
      },
      { execute_attempt: async () => response('scenario_evaluation', 'passed') }
    );
    const excluded = await runExperiment(
      {
        ...single,
        exclusions: [{ id: 'excluded', reason: 'Declared out of scope', task_id: 'answer' }],
      },
      { execute_attempt: async () => response('scenario_evaluation', 'passed') }
    );
    const budgetExhausted = await runExperiment(
      { ...single, budgets: { max_requests: 1 } },
      { execute_attempt: async () => response('scenario_evaluation', 'passed') }
    );
    let repetition = 0;
    const validMixed = await runExperiment(
      { ...single, budgets: { max_requests: 2 } },
      {
        execute_attempt: async () => {
          repetition += 1;
          return response('scenario_evaluation', repetition === 1 ? 'passed' : 'task_failed');
        },
      }
    );

    for (const result of [invalid, infrastructure, unsupported, excluded]) {
      expect(result.completion).toMatchObject({
        matrix_complete: true,
        execution_complete: true,
        valid_measurement_coverage_complete: false,
      });
      expect(result.complete).toBe(false);
    }
    expect(budgetExhausted.completion).toEqual({
      matrix_complete: true,
      execution_complete: false,
      valid_measurement_coverage_complete: false,
    });
    expect(budgetExhausted.complete).toBe(false);
    expect(validMixed.completion).toEqual({
      matrix_complete: true,
      execution_complete: true,
      valid_measurement_coverage_complete: true,
    });
    expect(validMixed.summaries.overall).toMatchObject({ valid: 2, passed: 1, task_failed: 1 });
    expect(validMixed.complete).toBe(true);
  });

  test('halts live execution when usage evidence is missing or exceeds the granted budget', async () => {
    const live = parseExperimentManifest({
      ...MANIFEST,
      mode: 'live',
      tasks: [MANIFEST.tasks[0]],
      repetitions: 1,
      budgets: {
        max_requests: 2,
        max_tokens: 100,
        max_cost: { amount: 1, currency: 'USD' },
      },
      live: LIVE_CONTROLS,
    });
    let calls = 0;
    const missing = await runExperiment(live, {
      live_authorization: authorization('review-1'),
      execute_attempt: async () => {
        calls += 1;
        return {
          status: 'passed',
          usage: { requests: 1 },
          evidence: {
            kind: 'scenario_evaluation',
            availability: 'available',
            artifact: identity('f'),
          },
        };
      },
    });
    expect(calls).toBe(1);
    expect(missing.results.map((result) => result.completion_code)).toEqual([
      'usage_unreported',
      'budget_exhausted',
    ]);

    const exceeded = await runExperiment(
      { ...live, repetitions: 1 },
      {
        live_authorization: authorization('review-2'),
        execute_attempt: async () => ({
          status: 'passed',
          usage: { requests: 3, tokens: 101, cost: { amount: 2, currency: 'USD' } },
          evidence: {
            kind: 'scenario_evaluation',
            availability: 'available',
            artifact: identity('f'),
          },
        }),
      }
    );
    expect(exceeded.results[0]).toMatchObject({
      status: 'incomplete',
      completion_code: 'budget_exceeded',
    });

    const wrongCurrency = await runExperiment(
      { ...live, repetitions: 1 },
      {
        live_authorization: authorization('review-3'),
        execute_attempt: async () => ({
          status: 'passed',
          usage: { requests: 1, tokens: 1, cost: { amount: 0.1, currency: 'EUR' } },
          evidence: {
            kind: 'scenario_evaluation',
            availability: 'available',
            artifact: identity('f'),
          },
        }),
      }
    );
    expect(wrongCurrency.results[0].attempts[0]).toMatchObject({
      status: 'invalid',
      error_code: 'cost_currency_mismatch',
      usage: { requests: 1, tokens: 1 },
    });
  });

  test('turns thrown and malformed adapter results into bounded evidence', async () => {
    const single = {
      ...MANIFEST,
      tasks: [MANIFEST.tasks[0]],
      repetitions: 1,
    };
    const thrown = await runExperiment(single, {
      execute_attempt: async () => {
        throw new Error('provider response containing sensitive detail');
      },
    });
    expect(thrown.results[0].attempts).toHaveLength(2);
    expect(thrown.results[0].attempts[0]).toMatchObject({
      status: 'infrastructure_failed',
      error_code: 'executor_error',
      usage: { requests: 0 },
    });

    const malformed = await runExperiment(single, {
      execute_attempt: async () => ({ status: 'passed', usage: { requests: -1 } }),
    });
    expect(malformed.results[0].attempts[0]).toMatchObject({
      status: 'invalid',
      error_code: 'invalid_executor_result',
      usage: { requests: 0 },
    });
  });
});
