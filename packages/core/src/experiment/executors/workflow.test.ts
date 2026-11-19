import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GenerateOptions, GenerateResult, ModelClient } from '../../adapters/types';
import type {
  ExperimentAttemptInput,
  ExperimentAttemptOutput,
  ExperimentTarget,
  ExperimentTask,
} from '../types';
import {
  type WorkflowExperimentEvidenceRecord,
  type WorkflowExperimentExecutorOptions,
  createWorkflowExperimentExecutor,
  workflowRecordIdentity,
} from './workflow';

// Each attempt runs the real workflow engine with its bounded cleanup; under full-suite load a
// test with several attempts can exceed the 5 s default on time alone.
setDefaultTimeout(30_000);

interface WorkflowSourceOptions {
  maxModelRequests?: number;
  timeoutMs?: number;
  initialState?: string;
  extra?: string;
  turn?: string;
}

/** Passes when the target reads the brief at least once and then answers. */
function workflowSource(options: WorkflowSourceOptions = {}): string {
  return `version: '1'
kind: agent_workflow
name: read-the-brief
target:
  provider: declared-provider
  model: declared-model
  generation:
    max_tokens: 128
    temperature: 0
environment:
  type: simulated
  policy:
    network: denied
    side_effects: denied
    permissions:
      documents: read
    budgets:
      max_actions: 10
      max_model_requests: ${options.maxModelRequests ?? 4}
      max_tool_calls: 4
      timeout_ms: ${options.timeoutMs ?? 10000}
tools:
  - read_document
  - calculator
workflow:
  system_instructions: Read the brief before answering.
  initial_state: ${options.initialState ?? '{ documents: { brief: "Approval is required." } }'}
  turns:
    - role: user
      content: "${options.turn ?? 'Read the brief and summarise it.'}"
outcomes:
  deterministic:
    - type: tool_trace
      tool: read_document
      minimum_calls: 1
${options.extra ?? ''}evidence:
  trace: summary
  artifacts: checksums
  redact: true
`;
}

const SEMANTIC_EXTRA = `  semantic:
    - type: llm_judge
      rubric: Summarises the brief.
      mode: strict_assurance
`;

const SOURCES: Record<string, string> = {
  'workflows/read.yaml': workflowSource(),
  'workflows/tight.yaml': workflowSource({ maxModelRequests: 2 }),
  'workflows/short-deadline.yaml': workflowSource({ timeoutMs: 200 }),
  'workflows/semantic.yaml': workflowSource({ extra: SEMANTIC_EXTRA }),
  'workflows/env.yaml': workflowSource({ turn: 'Summarise. ${AKIT_WORKFLOW_EXECUTOR_SECRET}' }),
  'workflows/fixture-file.yaml': workflowSource({ initialState: 'fixtures/state.json' }),
  'workflows/fixture-escape.yaml': workflowSource({ initialState: 'fixtures/escape.json' }),
  'workflows/fixtures/state.json': JSON.stringify({ documents: { brief: 'From the fixture.' } }),
  'workflows/broken.yaml': "version: '1'\nkind: agent_workflow\n",
  'scenarios/answer.yaml': 'name: answer\ncases: []\n',
};

const LOCAL_TARGET: ExperimentTarget = {
  id: 'qwen-local',
  provider: 'openai',
  model: 'qwen3.5:4b',
  capabilities: ['text', 'tools'],
  settings: { temperature: 0.7, max_output_tokens: 512 },
  deployment: { locality: 'local', runtime: 'ollama', cost_basis: 'not_applicable' },
};

const METERED_TARGET: ExperimentTarget = {
  id: 'hosted',
  provider: 'openai',
  model: 'fixture-hosted',
  capabilities: ['text', 'tools'],
  deployment: { locality: 'remote', cost_basis: 'metered' },
};

let root: string;

beforeAll(async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'akit-workflow-executor-'));
  root = path.join(base, 'root');
  const outside = path.join(base, 'outside');
  await mkdir(path.join(root, 'workflows', 'fixtures'), { recursive: true });
  await mkdir(path.join(root, 'scenarios'), { recursive: true });
  await mkdir(outside, { recursive: true });
  for (const [relative, content] of Object.entries(SOURCES)) {
    await writeFile(path.join(root, relative), content);
  }
  await writeFile(path.join(outside, 'read.yaml'), SOURCES['workflows/read.yaml']);
  await writeFile(path.join(outside, 'state.json'), '{"documents":{"brief":"outside"}}');
  await symlink(path.join(outside, 'read.yaml'), path.join(root, 'workflows/escape.yaml'));
  await symlink(
    path.join(outside, 'state.json'),
    path.join(root, 'workflows/fixtures/escape.json')
  );
});

