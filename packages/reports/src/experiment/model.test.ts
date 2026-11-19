import { beforeAll, describe, expect, test } from 'bun:test';
import { type ExperimentRunResult, runExperiment } from '@artemiskit/core';
import { createExperimentReport } from './model';
import {
  adapterErrorCollisionResult,
  concurrentExperimentResult,
  coreOutputMatrix,
  experimentManifest,
  haltedInFlightResult,
  liveBudgetResult,
  liveRunnerHaltResult,
  liveUsageUnreportedResult,
  localOpenWeightResult,
  mixedExperimentResult,
  preFixLiveMissingUsageResult,
  randomConcurrentResult,
  reverseKeys,
  statusExperimentResult,
  underDeclaredConcurrentResult,
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

  test('labels local open-weight targets and never invents a cost for them', async () => {
    const local = await localOpenWeightResult();
    const report = createExperimentReport(local);
    expect(report.summary).toMatchObject({ passed: 2, tokens: 40 });
    expect(report.summary.cost).toBeNull();
    expect(report.summary.costStatus).toBe('not_applicable');
    const text = JSON.stringify(report);
    expect(text).toContain('local via ollama; cost not applicable (no metered spend)');
    expect(text).toContain('open weights (Apache-2.0)');
    expect(text).toContain('Qwen');

    const forged = structuredClone(local);
    forged.results[0].attempts[0].usage.cost = { amount: 0, currency: 'USD' };
    expect(() => createExperimentReport(forged)).toThrow(error);
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

  test('accepts every core output across combined usage, currency, budget, and evidence failures', async () => {
    const cases = await coreOutputMatrix();
    expect(cases.length).toBe(960);
    const rejected = cases.filter(({ result }) => {
      try {
        createExperimentReport(result);
        return false;
      } catch {
        return true;
      }
    });
    expect(rejected.map(({ label }) => label)).toEqual([]);
    // 960 core runs and validations take about 1.7 s idle; allow for full-suite load.
  }, 20_000);

  test('rejects retained foreign-currency or overrun usage outside runner-normalized evidence', async () => {
    const runnerNormalized = [
      'evidence_kind_mismatch',
      'evidence_unavailable',
      'cost_currency_mismatch',
    ];
    let disguised = 0;
    for (const { label, result } of await coreOutputMatrix()) {
      const { budgets } = result.manifest;
      result.results.forEach((coordinateResult, resultIndex) => {
        coordinateResult.attempts.forEach((attempt, attemptIndex) => {
          const { usage } = attempt;
          const carriesUnsafeUsage =
            usage.cost?.currency === 'EUR' ||
            usage.requests > budgets.max_requests ||
            (usage.tokens ?? 0) > (budgets.max_tokens ?? Number.POSITIVE_INFINITY) ||
            (usage.cost?.amount ?? 0) > (budgets.max_cost?.amount ?? Number.POSITIVE_INFINITY);
          if (!runnerNormalized.includes(attempt.error_code ?? '') || !carriesUnsafeUsage) return;

          for (const disguise of ['error_code', 'evidence'] as const) {
            const forged = structuredClone(result);
            const forgedAttempt = forged.results[resultIndex].attempts[attemptIndex];
            if (disguise === 'error_code') forgedAttempt.error_code = 'adapter_arbitrary';
            else
              forgedAttempt.evidence = {
                kind: forged.results[resultIndex].coordinate.task_kind,
                availability: 'available',
                artifact: { schema_version: '1', algorithm: 'sha256', digest: 'f'.repeat(64) },
              };
            expect(() => createExperimentReport(forged), `${disguise} ${label}`).toThrow(error);
            disguised += 1;
          }
        });
      });
    }
    expect(disguised).toBeGreaterThan(100);
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

describe('concurrent experiment results', () => {
  type Attempt = ExperimentRunResult['results'][number]['attempts'][number];
  const attemptsOf = (value: ExperimentRunResult) => value.results.flatMap((item) => item.attempts);
  const admission = (attempt: Attempt) => {
    if (!attempt.admission) throw new Error('Expected admission evidence');
    return attempt.admission;
  };
  /** The attempt whose admission or settlement occupies a run-wide event position. */
  const atEvent = (value: ExperimentRunResult, position: number) => {
    const attempt = attemptsOf(value).find(
      (item) => admission(item).admitted_at === position || admission(item).settled_at === position
    );
    if (!attempt) throw new Error(`No attempt at event ${position}`);
    return attempt;
  };

  let concurrent: ExperimentRunResult;
  beforeAll(async () => {
    concurrent = await concurrentExperimentResult();
  });

  test('validates a concurrent result and states its parallel level and caveat', () => {
    const peak = Math.max(
      ...attemptsOf(concurrent).map(
        (attempt) =>
          attemptsOf(concurrent).filter(
            (other) =>
              admission(other).admitted_at <= admission(attempt).admitted_at &&
              admission(other).settled_at > admission(attempt).admitted_at
          ).length
      )
    );
    expect(peak).toBe(3);
    expect(concurrent.summaries.operational.retry_attempts).toBe(1);

    const report = createExperimentReport(concurrent);
    expect(report.summary.concurrency).toBe(3);
    const methodology = report.methodology.join(' ');
    expect(report.summary.peakInFlight).toBe(3);
    expect(methodology).toContain('declared limit of 3 coordinates in flight');
    expect(methodology).toContain('recorded peak was 3');
    expect(methodology).toContain('does not prove wall-clock timing');
    expect(methodology).toContain('Up to 3 coordinates were allowed to run concurrently');
    expect(JSON.stringify(report.sections)).toContain('concurrency 3');
    expect(createExperimentReport(reverseKeys(concurrent))).toEqual(report);
    expect(createExperimentReport(mixed).summary.concurrency).toBe(1);
    expect(createExperimentReport(mixed).methodology.join(' ')).not.toContain('in flight');
    expect(createExperimentReport(mixed).summary.peakInFlight).toBeNull();
  });

  test('replays many random concurrent interleavings, halts and overruns', async () => {
    const stops = new Set<string>();
    const rejected: number[] = [];
    for (let seed = 1; seed <= 150; seed += 1) {
      const result = await randomConcurrentResult(seed);
      stops.add(result.stop_reason ?? 'none');
      try {
        createExperimentReport(result);
      } catch {
        rejected.push(seed);
      }
    }
    expect(rejected).toEqual([]);
    for (const reason of ['none', 'request_budget_exhausted', 'budget_exceeded'])
      expect(stops.has(reason)).toBe(true);
    expect(stops.size).toBeGreaterThan(4);
  });

  test('rejects every random result whose recorded grant is forged', async () => {
    let forged = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const result = await randomConcurrentResult(seed);
      const attempts = attemptsOf(result);
      if (!attempts.length) continue;
      const target = admission(attempts[seed % attempts.length]);
      target.granted_budget.requests += 1;
      expect(() => createExperimentReport(result), `seed ${seed}`).toThrow(error);
      forged += 1;
    }
    expect(forged).toBeGreaterThan(40);
  });

  test('rejects tampered or inconsistent admission evidence', () => {
    const mutations: [string, (value: ExperimentRunResult) => void][] = [
      [
        'grant cost',
        (value) => {
          const grant = admission(value.results[0].attempts[0]).granted_budget;
          if (grant.cost) grant.cost.amount /= 2;
        },
      ],
      [
        'grant tokens removed',
        (value) => {
          admission(value.results[0].attempts[0]).granted_budget.tokens = undefined;
        },
      ],
      [
        'grant extra key',
        (value) => {
          Object.assign(admission(value.results[0].attempts[0]).granted_budget, { slots: 3 });
        },
      ],
      [
        'missing admission',
        (value) => {
          value.results[1].attempts[0].admission = undefined;
        },
      ],
      [
        'settled before admitted',
        (value) => {
          const record = admission(value.results[0].attempts[0]);
          [record.admitted_at, record.settled_at] = [record.settled_at, record.admitted_at];
        },
      ],
      [
        'duplicate event',
        (value) => {
          admission(value.results[1].attempts[0]).settled_at = admission(
            value.results[0].attempts[0]
          ).settled_at;
        },
      ],
      [
        'event outside the sequence',
        (value) => {
          admission(value.results[0].attempts[0]).settled_at += 100;
        },
      ],
      [
        'swapped first admissions',
        (value) => {
          const first = admission(atEvent(value, 0));
          const second = admission(atEvent(value, 1));
          [first.admitted_at, second.admitted_at] = [second.admitted_at, first.admitted_at];
        },
      ],
      [
        'retry admitted before its first attempt settled',
        (value) => {
          const chain = value.results.find((item) => item.attempts.length === 2);
          if (!chain) throw new Error('Expected a retry chain');
          const first = admission(chain.attempts[0]);
          const second = admission(chain.attempts[1]);
          // A clean swap keeps a valid event permutation but overlaps the retry with attempt 1.
          [first.settled_at, second.admitted_at] = [second.admitted_at, first.settled_at];
        },
      ],
      [
        'lower declared concurrency',
        (value) => {
          value.manifest.concurrency = 2;
        },
      ],
      [
        'declared serial',
        (value) => {
          value.manifest.concurrency = 1;
        },
      ],
      [
        'reproducibility caveat removed',
        (value) => {
          value.uncertainty.assumptions.pop();
        },
      ],
      [
        'usage beyond the run budget left terminal',
        (value) => {
          const attempt = value.results[0].attempts[0];
          attempt.usage.requests = value.manifest.budgets.max_requests + 1;
          value.summaries.operational.requests +=
            attempt.usage.requests - concurrent.results[0].attempts[0].usage.requests;
        },
      ],
    ];
    for (const [label, mutate] of mutations) {
      const value = structuredClone(concurrent);
      mutate(value);
      expect(() => createExperimentReport(value), label).toThrow(error);
    }
  });

  test('validates exactly sufficient cost budgets measured fully at concurrency above 1', async () => {
    const base = experimentManifest();
    for (const [amount, count] of [
      [0.25, 10],
      [0.1, 10],
      [0.5, 4],
      [1, 6],
    ] as const)
      for (const declared of [true, false]) {
        const execute = Object.assign(
          async (input: {
            coordinate: { task_kind: 'scenario_evaluation' | 'agent_workflow' };
          }) => ({
            status: 'passed' as const,
            usage: { requests: 1, cost: { amount, currency: 'USD' } },
            evidence: {
              kind: input.coordinate.task_kind,
              availability: 'available' as const,
              artifact: {
                schema_version: '1' as const,
                algorithm: 'sha256' as const,
                digest: 'c'.repeat(64),
              },
            },
          }),
          declared ? { reserve: () => ({ requests: 1, cost: { amount, currency: 'USD' } }) } : {}
        );
        const result = await runExperiment(
          experimentManifest({
            tasks: [base.tasks[1]],
            exclusions: [],
            repetitions: count / 2,
            concurrency: 4,
            retry_policy: { max_attempts: 1, retry_on: [] },
            budgets: { max_requests: 100, max_cost: { amount: amount * count, currency: 'USD' } },
          }),
          { execute_attempt: execute }
        );
        expect(result.summaries.overall.passed, `${amount}×${count} ${declared}`).toBe(count);
        expect(createExperimentReport(result).summary.passed).toBe(count);
      }
  });

  /** Concurrent fixture run whose attempt at matrix position `index` costs `costs[index]` USD. */
  const costRun = (
    costs: readonly number[],
    maxCost: number,
    concurrency: 2 | 4,
    declared: boolean
  ) => {
    const base = experimentManifest();
    const position = (input: { coordinate: { target_id: string; repetition_index: number } }) =>
      (input.coordinate.target_id === 'alpha' ? 0 : costs.length / 2) +
      input.coordinate.repetition_index -
      1;
    const execute = Object.assign(
      async (input: {
        coordinate: {
          task_kind: 'scenario_evaluation' | 'agent_workflow';
          target_id: string;
          repetition_index: number;
        };
      }) => ({
        status: 'passed' as const,
        usage: { requests: 1, cost: { amount: costs[position(input)] as number, currency: 'USD' } },
        evidence: {
          kind: input.coordinate.task_kind,
          availability: 'available' as const,
          artifact: {
            schema_version: '1' as const,
            algorithm: 'sha256' as const,
            digest: 'c'.repeat(64),
          },
        },
      }),
      declared
        ? {
            reserve: () => ({ requests: 1, cost: { amount: costs[0] as number, currency: 'USD' } }),
          }
        : {}
    );
    return runExperiment(
      experimentManifest({
        tasks: [base.tasks[1]],
        exclusions: [],
        repetitions: costs.length / 2,
        concurrency,
        retry_policy: { max_attempts: 1, retry_on: [] },
        budgets: { max_requests: 1_000, max_cost: { amount: maxCost, currency: 'USD' } },
      }),
      { execute_attempt: execute }
    );
  };

  test('charges sub-half-micro costs at least one micro-unit and rejects a run that spent them free', async () => {
    // Verifier reproduction 3: 0.0000004 USD per attempt against max_cost 0.000001.
    const costs = Array.from({ length: 40 }, () => 0.0000004);
    for (const declared of [true, false])
      for (const concurrency of [2, 4] as const) {
        const result = await costRun(costs, 0.000001, concurrency, declared);
        expect(result.summaries.overall.passed).toBe(1);
        expect(result.stop_reason).toBe('cost_budget_exhausted');
        expect(createExperimentReport(result).summary.passed).toBe(1);
      }

    // The earlier ledger charged nothing, so every attempt received the same 1 micro-unit
    // grant and all 40 ran. That schedule is no longer one the runner can produce.
    const free = await costRun(
      costs.map(() => 0),
      0.000001,
      2,
      false
    );
    expect(free.summaries.overall.passed).toBe(40);
    expect(createExperimentReport(free).summary.passed).toBe(40);
    const forged = structuredClone(free);
    for (const attempt of forged.results.flatMap((item) => item.attempts))
      attempt.usage.cost = { amount: 0.0000004, currency: 'USD' };
    let spent = 0;
    for (let index = 0; index < 40; index += 1) spent += 0.0000004;
    forged.summaries.operational.cost = { amount: spent, currency: 'USD' };
    expect(() => createExperimentReport(forged)).toThrow(error);
  });

  test('accepts an exactly sufficient cost budget stopped one coordinate early by per-attempt rounding', async () => {
    // Verifier reproduction 1: 301 + 122 + 601 + 241 = 1265 micro-units against 1263.
    const costs = [0.0003005, 0.0001215, 0.0006005, 0.0002405];
    for (const concurrency of [2, 4] as const) {
      const result = await costRun(costs, 0.001263, concurrency, false);
      expect(result.summaries.overall.passed).toBe(3);
      expect(result.stop_reason).toBe('budget_exceeded');
      expect(createExperimentReport(result).summary.passed).toBe(3);
    }
  });

  test('accepts attempts halted in flight and rejects either label on the other attempt', async () => {
    const result = await haltedInFlightResult();
    expect(result.results.map((item) => item.completion_code)).toEqual([
      'budget_exceeded',
      'halted_in_flight',
      'halted_in_flight',
      'budget_exhausted',
    ]);
    expect(result.stop_reason).toBe('budget_exceeded');
    const report = createExperimentReport(result);
    expect(report.summary.incomplete).toBe(4);
    expect(JSON.stringify(report.sections)).toContain('"incomplete","halted_in_flight"');

    const relabel = (index: number, code: 'budget_exceeded' | 'halted_in_flight') => {
      const forged = structuredClone(result);
      forged.results[index].completion_code = code;
      for (const attempt of forged.results[index].attempts) attempt.error_code = code;
      return forged;
    };
    // The attempt that overran cannot claim it was halted, and vice versa.
    expect(() => createExperimentReport(relabel(0, 'halted_in_flight'))).toThrow(error);
    expect(() => createExperimentReport(relabel(1, 'budget_exceeded'))).toThrow(error);
    expect(() => createExperimentReport(relabel(2, 'budget_exceeded'))).toThrow(error);
  });

  test('rejects halted_in_flight on a serial result', async () => {
    const serial = await liveRunnerHaltResult('budget_exceeded');
    expect(serial.manifest.concurrency).toBe(1);
    expect(createExperimentReport(serial).summary.incomplete).toBeGreaterThan(0);
    const forged = structuredClone(serial);
    const halted = forged.results.find((item) => item.completion_code === 'budget_exceeded');
    if (!halted) throw new Error('Expected a budget_exceeded coordinate');
    halted.completion_code = 'halted_in_flight';
    for (const attempt of halted.attempts) attempt.error_code = 'halted_in_flight';
    expect(() => createExperimentReport(forged)).toThrow(error);
  });

  test('accepts use beyond a reservation that the budget covers, and rejects forged halts', async () => {
    const underDeclared = await underDeclaredConcurrentResult();
    expect(underDeclared.summaries.overall).toMatchObject({ planned: 6, passed: 6 });
    expect(underDeclared.stop_reason).toBeUndefined();
    expect(underDeclared.summaries.operational).toMatchObject({ requests: 24, tokens: 120 });
    expect(createExperimentReport(underDeclared).summary.passed).toBe(6);

    const halted = structuredClone(underDeclared);
    halted.results[0].status = 'incomplete';
    halted.results[0].completion_code = 'budget_exceeded';
    halted.results[0].attempts[0].status = 'incomplete';
    halted.results[0].attempts[0].error_code = 'budget_exceeded';
    halted.stop_reason = 'budget_exceeded';
    expect(() => createExperimentReport(halted)).toThrow(error);

    const oversized = structuredClone(underDeclared);
    const reservation = oversized.execution?.reservations[0];
    if (reservation?.demand) reservation.demand.requests = 25;
    expect(() => createExperimentReport(oversized)).toThrow(error);
  });

  test('rejects forged reservations, peaks and schedules a greedy runner cannot produce', () => {
    const mutations: [string, (value: ExperimentRunResult) => void][] = [
      [
        'missing execution record',
        (value) => {
          value.execution = undefined;
        },
      ],
      [
        'peak overstated',
        (value) => {
          if (value.execution) value.execution.peak_in_flight = 4;
        },
      ],
      [
        'peak understated',
        (value) => {
          if (value.execution) value.execution.peak_in_flight = 1;
        },
      ],
      [
        'reservation demand changed',
        (value) => {
          const reservation = value.execution?.reservations[0];
          if (reservation?.demand) reservation.demand.requests = 2;
        },
      ],
      [
        'reservation demand removed',
        (value) => {
          const reservation = value.execution?.reservations[0];
          if (reservation) reservation.demand = undefined;
        },
      ],
      [
        'reservation list reordered',
        (value) => {
          value.execution?.reservations.reverse();
        },
      ],
      [
        'relabelled as a serial schedule',
        (value) => {
          // The verifier's forgery: serial-ordered events under a concurrent label.
          let position = 0;
          for (const item of value.results)
            for (const attempt of item.attempts) {
              const record = admission(attempt);
              record.admitted_at = position;
              record.settled_at = position + 1;
              position += 2;
            }
          if (value.execution) value.execution.peak_in_flight = 1;
        },
      ],
    ];
    for (const [label, mutate] of mutations) {
      const value = structuredClone(concurrent);
      mutate(value);
      expect(() => createExperimentReport(value), label).toThrow(error);
    }
  });

  test('requires a live concurrent result to carry an approval naming its concurrency', async () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const result = await randomConcurrentResult(seed);
      if (result.mode !== 'live' || !result.live_authorization) continue;
      expect(
        createExperimentReport(result)
          .sections.flatMap((item) => item.rows)
          .some((row) => row.cells.some((cell) => cell.includes('approved concurrency up to 8')))
      ).toBe(true);
      for (const approved of [undefined, result.manifest.concurrency - 1, 9]) {
        const forged = structuredClone(result);
        if (forged.live_authorization)
          forged.live_authorization.approved_concurrency = approved as never;
        expect(() => createExperimentReport(forged), `seed ${seed} ${approved}`).toThrow(error);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(5);
  });

  test('rejects an execution record on a serial result', () => {
    const value = structuredClone(mixed);
    value.execution = { peak_in_flight: 1, reservations: [] };
    expect(() => createExperimentReport(value)).toThrow(error);
  });

  test('rejects admission evidence on a serial result', () => {
    const value = structuredClone(mixed);
    value.results[0].attempts[0].admission = {
      admitted_at: 0,
      settled_at: 1,
      granted_budget: { requests: 100, tokens: 100_000 },
    };
    expect(() => createExperimentReport(value)).toThrow(error);
  });
});

describe('target generation settings', () => {
  test('lists each target generation settings and seeds in the controls section', () => {
    const report = createExperimentReport(mixed);
    const controls = report.sections.find((section) => section.id === 'controls');
    const generation = controls?.rows
      .filter((row) => row.cells[0].startsWith('generation: '))
      .map((row) => row.cells.slice(0, 2));
    expect(generation).toEqual([
      ['generation: alpha', 'temperature 0; seeds 40-41 by repetition'],
      ['generation: beta', 'task values; seeds 40-41 by repetition'],
    ]);
  });

  test('shows sampling overrides and reasoning effort declared by a target', async () => {
    const base = experimentManifest();
    const declared = await runExperiment(
      experimentManifest({
        tasks: [base.tasks[0]],
        exclusions: [],
        repetitions: 1,
        seed: { value: 7, strategy: 'fixed', require_support: true },
        targets: [
          {
            ...base.targets[0],
            settings: {
              reasoning_effort: 'medium',
              temperature: 1,
              top_p: 0.95,
              presence_penalty: 1.5,
              max_output_tokens: 32768,
              base_url: 'http://127.0.0.1:11434/v1',
            },
          },
          base.targets[1],
        ],
      }),
      {
        execute_attempt: async (input) => ({
          status: 'passed',
          usage: { requests: 1, tokens: 2 },
          evidence: {
            kind: input.task.kind,
            availability: 'available',
            artifact: { schema_version: '1', algorithm: 'sha256', digest: 'c'.repeat(64) },
          },
        }),
      }
    );
    const controls = createExperimentReport(declared).sections.find(
      (section) => section.id === 'controls'
    );
    expect(controls?.rows.find((row) => row.cells[0] === 'generation: alpha')?.cells[1]).toBe(
      'temperature 1; top_p 0.95; presence_penalty 1.5; max_output_tokens 32768; reasoning_effort medium; seed 7'
    );
  });
});
