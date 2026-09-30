import { beforeAll, describe, expect, test } from 'bun:test';
import type { ExperimentRunResult } from '@artemiskit/core';
import { createExperimentReport } from './model';
import {
  liveBudgetResult,
  mixedExperimentResult,
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
    expect(JSON.stringify(report)).toContain('request_budget_exhausted');
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
});