afterAll(async () => {
  await rm(path.dirname(root), { recursive: true, force: true });
});

function digestOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function workflowTask(
  sourcePath: string,
  options: { digest?: string; kind?: ExperimentTask['kind'] } = {}
): ExperimentTask {
  const kind = options.kind ?? 'agent_workflow';
  return {
    id: 'read-brief',
    kind,
    source: {
      kind,
      path: sourcePath,
      artifact: {
        schema_version: '1',
        algorithm: 'sha256',
        digest: options.digest ?? digestOf(SOURCES[sourcePath] ?? SOURCES['workflows/read.yaml']),
      },
    },
    required_capabilities: ['text'],
  };
}

function attemptInput(
  task: ExperimentTask,
  options: { target?: ExperimentTarget; requests?: number; seed?: number } = {}
): ExperimentAttemptInput {
  const target = options.target ?? LOCAL_TARGET;
  return {
    experiment_id: 'workflow-executor-test',
    coordinate: {
      coordinate_id: `${task.id}:${target.id}:1`,
      task_id: task.id,
      task_kind: task.kind,
      target_id: target.id,
      repetition_index: 1,
      ...(options.seed !== undefined ? { seed: options.seed } : {}),
      missing_capabilities: [],
    },
    task,
    target,
    retry_chain_id: 'chain-1',
    attempt_number: 1,
    remaining_budget: { requests: options.requests ?? 100 },
  };
}

type Reply =
  | { call: string; args?: unknown }
  | { text: string; finish?: GenerateResult['finishReason']; usageAvailable?: boolean }
  | 'throw'
  | 'never';

interface ScriptState {
  calls: number;
  closed: number;
  requests: GenerateOptions[];
}

const READ_BRIEF: Reply = { call: 'read_document', args: { id: 'brief' } };
const ANSWER: Reply = { text: 'The brief says approval is required.' };

/** A scripted client: replies in order, repeating the last reply once the script runs out. */
function scriptedClient(
  script: Reply[],
  options: { toolUse?: boolean } = {}
): ScriptState & { createClient: WorkflowExperimentExecutorOptions['createClient'] } {
  const state: ScriptState = { calls: 0, closed: 0, requests: [] };
  const createClient = (target: ExperimentTarget): ModelClient => ({
    provider: target.provider,
    capabilities: async () => ({
      streaming: false,
      functionCalling: true,
      toolUse: options.toolUse ?? true,
      maxContext: 8192,
    }),
    close: async () => {
      state.closed += 1;
    },
    async generate(request: GenerateOptions): Promise<GenerateResult> {
      const reply = script[Math.min(state.calls, script.length - 1)];
      state.calls += 1;
      state.requests.push(request);
      if (reply === 'throw') throw new Error('upstream exploded with key sk-should-never-appear');
      if (reply === 'never') return new Promise(() => {});
      const tokens = { prompt: 10, completion: 5, total: 15 };
      if ('call' in reply) {
        return {
          id: `response-${state.calls}`,
          model: target.model,
          text: '',
          tokens,
          latencyMs: 1,
          finishReason: 'tool_calls',
          toolCalls: [
            {
              id: `call-${state.calls}`,
              type: 'function',
              function: { name: reply.call, arguments: JSON.stringify(reply.args ?? {}) },
            },
          ],
        };
      }
      const usageAvailable = reply.usageAvailable ?? true;
      return {
        id: `response-${state.calls}`,
        model: target.model,
        text: reply.text,
        tokens: usageAvailable ? tokens : { prompt: 0, completion: 0, total: 0 },
        usageAvailable,
        latencyMs: 1,
        finishReason: reply.finish ?? 'stop',
      };
    },
  });
  return Object.assign(state, { createClient });
}

function executorFor(
  client: ReturnType<typeof scriptedClient>,
  options: Partial<WorkflowExperimentExecutorOptions> = {}
) {
  return createWorkflowExperimentExecutor({
    root,
    createClient: client.createClient,
    ...options,
  });
}

async function run(
  script: Reply[],
  sourcePath = 'workflows/read.yaml',
  options: {
    requests?: number;
    toolUse?: boolean;
    target?: ExperimentTarget;
    executor?: Partial<WorkflowExperimentExecutorOptions>;
  } = {}
): Promise<{ result: ExperimentAttemptOutput; client: ReturnType<typeof scriptedClient> }> {
  const client = scriptedClient(script, { toolUse: options.toolUse });
  const execute = executorFor(client, options.executor);
  const result = await execute(
    attemptInput(workflowTask(sourcePath), { requests: options.requests, target: options.target })
  );
  return { result, client };
}

