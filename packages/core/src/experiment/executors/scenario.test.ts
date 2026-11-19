import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GenerateOptions, GenerateResult, ModelClient } from '../../adapters/types';
import { runExperiment } from '../runner';
import type {
  ExperimentAttemptInput,
  ExperimentLiveAuthorization,
  ExperimentManifest,
  ExperimentRunResult,
  ExperimentTarget,
  ExperimentTask,
} from '../types';
import {
  SCENARIO_PROMPT_TOKEN_ALLOWANCE,
  type ScenarioExperimentEvidenceRecord,
  type ScenarioExperimentExecutorOptions,
  createScenarioExperimentExecutor,
  runManifestIdentity,
} from './scenario';

const ANSWER_SCENARIO = `name: fixture-answer
cases:
  - id: capital
    prompt: "What is the capital of Nigeria?"
    expected:
      type: contains
      values: ["Abuja"]
  - id: arithmetic
    prompt: "What is 2 + 2?"
    expected:
      type: contains
      values: ["4"]
`;

const GRADED_SCENARIO = `name: fixture-graded
cases:
  - id: graded
    prompt: "What is the capital of Nigeria?"
    expected:
      type: llm_grader
      rubric: "Names Abuja"
      strict: true
`;

const MIXED_SCENARIO = `name: fixture-mixed
cases:
  - id: arithmetic
    prompt: "What is 2 + 2?"
    expected:
      type: contains
      values: ["4"]
  - id: graded
    prompt: "What is the capital of Nigeria?"
    expected:
      type: llm_grader
      rubric: "Names Abuja"
      strict: true
`;

const RETRYING_SCENARIO = `name: fixture-retrying
cases:
  - id: capital
    prompt: "What is the capital of Nigeria?"
    retries: 2
    expected:
      type: contains
      values: ["Abuja"]
`;

const PINNED_MODEL_SCENARIO = `name: fixture-pinned
cases:
  - id: capital
    prompt: "What is the capital of Nigeria?"
    model: some-other-model
    expected:
      type: contains
      values: ["Abuja"]
`;

const ENV_SCENARIO = `name: fixture-env
cases:
  - id: capital
    prompt: "What is the capital of Nigeria? \${AKIT_EXECUTOR_TEST_SECRET}"
    expected:
      type: contains
      values: ["Abuja"]
`;

const TOOL_SCENARIO = `name: fixture-tools
setup:
  tools:
    - type: function
      function:
        name: lookup_order
        parameters:
          type: object
          properties:
            orderId: { type: string }
  fixtures:
    lookup_order:
      - when: { orderId: "A-1" }
        result: { status: delivered }
  toolLoop:
    enabled: true
    maxSteps: 2
cases:
  - id: order-status
    prompt: "Where is order A-1?"
    expected:
      type: contains
      values: ["delivered"]
`;

const SAMPLED_SCENARIO = `name: fixture-sampled
temperature: 0
maxTokens: 4096
seed: 7
cases:
  - id: capital
    prompt: "What is the capital of Nigeria?"
    expected:
      type: contains
      values: ["Abuja"]
`;

const BROKEN_SCENARIO = 'name: fixture-broken\ncases: []\n';

const SOURCES: Record<string, string> = {
  'scenarios/answer.yaml': ANSWER_SCENARIO,
  'scenarios/graded.yaml': GRADED_SCENARIO,
  'scenarios/mixed.yaml': MIXED_SCENARIO,
  'scenarios/retrying.yaml': RETRYING_SCENARIO,
  'scenarios/pinned.yaml': PINNED_MODEL_SCENARIO,
  'scenarios/env.yaml': ENV_SCENARIO,
  'scenarios/broken.yaml': BROKEN_SCENARIO,
  'scenarios/sampled.yaml': SAMPLED_SCENARIO,
  'scenarios/tools.yaml': TOOL_SCENARIO,
  'workflows/resolve.yaml': 'name: workflow\n',
};

const LOCAL_TARGET: ExperimentTarget = {
  id: 'qwen-local',
  provider: 'openai',
  model: 'qwen3.5:4b',
  capabilities: ['text'],
  deployment: { locality: 'local', runtime: 'ollama', cost_basis: 'not_applicable' },
};

const METERED_TARGET: ExperimentTarget = {
  id: 'hosted',
  provider: 'openai',
  model: 'fixture-hosted',
  capabilities: ['text'],
  deployment: { locality: 'remote', cost_basis: 'metered' },
};

const LOCAL_TARGET_9B: ExperimentTarget = {
  ...LOCAL_TARGET,
  id: 'qwen-local-9b',
  model: 'qwen3.5:9b',
};

const METERED_TARGET_2: ExperimentTarget = {
  ...METERED_TARGET,
  id: 'hosted-2',
  model: 'fixture-hosted-2',
};

const AUTHORIZATION: ExperimentLiveAuthorization = {
  approved: true,
  decision_id: 'executor-test',
  decided_at: '2026-11-19T00:00:00Z',
  approved_by: 'test-suite',
  reason: 'In-memory fixture clients only',
};

const PROVIDER_SECRET_TEXT = 'upstream exploded with key sk-should-never-appear';

let root: string;
let outside: string;

beforeAll(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'akit-scenario-executor-'));
  root = path.join(base, 'root');
  outside = path.join(base, 'outside');
  await mkdir(path.join(root, 'scenarios'), { recursive: true });
  await mkdir(path.join(root, 'workflows'), { recursive: true });
  await mkdir(outside, { recursive: true });
  for (const [relative, content] of Object.entries(SOURCES)) {
    await writeFile(path.join(root, relative), content);
  }
  await writeFile(path.join(outside, 'answer.yaml'), ANSWER_SCENARIO);
  await symlink(path.join(outside, 'answer.yaml'), path.join(root, 'scenarios/escape.yaml'));
});

