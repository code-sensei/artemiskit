import { describe, expect, test } from 'bun:test';
import { parseExperimentManifest } from './parser';
import { buildExperimentMatrix, runExperiment } from './runner';
import type {
  ExperimentAttemptDemand,
  ExperimentAttemptEvidence,
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

  test('labels attempts settling after an overrun halted the run halted_in_flight, not budget_exceeded', async () => {
    // Verifier finding 3: concurrency 3, max_tokens 30, reservations of 10 tokens. The first
    // attempt to settle uses 40 tokens; the two still in flight did not cause that overrun.
    const outputs: ExperimentAttemptOutput[] = [
      passed({ requests: 1, tokens: 40 }),
      {
        status: 'infrastructure_failed',
        usage: { requests: 0, tokens: 0 },
        evidence: { kind: 'scenario_evaluation', availability: 'unavailable' },
        error_code: 'temporary',
      },
      passed({ requests: 1, tokens: 5 }),
    ];
    let calls = 0;
    const result = await runExperiment(
      manifest({
        concurrency: 3,
        tasks: [BASE.tasks[0]],
        repetitions: 2,
        budgets: { max_requests: 100, max_tokens: 30 },
      }),
      {
        execute_attempt: withDemand(
          async () => {
            const position = calls;
            calls += 1;
            await delay(position * 3);
            return outputs[position] as ExperimentAttemptOutput;
          },
          () => ({ requests: 1, tokens: 10 })
        ),
      }
    );

    expect(calls).toBe(3);
    expect(
      result.results.map(({ status, completion_code, attempts }) => [
        status,
        completion_code,
        attempts.map((attempt) => [attempt.error_code, attempt.usage.tokens]),
      ])
    ).toEqual([
      ['incomplete', 'budget_exceeded', [['budget_exceeded', 40]]],
      ['incomplete', 'halted_in_flight', [['halted_in_flight', 0]]],
      ['incomplete', 'halted_in_flight', [['halted_in_flight', 5]]],
      ['incomplete', 'budget_exhausted', []],
    ]);
    expect(result.stop_reason).toBe('budget_exceeded');
    expect(result.runtime_exclusions).toEqual([
      { coordinate_id: result.results[3].coordinate.coordinate_id, reason: 'budget_exceeded' },
    ]);
    expect(result.summaries.operational.tokens).toBe(45);
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
            // Beyond its reservation and beyond what the pool can cover: a real overrun.
            return passed({ requests: 200, tokens: 1, cost: { amount: 0.01, currency: 'USD' } });
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
  test('measures exactly sufficient cost budgets fully, with or without a cost demand', async () => {
    // Verifier reproductions: 0.25×10 @2.5, 0.1×10 @1, 0.5×4 @2, 1×6 @6.
    for (const [amount, count] of [
      [0.25, 10],
      [0.1, 10],
      [0.5, 4],
      [1, 6],
    ] as const) {
      const tasks = Array.from({ length: count / 2 }, (_, index) => task(`c${index}`, `${index}`));
      for (const declared of [true, false])
        for (const concurrency of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
          const execute: ExperimentAttemptExecutor = async (input) => {
            await delay(input.target.id === 'model-two' ? 3 : 1);
            return passed({ requests: 1, cost: { amount, currency: 'USD' } });
          };
          if (declared)
            execute.reserve = () => ({ requests: 1, cost: { amount, currency: 'USD' } });
          const result = await runExperiment(
            manifest({
              concurrency,
              tasks,
              repetitions: 1,
              seed: undefined,
              retry_policy: { max_attempts: 1, retry_on: [] },
              budgets: { max_requests: 100, max_cost: { amount: amount * count, currency: 'USD' } },
            }),
            { execute_attempt: execute }
          );
          const label = `${amount}×${count} declared ${declared} concurrency ${concurrency}`;
          expect(result.summaries.overall.passed, label).toBe(count);
          expect(result.stop_reason, label).toBeUndefined();
        }
    }
  });

  test('never commits more cost than max_cost in micro-units', async () => {
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
      await runExperiment(
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
              outstanding.set(key, micro(input.remaining_budget.cost?.amount ?? 0));
              worst = Math.max(worst, sum([...outstanding.values()]) + consumed);
              await delay(1);
              outstanding.delete(key);
              consumed += micro(share);
              return passed({ requests: 1, cost: { amount: share, currency: 'USD' } });
            },
            () => ({ requests: 1, cost: { amount: share, currency: 'USD' } })
          ),
        }
      );
      expect(worst, `max ${maxCost}`).toBeLessThanOrEqual(micro(maxCost));
      expect(consumed, `max ${maxCost}`).toBeLessThanOrEqual(micro(maxCost));
    }
  });

  /** Fixture run whose coordinate at matrix position `index` costs `costs[index]` USD. */
  const costRun = (
    costs: readonly number[],
    maxCost: number,
    concurrency: ExperimentConcurrency,
    declared: boolean
  ) => {
    const tasks = Array.from({ length: costs.length / 2 }, (_, index) => task(`c${index}`, '1'));
    const cost = (taskId: string, targetId: string) =>
      costs[Number(taskId.slice(1)) * 2 + (targetId === 'model-one' ? 0 : 1)] as number;
    const execute: ExperimentAttemptExecutor = async (input) => {
      await delay(input.target.id === 'model-two' ? 2 : 1);
      return passed({
        requests: 1,
        cost: { amount: cost(input.task.id, input.target.id), currency: 'USD' },
      });
    };
    if (declared)
      execute.reserve = (request) => ({
        requests: 1,
        cost: { amount: cost(request.task.id, request.target.id), currency: 'USD' },
      });
    return runExperiment(
      manifest({
        concurrency,
        tasks,
        repetitions: 1,
        seed: undefined,
        retry_policy: { max_attempts: 1, retry_on: [] },
        budgets: { max_requests: 1_000, max_cost: { amount: maxCost, currency: 'USD' } },
      }),
      { execute_attempt: execute }
    );
  };

  test('charges sub-half-micro costs at least one micro-unit, so a concurrent run stops within max_cost', async () => {
    // Verifier reproduction 3: 0.0000004 USD per attempt with max_cost 0.000001 used to run
    // 40 of 40 attempts at concurrency 2 and 4 (16× the budget) without any stop.
    const costs = Array.from({ length: 40 }, () => 0.0000004);
    const serial = await costRun(costs, 0.000001, 1, false);
    expect(serial.summaries.overall.passed).toBe(2);
    expect(serial.stop_reason).toBe('budget_exceeded');
    for (const declared of [true, false])
      for (const concurrency of [2, 4] as const) {
        const label = `declared ${declared} concurrency ${concurrency}`;
        const result = await costRun(costs, 0.000001, concurrency, declared);
        expect(result.summaries.overall.passed, label).toBe(1);
        expect(result.stop_reason, label).toBe('cost_budget_exhausted');
        expect(result.runtime_exclusions, label).toHaveLength(39);
        expect(result.summaries.operational.cost?.amount, label).toBeLessThanOrEqual(0.000001);
      }
  });

  test('an exactly sufficient cost budget can stop a concurrent run one coordinate early by per-attempt rounding, recorded as budget_exceeded', async () => {
    // Verifier reproduction 1: each amount is a half micro-unit, so per-attempt rounding charges
    // 301 + 122 + 601 + 241 = 1265 micro-units against a 1263 limit equal to the exact sum.
    const costs = [0.0003005, 0.0001215, 0.0006005, 0.0002405];
    const maxCost = 0.001263;
    const serial = await costRun(costs, maxCost, 1, false);
    expect(serial.summaries.overall.passed).toBe(4);
    expect(serial.stop_reason).toBeUndefined();
    for (const declared of [true, false])
      for (const concurrency of [2, 4] as const) {
        const label = `declared ${declared} concurrency ${concurrency}`;
        const result = await costRun(costs, maxCost, concurrency, declared);
        expect(result.summaries.overall.passed, label).toBe(3);
        expect(result.stop_reason, label).toBe('budget_exceeded');
        expect(
          result.results.filter((item) => item.completion_code === 'budget_exceeded')
        ).toHaveLength(1);
        expect(result.summaries.operational.cost?.amount, label).toBeLessThanOrEqual(maxCost);
      }
  });

  test('treats a demand as a reservation: over-declared work completes, impossible demand runs alone', async () => {
    // Verifier reproduction: declares 6 requests, uses 5, max_requests 50, 5 tasks × 2 targets.
    const tasks = ['t1', 't2', 't3', 't4', 't5'].map((id, index) => task(id, String(index)));
    for (const concurrency of [2, 4, 8] as const) {
      const over = await runExperiment(
        manifest({
          concurrency,
          tasks,
          repetitions: 1,
          seed: undefined,
          retry_policy: { max_attempts: 1, retry_on: [] },
          budgets: { max_requests: 50 },
        }),
        {
          execute_attempt: withDemand(
            async (input) => {
              await delay(input.target.id === 'model-two' ? 6 : 1);
              return passed({ requests: 5 });
            },
            () => ({ requests: 6 })
          ),
        }
      );
      expect(measured(over), `over-declared ${concurrency}`).toBe(10);
      expect(over.stop_reason).toBeUndefined();

      let inFlight = 0;
      let peak = 0;
      const impossible = await runExperiment(
        manifest({
          concurrency,
          tasks: tasks.slice(0, 3),
          repetitions: 1,
          seed: undefined,
          retry_policy: { max_attempts: 1, retry_on: [] },
          budgets: { max_requests: 1_000 },
        }),
        {
          execute_attempt: withDemand(
            async () => {
              inFlight += 1;
              peak = Math.max(peak, inFlight);
              await delay(1);
              inFlight -= 1;
              return passed({ requests: 1 });
            },
            (request) => ({ requests: request.task.id === 't1' ? 1_000_000 : 1 })
          ),
        }
      );
      expect(measured(impossible), `impossible ${concurrency}`).toBe(6);
      expect(impossible.stop_reason).toBeUndefined();
      expect(impossible.execution?.reservations.slice(0, 2)).toEqual([
        { task_id: 't1', target_id: 'model-one' },
        { task_id: 't1', target_id: 'model-two' },
      ]);
    }
  });
});