describe('createWorkflowExperimentExecutor status mapping', () => {
  test('a verified workflow passes with metered usage and available evidence', async () => {
    const { result, client } = await run([READ_BRIEF, ANSWER]);
    expect(result.status).toBe('passed');
    expect(result.error_code).toBeUndefined();
    expect(result.usage).toEqual({ requests: 2, tokens: 30 });
    expect(result.evidence).toMatchObject({ kind: 'agent_workflow', availability: 'available' });
    expect(client.closed).toBe(1);
  });

  test('a failed required outcome is task_failed', async () => {
    const { result } = await run([ANSWER]);
    expect(result.status).toBe('task_failed');
    expect(result.error_code).toBeUndefined();
    expect(result.usage).toEqual({ requests: 1, tokens: 15 });
  });

  test('a call to an undeclared tool is policy_failed', async () => {
    const { result } = await run([{ call: 'write_file', args: { path: 'x', content: 'y' } }]);
    expect(result).toMatchObject({ status: 'policy_failed', error_code: 'policy_denied' });
    expect(result.evidence.availability).toBe('available');
  });

  test("exhausting the workflow's own request budget is policy_failed", async () => {
    const { result, client } = await run([READ_BRIEF], 'workflows/tight.yaml');
    expect(result).toMatchObject({
      status: 'policy_failed',
      error_code: 'workflow_budget_exceeded',
    });
    expect(client.calls).toBe(2);
  });

  test('a provider error is infrastructure_failed and never retains provider text', async () => {
    const { result } = await run(['throw']);
    expect(result).toMatchObject({ status: 'infrastructure_failed', error_code: 'target_error' });
    expect(JSON.stringify(result)).not.toContain('sk-should-never-appear');
  });

  test("the workflow's deadline is infrastructure_failed", async () => {
    const { result } = await run(['never'], 'workflows/short-deadline.yaml');
    expect(result).toMatchObject({
      status: 'infrastructure_failed',
      error_code: 'workflow_deadline',
    });
    expect(result.usage).toEqual({ requests: 1 });
  });

  test('a response cut off at its token limit is invalid', async () => {
    const { result } = await run([READ_BRIEF, { text: 'The brief', finish: 'length' }]);
    expect(result).toMatchObject({ status: 'invalid', error_code: 'response_truncated' });
  });

  test('malformed tool arguments are an invalid measurement', async () => {
    const { result } = await run([{ call: 'read_document', args: {} }]);
    expect(result).toMatchObject({ status: 'invalid', error_code: 'workflow_invalid_response' });
  });

  test('a target without tool use is an invalid measurement', async () => {
    const { result, client } = await run([ANSWER], 'workflows/read.yaml', { toolUse: false });
    expect(result).toMatchObject({
      status: 'invalid',
      error_code: 'workflow_tool_use_unsupported',
    });
    expect(client.calls).toBe(0);
  });

  test('unreported target usage leaves the outcome unverified and invalid', async () => {
    const { result } = await run([READ_BRIEF, { text: 'Summary.', usageAvailable: false }]);
    expect(result).toMatchObject({
      status: 'invalid',
      error_code: 'outcome_target_usage_unavailable',
    });
    expect(result.usage).toEqual({ requests: 2 });
  });

  test('a request refused by the attempt budget is incomplete', async () => {
    const { result, client } = await run([READ_BRIEF, ANSWER], 'workflows/read.yaml', {
      requests: 1,
    });
    expect(result).toMatchObject({ status: 'incomplete', error_code: 'request_budget_exhausted' });
    expect(client.calls).toBe(1);
    expect(result.usage.requests).toBe(1);
  });

  test('fewer remaining requests than turns is incomplete before any request', async () => {
    const { result, client } = await run([ANSWER], 'workflows/read.yaml', { requests: 0 });
    expect(result).toMatchObject({
      status: 'incomplete',
      error_code: 'request_budget_insufficient',
      usage: { requests: 0, tokens: 0 },
    });
    expect(client.calls).toBe(0);
  });

  test('a client that cannot be created is infrastructure_failed', async () => {
    const execute = createWorkflowExperimentExecutor({
      root,
      createClient: () => {
        throw new Error('no client');
      },
    });
    const result = await execute(attemptInput(workflowTask('workflows/read.yaml')));
    expect(result).toMatchObject({
      status: 'infrastructure_failed',
      error_code: 'client_unavailable',
    });
  });
});

