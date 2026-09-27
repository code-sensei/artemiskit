import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkflowCheckpointPayload } from './checkpoint';
import { openWorkflowCheckpointStore } from './checkpoint-store';
import { evaluateWorkflowDeterministicOutcomes } from './outcomes';
import { readWorkflowRecord } from './records';
import { type AgentWorkflow, AgentWorkflowSchema } from './schema';
import { runAgentWorkflow } from './session';
import type { AgentTarget, AgentTurnRequest } from './target';

function scenario(faults: unknown[], attempts = 1): AgentWorkflow {
  return AgentWorkflowSchema.parse({
    version: '1',
    kind: 'agent_workflow',
    name: 'controlled-fault',
    target: { provider: 'openai', model: 'fixture' },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions: { documents: 'read' },
        budgets: {
          max_actions: 10,
          max_model_requests: 3,
          max_tool_calls: 6,
          max_tokens: 100,
          timeout_ms: 2000,
        },
      },
    },
    tools: ['calculator', 'read_document'],
    workflow: {
      system_instructions: 'Use declared tools.',
      initial_state: { documents: { policy: 'PRIVATE-CURRENT-DOCUMENT' } },
      turns: [{ role: 'user', content: 'Proceed.' }],
    },
    faults,
    retry: { max_attempts: attempts },
    outcomes: {
      deterministic: [
        { type: 'tool_trace', tool: 'calculator', minimum_calls: 1, maximum_calls: 1 },
        { type: 'policy', rule: 'budgets_respected', expected: 'passed' },
      ],
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}
function target(
  tool = 'calculator',
  inspect?: (messages: AgentTurnRequest['messages']) => void,
  inputOverride?: Record<string, string | number>
): AgentTarget {
  return {
    provider: 'openai',
    capabilities: async () => ({ status: 'available', toolUse: true, transportCancellation: true }),
    turn: async (request) => {
      const continued = request.messages.some((message) => message.role === 'tool');
      if (continued) inspect?.(request.messages);
      return {
        status: 'completed',
        id: 'answer',
        model: 'fixture',
        latencyMs: 1,
        tokens: { prompt: 2, completion: 1, total: 3 },
        message: {
          role: 'assistant',
          content: continued ? 'Done.' : '',
          ...(continued
            ? {}
            : {
                tool_calls: [
                  {
                    id: 'original-call',
                    type: 'function' as const,
                    function: {
                      name: tool,
                      arguments: JSON.stringify(
                        inputOverride ??
                          (tool === 'calculator'
                            ? { operation: 'add', a: 1, b: 1 }
                            : { id: 'policy' })
                      ),
                    },
                  },
                ],
              }),
        },
      };
    },
  };
}
const outage = { id: 'first', tool: 'calculator', occurrence: 1, kind: 'unavailable_tool' };

describe('native declared faults and bounded retries', () => {
  test('charges each pre-effect retry, retains failure and counts one successful logical tool', async () => {
    const result = await runAgentWorkflow({ workflow: scenario([outage], 2), target: target() });
    expect(result.record.schemaVersion).toBe('3');
    expect(result.record.taskVerification).toBe('passed');
    expect(result.record.budgets).toMatchObject({ actions: 4, toolCalls: 2, modelRequests: 2 });
    expect(result.record.usage.reported.total).toBe(6);
    expect(result.record.recovery?.faults.injected).toBe(1);
    expect(result.record.recovery?.retries).toMatchObject({
      attempted: 1,
      recovered: 1,
      exhausted: 0,
    });
    expect(result.transcript.filter((message) => message.role === 'tool')).toHaveLength(1);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  test('V2 evidence cannot acquire retry exceptions through added V3 metadata', async () => {
    const workflow = scenario([outage], 2);
    const result = await runAgentWorkflow({ workflow, target: target() });
    const forged = structuredClone(result);
    forged.record.schemaVersion = '2';
    expect(evaluateWorkflowDeterministicOutcomes(workflow, forged).status).toBe('invalid');
  });
  test('exhaustion is a controlled failure and cannot erase attempts', async () => {
    const result = await runAgentWorkflow({
      workflow: scenario([outage, { ...outage, id: 'second' }], 2),
      target: target(),
    });
    expect(result.record.execution).toBe('failed');
    expect(result.record.taskVerification).toBe('unavailable');
    expect(result.record.budgets).toMatchObject({ actions: 3, toolCalls: 2, modelRequests: 1 });
    expect(result.record.recovery?.retries.exhausted).toBe(1);
    expect(result.record.recovery?.faults.injected).toBe(2);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  test('retry cannot replenish the action budget', async () => {
    const workflow = scenario([outage], 2);
    workflow.environment.policy.budgets.max_actions = 2;
    const result = await runAgentWorkflow({ workflow, target: target() });
    expect(result.record.execution).toBe('budget_exceeded');
    expect(result.record.budgets.actions).toBe(2);
    expect(result.record.recovery?.retries.recovered).toBe(0);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  test('malformed read data never becomes a successful tool result or an automatic retry', async () => {
    const result = await runAgentWorkflow({
      workflow: scenario(
        [{ ...outage, kind: 'malformed_result', output: { incorrect: 'PRIVATE-MALFORMED' } }],
        5
      ),
      target: target(),
    });
    expect(result.record.execution).toBe('invalid');
    expect(result.record.recovery?.retries.attempted).toBe(0);
    expect(result.record.budgets.toolCalls).toBe(1);
    expect(JSON.stringify(result.record)).not.toContain('PRIVATE-');
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  for (const kind of ['stale_data', 'incomplete_data'] as const) {
    test(`${kind} changes observations without changing the authoritative state`, async () => {
      const workflow = scenario([
        {
          id: 'read',
          tool: 'read_document',
          occurrence: 1,
          kind,
          output: { id: 'policy', content: 'PRIVATE-OLD' },
        },
      ]);
      workflow.outcomes.deterministic = [
        { type: 'tool_trace', tool: 'read_document', minimum_calls: 1, maximum_calls: 1 },
      ];
      let observed = '';
      const result = await runAgentWorkflow({
        workflow,
        target: target('read_document', (messages) => {
          observed = messages.at(-1)?.content ?? '';
        }),
      });
      expect(observed).toContain('PRIVATE-OLD');
      expect(result.state?.documents).toEqual({ policy: 'PRIVATE-CURRENT-DOCUMENT' });
      expect(result.record.taskVerification).toBe('passed');
      expect(JSON.stringify(result.record)).not.toContain('PRIVATE-');
      expect(readWorkflowRecord(result.record)).toEqual(result.record);
    });
  }
  test('conflicting instructions are bounded read content with redacted evidence', async () => {
    const workflow = scenario([
      {
        id: 'conflict',
        tool: 'read_document',
        occurrence: 1,
        kind: 'conflicting_instructions',
        instruction: 'PRIVATE-CONFLICTING-INSTRUCTION',
      },
    ]);
    workflow.outcomes.deterministic = [
      { type: 'tool_trace', tool: 'read_document', minimum_calls: 1 },
    ];
    let observed = '';
    const result = await runAgentWorkflow({
      workflow,
      target: target('read_document', (messages) => {
        observed = messages.at(-1)?.content ?? '';
      }),
    });
    expect(observed).toContain('PRIVATE-CURRENT-DOCUMENT');
    expect(observed).toContain('PRIVATE-CONFLICTING-INSTRUCTION');
    expect(result.record.taskVerification).toBe('passed');
    expect(JSON.stringify(result.record)).not.toContain('PRIVATE-');
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  test('policy and original argument validation precede fault injection', async () => {
    const workflow = scenario([], 5);
    workflow.tools.push('read_file');
    workflow.faults = [{ ...outage, tool: 'read_file', kind: 'unavailable_tool' }];
    workflow.environment.policy.permissions = { documents: 'read', files: 'read' };
    workflow.environment.policy.paths = { read: ['allowed.txt'], write: [] };
    const denied = await runAgentWorkflow({
      workflow,
      target: target('read_file', undefined, { path: 'private.txt' }),
    });
    expect(denied.record.policy).toBe('denied');
    expect(denied.record.recovery?.faults.injected).toBe(0);
    expect(denied.record.recovery?.retries.attempted).toBe(0);
    const invalid = target();
    const invoke = invalid.turn;
    invalid.turn = async (request, signal) => {
      const answer = await invoke(request, signal);
      if (answer.status === 'completed' && answer.message.tool_calls?.[0])
        answer.message.tool_calls[0].function.arguments = '{"operation":"add","a":"1","b":1}';
      return answer;
    };
    const malformed = await runAgentWorkflow({ workflow: scenario([outage], 5), target: invalid });
    expect(malformed.record.execution).toBe('invalid');
    expect(malformed.record.recovery?.faults.injected).toBe(0);
  });
  test('restore validates consumed fault schedule and retains charged retry attempts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'artemis-fault-resume-'));
    const workflow = scenario([outage], 2);
    workflow.environment.policy.budgets.timeout_ms = 60000;
    const checkpoint = { directory, configurationId: 'fault-target-v1' };
    const paused = await runAgentWorkflow({
      workflow,
      target: target(),
      checkpoint: { ...checkpoint, mode: 'create' },
      pauseAfterActions: 3,
    });
    expect(paused.record.reason).toBe('checkpoint_paused');
    expect(paused.record.budgets).toMatchObject({ actions: 3, toolCalls: 2, modelRequests: 1 });
    const lease = await openWorkflowCheckpointStore({ directory, mode: 'resume' });
    const saved = await lease.read();
    const payload = structuredClone(saved?.payload) as unknown as WorkflowCheckpointPayload;
    const corrupt = structuredClone(payload);
    corrupt.recovery.faults.entries[0].id_sha256 = 'a'.repeat(64);
    await lease.write(corrupt);
    await lease.close();
    let calls = 0;
    const refusedTarget = target();
    refusedTarget.capabilities = async () => {
      calls++;
      return { status: 'available', toolUse: true, transportCancellation: true };
    };
    const refused = await runAgentWorkflow({
      workflow,
      target: refusedTarget,
      checkpoint: { ...checkpoint, mode: 'resume' },
    });
    expect(refused.record.reason).toBe('checkpoint_invalid');
    expect(calls).toBe(0);
    const repair = await openWorkflowCheckpointStore({ directory, mode: 'resume' });
    await repair.write(payload);
    await repair.close();
    const resumed = await runAgentWorkflow({
      workflow,
      target: target(),
      checkpoint: { ...checkpoint, mode: 'resume' },
    });
    expect(resumed.record.taskVerification).toBe('passed');
    expect(resumed.record.budgets).toMatchObject({ actions: 4, toolCalls: 2, modelRequests: 2 });
    expect(resumed.record.recovery?.faults.injected).toBe(1);
    expect(resumed.record.recovery?.retries).toMatchObject({
      attempted: 1,
      recovered: 1,
      exhausted: 0,
    });
    expect(readWorkflowRecord(resumed.record)).toEqual(resumed.record);
    for (const mutate of [
      (record: typeof resumed.record) => {
        if (record.recovery) record.recovery.retries.entries[0].previousOperationId = 'tool-2';
      },
      (record: typeof resumed.record) => {
        if (record.recovery) record.recovery.faults.entries[0].kind = 'stale_data';
      },
      (record: typeof resumed.record) => {
        if (record.recovery) record.recovery.retries.recovered = 0;
      },
    ]) {
      const forged = structuredClone(resumed.record);
      mutate(forged);
      expect(() => readWorkflowRecord(forged)).toThrow();
    }
  });
  test('two charged failures form one recovered logical call across resume', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'artemis-retry-chain-'));
    const workflow = scenario([outage, { ...outage, id: 'second' }], 3);
    workflow.environment.policy.budgets.timeout_ms = 60000;
    const checkpoint = { directory, configurationId: 'chain-target' };
    const paused = await runAgentWorkflow({
      workflow,
      target: target(),
      checkpoint: { ...checkpoint, mode: 'create' },
      pauseAfterActions: 4,
    });
    expect(paused.record.reason).toBe('checkpoint_paused');
    const result = await runAgentWorkflow({
      workflow,
      target: target(),
      checkpoint: { ...checkpoint, mode: 'resume' },
    });
    expect(result.record.taskVerification).toBe('passed');
    expect(result.record.budgets).toMatchObject({ actions: 5, toolCalls: 3, modelRequests: 2 });
    expect(result.record.recovery?.retries).toMatchObject({
      attempted: 2,
      recovered: 1,
      exhausted: 0,
    });
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  for (const kind of ['stale_data', 'incomplete_data', 'conflicting_instructions'] as const) {
    test(`checkpoint reconstruction preserves ${kind} observations without inventing state`, async () => {
      const directory = await mkdtemp(join(tmpdir(), 'artemis-read-fault-resume-'));
      const workflow = scenario([
        {
          id: 'read',
          tool: 'read_document',
          occurrence: 1,
          kind,
          ...(kind === 'conflicting_instructions'
            ? { instruction: 'PRIVATE-CONFLICT' }
            : { output: { id: 'policy', content: 'PRIVATE-STALE' } }),
        },
      ]);
      workflow.environment.policy.budgets.timeout_ms = 60000;
      workflow.outcomes.deterministic = [
        { type: 'tool_trace', tool: 'read_document', minimum_calls: 1 },
      ];
      const checkpoint = { directory, configurationId: 'read-target' };
      const paused = await runAgentWorkflow({
        workflow,
        target: target('read_document'),
        checkpoint: { ...checkpoint, mode: 'create' },
        pauseAfterActions: 2,
      });
      expect(paused.record.reason).toBe('checkpoint_paused');
      const result = await runAgentWorkflow({
        workflow,
        target: target('read_document'),
        checkpoint: { ...checkpoint, mode: 'resume' },
      });
      expect(result.record.taskVerification).toBe('passed');
      expect(result.state?.documents).toEqual({ policy: 'PRIVATE-CURRENT-DOCUMENT' });
      expect(result.record.recovery?.faults.injected).toBe(1);
      expect(readWorkflowRecord(result.record)).toEqual(result.record);
    });
  }
  test('consumed fault schedule survives a truncated public ledger and cannot reinject', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'artemis-truncated-fault-resume-'));
    const workflow = scenario([{ ...outage, occurrence: 65 }], 2);
    workflow.environment.policy.budgets = {
      max_actions: 200,
      max_model_requests: 100,
      max_tool_calls: 100,
      max_tokens: 1000,
      timeout_ms: 60000,
    };
    workflow.outcomes.deterministic = [
      { type: 'tool_trace', tool: 'calculator', minimum_calls: 70 },
    ];
    const repeated: AgentTarget = {
      ...target(),
      turn: async (request) => {
        const completed = request.messages.filter((message) => message.role === 'tool').length;
        return {
          status: 'completed',
          id: `answer-${completed}`,
          model: 'fixture',
          latencyMs: 1,
          tokens: { prompt: 2, completion: 1, total: 3 },
          message: {
            role: 'assistant',
            content: completed === 70 ? 'Done.' : '',
            ...(completed === 70
              ? {}
              : {
                  tool_calls: [
                    {
                      id: `call-${completed + 1}`,
                      type: 'function',
                      function: {
                        name: 'calculator',
                        arguments: '{"operation":"add","a":1,"b":1}',
                      },
                    },
                  ],
                }),
          },
        };
      },
    };
    const checkpoint = { directory, configurationId: 'truncated-target' };
    const paused = await runAgentWorkflow({
      workflow,
      target: repeated,
      checkpoint: { ...checkpoint, mode: 'create' },
      pauseAfterActions: 131,
    });
    expect(paused.record.reason).toBe('checkpoint_paused');
    expect(paused.record.droppedEvents).toBeGreaterThan(0);
    const resumed = await runAgentWorkflow({
      workflow,
      target: repeated,
      checkpoint: { ...checkpoint, mode: 'resume' },
    });
    expect(resumed.record.execution).toBe('completed');
    expect(resumed.record.taskVerification).toBe('unavailable');
    expect(resumed.record.budgets).toMatchObject({
      actions: 142,
      toolCalls: 71,
      modelRequests: 71,
    });
    expect(resumed.record.recovery?.faults.injected).toBe(1);
    expect(resumed.record.recovery?.retries).toMatchObject({ attempted: 1, recovered: 1 });
    expect(readWorkflowRecord(resumed.record)).toEqual(resumed.record);
  }, 20000);
  test('a declared timeout consumes elapsed authority and remains pre-effect', async () => {
    const workflow = scenario([{ ...outage, kind: 'timeout', timeout_ms: 100 }], 2);
    workflow.environment.policy.budgets.timeout_ms = 20;
    const result = await runAgentWorkflow({ workflow, target: target() });
    expect(result.record.execution).toBe('timeout');
    expect(result.record.budgets.toolCalls).toBe(1);
    expect(result.record.recovery?.retries.recovered).toBe(0);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
});
