import { describe, expect, test } from 'bun:test';
import { parseExperimentManifest } from './parser';
import { buildExperimentMatrix, runExperiment } from './runner';
import type {
  ExperimentAttemptDemand,
  ExperimentAttemptExecutor,
  ExperimentAttemptInput,
  ExperimentAttemptOutput,
  ExperimentConcurrency,
  ExperimentDemandRequest,
  ExperimentManifest,
  ExperimentRemainingBudget,
  ExperimentRunResult,
} from './types';

const identity = (digit: string) => ({
  schema_version: '1' as const,
  algorithm: 'sha256' as const,
  digest: digit.repeat(64),
});

const STOP_CONDITIONS = [
  'request_budget_exhausted',
  'token_budget_exhausted',
  'cost_budget_exhausted',
  'usage_unreported',
  'usage_invalid',
  'budget_exceeded',
] as const;

const task = (id: string, digit: string) => ({
  id,
  kind: 'scenario_evaluation' as const,
  source: {
    kind: 'scenario_evaluation' as const,
    path: `scenarios/${id}.yaml`,
    artifact: identity(digit),
  },
  required_capabilities: ['text'],
});

const BASE: ExperimentManifest = {
  schema_version: '1',
  id: 'concurrent-comparison',
  mode: 'fixture',
  identities: { schema_version: '1', workload: identity('a'), rubric: identity('b') },
  tasks: [task('alpha', '1'), task('beta', '2'), task('gamma', '3')],
  targets: [
    { id: 'model-one', provider: 'fixture', model: 'one', capabilities: ['text', 'seed'] },
    { id: 'model-two', provider: 'fixture', model: 'two', capabilities: ['text', 'seed'] },
  ],
  repetitions: 2,
  concurrency: 4,
  seed: { value: 7, strategy: 'increment_by_repetition', require_support: true },
  exclusions: [],
  retry_policy: { max_attempts: 3, retry_on: ['incomplete', 'invalid', 'infrastructure_failed'] },
  budgets: { max_requests: 1_000 },
};

const authorization = {
  approved: true as const,
  decision_id: 'concurrency-review',
  decided_at: '2026-11-19T12:00:00Z',
  approved_by: 'release-operator',
  reason: 'Bounded concurrent evaluation approved',
  approved_concurrency: 8 as const,
};

const manifest = (overrides: Partial<ExperimentManifest> = {}) =>
  parseExperimentManifest({ ...BASE, ...overrides });

const liveManifest = (concurrency: ExperimentConcurrency, overrides: Partial<ExperimentManifest>) =>
  manifest({
    mode: 'live',
    concurrency,
    budgets: { max_requests: 100, max_tokens: 1_000, max_cost: { amount: 1, currency: 'USD' } },
    live: { concurrency_ceiling: concurrency, stop_conditions: [...STOP_CONDITIONS] },
    ...overrides,
  });

const passed = (usage: ExperimentAttemptOutput['usage']): ExperimentAttemptOutput => ({
  status: 'passed',
  usage,
  evidence: { kind: 'scenario_evaluation', availability: 'available', artifact: identity('e') },
});

const attemptKey = (input: ExperimentAttemptInput) =>
  `${input.coordinate.coordinate_id}:${input.attempt_number}`;

