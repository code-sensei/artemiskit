import { beforeAll, describe, expect, test } from 'bun:test';
import type { ExperimentRunResult } from '@artemiskit/core';
import { createExperimentReport } from './model';
import {
  adapterErrorCollisionResult,
  liveBudgetResult,
  liveRunnerHaltResult,
  liveUsageUnreportedResult,
  mixedExperimentResult,
  preFixLiveMissingUsageResult,
  reverseKeys,
  statusExperimentResult,
} from './model-fixtures';

let mixed: ExperimentRunResult;
let live: ExperimentRunResult;

beforeAll(async () => {
  mixed = await mixedExperimentResult();
  live = await liveBudgetResult();
});

const error = 'Invalid, unsupported or ambiguous experiment report evidence';

describe('canonical experiment report model', () => {
  test('is deterministic across inert objects, JSON, and object key order', () => {
    const before = JSON.stringify(mixed);
    const report = createExperimentReport(mixed);
    expect(createExperimentReport(JSON.stringify(mixed))).toEqual(report);
    expect(createExperimentReport(reverseKeys(mixed))).toEqual(report);
    expect(JSON.stringify(mixed)).toBe(before);
    expect(report.summary).toMatchObject({
      planned: 8,
      attempted: 4,
      unattempted: 4,
      valid: 3,
      passed: 1,
      task_failed: 1,
      policy_failed: 1,
      invalid: 1,
      unsupported: 2,
      excluded: 2,
      attempts: 6,
      retries: 2,
      requests: 6,
      tokens: 38,
      cost: null,
      validOutcomeRate: 1 / 3,
    });
    expect(report.summary.completion).toEqual({
      matrix_complete: true,
      execution_complete: true,
      valid_measurement_coverage_complete: false,
    });
    expect(report.sections.map((section) => section.id)).toEqual([
      'coordinates',
      'attempts',
      'tasks',
      'targets',
      'controls',
      'summaries',
      'budgets',
      'exclusions',
    ]);
  });

  test('keeps exact denominators, retries, repetitions, and task evidence kinds distinct', () => {
    const report = createExperimentReport(mixed);
    expect(report.methodology.join(' ')).toContain(
      'passed / (passed + task failed + policy failed)'
    );
    expect(report.sections.find((section) => section.id === 'coordinates')?.rows).toHaveLength(8);
    expect(report.sections.find((section) => section.id === 'attempts')?.rows).toHaveLength(6);
    const text = JSON.stringify(report);
    expect(text).toContain('scenario_evaluation: available');
    expect(text).toContain('agent_workflow: available');
    expect(text).toContain('unavailable');
    expect(text).toContain('1/3');
    expect(text).not.toContain('winner');
    expect(text).not.toContain('certified');
  });

  test('links every row and finding to deterministic local evidence and SHA-256 identities', () => {
    const report = createExperimentReport(mixed);
    const evidence = new Set(report.evidence.map((item) => item.id));
    expect(report.evidence.length).toBeGreaterThan(10);
    for (const item of [
      ...report.findings,
      ...report.sections.flatMap((section) => section.rows),
    ]) {
      expect(item.id).toMatch(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/);
      expect(item.evidenceIds.length).toBeGreaterThan(0);
      expect(item.evidenceIds.every((id) => evidence.has(id))).toBe(true);
    }
    for (const item of report.evidence) {
      expect(item.id).toMatch(/^e-[a-f0-9]{64}$/);
      expect(item.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(item.path === '' || item.path.startsWith('/')).toBe(true);
    }
  });

  test('shows all non-valid outcome classes without converting them to passes', async () => {
    for (const status of ['invalid', 'incomplete', 'infrastructure_failed'] as const) {
      const report = createExperimentReport(await statusExperimentResult(status));
      expect(report.summary[status]).toBe(2);
      expect(report.summary.valid).toBe(0);
      expect(report.summary.validOutcomeRate).toBeNull();
      expect(report.summary.completion.valid_measurement_coverage_complete).toBe(false);
    }
    expect(createExperimentReport(mixed).summary).toMatchObject({ unsupported: 2, excluded: 2 });
  });

  test('retains live authorization controls, request reservation, stop evidence, and cost', () => {
    const report = createExperimentReport(live);
    expect(report.summary).toMatchObject({
      planned: 4,
      attempted: 1,
      unattempted: 3,
      passed: 1,
      incomplete: 3,
      executorInvocations: 1,
      reservedLiveRequests: 1,
      requests: 1,
      tokens: 10,
      cost: { amount: 0.1, currency: 'USD' },
    });
    expect(report.findings.some((finding) => finding.title.includes('stopped'))).toBe(true);
    const text = JSON.stringify(report);
    expect(text).toContain('request_budget_exhausted');
    expect(text).toContain('concurrency ceiling 1');
    expect(text).toContain('Bounded report fixture');
  });

  test('accepts unrestricted adapter error-code collisions in fixture and live terminal results', async () => {
    for (const mode of ['fixture', 'live'] as const) {
      for (const errorCode of [
        'usage_unreported',
        'usage_invalid',
        'budget_exceeded',
        'invalid_executor_result',
        'cost_currency_mismatch',
      ]) {
        const collision = await adapterErrorCollisionResult(mode, errorCode);
        expect(collision.stop_reason).toBeUndefined();
        expect(collision.results.every((item) => item.completion_code === 'terminal')).toBe(true);
        expect(createExperimentReport(collision).summary).toMatchObject({
          invalid: 2,
          incomplete: 0,
        });
      }
    }
  });
});

describe('strict saved-result validation', () => {
  test('rejects hostile, exotic, sparse, non-finite, unsupported, and oversized input generically', () => {
    let called = 0;
    const hostile = () => {
      called += 1;
      throw new Error('PRIVATE-CREDENTIAL');
    };
    const getter = Object.defineProperty({}, 'schema_version', { enumerable: true, get: hostile });
    const proxy = new Proxy(mixed, { get: hostile, ownKeys: hostile, getPrototypeOf: hostile });
    const sparse = Array(2);
    sparse[1] = mixed;
    const exotic = Object.setPrototypeOf([mixed], null);
    const symbol = { ...mixed, [Symbol('secret')]: 'PRIVATE-CREDENTIAL' };
    const nonFinite = structuredClone(mixed);
    nonFinite.summaries.operational.tokens = Number.NaN;
    for (const input of [
      null,
      {},
      [],
      getter,
      proxy,
      sparse,
      exotic,
      symbol,
      nonFinite,
      { ...mixed, extra: true },
    ])
      expect(() => createExperimentReport(input)).toThrow(error);
    expect(() => createExperimentReport(' '.repeat(8 * 1024 * 1024 + 1))).toThrow(error);
    expect(called).toBe(0);
  });

  test('rejects contradictory summaries, completion, identities, coordinates, retries, attempts, and evidence', () => {
    const mutations: ((value: ExperimentRunResult) => void)[] = [
      (value) => value.summaries.overall.passed++,
      (value) => {
        value.complete = true;
      },
      (value) => {
        value.completion.valid_measurement_coverage_complete = true;
      },
      (value) => {
        value.identities.workload.digest = 'f'.repeat(64);
      },
      (value) => {
        value.results[0].coordinate.coordinate_id = 'f'.repeat(64);
      },
      (value) => {
        value.results[0].attempts[0].retry_chain_id = 'f'.repeat(64);
      },
      (value) => {
        value.results[0].attempts[0].attempt_number = 2;
      },
      (value) => {
        value.results[0].attempts[1].evidence.kind = 'agent_workflow';
      },
      (value) => value.results.pop(),
      (value) => value.results.reverse(),
      (value) => {
        value.manifest.budgets.max_requests = 1;
      },
      (value) => {
        value.results[5].attempts.pop();
      },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(mixed);
      mutate(value);
      expect(() => createExperimentReport(value)).toThrow(error);
    }
  });

  test('rejects contradictory runtime exclusions, stop metadata, and live approval', () => {
    const mutations: ((value: ExperimentRunResult) => void)[] = [
      (value) => value.runtime_exclusions.pop(),
      (value) => {
        value.stop_reason = 'cost_budget_exhausted';
      },
      (value) => {
        if (value.live_authorization) value.live_authorization.approved_by = '';
      },
      (value) => {
        if (value.live_authorization) value.live_authorization.decision_id = 'PRIVATE SECRET';
      },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(live);
      mutate(value);
      expect(() => createExperimentReport(value)).toThrow(error);
    }
  });

  test('rejects pre-fix live missing-usage evidence without matching stop semantics', async () => {
    const preFix = await preFixLiveMissingUsageResult();
    expect(preFix.results.every((item) => item.completion_code === 'terminal')).toBe(true);
    expect(preFix.results.every((item) => item.attempts[0].usage.tokens === undefined)).toBe(true);
    expect(preFix.stop_reason).toBeUndefined();
    expect(() => createExperimentReport(preFix)).toThrow(error);
  });

  test('accepts the enforced live usage halt before evidence-kind normalization', async () => {
    const enforced = await liveUsageUnreportedResult();
    expect(enforced.results[0]).toMatchObject({
      status: 'incomplete',
      completion_code: 'usage_unreported',
      attempts: [{ status: 'incomplete', error_code: 'usage_unreported' }],
    });
    expect(enforced.results[0].attempts[0].evidence.kind).not.toBe(
      enforced.results[0].coordinate.task_kind
    );
    expect(enforced.stop_reason).toBe('usage_unreported');
    expect(createExperimentReport(enforced).summary).toMatchObject({
      incomplete: 2,
      executorInvocations: 1,
    });
  });

  test('accepts exact core results for every runner-owned live halt shape', async () => {
    for (const [cause, completionCode] of [
      ['usage_unreported', 'usage_unreported'],
      ['invalid_executor_result', 'usage_invalid'],
      ['cost_currency_mismatch', 'usage_invalid'],
      ['budget_exceeded', 'budget_exceeded'],
    ] as const) {
      const result = await liveRunnerHaltResult(cause);
      expect(result.results[0]).toMatchObject({
        completion_code: completionCode,
        attempts: [{ error_code: cause }],
      });
      expect(result.stop_reason).toBe(completionCode);
      expect(createExperimentReport(result).summary).toMatchObject({
        attempted: 1,
        incomplete: completionCode === 'usage_invalid' ? 1 : 2,
        invalid: completionCode === 'usage_invalid' ? 1 : 0,
      });
    }
  });

  test('rejects mutated runner-owned nonterminal codes and normalized evidence pairings', async () => {
    for (const cause of [
      'usage_unreported',
      'invalid_executor_result',
      'cost_currency_mismatch',
      'budget_exceeded',
    ] as const) {
      const result = await liveRunnerHaltResult(cause);
      result.results[0].attempts[0].error_code = 'adapter_arbitrary';
      expect(() => createExperimentReport(result)).toThrow(error);
    }

    const invalidExecutor = await liveRunnerHaltResult('invalid_executor_result');
    invalidExecutor.results[0].attempts[0].usage.requests = 1;
    invalidExecutor.summaries.operational.requests = 1;
    expect(() => createExperimentReport(invalidExecutor)).toThrow(error);

    const costMismatch = await liveRunnerHaltResult('cost_currency_mismatch');
    costMismatch.results[0].attempts[0].usage.tokens = undefined;
    costMismatch.summaries.operational.tokens = 0;
    expect(() => createExperimentReport(costMismatch)).toThrow(error);

    const invalidEvidence = await liveRunnerHaltResult('invalid_executor_result');
    invalidEvidence.results[0].attempts[0].evidence = {
      kind: invalidEvidence.results[0].coordinate.task_kind,
      availability: 'available',
      artifact: { schema_version: '1', algorithm: 'sha256', digest: 'f'.repeat(64) },
    };
    expect(() => createExperimentReport(invalidEvidence)).toThrow(error);
  });

  test('rejects reported cost in a currency other than the manifest maximum', () => {
    const changed = structuredClone(live);
    const attemptCost = changed.results[0].attempts[0].usage.cost;
    const summaryCost = changed.summaries.operational.cost;
    if (!attemptCost || !summaryCost) throw new Error('Expected the live fixture to report cost');
    attemptCost.currency = 'EUR';
    summaryCost.currency = 'EUR';
    expect(() => createExperimentReport(changed)).toThrow(error);
  });

  test('requires the exact canonical manifest instead of accepting parser defaults or normalization', () => {
    const { mode: _mode, ...manifestWithoutMode } = structuredClone(mixed.manifest);
    const missingMode = { ...structuredClone(mixed), manifest: manifestWithoutMode };
    expect(() => createExperimentReport(missingMode)).toThrow(error);

    const paddedProvider = structuredClone(mixed);
    paddedProvider.manifest.targets[0].provider = ` ${paddedProvider.manifest.targets[0].provider} `;
    expect(() => createExperimentReport(paddedProvider)).toThrow(error);
  });

  test('matches core authorization datetime and normalized text constraints', () => {
    for (const decidedAt of ['2026-99-99T99:99:99Z', '2026-02-30T12:00:00Z']) {
      const value = structuredClone(live);
      if (value.live_authorization) value.live_authorization.decided_at = decidedAt;
      expect(() => createExperimentReport(value)).toThrow(error);
    }
    const padded = structuredClone(live);
    if (padded.live_authorization) padded.live_authorization.approved_by = ' fixture operator ';
    expect(() => createExperimentReport(padded)).toThrow(error);
  });

  test('enforces the public per-attempt usage bounds', () => {
    const requests = structuredClone(mixed);
    requests.results[0].attempts[0].usage.requests = 1_000_001;
    requests.summaries.operational.requests += 1_000_000;
    expect(() => createExperimentReport(requests)).toThrow(error);

    const tokens = structuredClone(mixed);
    tokens.results[0].attempts[0].usage.tokens = 10_000_000_001;
    tokens.summaries.operational.tokens += 9_999_999_997;
    expect(() => createExperimentReport(tokens)).toThrow(error);
  });
});
