import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AgentTarget, validateAgentWorkflow } from '@artemiskit/core';
import { ArtemisKit } from '../artemiskit';
import { readWorkflowRecord } from '../index';
import type { WorkflowCheckpointOptions } from '../types-only';

describe('SDK workflow recovery options', () => {
  test('forwards checkpoint and pause controls and preserves the same logical run', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'artemis-sdk-recovery-'));
    const checkpoint: WorkflowCheckpointOptions = {
      directory: join(parent, 'private'),
      mode: 'create',
      configurationId: 'sdk-fixture-v1',
    };
    const workflow = validateAgentWorkflow({
      version: '1',
      kind: 'agent_workflow',
      name: 'sdk-recovery',
      target: { provider: 'openai', model: 'fixture' },
      environment: {
        type: 'simulated',
        policy: {
          network: 'denied',
          side_effects: 'denied',
          permissions: { files: 'write' },
          budgets: {
            max_actions: 6,
            max_model_requests: 2,
            max_tool_calls: 2,
            max_tokens: 6,
            timeout_ms: 20000,
          },
        },
      },
      tools: ['write_file'],
      workflow: {
        system_instructions: 'Write two files.',
        initial_state: { files: {} },
        turns: [{ role: 'user', content: 'PRIVATE-WORKFLOW' }],
      },
      outcomes: {
        deterministic: [{ type: 'file', path: 'two.txt', exists: true, equals: 'PRIVATE-FILE' }],
      },
      evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
    });
    let calls = 0;
    let capabilities = 0;
    const target: AgentTarget = {
      provider: 'openai',
      capabilities: async () => {
        capabilities++;
        return { status: 'available', toolUse: true, transportCancellation: true };
      },
      turn: async (request) => {
        calls++;
        const continued = request.messages.some((message) => message.role === 'tool');
        return {
          status: 'completed',
          id: `answer-${calls}`,
          model: 'fixture',
          latencyMs: 1,
          tokens: { prompt: 2, completion: 1, total: 3 },
          message: {
            role: 'assistant',
            content: continued ? 'Done.' : '',
            ...(continued
              ? {}
              : {
                  tool_calls: ['one', 'two'].map((name) => ({
                    id: name,
                    type: 'function' as const,
                    function: {
                      name: 'write_file',
                      arguments: JSON.stringify({ path: `${name}.txt`, content: 'PRIVATE-FILE' }),
                    },
                  })),
                }),
          },
        };
      },
    };
    const kit = new ArtemisKit();
    const paused = await kit.runWorkflow({ workflow, target, checkpoint, pauseAfterActions: 2 });
    expect(paused.record.reason).toBe('checkpoint_paused');
    expect(paused.record.budgets.actions).toBe(2);
    expect(calls).toBe(1);
    expect(readWorkflowRecord(paused.record)).toEqual(paused.record);
    const bad = await kit.runWorkflow({
      workflow,
      target,
      checkpoint: { ...checkpoint, mode: 'resume', configurationId: 'changed' },
    });
    expect(bad.record.execution).not.toBe('completed');
    expect(capabilities).toBe(1);
    expect(calls).toBe(1);
    const session = await kit.createWorkflowSession({
      workflow,
      target,
      checkpoint: { ...checkpoint, mode: 'resume' },
    });
    expect(typeof session.pause).toBe('function');
    const resumed = await session.run();
    expect(resumed.record.taskVerification).toBe('passed');
    expect(resumed.record.budgets).toMatchObject({ actions: 4, toolCalls: 2, modelRequests: 2 });
    expect(resumed.record.usage.reported.total).toBe(6);
    expect(calls).toBe(2);
    expect(resumed.record.recovery?.runId).toBe(paused.record.recovery?.runId);
    expect(resumed.record.recovery?.attempts).toBe(2);
    expect(JSON.stringify(resumed.record)).not.toContain('PRIVATE-');
    expect(JSON.stringify(resumed.record)).not.toContain(checkpoint.directory);
    expect(readWorkflowRecord(resumed.record)).toEqual(resumed.record);
  });
});