/** Deterministic 32-bit PRNG so property failures are reproducible from their seed. */
function random(seed: number) {
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

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Event-sorted admission evidence must be the exact permutation 0 .. 2 × attempts − 1. */
function admissionEvents(result: ExperimentRunResult): number[] {
  return result.results
    .flatMap((item) => item.attempts)
    .flatMap((attempt) => {
      if (!attempt.admission) throw new Error('missing admission evidence');
      return [attempt.admission.admitted_at, attempt.admission.settled_at];
    })
    .sort((left, right) => left - right);
}
type Execute = (input: ExperimentAttemptInput) => Promise<ExperimentAttemptOutput>;

/** Attach a declared per-pair demand to an executor. */
function withDemand(
  execute: Execute,
  demand: (request: ExperimentDemandRequest) => ExperimentAttemptDemand | undefined
): ExperimentAttemptExecutor {
  return Object.assign(execute, { reserve: demand });
}

/** Executor modelled on the scenario executor: `cases` requests, refused when the grant is short. */
function scenarioLike(
  cases: (taskId: string) => number,
  latency: (input: ExperimentAttemptInput) => Promise<void>
): ExperimentAttemptExecutor {
  return withDemand(
    async (input) => {
      const needed = cases(input.task.id);
      if (needed > input.remaining_budget.requests) {
        return {
          status: 'incomplete',
          usage: { requests: 0 },
          evidence: { kind: 'scenario_evaluation', availability: 'unavailable' },
          error_code: 'request_budget_insufficient',
        };
      }
      await latency(input);
      return passed({ requests: needed });
    },
    (request) => ({ requests: cases(request.task.id) })
  );
}

const measured = (result: ExperimentRunResult) =>
  result.results.filter((item) => item.status === 'passed').length;

const measuredPerTarget = (result: ExperimentRunResult) =>
  result.summaries.targets.map((group) => [group.key, group.summary.passed]);

describe('runExperiment with bounded concurrency', () => {
  test('never exceeds the declared in-flight bound and keeps matrix order', async () => {
    for (const concurrency of [2, 3, 8] as const) {
      const rng = random(concurrency);
      let inFlight = 0;
      let peak = 0;
      const value = manifest({ concurrency, repetitions: 4 });
      const result = await runExperiment(value, {
        execute_attempt: withDemand(
          async () => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            await delay(rng.int(0, 4));
            inFlight -= 1;
            return passed({ requests: 1 });
          },
          () => ({ requests: 1 })
        ),
      });

      expect(peak).toBe(concurrency);
      expect(result.execution?.peak_in_flight).toBe(concurrency);
      expect(result.execution?.reservations).toEqual(
        value.tasks.flatMap((item) =>
          value.targets.map((target) => ({
            task_id: item.id,
            target_id: target.id,
            demand: { requests: 1 },
          }))
        )
      );
      expect(result.results.map((item) => item.coordinate)).toEqual(buildExperimentMatrix(value));
      expect(result.summaries.overall).toMatchObject({ planned: 24, passed: 24 });
      expect(admissionEvents(result)).toEqual([...Array(48).keys()]);
    }
  });

  test('runs executors without a complete declared demand one attempt at a time', async () => {
    const cases: [string, ExperimentAttemptExecutor['reserve']][] = [
      ['undeclared', undefined],
      [
        'throws',
        () => {
          throw new Error('reserve failed');
        },
      ],
      ['malformed', () => ({ requests: 0 }) as ExperimentAttemptDemand],
      ['missing token bound', () => ({ requests: 1 })],
      [
        'foreign currency',
        () => ({ requests: 1, tokens: 5, cost: { amount: 1, currency: 'EUR' } }),
      ],
    ];
    for (const [label, reserve] of cases) {
      let inFlight = 0;
      let peak = 0;
      const execute: ExperimentAttemptExecutor = async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await delay(1);
        inFlight -= 1;
        return passed({ requests: 1, tokens: 1, cost: { amount: 0.01, currency: 'USD' } });
      };
      if (reserve) execute.reserve = reserve;
      const result = await runExperiment(
        manifest({
          concurrency: 4,
          budgets: { max_requests: 100, max_tokens: 100, max_cost: { amount: 1, currency: 'USD' } },
        }),
        { execute_attempt: execute }
      );
      expect(peak, label).toBe(1);
      expect(result.execution?.peak_in_flight, label).toBe(1);
      expect(
        result.execution?.reservations.every((item) => item.demand === undefined),
        label
      ).toBe(true);
      expect(result.summaries.overall.passed, label).toBe(12);
    }
  });

  test('matches the serial result apart from scheduling evidence and the reproducibility note', async () => {
    const execute: Execute = async (input) => {
      await delay((input.coordinate.repetition_index * 7 + input.task.id.length) % 5);
      if (input.task.id === 'beta' && input.attempt_number === 1) {
        return { ...passed({ requests: 1 }), status: 'infrastructure_failed' as const };
      }
      return input.target.id === 'model-two'
        ? { ...passed({ requests: 2 }), status: 'task_failed' as const }
        : passed({ requests: 1 });
    };
    const serial = await runExperiment(manifest({ concurrency: 1 }), {
      execute_attempt: withDemand(execute, () => {
        throw new Error('reserve must not be consulted for serial runs');
      }),
    });
    const parallel = await runExperiment(manifest({ concurrency: 4 }), {
      execute_attempt: withDemand(execute, () => ({ requests: 2 })),
    });

    expect('execution' in serial).toBe(false);
    expect(
      serial.results.flatMap((item) => item.attempts).some((attempt) => 'admission' in attempt)
    ).toBe(false);
    expect(serial.uncertainty.assumptions).toHaveLength(2);
    expect(parallel.uncertainty.assumptions).toEqual([
      ...serial.uncertainty.assumptions,
      expect.stringContaining('Up to 4 coordinates were allowed to run concurrently'),
    ]);

    const withoutAdmission = structuredClone(parallel);
    for (const item of withoutAdmission.results)
      for (const attempt of item.attempts) attempt.admission = undefined;
    expect(JSON.parse(JSON.stringify(withoutAdmission.results))).toEqual(
      JSON.parse(JSON.stringify(serial.results))
    );
    expect(parallel.summaries).toEqual(serial.summaries);
  });

  test('grants exactly the declared demand and waits instead of shrinking it', async () => {
    const seen: ExperimentRemainingBudget[] = [];
    const result = await runExperiment(
      manifest({
        tasks: [BASE.tasks[0]],
        repetitions: 4,
        retry_policy: { max_attempts: 1, retry_on: [] },
        budgets: { max_requests: 12, max_tokens: 40, max_cost: { amount: 3, currency: 'USD' } },
      }),
      {
        execute_attempt: withDemand(
          async (input) => {
            seen.push(input.remaining_budget);
            await delay(1);
            return passed({ requests: 1, tokens: 4, cost: { amount: 0.2, currency: 'USD' } });
          },
          () => ({ requests: 3, tokens: 10, cost: { amount: 0.5, currency: 'USD' } })
        ),
      }
    );

    expect(seen.slice(0, 4)).toEqual(
      Array(4).fill({ requests: 3, tokens: 10, cost: { amount: 0.5, currency: 'USD' } })
    );
    expect(result.summaries.overall).toMatchObject({ planned: 8, passed: 8 });
    expect(result.stop_reason).toBeUndefined();
    expect(result.results[0].attempts[0].admission).toEqual({
      admitted_at: 0,
      settled_at: expect.any(Number),
      granted_budget: { requests: 3, tokens: 10, cost: { amount: 0.5, currency: 'USD' } },
    });
  });

  test('measures every coordinate a serial run measures with an exactly sufficient budget', async () => {
    // Verifier reproduction: 5 tasks × 2 targets, 5 cases each, max_requests 50.
    const tasks = ['t1', 't2', 't3', 't4', 't5'].map((id, index) => task(id, String(index)));
    const run = (concurrency: ExperimentConcurrency, maxRequests: number) =>
      runExperiment(
        manifest({
          concurrency,
          tasks,
          repetitions: 1,
          seed: undefined,
          retry_policy: { max_attempts: 1, retry_on: [] },
          budgets: { max_requests: maxRequests },
        }),
        {
          execute_attempt: scenarioLike(
            () => 5,
            (input) => delay(input.target.id === 'model-two' ? 6 : 1)
          ),
        }
      );

    const serial = await run(1, 50);
    for (const concurrency of [2, 4, 8] as const) {
      const parallel = await run(concurrency, 50);
      expect(measured(parallel)).toBe(10);
      expect(parallel.summaries.operational.requests).toBe(50);
      expect(parallel.stop_reason).toBeUndefined();
      expect(measuredPerTarget(parallel)).toEqual(measuredPerTarget(serial));
    }

    const serialShort = await run(1, 20);
    expect(measured(serialShort)).toBe(4);
    expect(serialShort.stop_reason).toBe('request_budget_exhausted');
    const parallelShort = await run(8, 20);
    expect(measured(parallelShort)).toBe(4);
    expect(parallelShort.stop_reason).toBe('request_budget_exhausted');
    expect(parallelShort.runtime_exclusions).toHaveLength(6);
    expect(
      parallelShort.results.filter(
        (item) => item.status === 'incomplete' && item.completion_code !== 'budget_exhausted'
      )
    ).toEqual([]);
  });

  test('records a request shortfall as a runtime exclusion and keeps measuring smaller work', async () => {
    const tasks = [task('large', '1'), task('small', '2')];
    const cases = (taskId: string) => (taskId === 'large' ? 5 : 2);
    const value = (concurrency: ExperimentConcurrency) =>
      manifest({
        concurrency,
        tasks,
        targets: [BASE.targets[0], BASE.targets[1]],
        repetitions: 1,
        seed: undefined,
        retry_policy: { max_attempts: 1, retry_on: [] },
        budgets: { max_requests: 9 },
      });
    const parallel = await runExperiment(value(2), {
      execute_attempt: scenarioLike(cases, () => delay(1)),
    });
    const serial = await runExperiment(value(1), {
      execute_attempt: scenarioLike(cases, () => delay(1)),
    });

    // Serial: large/one runs (5), large/two is refused by the executor, both small ones run.
    expect(serial.results.map((item) => item.status)).toEqual([
      'passed',
      'incomplete',
      'passed',
      'passed',
    ]);
    expect(serial.stop_reason).toBeUndefined();
    expect(parallel.results.map((item) => [item.status, item.completion_code])).toEqual([
      ['passed', 'terminal'],
      ['incomplete', 'budget_exhausted'],
      ['passed', 'terminal'],
      ['passed', 'terminal'],
    ]);
    expect(parallel.stop_reason).toBe('request_budget_exhausted');
    expect(parallel.runtime_exclusions).toEqual([
      {
        coordinate_id: parallel.results[1].coordinate.coordinate_id,
        reason: 'request_budget_exhausted',
      },
    ]);
  });

  test('keeps every retry inside its own coordinate and never overlaps its attempts', async () => {
    const active = new Set<string>();
    const attempts = new Map<string, number[]>();
    const rng = random(99);
    const result = await runExperiment(manifest({ concurrency: 6, repetitions: 3 }), {
      execute_attempt: withDemand(
        async (input) => {
          const id = input.coordinate.coordinate_id;
          expect(active.has(id)).toBe(false);
          active.add(id);
          attempts.set(id, [...(attempts.get(id) ?? []), input.attempt_number]);
          expect(input.retry_chain_id).toBe(id);
          await yieldTurns(rng.int(0, 30));
          active.delete(id);
          return input.attempt_number < 3 && rng.next() < 0.6
            ? { ...passed({ requests: 1 }), status: 'invalid' as const }
            : passed({ requests: 1 });
        },
        () => ({ requests: 1 })
      ),
    });

    for (const item of result.results) {
      const numbers = item.attempts.map((attempt) => attempt.attempt_number);
      expect(attempts.get(item.coordinate.coordinate_id)).toEqual(numbers);
      expect(numbers).toEqual(numbers.map((_, index) => index + 1));
      for (let index = 1; index < item.attempts.length; index += 1) {
        const previous = item.attempts[index - 1].admission;
        const current = item.attempts[index].admission;
        expect(previous && current && previous.settled_at < current.admitted_at).toBe(true);
      }
    }
    expect(result.summaries.operational.retry_attempts).toBeGreaterThan(0);
  });

  test('admits nothing after a halt and records in-flight attempts truthfully', async () => {
    let calls = 0;
    const live = liveManifest(3, { tasks: [BASE.tasks[0]], repetitions: 3 });
    const result = await runExperiment(live, {
      live_authorization: authorization,
      execute_attempt: withDemand(
        async (input) => {
          calls += 1;
          const position = calls;
          if (position === 1) return passed({ requests: 1 });
          await delay(position === 2 ? 2 : 4);
          if (position === 2) {
            return {
              status: 'infrastructure_failed',
              usage: { requests: 1, tokens: 3, cost: { amount: 0.01, currency: 'USD' } },
              evidence: { kind: input.task.kind, availability: 'unavailable' },
              error_code: 'temporary',
            };
          }
          return passed({ requests: 1, tokens: 5, cost: { amount: 0.02, currency: 'USD' } });
        },
        () => ({ requests: 1, tokens: 10, cost: { amount: 0.05, currency: 'USD' } })
      ),
    });

    expect(calls).toBe(3);
    expect(
      result.results.map(({ status, completion_code, attempts }) => ({
        status,
        completion_code,
        attempts: attempts.length,
      }))
    ).toEqual([
      { status: 'incomplete', completion_code: 'usage_unreported', attempts: 1 },
      { status: 'incomplete', completion_code: 'budget_exhausted', attempts: 1 },
      { status: 'passed', completion_code: 'terminal', attempts: 1 },
      { status: 'incomplete', completion_code: 'budget_exhausted', attempts: 0 },
      { status: 'incomplete', completion_code: 'budget_exhausted', attempts: 0 },
      { status: 'incomplete', completion_code: 'budget_exhausted', attempts: 0 },
    ]);
    expect(result.stop_reason).toBe('usage_unreported');
    expect(result.runtime_exclusions).toEqual(
      [1, 3, 4, 5].map((index) => ({
        coordinate_id: result.results[index].coordinate.coordinate_id,
        reason: 'usage_unreported',
      }))
    );
    expect(result.summaries.operational).toMatchObject({
      executor_invocations: 3,
      reserved_live_requests: 3,
      requests: 3,
      tokens: 8,
    });
  });

  test('keeps the first halt when an in-flight attempt halts again', async () => {
    let calls = 0;
    const result = await runExperiment(
      liveManifest(2, { tasks: [BASE.tasks[0]], repetitions: 1 }),
      {
        live_authorization: authorization,
        execute_attempt: withDemand(
          async () => {
            calls += 1;
            if (calls === 1) return passed({ requests: 1 });
            await delay(2);
            return passed({ requests: 99, tokens: 1, cost: { amount: 0.01, currency: 'USD' } });
          },
          () => ({ requests: 1, tokens: 10, cost: { amount: 0.05, currency: 'USD' } })
        ),
      }
    );

    expect(result.results.map((item) => item.completion_code)).toEqual([
      'usage_unreported',
      'budget_exceeded',
    ]);
    expect(result.stop_reason).toBe('usage_unreported');
    expect(result.runtime_exclusions).toEqual([]);
  });

  test('records hostile executor output instead of rejecting while attempts are in flight', async () => {
    const settled: string[] = [];
    const result = await runExperiment(
      manifest({ concurrency: 3, tasks: [BASE.tasks[0]], repetitions: 2 }),
      {
        execute_attempt: withDemand(
          async (input) => {
            if (input.coordinate.repetition_index === 1 && input.target.id === 'model-one') {
              return Object.defineProperty({}, 'status', {
                enumerable: true,
                get() {
                  throw new Error('getter');
                },
              }) as ExperimentAttemptOutput;
            }
            await delay(3);
            settled.push(attemptKey(input));
            return passed({ requests: 1 });
          },
          () => ({ requests: 1 })
        ),
      }
    );

    expect(settled).toHaveLength(3);
    expect(result.results[0].attempts[0]).toMatchObject({
      status: 'invalid',
      error_code: 'invalid_executor_result',
    });
    expect(result.results.slice(1).map((item) => item.status)).toEqual([
      'passed',
      'passed',
      'passed',
    ]);
  });

  test('still requires live authorization before any concurrent invocation', async () => {
    let calls = 0;
    await expect(
      runExperiment(liveManifest(4, {}), {
        execute_attempt: async () => {
          calls += 1;
          return passed({ requests: 1 });
        },
      })
    ).rejects.toThrow('approved host authorization');
    expect(calls).toBe(0);
  });

  test('requires the live approval to cover the declared concurrency and records it', async () => {
    let calls = 0;
    const execute = withDemand(
      async () => {
        calls += 1;
        return passed({ requests: 1, tokens: 1, cost: { amount: 0.01, currency: 'USD' } });
      },
      () => ({ requests: 1, tokens: 1, cost: { amount: 0.01, currency: 'USD' } })
    );
    const { approved_concurrency: _approved, ...serialApproval } = authorization;
    for (const approval of [
      serialApproval,
      { ...serialApproval, approved_concurrency: 1 as const },
      { ...serialApproval, approved_concurrency: 3 as const },
    ]) {
      await expect(
        runExperiment(liveManifest(4, {}), {
          live_authorization: approval,
          execute_attempt: execute,
        })
      ).rejects.toThrow('covering the declared concurrency');
    }
    await expect(
      runExperiment(liveManifest(4, {}), {
        live_authorization: { ...serialApproval, approved_concurrency: 9 } as never,
        execute_attempt: execute,
      })
    ).rejects.toThrow('approved host authorization');
    expect(calls).toBe(0);

    const approved = { ...serialApproval, approved_concurrency: 4 as const };
    const result = await runExperiment(liveManifest(4, {}), {
      live_authorization: approved,
      execute_attempt: execute,
    });
    expect(result.live_authorization).toEqual(approved);
    expect(result.summaries.overall.passed).toBe(12);
  });

  test('never lets cost grants sum above max_cost under floating-point rounding', async () => {
    for (const [maxCost, share] of [
      [0.3, 0.1],
      [0.7, 0.1],
      [1.1, 0.1],
      [2.9, 0.29],
      [0.01, 0.001],
    ] as const) {
      const outstanding = new Map<string, number>();
      let consumed = 0;
      let worst = 0;
      const result = await runExperiment(
        manifest({
          concurrency: 8,
          repetitions: 4,
          retry_policy: { max_attempts: 1, retry_on: [] },
          budgets: { max_requests: 1_000, max_cost: { amount: maxCost, currency: 'USD' } },
        }),
        {
          execute_attempt: withDemand(
            async (input) => {
              const key = attemptKey(input);
              outstanding.set(key, input.remaining_budget.cost?.amount ?? 0);
              worst = Math.max(
                worst,
                [...outstanding.values()].reduce((sum, amount) => sum + amount, consumed)
              );
              await delay(1);
              outstanding.delete(key);
              const amount = input.remaining_budget.cost?.amount ?? 0;
              consumed += amount;
              return passed({ requests: 1, cost: { amount, currency: 'USD' } });
            },
            () => ({ requests: 1, cost: { amount: share, currency: 'USD' } })
          ),
        }
      );
      expect(worst, `max ${maxCost}`).toBeLessThanOrEqual(maxCost);
      expect(consumed, `max ${maxCost}`).toBeLessThanOrEqual(maxCost);
      expect(result.summaries.overall.attempted, `max ${maxCost}`).toBeGreaterThan(0);
    }
  });
});