describe('createWorkflowExperimentExecutor refusals before any model call', () => {
  const refusals: Array<[string, ExperimentTask, string]> = [
    [
      'a digest mismatch',
      workflowTask('workflows/read.yaml', { digest: 'f'.repeat(64) }),
      'source_digest_mismatch',
    ],
    ['a parent-directory escape', workflowTask('../outside/read.yaml'), 'source_path_rejected'],
    ['an absolute path', workflowTask('/etc/hosts'), 'source_path_rejected'],
    ['a symlink leaving the root', workflowTask('workflows/escape.yaml'), 'source_path_rejected'],
    ['a missing source', workflowTask('workflows/missing.yaml'), 'source_unreadable'],
    ['an invalid workflow', workflowTask('workflows/broken.yaml'), 'workflow_invalid'],
    [
      'a scenario task',
      workflowTask('scenarios/answer.yaml', { kind: 'scenario_evaluation' }),
      'task_kind_unsupported',
    ],
    [
      'semantic outcomes without a judge',
      workflowTask('workflows/semantic.yaml'),
      'semantic_judge_unavailable',
    ],
    [
      'a fixture symlink leaving the root',
      workflowTask('workflows/fixture-escape.yaml'),
      'workflow_fixture_invalid',
    ],
  ];

  for (const [name, task, code] of refusals) {
    test(`${name} is invalid with zero model calls`, async () => {
      const client = scriptedClient([READ_BRIEF, ANSWER]);
      const result = await executorFor(client)(attemptInput(task));
      expect(result).toEqual({
        status: 'invalid',
        usage: { requests: 0, tokens: 0 },
        evidence: { kind: task.kind, availability: 'unavailable' },
        error_code: code,
      });
      expect(client.calls).toBe(0);
    });
  }

  test('generation settings the engine cannot send are refused', async () => {
    const settings = { top_p: 0.8, presence_penalty: 1.5, top_k: 20, min_p: 0 };
    for (const [setting, value] of Object.entries(settings)) {
      const target = { ...LOCAL_TARGET, settings: { [setting]: value } };
      const { result, client } = await run([ANSWER], 'workflows/read.yaml', { target });
      expect(result).toMatchObject({
        status: 'invalid',
        error_code: 'generation_setting_unsupported',
      });
      expect(client.calls).toBe(0);
    }
  });

  test('a coordinate seed is refused because the engine sends none', async () => {
    const client = scriptedClient([READ_BRIEF, ANSWER]);
    const result = await executorFor(client)(
      attemptInput(workflowTask('workflows/read.yaml'), { seed: 7 })
    );
    expect(result).toMatchObject({ status: 'invalid', error_code: 'workflow_seed_unsupported' });
    expect(client.calls).toBe(0);
  });
});

