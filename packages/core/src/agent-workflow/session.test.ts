import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCall } from '../adapters/types';
import {
  type WorkflowEnvironmentFactory,
  WorkflowEnvironmentInitializationError,
  createSimulatedWorkflowEnvironment,
  resolveWorkflowInitialState,
} from './environment';
import { validateAgentWorkflow } from './parser';
import type { AgentWorkflow } from './schema';
import { createAgentWorkflowSession, runAgentWorkflow } from './session';
import {
  type AgentTarget,
  type AgentTurnRequest,
  type AgentTurnResult,
  createModelClientTarget,
} from './target';

function fixture(): AgentWorkflow {
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'session',
    target: { provider: 'custom', model: 'fixture-model' },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'approval_required',
        permissions: { files: 'write', workflow_state: 'write' },
        budgets: { max_actions: 30, timeout_ms: 1000 },
      },
    },
    tools: ['calculator', 'read_file', 'write_file', 'request_approval'],
    workflow: {
      system_instructions: 'Use structured tools.',
      initial_state: { files: { 'note.txt': 'PRIVATE-CONTENT' }, workflow_state: {} },
      turns: [{ role: 'user', content: 'Complete task.' }],
    },
    outcomes: {
      deterministic: [{ type: 'policy', rule: 'permissions_respected', expected: 'passed' }],
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}
function call(
  name = 'calculator',
  args: unknown = { operation: 'add', a: 1, b: 2 },
  id = 'call-1'
): ToolCall {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}
function answer(
  calls: ToolCall[] = [],
  text = 'done'
): Extract<AgentTurnResult, { status: 'completed' }> {
  return {
    status: 'completed',
    id: 'response',
    model: 'fixture-model',
    message: { role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls } : {}) },
    tokens: { prompt: 2, completion: 1, total: 3 },
    latencyMs: 1,
    finishReason: calls.length ? 'tool_calls' : 'stop',
  };
}
function target(
  responses:
    | AgentTurnResult[]
    | ((request: AgentTurnRequest, index: number, signal?: AbortSignal) => Promise<AgentTurnResult>)
): AgentTarget & { requests: AgentTurnRequest[] } {
  const requests: AgentTurnRequest[] = [];
  return {
    provider: 'custom',
    requests,
    capabilities: async () => ({
      status: 'available',
      toolUse: true,
      transportCancellation: false,
    }),
    turn: async (request, signal) => {
      requests.push(structuredClone(request));
      return typeof responses === 'function'
        ? responses(request, requests.length - 1, signal)
        : structuredClone(responses[requests.length - 1] ?? answer());
    },
  };
}
const never = <T>(): Promise<T> => new Promise(() => {});