describe('concurrent budget admission properties', () => {
  test('consumed use plus outstanding grants never exceed any declared budget', async () => {
    for (let seed = 1; seed <= 250; seed += 1) {
      const rng = random(seed);
      const live = rng.next() < 0.5;
      const concurrency = rng.int(2, 8) as ExperimentConcurrency;
      const budgets = {
        max_requests: rng.int(1, 40),
        max_tokens: rng.int(1, 400),
        max_cost: { amount: rng.int(1, 300) / 100, currency: 'USD' },
      };
      const demands = new Map<string, ExperimentAttemptDemand | undefined>();
      const value = manifest({
        mode: live ? 'live' : 'fixture',
        concurrency,
        repetitions: rng.int(1, 4),
        retry_policy: {
          max_attempts: rng.int(1, 3),
          retry_on: ['incomplete', 'invalid', 'infrastructure_failed'],
        },
        budgets,
        ...(live
          ? { live: { concurrency_ceiling: concurrency, stop_conditions: [...STOP_CONDITIONS] } }
          : {}),
      });

      const outstanding = new Map<string, ExperimentRemainingBudget>();
      const granted = new Map<string, ExperimentRemainingBudget>();
      const used = { requests: 0, tokens: 0, cost: 0, invocations: 0 };
      let peak = 0;
      const result = await runExperiment(value, {
        live_authorization: live ? authorization : undefined,
        execute_attempt: withDemand(
          async (input) => {
            const key = attemptKey(input);
            const grant = input.remaining_budget;
            outstanding.set(key, grant);
            granted.set(key, grant);
            used.invocations += 1;
            peak = Math.max(peak, outstanding.size);
            const held = [...outstanding.values()];
            const sum = (pick: (item: ExperimentRemainingBudget) => number) =>
              held.reduce((total, item) => total + pick(item), 0);
            const requests = used.requests + sum((item) => item.requests);
            expect(live ? Math.max(requests, used.invocations) : requests).toBeLessThanOrEqual(
              budgets.max_requests
            );
            expect(used.tokens + sum((item) => item.tokens ?? 0)).toBeLessThanOrEqual(
              budgets.max_tokens
            );
            expect(used.cost + sum((item) => item.cost?.amount ?? 0)).toBeLessThanOrEqual(
              budgets.max_cost.amount
            );

            await yieldTurns(rng.int(0, 40));
            const usage = {
              requests: rng.int(0, grant.requests),
              tokens: rng.int(0, grant.tokens ?? 0),
              cost: {
                amount: (rng.next() < 0.3 ? 1 : rng.next()) * (grant.cost?.amount ?? 0),
                currency: 'USD',
              },
            };
            outstanding.delete(key);
            used.requests += usage.requests;
            used.tokens += usage.tokens;
            used.cost += usage.cost.amount;
            const status = (['passed', 'task_failed', 'invalid', 'incomplete'] as const)[
              rng.int(0, 3)
            ];
            return {
              status,
              usage,
              evidence: {
                kind: 'scenario_evaluation',
                availability: 'available',
                artifact: identity('d'),
              },
            };
          },
          (request) => {
            const key = `${request.task.id}:${request.target.id}`;
            if (!demands.has(key))
              demands.set(
                key,
                rng.next() < 0.15
                  ? undefined
                  : {
                      requests: rng.int(1, 6),
                      tokens: rng.int(1, 60),
                      cost: { amount: rng.int(1, 60) / 100, currency: 'USD' },
                    }
              );
            return demands.get(key);
          }
        ),
      });

      const label = `seed ${seed}`;
      expect(peak, label).toBeLessThanOrEqual(concurrency);
      expect(result.execution?.peak_in_flight, label).toBe(peak);
      expect(result.completion.matrix_complete, label).toBe(true);
      expect(
        result.results.map((item) => item.coordinate.coordinate_id),
        label
      ).toEqual(buildExperimentMatrix(value).map((coordinate) => coordinate.coordinate_id));
      const operational = result.summaries.operational;
      expect(operational.requests, label).toBeLessThanOrEqual(budgets.max_requests);
      expect(operational.reserved_live_requests, label).toBeLessThanOrEqual(budgets.max_requests);
      expect(operational.tokens, label).toBeLessThanOrEqual(budgets.max_tokens);
      expect(operational.cost?.amount ?? 0, label).toBeLessThanOrEqual(budgets.max_cost.amount);
      expect(admissionEvents(result), label).toEqual([...Array(operational.attempts * 2).keys()]);
      for (const item of result.results)
        for (const attempt of item.attempts)
          expect(attempt.admission?.granted_budget, label).toEqual(
            JSON.parse(
              JSON.stringify(
                granted.get(`${item.coordinate.coordinate_id}:${attempt.attempt_number}`)
              )
            )
          );
      // Every coordinate left unmeasured by the budget carries a runtime exclusion.
      const excluded = new Set(result.runtime_exclusions.map((item) => item.coordinate_id));
      for (const item of result.results)
        if (item.completion_code === 'budget_exhausted')
          expect(excluded.has(item.coordinate.coordinate_id), label).toBe(true);
    }
  });

  test('an exactly sufficient budget measures every coordinate at every concurrency', async () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      const rng = random(seed);
      const tasks = Array.from({ length: rng.int(1, 5) }, (_, index) =>
        task(`t${index}`, String(index))
      );
      const cases = new Map(tasks.map((item) => [item.id, rng.int(1, 6)]));
      const tokensPerCase = rng.int(1, 20);
      const overestimate = rng.next() < 0.5 ? 1 : rng.int(2, 4);
      const repetitions = rng.int(1, 4);
      const need = [...cases.values()].reduce((sum, count) => sum + count, 0) * 2 * repetitions;
      const slow = rng.int(5, 60);
      const outcomes: number[][] = [];
      for (const concurrency of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
        const result = await runExperiment(
          manifest({
            concurrency,
            tasks,
            repetitions,
            retry_policy: { max_attempts: 1, retry_on: [] },
            budgets: { max_requests: need, max_tokens: need * tokensPerCase },
          }),
          {
            execute_attempt: withDemand(
              async (input) => {
                const count = cases.get(input.task.id) ?? 0;
                if (count > input.remaining_budget.requests)
                  return {
                    status: 'incomplete',
                    usage: { requests: 0 },
                    evidence: { kind: 'scenario_evaluation', availability: 'unavailable' },
                    error_code: 'request_budget_insufficient',
                  };
                await yieldTurns(input.target.id === 'model-two' ? slow : rng.int(0, 5));
                return passed({ requests: count, tokens: count * tokensPerCase });
              },
              (request) => {
                const count = cases.get(request.task.id) ?? 0;
                return { requests: count, tokens: count * tokensPerCase * overestimate };
              }
            ),
          }
        );
        const label = `seed ${seed} concurrency ${concurrency}`;
        expect(result.stop_reason, label).toBeUndefined();
        expect(result.summaries.overall.passed, label).toBe(result.summaries.overall.planned);
        outcomes.push(result.summaries.targets.map((group) => group.summary.passed));
      }
      expect(new Set(outcomes.map((item) => JSON.stringify(item))).size, `seed ${seed}`).toBe(1);
    }
  });
});