describe('createWorkflowExperimentExecutor measured condition and evidence', () => {
  test("the coordinate's target and generation settings replace the workflow's", async () => {
    const records: WorkflowExperimentEvidenceRecord[] = [];
    const { result, client } = await run([READ_BRIEF, ANSWER], 'workflows/read.yaml', {
      executor: { onEvidence: (record) => void records.push(record) },
    });
    expect(result.status).toBe('passed');
    for (const request of client.requests) {
      expect(request.model).toBe('qwen3.5:4b');
      expect(request.maxTokens).toBe(512);
      expect(request.temperature).toBe(0.7);
    }
    const configuration = records[0].record.configuration;
    expect(configuration?.model.display).toBe('qwen3.5:4b');
    expect(configuration?.provider.display).toBe('openai');
    expect(configuration?.generation).toEqual({ maxTokens: 512, temperature: 0.7 });
  });

  test("the workflow's generation applies when the target declares none", async () => {
    const target = { ...LOCAL_TARGET, settings: undefined };
    const { client } = await run([READ_BRIEF, ANSWER], 'workflows/read.yaml', { target });
    expect(client.requests[0].maxTokens).toBe(128);
    expect(client.requests[0].temperature).toBe(0);
  });

  test('environment references are sent literally, never expanded', async () => {
    process.env.AKIT_WORKFLOW_EXECUTOR_SECRET = 'leaked-value';
    try {
      const { client } = await run([ANSWER], 'workflows/env.yaml');
      const sent = JSON.stringify(client.requests[0].prompt);
      expect(sent).toContain('${AKIT_WORKFLOW_EXECUTOR_SECRET}');
      expect(sent).not.toContain('leaked-value');
    } finally {
      process.env.AKIT_WORKFLOW_EXECUTOR_SECRET = undefined;
    }
  });

  test('a file fixture under the workflow directory is inlined into the measured workflow', async () => {
    const records: WorkflowExperimentEvidenceRecord[] = [];
    const { result } = await run([READ_BRIEF, ANSWER], 'workflows/fixture-file.yaml', {
      executor: { onEvidence: (record) => void records.push(record) },
    });
    expect(result.status).toBe('passed');
    const inline = await run([READ_BRIEF, ANSWER], 'workflows/read.yaml', {
      executor: { onEvidence: (record) => void records.push(record) },
    });
    expect(inline.result.status).toBe('passed');
    // Different fixture content yields a different measured configuration.
    expect(records[0].record.configuration?.sha256).not.toBe(
      records[1].record.configuration?.sha256
    );
  });

  test('evidence is the canonical digest of the saved record', async () => {
    const records: WorkflowExperimentEvidenceRecord[] = [];
    const { result } = await run([READ_BRIEF, ANSWER], 'workflows/read.yaml', {
      executor: { onEvidence: (record) => void records.push(record) },
    });
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(record.coordinate_id).toBe('read-brief:qwen-local:1');
    expect(record.attempt_number).toBe(1);
    expect(record.artifact).toEqual(workflowRecordIdentity(record.record));
    expect(result.evidence).toEqual({
      kind: 'agent_workflow',
      availability: 'available',
      artifact: record.artifact,
    });
    expect(JSON.stringify(record.record)).not.toContain('Approval is required');
  });

  test('a failed evidence store is infrastructure_failed', async () => {
    const { result } = await run([READ_BRIEF, ANSWER], 'workflows/read.yaml', {
      executor: {
        onEvidence: () => {
          throw new Error('disk full');
        },
      },
    });
    expect(result).toMatchObject({
      status: 'infrastructure_failed',
      error_code: 'evidence_store_failed',
      evidence: { kind: 'agent_workflow', availability: 'unavailable' },
    });
  });

  test('metered targets report resolved cost; local targets never consult the resolver', async () => {
    let consulted = 0;
    const resolveCost = () => {
      consulted += 1;
      return { amount: 0.25, currency: 'USD' };
    };
    const metered = await run([READ_BRIEF, ANSWER], 'workflows/read.yaml', {
      target: METERED_TARGET,
      executor: { resolveCost },
    });
    expect(metered.result.usage.cost).toEqual({ amount: 0.25, currency: 'USD' });
    const local = await run([READ_BRIEF, ANSWER], 'workflows/read.yaml', {
      executor: { resolveCost },
    });
    expect(local.result.usage.cost).toBeUndefined();
    expect(consulted).toBe(1);
  });

  test('a misbehaving cost resolver is infrastructure_failed', async () => {
    const { result } = await run([READ_BRIEF, ANSWER], 'workflows/read.yaml', {
      target: METERED_TARGET,
      executor: { resolveCost: () => ({ amount: -1, currency: 'USD' }) },
    });
    expect(result).toMatchObject({
      status: 'infrastructure_failed',
      error_code: 'cost_resolution_failed',
    });
  });
});

describe('createWorkflowExperimentExecutor demand', () => {
  test("declares the workflow's request limit and nothing else", async () => {
    const execute = executorFor(scriptedClient([ANSWER]));
    const demand = await execute.reserve?.({
      experiment_id: 'x',
      task: workflowTask('workflows/tight.yaml'),
      target: LOCAL_TARGET,
    });
    expect(demand).toEqual({ requests: 2 });
  });

  test('declares no demand for a task it would refuse', async () => {
    const execute = executorFor(scriptedClient([ANSWER]));
    const demand = await execute.reserve?.({
      experiment_id: 'x',
      task: workflowTask('workflows/read.yaml', { digest: 'f'.repeat(64) }),
      target: LOCAL_TARGET,
    });
    expect(demand).toBeUndefined();
  });

  test('rejects invalid options at construction', () => {
    const createClient = scriptedClient([ANSWER]).createClient;
    expect(() => createWorkflowExperimentExecutor({ root: 'relative', createClient })).toThrow(
      TypeError
    );
    expect(() =>
      createWorkflowExperimentExecutor({ root, createClient, cleanupTimeoutMs: 0 })
    ).toThrow(TypeError);
  });
});