/**
 * Independently replay the recorded admission and settlement events: at every admission,
 * settled use plus every outstanding grant (its own included) must fit each declared budget.
 */
function admissionViolations(result: ExperimentRunResult): string[] {
  const { budgets } = result.manifest;
  const events: { at: number; kind: 'admit' | 'settle'; attempt: ExperimentAttemptEvidence }[] = [];
  for (const item of result.results)
    for (const attempt of item.attempts) {
      if (!attempt.admission) return ['missing admission'];
      events.push({ at: attempt.admission.admitted_at, kind: 'admit', attempt });
      events.push({ at: attempt.admission.settled_at, kind: 'settle', attempt });
    }
  events.sort((left, right) => left.at - right.at);
  const held = new Set<ExperimentAttemptEvidence>();
  const used = { requests: 0, tokens: 0, cost: 0, invocations: 0 };
  const violations: string[] = [];
  for (const { kind, attempt } of events) {
    if (kind === 'settle') {
      held.delete(attempt);
      used.requests += attempt.usage.requests;
      used.tokens += attempt.usage.tokens ?? 0;
      used.cost += micro(attempt.usage.cost?.amount ?? 0);
      continue;
    }
    held.add(attempt);
    used.invocations += 1;
    const grants = [...held].map((item) => item.admission?.granted_budget);
    const requests = used.requests + sum(grants.map((grant) => grant?.requests ?? 0));
    const committed = result.mode === 'live' ? Math.max(requests, used.invocations) : requests;
    if (committed > budgets.max_requests) violations.push(`requests ${committed}`);
    if (
      budgets.max_tokens !== undefined &&
      used.tokens + sum(grants.map((grant) => grant?.tokens ?? 0)) > budgets.max_tokens
    )
      violations.push('tokens');
    if (
      budgets.max_cost !== undefined &&
      used.cost + sum(grants.map((grant) => micro(grant?.cost?.amount ?? 0))) >
        micro(budgets.max_cost.amount)
    )
      violations.push('cost');
  }
  return violations;
}

