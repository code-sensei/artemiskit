import { describe, expect, test } from 'bun:test';
import { parseExperimentManifest } from './parser';
import { buildExperimentMatrix, runExperiment } from './runner';
import type { ExperimentAttemptInput, ExperimentAttemptOutput, ExperimentManifest } from './types';

const identity = (digit: string) => ({
  schema_version: '1' as const,
  algorithm: 'sha256' as const,
  digest: digit.repeat(64),
});

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
      required_capabilities: ['text'],
      language: 'en-NG',
      policy: 'safety',
    },
    {
      id: 'resolve',
      kind: 'agent_workflow',
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
      capabilities: ['text', 'tools'],
    },
  ],
  repetitions: 2,
  retry_policy: {
    max_attempts: 2,
    retry_on: ['incomplete', 'invalid', 'infrastructure_failed'],
  },
  budgets: { max_requests: 30 },
};

const response = (
  status: ExperimentAttemptOutput['status'],
  error_code?: string
): ExperimentAttemptOutput => ({
  status,
  usage: { requests: 1, tokens: 10 },
  error_code,
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
});

describe('runExperiment', () => {
  test('preserves status distinctions, retries, stable ordering, and denominator integrity', async () => {
    const seen: ExperimentAttemptInput[] = [];
    const execute = async (input: ExperimentAttemptInput): Promise<ExperimentAttemptOutput> => {
      seen.push(input);
      const key = `${input.task.id}:${input.target.id}:${String(input.coordinate.repetition_index)}`;
      if (key === 'answer:fixture-alpha:1') {
        return input.attempt_number === 1
          ? response('infrastructure_failed', 'temporary')
          : response('passed');
      }
      if (key === 'answer:fixture-alpha:2') return response('task_failed');
      if (key === 'answer:fixture-beta:1') return response('policy_failed');
      if (key === 'answer:fixture-beta:2') return response('invalid', 'judge_invalid');
      if (key === 'resolve:fixture-beta:1') {
        return input.attempt_number === 1 ? response('incomplete', 'partial') : response('passed');
      }
      return response('infrastructure_failed', 'unavailable');
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
    expect(result.complete).toBe(true);
  });

  test('requires positive host authorization before invoking a live executor', async () => {
    let calls = 0;
    const live = parseExperimentManifest({
      ...MANIFEST,
      mode: 'live',
      tasks: [MANIFEST.tasks[0]],
      targets: [MANIFEST.targets[0]],
      repetitions: 1,
      budgets: {
        max_requests: 1,
        max_tokens: 100,
        max_cost: { amount: 1, currency: 'USD' },
      },
    });
    const execute = async () => {
      calls += 1;
      return response('passed');
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
        } as never,
      })
    ).rejects.toThrow('approved host authorization');
    await expect(
      runExperiment(live, {
        execute_attempt: execute,
        live_authorization: {
          approved: true,
          decision_id: 'review-1',
          decided_at: '2026-09-30T12:00:00Z',
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
      targets: [MANIFEST.targets[0]],
      repetitions: 2,
      budgets: {
        max_requests: 1,
        max_tokens: 100,
        max_cost: { amount: 1, currency: 'USD' },
      },
    });
    const result = await runExperiment(live, {
      live_authorization: {
        approved: true,
        decision_id: 'review-1',
        decided_at: '2026-09-30T12:00:00Z',
      },
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
    expect(result.live_authorization).toEqual({
      approved: true,
      decision_id: 'review-1',
      decided_at: '2026-09-30T12:00:00Z',
    });
    expect(result.complete).toBe(false);
  });

  test('keeps a retry inside its coordinate when the shared budget is exhausted', async () => {
    const bounded = parseExperimentManifest({
      ...MANIFEST,
      tasks: [MANIFEST.tasks[0]],
      targets: [MANIFEST.targets[0]],
      repetitions: 2,
      budgets: { max_requests: 1 },
    });
    let calls = 0;
    const result = await runExperiment(bounded, {
      execute_attempt: async () => {
        calls += 1;
        return response('infrastructure_failed', 'temporary');
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
  });

  test('halts live execution when usage evidence is missing or exceeds the granted budget', async () => {
    const live = parseExperimentManifest({
      ...MANIFEST,
      mode: 'live',
      tasks: [MANIFEST.tasks[0]],
      targets: [MANIFEST.targets[0]],
      repetitions: 2,
      budgets: {
        max_requests: 2,
        max_tokens: 100,
        max_cost: { amount: 1, currency: 'USD' },
      },
    });
    let calls = 0;
    const missing = await runExperiment(live, {
      live_authorization: {
        approved: true,
        decision_id: 'review-1',
        decided_at: '2026-09-30T12:00:00Z',
      },
      execute_attempt: async () => {
        calls += 1;
        return { status: 'passed', usage: { requests: 1 } };
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
        live_authorization: {
          approved: true,
          decision_id: 'review-2',
          decided_at: '2026-09-30T12:00:00Z',
        },
        execute_attempt: async () => ({
          status: 'passed',
          usage: { requests: 3, tokens: 101, cost: { amount: 2, currency: 'USD' } },
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
        live_authorization: {
          approved: true,
          decision_id: 'review-3',
          decided_at: '2026-09-30T12:00:00Z',
        },
        execute_attempt: async () => ({
          status: 'passed',
          usage: { requests: 1, tokens: 1, cost: { amount: 0.1, currency: 'EUR' } },
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
      targets: [MANIFEST.targets[0]],
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