describe('native workflow session host', () => {
  test('multi-turn tool correlation, reusable session and isolated working inputs', async () => {
    const workflow = fixture();
    workflow.workflow.turns.push({ role: 'user', content: 'Explain.' });
    const before = structuredClone(workflow);
    const t = target([
      answer([call('write_file', { path: 'note.txt', content: 'updated' })]),
      answer(),
      answer(),
    ]);
    const session = createAgentWorkflowSession({ workflow, target: t });
    expect(session.state).toBe('idle');
    const first = session.run();
    expect(session.run()).toBe(first);
    const result = await first;
    expect(result.record.execution).toBe('completed');
    expect(result.record.taskVerification).toBe('unavailable');
    expect(result.state?.files).toEqual({ 'note.txt': 'updated' });
    expect(workflow).toEqual(before);
    expect(t.requests[1].messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'call-1' });
    expect(t.requests[2].messages.at(-1)).toEqual({ role: 'user', content: 'Explain.' });
    expect(result.record.budgets).toMatchObject({ actions: 4, modelRequests: 3, toolCalls: 1 });
    expect(result.record.artifacts.files).toHaveLength(1);
    expect((await runAgentWorkflow({ workflow, target: target([answer()]) })).state?.files).toEqual(
      { 'note.txt': 'PRIVATE-CONTENT' }
    );
    expect(session.state).toBe('completed');
    const events = [];
    for await (const event of session.events()) events.push(event);
    expect(events).toEqual(result.record.events);
  });
  test('approval remains pending, never granted', async () => {
    const result = await runAgentWorkflow({
      workflow: fixture(),
      target: target([answer([call('request_approval', { reason: 'Review required' })]), answer()]),
    });
    expect(result.state?.workflow_state).toEqual({
      approvals: { requested: true, status: 'pending', reason: 'Review required' },
    });
  });
  test.each(['max_actions', 'max_model_requests', 'max_tool_calls'] as const)(
    'enforces cumulative %s',
    async (limit) => {
      const workflow = fixture();
      workflow.environment.policy.budgets[limit] = 1;
      const t = target([
        answer([call(), call('calculator', { operation: 'add', a: 2, b: 3 }, 'call-2')]),
        answer(),
      ]);
      const result = await runAgentWorkflow({ workflow, target: t });
      expect(result.record.execution).toBe('budget_exceeded');
      expect(result.record.reason).toBe(limit);
    }
  );
  test('caps requested output and reports token overshoot without executing returned tools', async () => {
    const workflow = fixture();
    workflow.environment.policy.budgets.max_tokens = 2;
    const t = target([answer([call()])]);
    const result = await runAgentWorkflow({ workflow, target: t });
    expect(t.requests[0].generation.maxTokens).toBe(2);
    expect(result.record.budgets.tokenOvershoot).toBe(1);
    expect(result.record.budgets.toolCalls).toBe(0);
    expect(result.record.reason).toBe('max_tokens');
  });
  test.each([true, false])(
    'missing usage fails closed with returned tools=%s when token budget is configured',
    async (withTools) => {
      const workflow = fixture();
      workflow.environment.policy.budgets.max_tokens = 20;
      const response = {
        ...answer(withTools ? [call()] : []),
        tokens: { prompt: 0, completion: 0, total: 0 },
        usageAvailable: false,
      };
      const result = await runAgentWorkflow({ workflow, target: target([response]) });
      expect(result.record.reason).toBe('usage_unavailable');
      expect(result.record.budgets.toolCalls).toBe(0);
      expect(result.record.usage.status).toBe('unavailable');
    }
  );
  test('legacy zero usage remains unavailable, explicitly measured zero is reported', async () => {
    const response = { ...answer(), tokens: { prompt: 0, completion: 0, total: 0 } };
    expect(
      (await runAgentWorkflow({ workflow: fixture(), target: target([response]) })).record.usage
        .status
    ).toBe('unavailable');
    expect(
      (
        await runAgentWorkflow({
          workflow: fixture(),
          target: target([{ ...response, usageAvailable: true }]),
        })
      ).record.usage.status
    ).toBe('reported');
  });
  test.each([
    ['unknown tool', () => answer([call('send_email')])],
    ['coercion', () => answer([call('calculator', { operation: 'add', a: '1', b: 2 })])],
    [
      'malformed JSON',
      () => {
        const c = call();
        c.function.arguments = '{';
        return answer([c]);
      },
    ],
    ['duplicate ID', () => answer([call(), call()])],
    [
      'unsafe keys',
      () => {
        const c = call();
        c.function.arguments = '{"__proto__":{}}';
        return answer([c]);
      },
    ],
    ['extra response key', () => ({ ...answer(), raw: 'secret' })],
    ['missing usage', () => ({ ...answer(), tokens: undefined })],
    ['inconsistent usage', () => ({ ...answer(), tokens: { prompt: 2, completion: 1, total: 8 } })],
    [
      'getter',
      () =>
        Object.defineProperty(answer(), 'model', {
          enumerable: true,
          get() {
            throw new Error('SECRET');
          },
        }),
    ],
  ] as const)('rejects custom target %s', async (_, value) => {
    const result = await runAgentWorkflow({
      workflow: fixture(),
      target: target(async () => value() as AgentTurnResult),
    });
    expect(result.record.execution).toBe('invalid');
    expect(JSON.stringify(result.record)).not.toContain('SECRET');
    for (const requested of result.record.events.filter((e) => e.type.endsWith('_requested')))
      expect(
        result.record.events.some(
          (e) => e.operationId === requested.operationId && e.type.endsWith('_completed')
        )
      ).toBe(true);
  });
  test('rejects previously used call IDs on subsequent model turns', async () => {
    const result = await runAgentWorkflow({
      workflow: fixture(),
      target: target([answer([call()]), answer([call()])]),
    });
    expect(result.record.reason).toBe('invalid_response');
    expect(result.record.budgets.toolCalls).toBe(1);
  });
  test('host path grants deny before a custom environment gets a call', async () => {
    const workflow = fixture();
    workflow.environment.policy.paths = { read: ['note.txt'], write: [] };
    let invoked = 0;
    const factory: WorkflowEnvironmentFactory = async (options) => {
      const env = await createSimulatedWorkflowEnvironment(options);
      return {
        ...env,
        execute: async (...args) => {
          invoked++;
          return env.execute(...args);
        },
      };
    };
    const result = await runAgentWorkflow({
      workflow,
      target: target([
        answer([call('write_file', { path: 'elsewhere.txt', content: 'forbidden' })]),
      ]),
      environmentFactory: factory,
    });
    expect(invoked).toBe(0);
    expect(result.record.policy).toBe('denied');
  });
  test('invalid policy and sandbox without factory fail closed', async () => {
    const workflow = fixture();
    workflow.environment.type = 'sandbox';
    expect((await runAgentWorkflow({ workflow, target: target([]) })).record.reason).toBe(
      'environment_unavailable'
    );
    (workflow.environment.policy as unknown as Record<string, unknown>).network = 'allowed';
    const t = target([]);
    expect((await runAgentWorkflow({ workflow, target: t })).record.reason).toBe(
      'invalid_workflow'
    );
    expect(t.requests).toHaveLength(0);
  });
  test('validates custom environment outputs and failed snapshots', async () => {
    const bad: WorkflowEnvironmentFactory = async (options) => ({
      ...(await createSimulatedWorkflowEnvironment(options)),
      execute: async () => ({
        status: 'succeeded',
        output: { value: 'coerced' },
        state: {},
        evidence: { tool: 'calculator', version: '1', status: 'succeeded' },
      }),
    });
    expect(
      (
        await runAgentWorkflow({
          workflow: fixture(),
          target: target([answer([call()])]),
          environmentFactory: bad,
        })
      ).record.reason
    ).toBe('invalid_environment');
    const failing: WorkflowEnvironmentFactory = async (options) => ({
      ...(await createSimulatedWorkflowEnvironment(options)),
      snapshot: async () => {
        throw new Error('private');
      },
    });
    const result = await runAgentWorkflow({
      workflow: fixture(),
      target: target([answer()]),
      environmentFactory: failing,
    });
    expect(result.state).toBeNull();
    expect(result.record.artifacts.state).toBe('unavailable');
  });
  test('preflightOnly performs correlated roundtrip and never initializes environment', async () => {
    let initialized = false;
    const workflow = fixture();
    workflow.workflow.initial_state = 'missing-fixture.yaml';
    const t = target(async (request, index) => {
      const nonce = (
        request.tools[0].function.parameters.properties as Record<string, { const: string }>
      ).nonce.const;
      if (index === 0) return answer([call('artemis_probe', { nonce }, 'probe-1')]);
      expect(request.messages.at(-1)?.toolCallId).toBe('probe-1');
      return answer([], nonce);
    });
    const result = await runAgentWorkflow({
      workflow,
      target: t,
      preflightOnly: true,
      environmentFactory: async (options) => {
        initialized = true;
        return createSimulatedWorkflowEnvironment(options);
      },
    });
    expect(initialized).toBe(false);
    expect(result.record.capability.preflight).toBe('passed');
    expect(result.record.usage.preflight.total).toBe(6);
    expect(result.record.budgets.actions).toBe(3);
    expect(result.transcript).toEqual([]);
  });
  test('preflight prose is unsupported and stops before scenario turns', async () => {
    const t = target([answer([], '{"tool":"artemis_probe"}')]);
    const result = await runAgentWorkflow({ workflow: fixture(), target: t, preflight: true });
    expect(result.record.execution).toBe('unsupported');
    expect(result.record.capability.preflight).toBe('failed');
    expect(t.requests).toHaveLength(1);
  });
  test('deadline/cancel stop admission and pending tools cannot suppress close', async () => {
    let closed = false;
    let receivedAbort = false;
    const factory: WorkflowEnvironmentFactory = async (options) => ({
      ...(await createSimulatedWorkflowEnvironment(options)),
      execute: async (_, signal) => {
        signal.addEventListener('abort', () => {
          receivedAbort = true;
        });
        return never();
      },
      close: async () => {
        closed = true;
        return { status: 'completed', artifacts: 'discarded' };
      },
    });
    const workflow = fixture();
    workflow.environment.policy.budgets.timeout_ms = 20;
    const result = await runAgentWorkflow({
      workflow,
      target: target([answer([call()])]),
      environmentFactory: factory,
      cleanupTimeoutMs: 30,
    });
    expect(result.record.execution).toBe('timeout');
    expect(receivedAbort).toBe(true);
    expect(closed).toBe(true);
    expect(result.record.cleanup.status).toBe('unresolved');
    expect(result.record.cleanup.pendingOperations).toBeGreaterThan(0);
    expect(result.state).toBeNull();
  });
  test('failed environment initialization retains unresolved resource evidence', async () => {
    const result = await runAgentWorkflow({
      workflow: fixture(),
      target: target([]),
      environmentFactory: async () => {
        throw new WorkflowEnvironmentInitializationError({
          status: 'unresolved',
          artifacts: 'unknown',
          pendingOperations: 1,
        });
      },
    });
    expect(result.record.reason).toBe('environment_unavailable');
    expect(result.record.cleanup).toEqual({
      status: 'unresolved',
      artifacts: 'unknown',
      pendingOperations: 1,
    });
    expect(result.state).toBeNull();
  });
  test('environment that arrives after bounded cleanup still receives a close attempt', async () => {
    const workflow = fixture();
    workflow.environment.policy.budgets.timeout_ms = 10;
    let release: () => void = () => {};
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    let closed = false;
    const result = await runAgentWorkflow({
      workflow,
      target: target([]),
      cleanupTimeoutMs: 30,
      environmentFactory: async (options) => {
        const environment = await createSimulatedWorkflowEnvironment(options);
        await delayed;
        return {
          ...environment,
          close: async (signal) => {
            closed = true;
            return environment.close(signal);
          },
        };
      },
    });
    expect(result.record.cleanup.status).toBe('unresolved');
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toBe(true);
    expect(result.record.cleanup.status).toBe('unresolved');
  });
  test('cancelled model usage remains partial even if callback drains', async () => {
    const t = target(async (_, index, signal) => {
      if (index === 0) return answer([call()]);
      setTimeout(() => session.cancel(), 2);
      return new Promise((resolve) =>
        signal?.addEventListener('abort', () => resolve(answer()), { once: true })
      );
    });
    const session = createAgentWorkflowSession({
      workflow: fixture(),
      target: t,
      cleanupTimeoutMs: 30,
    });
    const result = await session.run();
    expect(result.record.execution).toBe('cancelled');
    expect(result.record.usage.status).toBe('partial');
    expect(result.record.usage.missingRequests).toBe(1);
  });
  test('cancel before run causes no model/environment work', async () => {
    const t = target([]);
    const session = createAgentWorkflowSession({ workflow: fixture(), target: t });
    session.cancel();
    const result = await session.run();
    expect(result.record.execution).toBe('cancelled');
    expect(t.requests).toHaveLength(0);
  });
  test('tracks hidden legacy transport after bounded facade returns', async () => {
    const workflow = fixture();
    workflow.environment.policy.budgets.timeout_ms = 15;
    const bridge = createModelClientTarget({
      provider: 'custom',
      capabilities: async () => ({
        streaming: false,
        functionCalling: true,
        toolUse: true,
        maxContext: 1000,
      }),
      generate: () => never(),
    });
    const result = await runAgentWorkflow({ workflow, target: bridge, cleanupTimeoutMs: 30 });
    expect(result.record.execution).toBe('timeout');
    expect(result.record.cleanup.status).toBe('unresolved');
    expect(result.record.usage.inFlightUnknown).toBe(true);
    expect(result.record.usage.missingRequests).toBe(1);
  });
  test('bounded metadata has no raw IDs, paths, content, arguments or errors', async () => {
    const result = await runAgentWorkflow({
      workflow: fixture(),
      target: target([
        answer([call('read_file', { path: 'note.txt' }, 'SECRET-CALL-ID')]),
        answer([], 'PRIVATE-CONTENT'),
      ]),
    });
    const saved = JSON.stringify(result.record);
    for (const value of ['SECRET-CALL-ID', 'note.txt', 'PRIVATE-CONTENT', 'Complete task.'])
      expect(saved).not.toContain(value);
    expect(
      result.record.events.find((e) => e.type === 'tool_requested')?.requestedCallIdHash
    ).toHaveLength(64);
    expect(result.record.configuration?.limits.max_actions).toBe(30);
  });
  test('trace truncation preserves terminal evidence and live stream finishes', async () => {
    const workflow = fixture();
    workflow.environment.policy.budgets.max_actions = 300;
    workflow.environment.policy.budgets.timeout_ms = 5000;
    const t = target(async (_, index) =>
      index < 70
        ? answer([call('calculator', { operation: 'add', a: 1, b: 2 }, `call-${index}`)])
        : answer()
    );
    const session = createAgentWorkflowSession({ workflow, target: t });
    const events: unknown[] = [];
    const collect = (async () => {
      for await (const event of session.events()) events.push(event);
    })();
    const result = await session.run();
    await collect;
    expect(result.record.execution).toBe('completed');
    expect(result.record.events).toHaveLength(256);
    expect(result.record.events.at(-1)?.type).toBe('finished');
    expect(result.record.droppedEvents).toBeGreaterThan(0);
    expect(events).toHaveLength(256);
  });
  test('fixture loader supports bounded YAML/JSON and rejects secrets/symlinks/traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workflow-fixture-'));
    await mkdir(join(root, 'fixtures'));
    await writeFile(
      join(root, 'fixtures', 'state.yaml'),
      'workflow_state:\n  marker: "${SECRET_TOKEN}"\n'
    );
    const workflow = fixture();
    workflow.workflow.initial_state = 'fixtures/state.yaml';
    expect(await resolveWorkflowInitialState(workflow, root)).toEqual({
      workflow_state: { marker: '${SECRET_TOKEN}' },
    });
    await symlink(join(root, 'fixtures', 'state.yaml'), join(root, 'fixtures', 'link.yaml'));
    for (const path of ['fixtures/link.yaml', 'fixtures/secrets.json', '../state.yaml']) {
      workflow.workflow.initial_state = path;
      await expect(resolveWorkflowInitialState(workflow, root)).rejects.toThrow();
    }
    await writeFile(join(root, 'fixtures', 'state.yaml'), 'a: &x [1]\nb: *x\n');
    workflow.workflow.initial_state = 'fixtures/state.yaml';
    await expect(resolveWorkflowInitialState(workflow, root)).rejects.toThrow();
  });
});
