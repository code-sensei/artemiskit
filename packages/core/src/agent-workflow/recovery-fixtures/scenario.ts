import type { ToolCall } from '../../adapters/types';
import { validateAgentWorkflow } from '../parser';
import type { AgentTarget, AgentTurnResult } from '../target';

export function recoveryWorkflow() {
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'durable recovery fixture',
    target: { provider: 'custom', model: 'fixture-model' },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions: { files: 'write' },
        budgets: { max_actions: 20, timeout_ms: 30000 },
      },
    },
    tools: ['write_file', 'read_file'],
    workflow: {
      system_instructions: 'Complete controlled file task.',
      initial_state: { files: {} },
      turns: [{ role: 'user', content: 'Write both controlled outputs.' }],
    },
    outcomes: {
      deterministic: [
        { type: 'file', path: 'one.txt', exists: true, equals: 'PRIVATE-ONE' },
        { type: 'file', path: 'two.txt', exists: true, equals: 'PRIVATE-TWO' },
      ],
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}
export function recoveryAnswer(
  calls: ToolCall[] = [],
  content = 'finished'
): Extract<AgentTurnResult, { status: 'completed' }> {
  return {
    status: 'completed',
    id: 'answer',
    model: 'fixture-model',
    message: { role: 'assistant', content, ...(calls.length ? { tool_calls: calls } : {}) },
    tokens: { prompt: 2, completion: 1, total: 3 },
    usageAvailable: true,
    latencyMs: 1,
    finishReason: calls.length ? 'tool_calls' : 'stop',
  };
}
export function recoveryCalls(): ToolCall[] {
  return ['one', 'two'].map((name) => ({
    id: `call-${name}`,
    type: 'function',
    function: {
      name: 'write_file',
      arguments: JSON.stringify({ path: `${name}.txt`, content: `PRIVATE-${name.toUpperCase()}` }),
    },
  }));
}
export function recoveryTarget(): AgentTarget {
  return {
    provider: 'custom',
    capabilities: async () => ({ status: 'available', toolUse: true, transportCancellation: true }),
    turn: async (request) => {
      if (request.tools[0]?.function.name === 'artemis_probe') {
        const previous = request.messages.find((message) => message.role === 'tool');
        if (previous) return recoveryAnswer([], JSON.parse(previous.content).nonce);
        const properties = request.tools[0].function.parameters.properties as {
          nonce: { const: string };
        };
        return recoveryAnswer([
          {
            id: 'probe-call',
            type: 'function',
            function: {
              name: 'artemis_probe',
              arguments: JSON.stringify({ nonce: properties.nonce.const }),
            },
          },
        ]);
      }
      return recoveryAnswer(
        request.messages.some((message) => message.role === 'tool') ? [] : recoveryCalls()
      );
    },
  };
}