afterAll(async () => {
  await rm(path.dirname(root), { recursive: true, force: true });
});

function digestOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function scenarioTask(
  sourcePath: string,
  options: { id?: string; digest?: string; kind?: ExperimentTask['kind'] } = {}
): ExperimentTask {
  const kind = options.kind ?? 'scenario_evaluation';
  return {
    id: options.id ?? 'answer',
    kind,
    source: {
      kind,
      path: sourcePath,
      artifact: {
        schema_version: '1',
        algorithm: 'sha256',
        digest: options.digest ?? digestOf(SOURCES[sourcePath] ?? ANSWER_SCENARIO),
      },
    },
    required_capabilities: ['text'],
  };
}

function experiment(
  tasks: ExperimentTask[],
  overrides: Partial<ExperimentManifest> = {}
): ExperimentManifest {
  const fixed = (digit: string) => ({
    schema_version: '1' as const,
    algorithm: 'sha256' as const,
    digest: digit.repeat(64),
  });
  return {
    schema_version: '1',
    id: 'executor-fixture',
    mode: 'fixture',
    identities: { schema_version: '1', workload: fixed('a'), rubric: fixed('b') },
    tasks,
    targets: [LOCAL_TARGET, METERED_TARGET],
    repetitions: 1,
    concurrency: 1,
    exclusions: [],
    retry_policy: { max_attempts: 1, retry_on: [] },
    budgets: { max_requests: 100 },
    ...overrides,
  };
}

function liveExperiment(
  tasks: ExperimentTask[],
  overrides: Partial<ExperimentManifest> = {}
): ExperimentManifest {
  return experiment(tasks, {
    mode: 'live',
    budgets: {
      max_requests: 100,
      max_tokens: 100_000,
      max_cost: { amount: 10, currency: 'USD' },
    },
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
    ...overrides,
  });
}

interface FixtureBehaviour {
  /** Reply for the target prompt; defaults to the correct answer. */
  answer?: (prompt: string) => string;
  /** Reply for the LLM grader's prompt. */
  grader?: string;
  /** Throw a provider error for prompts containing this text. */
  failOn?: string;
  usageAvailable?: boolean;
  /** Report every target answer as cut off at its token limit. */
  truncated?: boolean;
  never?: boolean;
  /** Per-request tool behaviour: call a tool by name, or throw a provider error. */
  toolScript?: Array<{ call: string } | 'throw'>;
}

interface FixtureState {
  calls: number;
  closed: number;
  targets: string[];
}

const CORRECT = (prompt: string) => (prompt.includes('capital') ? 'Abuja' : '4');

function promptText(options: GenerateOptions): string {
  if (typeof options.prompt === 'string') return options.prompt;
  return options.prompt.map((message) => String(message.content)).join('\n');
}

function fixtureClients(
  behaviours: Record<string, FixtureBehaviour>
): FixtureState & { createClient: ScenarioExperimentExecutorOptions['createClient'] } {
  const state: FixtureState = { calls: 0, closed: 0, targets: [] };
  const createClient = (target: ExperimentTarget): ModelClient => {
    state.targets.push(target.id);
    const behaviour = behaviours[target.id] ?? {};
    let clientCalls = 0;
    return {
      provider: target.provider,
      capabilities: async () => ({
        streaming: false,
        functionCalling: false,
        toolUse: false,
        maxContext: 8192,
      }),
      close: async () => {
        state.closed += 1;
      },
      generate: async (options): Promise<GenerateResult> => {
        state.calls += 1;
        clientCalls += 1;
        const text = promptText(options);
        const scripted = behaviour.toolScript?.[clientCalls - 1];
        if (scripted === 'throw') throw new Error(PROVIDER_SECRET_TEXT);
        if (scripted) {
          return {
            id: `fixture-${state.calls}`,
            model: target.model,
            text: '',
            tokens: { prompt: 7, completion: 3, total: 10 },
            latencyMs: 1,
            finishReason: 'tool_calls',
            toolCalls: [
              {
                id: `call-${clientCalls}`,
                type: 'function',
                function: { name: scripted.call, arguments: '{"orderId":"A-1"}' },
              },
            ],
          };
        }
        if (behaviour.never) return new Promise<GenerateResult>(() => {});
        if (behaviour.failOn && text.includes(behaviour.failOn)) {
          throw new Error(PROVIDER_SECRET_TEXT);
        }
        const isGrader = text.includes('RUBRIC:');
        return {
          id: `fixture-${state.calls}`,
          model: target.model,
          text: isGrader
            ? (behaviour.grader ?? '{"score":1,"reason":"ok"}')
            : (behaviour.answer ?? CORRECT)(text),
          tokens: { prompt: 7, completion: 3, total: 10 },
          latencyMs: 1,
          ...(behaviour.usageAvailable === false ? { usageAvailable: false } : {}),
          ...(behaviour.truncated && !isGrader ? { finishReason: 'length' as const } : {}),
        };
      },
    };
  };
  return Object.assign(state, { createClient });
}

function attemptFor(result: ExperimentRunResult, targetId: string) {
  const coordinate = result.results.find((item) => item.coordinate.target_id === targetId);
  if (!coordinate) throw new Error(`no coordinate for ${targetId}`);
  return coordinate.attempts[0];
}

function directInput(task: ExperimentTask): ExperimentAttemptInput {
  return {
    experiment_id: 'direct',
    coordinate: {
      coordinate_id: 'c'.repeat(64),
      task_id: task.id,
      task_kind: task.kind,
      target_id: LOCAL_TARGET.id,
      repetition_index: 1,
      missing_capabilities: [],
    },
    task,
    target: LOCAL_TARGET,
    retry_chain_id: 'c'.repeat(64),
    attempt_number: 1,
    remaining_budget: { requests: 100 },
  };
}