/** Integer micro-units, as the runner accounts cost. */
const micro = (amount: number) => Math.round(amount * 1_000_000);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('concurrent budget admission properties', () => {
  test('(a) true-cost executors measure everything under an exact cost budget', async () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = random(seed);
      const tasks = Array.from({ length: rng.int(1, 4) }, (_, index) =>
        task(`t${index}`, String(index))
      );
      const repetitions = rng.int(1, 3);
      const costs = new Map<string, number>();
      for (const item of tasks)
        for (const target of BASE.targets)
          costs.set(`${item.id}:${target.id}`, rng.int(1, 300) / (rng.next() < 0.5 ? 100 : 1000));
      const demandKind = new Map<string, number>();
      for (const key of costs.keys()) demandKind.set(key, rng.int(0, 3));
      const exact = sum([...costs.values()].map((amount) => micro(amount) * repetitions));
      const slow = rng.int(5, 40);
      const outcomes: string[] = [];
      let serialPassed = 0;
      for (const concurrency of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
        const result = await runExperiment(
          manifest({
            concurrency,
            tasks,
            repetitions,
            seed: undefined,
            retry_policy: { max_attempts: 1, retry_on: [] },
            budgets: { max_requests: 1_000, max_cost: { amount: exact / 1e6, currency: 'USD' } },
          }),
          {
            execute_attempt: withDemand(
              async (input) => {
                await yieldTurns(input.target.id === 'model-two' ? slow : rng.int(0, 4));
                const amount = costs.get(`${input.task.id}:${input.target.id}`) ?? 0;
                return passed({ requests: 1, cost: { amount, currency: 'USD' } });
              },
              (request) => {
                const key = `${request.task.id}:${request.target.id}`;
                const amount = costs.get(key) ?? 0;
                const kind = demandKind.get(key);
                // exact, under-declared, over-declared, or no demand
                if (kind === 3) return undefined;
                const factor = kind === 0 ? 1 : kind === 1 ? 0.5 : 2;
                return { requests: 1, cost: { amount: amount * factor, currency: 'USD' } };
              }
            ),
          }
        );
        const label = `seed ${seed} concurrency ${concurrency}`;
        if (concurrency === 1) {
          // Serial runs keep their floating-point cost arithmetic (byte-identical to before),
          // which can fall an ulp short on the last coordinate; concurrent runs never do.
          serialPassed = result.summaries.overall.passed;
          continue;
        }
        expect(result.summaries.overall.passed, label).toBe(result.summaries.overall.planned);
        expect(result.summaries.overall.passed, label).toBeGreaterThanOrEqual(serialPassed);
        expect(result.stop_reason, label).toBeUndefined();
        outcomes.push(JSON.stringify(result.summaries.targets));
      }
      expect(new Set(outcomes).size, `seed ${seed}`).toBe(1);
    }
  });

  test('(b) use above a declared demand that fits the run budget never halts', async () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const rng = random(seed);
      const tasks = Array.from({ length: rng.int(1, 4) }, (_, index) =>
        task(`t${index}`, String(index))
      );
      const repetitions = rng.int(1, 3);
      const usage = new Map<string, { requests: number; tokens: number }>();
      for (const item of tasks)
        for (const target of BASE.targets)
          usage.set(`${item.id}:${target.id}`, { requests: rng.int(1, 6), tokens: rng.int(1, 80) });
      const need = (pick: (value: { requests: number; tokens: number }) => number) =>
        sum([...usage.values()].map(pick)) * repetitions;
      for (const concurrency of [2, 4, 8] as const) {
        const result = await runExperiment(
          manifest({
            concurrency,
            tasks,
            repetitions,
            seed: undefined,
            retry_policy: { max_attempts: 1, retry_on: [] },
            budgets: {
              max_requests: need((value) => value.requests),
              max_tokens: need((value) => value.tokens),
            },
          }),
          {
            execute_attempt: withDemand(
              async (input) => {
                await yieldTurns(rng.int(0, 30));
                return passed(usage.get(`${input.task.id}:${input.target.id}`) ?? { requests: 0 });
              },
              (request) => {
                const actual = usage.get(`${request.task.id}:${request.target.id}`);
                if (!actual) return undefined;
                // Under-declared on purpose: the reservation is smaller than the real use.
                return {
                  requests: Math.max(1, Math.floor(actual.requests / 2)),
                  tokens: Math.max(1, Math.floor(actual.tokens / rng.int(2, 5))),
                };
              }
            ),
          }
        );
        const label = `seed ${seed} concurrency ${concurrency}`;
        expect(result.stop_reason, label).toBeUndefined();
        expect(result.summaries.overall.passed, label).toBe(result.summaries.overall.planned);
      }
    }
  });

  test('(c) consumed use plus outstanding grants never exceed a budget under hostile executors', async () => {
    for (let seed = 1; seed <= 250; seed += 1) {
      const rng = random(seed);
      const live = rng.next() < 0.5;
      const concurrency = rng.int(2, 8) as ExperimentConcurrency;
      const budgets = {
        max_requests: rng.int(1, 40),
        max_tokens: rng.int(1, 400),
        max_cost: { amount: rng.int(1, 300) / 100, currency: 'USD' },
      };
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
      let peak = 0;
      const result = await runExperiment(value, {
        live_authorization: live ? authorization : undefined,
        execute_attempt: withDemand(
          async (input) => {
            const key = attemptKey(input);
            const grant = input.remaining_budget;
            outstanding.set(key, grant);
            granted.set(key, grant);
            peak = Math.max(peak, outstanding.size);
            await yieldTurns(rng.int(0, 40));
            outstanding.delete(key);
            // Hostile: sometimes report use far beyond the reservation or the whole budget.
            const scale = rng.next() < 0.25 ? rng.int(2, 20) : 1;
            const usage = {
              requests: rng.int(0, grant.requests * scale),
              tokens: rng.int(0, (grant.tokens ?? 0) * scale),
              cost: {
                amount: (rng.next() < 0.3 ? 1 : rng.next()) * (grant.cost?.amount ?? 0) * scale,
                currency: 'USD',
              },
            };
            if (rng.next() < 0.05) throw new Error('hostile executor');
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
          () =>
            rng.next() < 0.15
              ? undefined
              : {
                  requests: rng.int(1, 6),
                  tokens: rng.int(1, 60),
                  cost: { amount: rng.int(1, 60) / 100, currency: 'USD' },
                }
        ),
      });

      const label = `seed ${seed}`;
      expect(admissionViolations(result), label).toEqual([]);
      // The recorded peak counts admitted, unsettled grants; a finished body may await settlement.
      expect(peak, label).toBeLessThanOrEqual(result.execution?.peak_in_flight ?? 0);
      expect(result.execution?.peak_in_flight, label).toBeLessThanOrEqual(concurrency);
      expect(result.completion.matrix_complete, label).toBe(true);
      expect(
        result.results.map((item) => item.coordinate.coordinate_id),
        label
      ).toEqual(buildExperimentMatrix(value).map((coordinate) => coordinate.coordinate_id));
      const operational = result.summaries.operational;
      expect(operational.reserved_live_requests, label).toBeLessThanOrEqual(budgets.max_requests);
      // Only use an executor reports beyond its grant can exceed a budget, and it is recorded.
      if (!result.results.some((item) => item.completion_code === 'budget_exceeded')) {
        expect(operational.requests, label).toBeLessThanOrEqual(budgets.max_requests);
        expect(operational.tokens, label).toBeLessThanOrEqual(budgets.max_tokens);
      }
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

  test('(d) an exactly sufficient budget measures every coordinate at every concurrency', async () => {
    for (let seed = 1; seed <= 120; seed += 1) {
      const rng = random(seed);
      const tasks = Array.from({ length: rng.int(1, 5) }, (_, index) =>
        task(`t${index}`, String(index))
      );
      const cases = new Map(tasks.map((item) => [item.id, rng.int(1, 6)]));
      const tokensPerCase = rng.int(1, 20);
      const tokenFactor = [0.5, 1, 2, 1_000_000][rng.int(0, 3)] as number;
      const requestExtra = [0, 0, 2, 1_000_000][rng.int(0, 3)] as number;
      const declare = rng.next() < 0.85;
      const repetitions = rng.int(1, 4);
      const need = [...cases.values()].reduce((total, count) => total + count, 0) * 2 * repetitions;
      const slow = rng.int(5, 60);
      const outcomes: string[] = [];
      for (const concurrency of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
        const execute: ExperimentAttemptExecutor = async (input) => {
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
        };
        if (declare)
          execute.reserve = (request) => {
            const count = cases.get(request.task.id) ?? 0;
            // Exact, over-declared or impossible request demand; any token demand.
            return {
              requests: count + requestExtra,
              tokens: Math.max(1, Math.round(count * tokensPerCase * tokenFactor)),
            };
          };
        const result = await runExperiment(
          manifest({
            concurrency,
            tasks,
            repetitions,
            retry_policy: { max_attempts: 1, retry_on: [] },
            budgets: { max_requests: need, max_tokens: need * tokensPerCase },
          }),
          { execute_attempt: execute }
        );
        const label = `seed ${seed} concurrency ${concurrency}`;
        expect(result.stop_reason, label).toBeUndefined();
        expect(result.summaries.overall.passed, label).toBe(result.summaries.overall.planned);
        outcomes.push(JSON.stringify(result.summaries.targets));
      }
      expect(new Set(outcomes).size, `seed ${seed}`).toBe(1);
    }
  });
});