describe('createScenarioExperimentExecutor status mapping', () => {
  test('maps all-passing cases to passed with metered requests and tokens', async () => {
    const fixtures = fixtureClients({});
    const result = await runExperiment(experiment([scenarioTask('scenarios/answer.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    for (const target of [LOCAL_TARGET, METERED_TARGET]) {
      const attempt = attemptFor(result, target.id);
      expect(attempt.status).toBe('passed');
      expect(attempt.error_code).toBeUndefined();
      expect(attempt.usage).toEqual({ requests: 2, tokens: 20 });
      expect(attempt.evidence.availability).toBe('available');
    }
    expect(fixtures.targets).toEqual([LOCAL_TARGET.id, METERED_TARGET.id]);
    expect(fixtures.closed).toBe(2);
    expect(result.summaries.overall.passed).toBe(2);
  });

  test('maps a response cut off at its token limit to invalid, even when it would pass', async () => {
    const fixtures = fixtureClients({ [METERED_TARGET.id]: { truncated: true } });
    const result = await runExperiment(experiment([scenarioTask('scenarios/answer.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    expect(attemptFor(result, LOCAL_TARGET.id).status).toBe('passed');
    const truncated = attemptFor(result, METERED_TARGET.id);
    expect(truncated.status).toBe('invalid');
    expect(truncated.error_code).toBe('response_truncated');
    expect(truncated.evidence.availability).toBe('available');
    expect(result.summaries.overall.invalid).toBe(1);
    expect(result.summaries.overall.valid).toBe(1);
  });

  test('maps a failed valid case to task_failed', async () => {
    const fixtures = fixtureClients({ [METERED_TARGET.id]: { answer: () => 'Lagos' } });
    const result = await runExperiment(experiment([scenarioTask('scenarios/answer.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    expect(attemptFor(result, LOCAL_TARGET.id).status).toBe('passed');
    const failed = attemptFor(result, METERED_TARGET.id);
    expect(failed.status).toBe('task_failed');
    expect(failed.error_code).toBeUndefined();
    expect(failed.evidence.availability).toBe('available');
  });

  test('maps an unreliable evaluation to invalid measurement_invalid', async () => {
    const fixtures = fixtureClients({ [LOCAL_TARGET.id]: { grader: 'not json' } });
    const result = await runExperiment(experiment([scenarioTask('scenarios/graded.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('invalid');
    expect(attempt.error_code).toBe('measurement_invalid');
    expect(attempt.usage.requests).toBe(2);
    expect(attemptFor(result, METERED_TARGET.id).status).toBe('passed');
  });

  test('ranks an invalid measurement above a failed case', async () => {
    const fixtures = fixtureClients({
      [LOCAL_TARGET.id]: { answer: () => 'five', grader: 'not json' },
    });
    const result = await runExperiment(experiment([scenarioTask('scenarios/mixed.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    expect(attemptFor(result, LOCAL_TARGET.id).status).toBe('invalid');
  });

  test('ranks a provider error above every other case outcome without leaking its text', async () => {
    const fixtures = fixtureClients({
      [LOCAL_TARGET.id]: { failOn: 'capital', answer: () => 'five' },
    });
    const result = await runExperiment(experiment([scenarioTask('scenarios/answer.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('infrastructure_failed');
    expect(attempt.error_code).toBe('provider_error');
    expect(attempt.usage).toEqual({ requests: 2 });
    expect(attempt.evidence.availability).toBe('available');
    expect(JSON.stringify(result)).not.toContain('sk-should-never-appear');
  });

  test('maps a case timeout to provider_error and leaves tokens unreported', async () => {
    const fixtures = fixtureClients({ [LOCAL_TARGET.id]: { never: true } });
    const result = await runExperiment(experiment([scenarioTask('scenarios/graded.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        timeoutMs: 10,
        createClient: fixtures.createClient,
      }),
    });

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('infrastructure_failed');
    expect(attempt.error_code).toBe('provider_error');
    expect(attempt.usage).toEqual({ requests: 1 });
  });

  test.each([
    ['an unknown tool call', [{ call: 'delete_everything' }], 'invalid', 'measurement_invalid'],
    [
      'a failed follow-up generation',
      [{ call: 'lookup_order' }, 'throw'],
      'infrastructure_failed',
      'provider_error',
    ],
  ] as const)('maps a tool loop ending in %s to %s', async (_label, toolScript, status, code) => {
    const fixtures = fixtureClients({ [LOCAL_TARGET.id]: { toolScript: [...toolScript] } });
    const result = await runExperiment(experiment([scenarioTask('scenarios/tools.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe(status);
    expect(attempt.error_code).toBe(code);
    expect(attempt.usage.requests).toBe(toolScript.length);
    expect(JSON.stringify(result)).not.toContain('sk-should-never-appear');
  });

  test('maps a throwing createClient to client_unavailable without requests', async () => {
    const result = await runExperiment(experiment([scenarioTask('scenarios/answer.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: () => {
          throw new Error(PROVIDER_SECRET_TEXT);
        },
      }),
    });

    for (const target of [LOCAL_TARGET, METERED_TARGET]) {
      const attempt = attemptFor(result, target.id);
      expect(attempt.status).toBe('infrastructure_failed');
      expect(attempt.error_code).toBe('client_unavailable');
      expect(attempt.usage).toEqual({ requests: 0, tokens: 0 });
    }
    expect(JSON.stringify(result)).not.toContain('sk-should-never-appear');
  });

  test('never emits policy_failed', async () => {
    const fixtures = fixtureClients({ [LOCAL_TARGET.id]: { answer: () => 'no' } });
    const result = await runExperiment(experiment([scenarioTask('scenarios/answer.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });
    expect(result.summaries.operational.attempt_statuses.policy_failed).toBe(0);
  });
});

describe('createScenarioExperimentExecutor source safety', () => {
  test('rejects a digest mismatch before any model call', async () => {
    const fixtures = fixtureClients({});
    const task = scenarioTask('scenarios/answer.yaml', { digest: 'f'.repeat(64) });
    const result = await runExperiment(experiment([task]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    for (const target of [LOCAL_TARGET, METERED_TARGET]) {
      const attempt = attemptFor(result, target.id);
      expect(attempt.status).toBe('invalid');
      expect(attempt.error_code).toBe('source_digest_mismatch');
      expect(attempt.usage).toEqual({ requests: 0, tokens: 0 });
      expect(attempt.evidence).toEqual({
        kind: 'scenario_evaluation',
        availability: 'unavailable',
      });
    }
    expect(fixtures.targets).toEqual([]);
    expect(fixtures.calls).toBe(0);
  });

  test('rejects a symlink that leaves the root before any model call', async () => {
    const fixtures = fixtureClients({});
    const task = scenarioTask('scenarios/escape.yaml', { digest: digestOf(ANSWER_SCENARIO) });
    const result = await runExperiment(experiment([task]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('invalid');
    expect(attempt.error_code).toBe('source_path_rejected');
    expect(attempt.usage).toEqual({ requests: 0, tokens: 0 });
    expect(fixtures.calls).toBe(0);
  });

  test.each([
    ['parent escape', '../outside/answer.yaml'],
    ['nested parent escape', 'scenarios/../../outside/answer.yaml'],
    ['absolute path', '/etc/hosts'],
    ['windows absolute path', 'C:\\scenarios\\answer.yaml'],
    ['backslash path', 'scenarios\\answer.yaml'],
    ['nul byte', 'scenarios/answer.yaml\0'],
  ])('rejects a %s before any model call', async (_label, sourcePath) => {
    const fixtures = fixtureClients({});
    const execute = createScenarioExperimentExecutor({
      root,
      repetitions: 1,
      createClient: fixtures.createClient,
    });
    const task = scenarioTask(sourcePath, { digest: digestOf(ANSWER_SCENARIO) });

    const output = await execute(directInput(task));
    expect(output).toEqual({
      status: 'invalid',
      usage: { requests: 0, tokens: 0 },
      evidence: { kind: 'scenario_evaluation', availability: 'unavailable' },
      error_code: 'source_path_rejected',
    });
    expect(fixtures.targets).toEqual([]);
  });

  test('reports a missing source as source_unreadable', async () => {
    const execute = createScenarioExperimentExecutor({
      root,
      repetitions: 1,
      createClient: fixtureClients({}).createClient,
    });
    const output = await execute(directInput(scenarioTask('scenarios/missing.yaml')));
    expect(output.status).toBe('invalid');
    expect(output.error_code).toBe('source_unreadable');
  });

  test('rejects agent_workflow tasks before reading or calling anything', async () => {
    const fixtures = fixtureClients({});
    const task = scenarioTask('workflows/resolve.yaml', { id: 'resolve', kind: 'agent_workflow' });
    const result = await runExperiment(experiment([task]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('invalid');
    expect(attempt.error_code).toBe('task_kind_unsupported');
    expect(attempt.evidence).toEqual({ kind: 'agent_workflow', availability: 'unavailable' });
    expect(fixtures.calls).toBe(0);
  });

  test.each([
    ['scenarios/broken.yaml', 'scenario_invalid'],
    ['scenarios/retrying.yaml', 'scenario_retries_unsupported'],
    ['scenarios/pinned.yaml', 'scenario_model_conflict'],
  ])('rejects %s as %s without calling the model', async (sourcePath, code) => {
    const fixtures = fixtureClients({});
    const result = await runExperiment(experiment([scenarioTask(sourcePath)]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
      }),
    });

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('invalid');
    expect(attempt.error_code).toBe(code);
    expect(fixtures.calls).toBe(0);
  });

  test('does not expand host environment variables into prompts', async () => {
    process.env.AKIT_EXECUTOR_TEST_SECRET = 'host-secret-value';
    const prompts: string[] = [];
    const fixtures = fixtureClients({});
    try {
      await runExperiment(experiment([scenarioTask('scenarios/env.yaml')]), {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 1,
          createClient: async (target) => {
            const client = fixtures.createClient(target) as ModelClient;
            return {
              ...client,
              generate: (options) => {
                prompts.push(promptText(options));
                return client.generate(options);
              },
            };
          },
        }),
      });
    } finally {
      Reflect.deleteProperty(process.env, 'AKIT_EXECUTOR_TEST_SECRET');
    }
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.join('\n')).not.toContain('host-secret-value');
  });
});

describe('createScenarioExperimentExecutor usage and cost', () => {
  test('omits tokens when a request lacks usage so live runs halt with usage_unreported', async () => {
    const fixtures = fixtureClients({ [LOCAL_TARGET.id]: { usageAvailable: false } });
    const result = await runExperiment(
      liveExperiment([scenarioTask('scenarios/answer.yaml')], {
        targets: [LOCAL_TARGET, LOCAL_TARGET_9B],
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 1,
          createClient: fixtures.createClient,
        }),
        live_authorization: AUTHORIZATION,
      }
    );

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('incomplete');
    expect(attempt.error_code).toBe('usage_unreported');
    expect(attempt.usage).toEqual({ requests: 2 });
    expect(result.stop_reason).toBe('usage_unreported');
  });

  test('never reports cost for a local not_applicable target', async () => {
    const costCalls: string[] = [];
    const fixtures = fixtureClients({});
    const result = await runExperiment(
      liveExperiment([scenarioTask('scenarios/answer.yaml')], {
        targets: [LOCAL_TARGET, LOCAL_TARGET_9B],
        budgets: { max_requests: 100, max_tokens: 100_000 },
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 1,
          createClient: fixtures.createClient,
          resolveCost: (target) => {
            costCalls.push(target.id);
            return { amount: 1, currency: 'USD' };
          },
        }),
        live_authorization: AUTHORIZATION,
      }
    );

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('passed');
    expect(attempt.usage).toEqual({ requests: 2, tokens: 20 });
    expect(costCalls).toEqual([]);
    expect(result.summaries.operational.cost).toBeUndefined();
  });

  test('reports metered cost only from resolveCost', async () => {
    const costCalls: string[] = [];
    const fixtures = fixtureClients({});
    const result = await runExperiment(liveExperiment([scenarioTask('scenarios/answer.yaml')]), {
      execute_attempt: createScenarioExperimentExecutor({
        root,
        repetitions: 1,
        createClient: fixtures.createClient,
        resolveCost: (target, manifest) => {
          costCalls.push(target.id);
          expect(manifest.cases).toHaveLength(2);
          return { amount: 0.02, currency: 'USD' };
        },
      }),
      live_authorization: AUTHORIZATION,
    });

    expect(attemptFor(result, LOCAL_TARGET.id).usage.cost).toBeUndefined();
    expect(attemptFor(result, METERED_TARGET.id).usage).toEqual({
      requests: 2,
      tokens: 20,
      cost: { amount: 0.02, currency: 'USD' },
    });
    expect(costCalls).toEqual([METERED_TARGET.id]);
  });

  test('leaves metered cost unreported without resolveCost and never estimates it', async () => {
    const fixtures = fixtureClients({});
    const result = await runExperiment(
      liveExperiment([scenarioTask('scenarios/answer.yaml')], {
        targets: [METERED_TARGET, METERED_TARGET_2],
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 1,
          createClient: fixtures.createClient,
        }),
        live_authorization: AUTHORIZATION,
      }
    );

    const attempt = attemptFor(result, METERED_TARGET.id);
    expect(attempt.status).toBe('incomplete');
    expect(attempt.error_code).toBe('usage_unreported');
    expect(attempt.usage.cost).toBeUndefined();
  });

  test.each([
    [
      'throws',
      () => {
        throw new Error(PROVIDER_SECRET_TEXT);
      },
    ],
    ['returns a malformed cost', () => ({ amount: -1, currency: 'usd' })],
  ])('maps a resolveCost that %s to cost_resolution_failed', async (_label, resolveCost) => {
    const fixtures = fixtureClients({});
    const result = await runExperiment(
      experiment([scenarioTask('scenarios/answer.yaml')], {
        targets: [METERED_TARGET, METERED_TARGET_2],
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 1,
          createClient: fixtures.createClient,
          resolveCost,
        }),
      }
    );

    const attempt = attemptFor(result, METERED_TARGET.id);
    expect(attempt.status).toBe('infrastructure_failed');
    expect(attempt.error_code).toBe('cost_resolution_failed');
    expect(attempt.usage).toEqual({ requests: 2, tokens: 20 });
  });

  test('refuses to start when the remaining request budget cannot cover every case', async () => {
    const fixtures = fixtureClients({});
    const result = await runExperiment(
      experiment([scenarioTask('scenarios/answer.yaml')], {
        targets: [LOCAL_TARGET, LOCAL_TARGET_9B],
        budgets: { max_requests: 1 },
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 1,
          createClient: fixtures.createClient,
        }),
      }
    );

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('incomplete');
    expect(attempt.error_code).toBe('request_budget_insufficient');
    expect(fixtures.calls).toBe(0);
  });

  test('stops at the request budget when evaluator calls would exceed it', async () => {
    const fixtures = fixtureClients({});
    const result = await runExperiment(
      experiment([scenarioTask('scenarios/graded.yaml')], {
        targets: [LOCAL_TARGET, LOCAL_TARGET_9B],
        budgets: { max_requests: 1 },
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 1,
          createClient: fixtures.createClient,
        }),
      }
    );

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('incomplete');
    expect(attempt.error_code).toBe('request_budget_exhausted');
    expect(attempt.usage).toEqual({ requests: 1, tokens: 10 });
    expect(fixtures.calls).toBe(1);
  });
});

describe('createScenarioExperimentExecutor evidence', () => {
  test('hands the run manifest to onEvidence with a stable canonical digest', async () => {
    const records: ScenarioExperimentEvidenceRecord[] = [];
    const fixtures = fixtureClients({});
    const result = await runExperiment(
      experiment([scenarioTask('scenarios/answer.yaml')], {
        repetitions: 2,
        seed: { value: 41, strategy: 'increment_by_repetition', require_support: false },
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 2,
          createClient: fixtures.createClient,
          onEvidence: (record) => {
            records.push(record);
          },
        }),
      }
    );

    expect(records).toHaveLength(4);
    for (const record of records) {
      const coordinate = result.results.find(
        (item) => item.coordinate.coordinate_id === record.coordinate_id
      );
      expect(coordinate?.attempts[0].evidence).toEqual({
        kind: 'scenario_evaluation',
        availability: 'available',
        artifact: record.artifact,
      });
      expect(record.attempt_number).toBe(1);
      expect(runManifestIdentity(record.manifest)).toEqual(record.artifact);
      expect(record.manifest.attempt_evidence?.repetition).toEqual({
        index: coordinate?.coordinate.repetition_index ?? 0,
        total: 2,
      });
      expect(record.manifest.config.seed).toBe(coordinate?.coordinate.seed);
      expect(record.manifest.config.model).toBe(
        coordinate?.coordinate.target_id === LOCAL_TARGET.id
          ? LOCAL_TARGET.model
          : METERED_TARGET.model
      );
      expect(record.manifest.attempt_evidence?.retry_policy.default_max_retries).toBe(0);
    }
  });

  test('records the target-declared reasoning_effort in the run manifest', async () => {
    const records: ScenarioExperimentEvidenceRecord[] = [];
    const thinkingOff: ExperimentTarget = {
      ...LOCAL_TARGET,
      settings: { base_url: 'http://127.0.0.1:11434/v1', reasoning_effort: 'none' },
    };
    const thinkingOn: ExperimentTarget = {
      ...LOCAL_TARGET_9B,
      settings: { reasoning_effort: 'medium' },
    };
    const fixtures = fixtureClients({});
    await runExperiment(
      experiment([scenarioTask('scenarios/answer.yaml')], {
        targets: [thinkingOff, thinkingOn, METERED_TARGET],
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 1,
          createClient: fixtures.createClient,
          onEvidence: (record) => {
            records.push(record);
          },
        }),
      }
    );

    const effortByModel = Object.fromEntries(
      records.map((record) => [
        record.manifest.config.model,
        record.manifest.resolved_config?.reasoning_effort,
      ])
    );
    expect(effortByModel).toEqual({
      [thinkingOff.model]: 'none',
      [thinkingOn.model]: 'medium',
      [METERED_TARGET.model]: undefined,
    });
    for (const record of records) {
      expect(runManifestIdentity(record.manifest)).toEqual(record.artifact);
    }
  });

  test('produces the same digest regardless of object key order', () => {
    const manifest = { b: 1, a: { d: [1, { z: 1, y: 2 }], c: 'x' } };
    const reordered = { a: { c: 'x', d: [1, { y: 2, z: 1 }] }, b: 1 };
    const identity = runManifestIdentity(manifest as never);
    expect(runManifestIdentity(reordered as never)).toEqual(identity);
    expect(identity.digest).toBe(digestOf('{"a":{"c":"x","d":[1,{"y":2,"z":1}]},"b":1}'));
    expect(runManifestIdentity({ ...manifest, b: 2 } as never).digest).not.toBe(identity.digest);
  });

  test('maps an onEvidence failure to evidence_store_failed', async () => {
    const fixtures = fixtureClients({});
    const result = await runExperiment(
      experiment([scenarioTask('scenarios/answer.yaml')], {
        targets: [LOCAL_TARGET, LOCAL_TARGET_9B],
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 1,
          createClient: fixtures.createClient,
          onEvidence: async () => {
            throw new Error(PROVIDER_SECRET_TEXT);
          },
        }),
      }
    );

    const attempt = attemptFor(result, LOCAL_TARGET.id);
    expect(attempt.status).toBe('infrastructure_failed');
    expect(attempt.error_code).toBe('evidence_store_failed');
    expect(attempt.usage).toEqual({ requests: 2, tokens: 20 });
    expect(attempt.evidence).toEqual({ kind: 'scenario_evaluation', availability: 'unavailable' });
    expect(fixtures.closed).toBe(2);
    expect(JSON.stringify(result)).not.toContain('sk-should-never-appear');
  });
});

describe('createScenarioExperimentExecutor options', () => {
  const createClient = () => fixtureClients({}).createClient(LOCAL_TARGET);

  test.each([
    ['a relative root', { root: 'relative/root', repetitions: 1, createClient }],
    ['zero repetitions', { root: '/tmp', repetitions: 0, createClient }],
    ['a missing createClient', { root: '/tmp', repetitions: 1 }],
    ['a fractional timeout', { root: '/tmp', repetitions: 1, createClient, timeoutMs: 1.5 }],
  ])('rejects %s', (_label, options) => {
    expect(() =>
      createScenarioExperimentExecutor(options as unknown as ScenarioExperimentExecutorOptions)
    ).toThrow(TypeError);
  });

  test('treats a createClient result without generate as client_unavailable', async () => {
    const execute = createScenarioExperimentExecutor({
      root,
      repetitions: 1,
      createClient: () => ({ provider: 'broken' }) as unknown as ModelClient,
    });
    const output = await execute(directInput(scenarioTask('scenarios/answer.yaml')));
    expect(output.status).toBe('infrastructure_failed');
    expect(output.error_code).toBe('client_unavailable');
  });

  test('rejects a repetition index beyond the declared total', async () => {
    const execute = createScenarioExperimentExecutor({ root, repetitions: 1, createClient });
    const input = directInput(scenarioTask('scenarios/answer.yaml'));
    input.coordinate.repetition_index = 2;
    const output = await execute(input);
    expect(output.status).toBe('invalid');
    expect(output.error_code).toBe('repetition_out_of_range');
  });
});

describe('createScenarioExperimentExecutor target generation settings', () => {
  const THINKING: ExperimentTarget = {
    ...LOCAL_TARGET_9B,
    settings: {
      reasoning_effort: 'medium',
      temperature: 1,
      top_p: 0.95,
      presence_penalty: 1.5,
      max_output_tokens: 32768,
    },
  };
  const PLAIN: ExperimentTarget = { ...LOCAL_TARGET, settings: { reasoning_effort: 'none' } };

  /** Record every request's options by target, answering correctly. */
  function recordingClients() {
    const requests: Array<{ target: string; options: GenerateOptions }> = [];
    const createClient = (target: ExperimentTarget): ModelClient => ({
      provider: 'openai',
      async capabilities() {
        return { streaming: false, functionCalling: false, toolUse: false, maxContext: 8192 };
      },
      async generate(options): Promise<GenerateResult> {
        requests.push({ target: target.id, options });
        return {
          id: `r${requests.length}`,
          model: target.model,
          text: 'Abuja',
          tokens: { prompt: 1, completion: 1, total: 2 },
          latencyMs: 1,
        };
      },
    });
    return { requests, createClient };
  }

  async function run(targets: ExperimentTarget[], repetitions = 3) {
    const clients = recordingClients();
    const records: ScenarioExperimentEvidenceRecord[] = [];
    const result = await runExperiment(
      experiment([scenarioTask('scenarios/sampled.yaml')], {
        targets,
        repetitions,
        seed: { value: 40, strategy: 'increment_by_repetition', require_support: false },
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions,
          createClient: clients.createClient,
          onEvidence: (record) => {
            records.push(record);
          },
        }),
      }
    );
    return { ...clients, records, result };
  }

  test('applies each target overrides and the scenario values otherwise, with the repetition seed', async () => {
    const { requests } = await run([THINKING, PLAIN]);

    const thinking = requests.filter((request) => request.target === THINKING.id);
    const plain = requests.filter((request) => request.target === PLAIN.id);
    expect(thinking.map((request) => request.options.seed)).toEqual([40, 41, 42]);
    expect(plain.map((request) => request.options.seed)).toEqual([40, 41, 42]);
    for (const { options } of thinking) {
      expect(options).toMatchObject({
        temperature: 1,
        topP: 0.95,
        presencePenalty: 1.5,
        maxTokens: 32768,
      });
    }
    for (const { options } of plain) {
      expect(options).toMatchObject({ temperature: 0, maxTokens: 4096 });
      expect(options).not.toHaveProperty('topP');
      expect(options).not.toHaveProperty('presencePenalty');
    }
  });

  test('records the effective settings sent in each run manifest', async () => {
    const { records } = await run([THINKING, PLAIN]);

    const byTarget = (model: string) =>
      records
        .filter((record) => record.manifest.config.model === model)
        .map((record) => record.manifest.resolved_config);
    expect(byTarget(THINKING.model)).toEqual(
      [40, 41, 42].map((seed) => ({
        provider: 'openai',
        model: THINKING.model,
        temperature: 1,
        max_tokens: 32768,
        top_p: 0.95,
        presence_penalty: 1.5,
        seed,
        reasoning_effort: 'medium',
        source: { temperature: 'config', max_tokens: 'config' },
      }))
    );
    expect(byTarget(PLAIN.model)).toEqual(
      [40, 41, 42].map((seed) => ({
        provider: 'openai',
        model: PLAIN.model,
        temperature: 0,
        max_tokens: 4096,
        seed,
        reasoning_effort: 'none',
        source: { temperature: 'scenario', max_tokens: 'scenario' },
      }))
    );
    for (const record of records) {
      expect(record.manifest.execution_provenance?.target.generation?.seed).toBe(
        record.manifest.resolved_config?.seed
      );
      expect(runManifestIdentity(record.manifest)).toEqual(record.artifact);
    }
  });

  test.each([
    ['generation_settings_invalid', { temperature: 3 }],
    ['generation_settings_invalid', { max_output_tokens: 0 }],
    ['generation_setting_unsupported', { top_k: 20 }],
    ['generation_setting_unsupported', { min_p: 0 }],
  ])('records %s for %p before any request', async (code, settings) => {
    const { requests, result } = await run([{ ...LOCAL_TARGET, settings }, METERED_TARGET], 1);

    expect(requests.filter((request) => request.target === LOCAL_TARGET.id)).toEqual([]);
    expect(requests.filter((request) => request.target === METERED_TARGET.id)).toHaveLength(1);
    expect(attemptFor(result, LOCAL_TARGET.id)).toMatchObject({
      status: 'invalid',
      error_code: code,
      usage: { requests: 0, tokens: 0 },
    });
  });
});

describe('createScenarioExperimentExecutor declared demand', () => {
  const executor = () =>
    createScenarioExperimentExecutor({
      root,
      repetitions: 5,
      createClient: fixtureClients({}).createClient,
    });
  const reserve = (task: ExperimentTask, target: ExperimentTarget = LOCAL_TARGET) => {
    const declare = executor().reserve;
    if (!declare) throw new Error('scenario executor must declare reserve');
    return declare({ experiment_id: 'demand', task, target });
  };

  test('declares one request per case and a token bound when the output cap is known', async () => {
    expect(await reserve(scenarioTask('scenarios/answer.yaml'))).toEqual({ requests: 2 });

    const capped = { ...LOCAL_TARGET, settings: { max_output_tokens: 64 } };
    const promptBytes = ['What is the capital of Nigeria?', 'What is 2 + 2?'].map((text) =>
      Buffer.byteLength(text)
    );
    expect(await reserve(scenarioTask('scenarios/answer.yaml'), capped)).toEqual({
      requests: 2,
      tokens: promptBytes.reduce(
        (sum, bytes) => sum + bytes + SCENARIO_PROMPT_TOKEN_ALLOWANCE + 64,
        0
      ),
    });
    expect(await reserve(scenarioTask('scenarios/sampled.yaml', { id: 'sampled' }))).toEqual({
      requests: 1,
      tokens:
        Buffer.byteLength('What is the capital of Nigeria?') +
        SCENARIO_PROMPT_TOKEN_ALLOWANCE +
        4096,
    });
  });

  test('declares nothing for work it cannot bound or will not run', async () => {
    for (const source of [
      'scenarios/graded.yaml',
      'scenarios/mixed.yaml',
      'scenarios/retrying.yaml',
      'scenarios/tools.yaml',
      'scenarios/broken.yaml',
    ])
      expect(await reserve(scenarioTask(source)), source).toBeUndefined();
    expect(
      await reserve(scenarioTask('scenarios/answer.yaml', { digest: 'f'.repeat(64) }))
    ).toBeUndefined();
    expect(
      await reserve(scenarioTask('workflows/resolve.yaml', { kind: 'agent_workflow' }))
    ).toBeUndefined();
  });

  test('measures every coordinate concurrently when the budget exactly covers the cases', async () => {
    const fixtures = fixtureClients({});
    let inFlight = 0;
    let peak = 0;
    const createClient: ScenarioExperimentExecutorOptions['createClient'] = (target) => {
      const client = fixtures.createClient(target) as ModelClient;
      return {
        ...client,
        generate: async (options) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) =>
            setTimeout(resolve, target.id === LOCAL_TARGET_9B.id ? 6 : 1)
          );
          inFlight -= 1;
          return client.generate(options);
        },
      };
    };
    const result = await runExperiment(
      experiment([scenarioTask('scenarios/answer.yaml')], {
        targets: [LOCAL_TARGET, LOCAL_TARGET_9B],
        repetitions: 5,
        concurrency: 4,
        budgets: { max_requests: 20 },
      }),
      {
        execute_attempt: createScenarioExperimentExecutor({ root, repetitions: 5, createClient }),
      }
    );

    expect(result.summaries.overall).toMatchObject({ planned: 10, passed: 10 });
    expect(result.summaries.operational.requests).toBe(20);
    expect(result.stop_reason).toBeUndefined();
    expect(result.execution?.peak_in_flight).toBe(4);
    expect(peak).toBeGreaterThan(1);
    expect(result.execution?.reservations.map((item) => item.demand)).toEqual([
      { requests: 2 },
      { requests: 2 },
    ]);
  });

  test('runs alone, never short, when declared token bounds exceed the live budget', async () => {
    const fixtures = fixtureClients({});
    const capped = (target: ExperimentTarget) => ({
      ...target,
      settings: { max_output_tokens: 64 },
    });
    const result = await runExperiment(
      liveExperiment([scenarioTask('scenarios/answer.yaml')], {
        targets: [capped(LOCAL_TARGET), capped(LOCAL_TARGET_9B)],
        repetitions: 3,
        concurrency: 4,
        budgets: { max_requests: 12, max_tokens: 120 },
        live: {
          concurrency_ceiling: 4,
          stop_conditions: [
            'request_budget_exhausted',
            'token_budget_exhausted',
            'cost_budget_exhausted',
            'usage_unreported',
            'usage_invalid',
            'budget_exceeded',
          ],
        },
      }),
      {
        live_authorization: { ...AUTHORIZATION, approved_concurrency: 4 },
        execute_attempt: createScenarioExperimentExecutor({
          root,
          repetitions: 3,
          createClient: fixtures.createClient,
        }),
      }
    );

    // Each pair reserves far more than the 120-token budget, so attempts never overlap,
    // yet every coordinate is measured exactly as a serial run would measure it.
    expect(result.summaries.overall).toMatchObject({ planned: 6, passed: 6 });
    expect(result.summaries.operational.tokens).toBe(120);
    expect(result.execution?.peak_in_flight).toBe(1);
    expect(result.stop_reason).toBeUndefined();
  });

  test('keeps measuring when a runtime adds more prompt tokens than the reservation allows', async () => {
    // Verifier reproduction: 4 tasks × 2 local targets × 2 repetitions, 2 cases each,
    // maxTokens 50, an exact request budget, an ample token budget and 600 template tokens.
    const overhead = 600;
    const sources = [0, 1, 2, 3].map((index) => ({
      path: `scenarios/overhead-${index}.yaml`,
      content: `name: overhead-${index}
maxTokens: 50
cases:
  - id: capital
    prompt: "What is the capital of Nigeria? (${index})"
    expected:
      type: contains
      values: ["Abuja"]
  - id: arithmetic
    prompt: "What is 2 + 2? (${index})"
    expected:
      type: contains
      values: ["4"]
`,
    }));
    for (const source of sources) await writeFile(path.join(root, source.path), source.content);
    const tasks = sources.map((source, index) =>
      scenarioTask(source.path, { id: `overhead-${index}`, digest: digestOf(source.content) })
    );
    const createClient = (target: ExperimentTarget): ModelClient => {
      const client = fixtureClients({}).createClient(target) as ModelClient;
      return {
        ...client,
        generate: async (options) => {
          const result = await client.generate(options);
          const prompt = Buffer.byteLength(promptText(options)) + overhead;
          return { ...result, tokens: { prompt, completion: 1, total: prompt + 1 } };
        },
      };
    };
    const run = (concurrency: 1 | 2 | 4 | 8) =>
      runExperiment(
        liveExperiment(tasks, {
          targets: [LOCAL_TARGET, LOCAL_TARGET_9B],
          repetitions: 2,
          concurrency,
          budgets: { max_requests: 32, max_tokens: 100_000 },
          live: {
            concurrency_ceiling: concurrency,
            stop_conditions: [
              'request_budget_exhausted',
              'token_budget_exhausted',
              'cost_budget_exhausted',
              'usage_unreported',
              'usage_invalid',
              'budget_exceeded',
            ],
          },
        }),
        {
          live_authorization: { ...AUTHORIZATION, approved_concurrency: concurrency },
          execute_attempt: createScenarioExperimentExecutor({ root, repetitions: 2, createClient }),
        }
      );

    for (const concurrency of [1, 2, 4, 8] as const) {
      const result = await run(concurrency);
      expect(result.summaries.overall.passed, `concurrency ${concurrency}`).toBe(16);
      expect(result.stop_reason, `concurrency ${concurrency}`).toBeUndefined();
      if (concurrency > 1) {
        const demand = result.execution?.reservations[0]?.demand;
        // Each attempt uses more tokens than it reserved; the pool covers the excess.
        expect(demand?.tokens).toBeLessThan(
          result.results[0].attempts[0].usage.tokens ?? Number.POSITIVE_INFINITY
        );
      }
    }
  });
});
