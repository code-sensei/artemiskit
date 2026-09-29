import {
  type AgentTarget,
  type WorkflowJudgeOptions,
  validateAgentWorkflow,
} from '@artemiskit/core';

/** Deterministic in-process engine fixtures; no credentials or provider network. */
export function reportWorkflow() {
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'PRIVATE-SCENARIO',
    target: { provider: 'custom', model: 'PRIVATE-MODEL' },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions: { files: 'write' },
        budgets: { max_actions: 20, timeout_ms: 30000 },
      },
    },
    tools: ['write_file'],
    workflow: {
      system_instructions: 'PRIVATE-INSTRUCTIONS',
      initial_state: { files: {} },
      turns: [{ role: 'user', content: 'PRIVATE-PROMPT' }],
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
export function reportTarget(
  options: { write?: boolean; missingUsage?: boolean } = {}
): AgentTarget {
  return {
    provider: 'custom',
    capabilities: async () => ({ status: 'available', toolUse: true, transportCancellation: true }),
    turn: async (request) => {
      const observed = request.messages.some((message) => message.role === 'tool');
      const probe = request.tools[0]?.function.name === 'artemis_probe';
      const calls =
        observed || options.write === false
          ? []
          : probe
            ? [
                {
                  id: 'PRIVATE-PROBE',
                  type: 'function' as const,
                  function: {
                    name: 'artemis_probe',
                    arguments: JSON.stringify({
                      nonce: (
                        request.tools[0].function.parameters.properties as {
                          nonce: { const: string };
                        }
                      ).nonce.const,
                    }),
                  },
                },
              ]
            : ['one', 'two'].map((name) => ({
                id: `PRIVATE-CALL-${name}`,
                type: 'function' as const,
                function: {
                  name: 'write_file',
                  arguments: JSON.stringify({
                    path: `${name}.txt`,
                    content: `PRIVATE-${name.toUpperCase()}`,
                  }),
                },
              }));
      const tool = request.messages.find((message) => message.role === 'tool');
      return {
        status: 'completed',
        id: 'PRIVATE-RESPONSE',
        model: 'PRIVATE-MODEL',
        message: {
          role: 'assistant',
          content: probe && tool ? JSON.parse(tool.content).nonce : 'PRIVATE-PROSE',
          ...(calls.length ? { tool_calls: calls } : {}),
        },
        tokens: { prompt: 2, completion: 1, total: 3 },
        usageAvailable: !(options.missingUsage && observed),
        latencyMs: 1,
        finishReason: calls.length ? 'tool_calls' : 'stop',
      };
    },
  };
}
export function reportJudge(text = '{"verdict":"pass"}'): WorkflowJudgeOptions {
  return {
    provider: 'PRIVATE-JUDGE-PROVIDER',
    model: 'PRIVATE-JUDGE-MODEL',
    limits: { maxRequests: 2, maxTokens: 100, maxOutputTokens: 20, timeoutMs: 1000 },
    client: {
      provider: 'PRIVATE-JUDGE-PROVIDER',
      capabilities: async () => ({
        streaming: false,
        functionCalling: false,
        toolUse: false,
        maxContext: 10000,
      }),
      generate: async () => ({
        id: 'PRIVATE-JUDGE-RESPONSE',
        text,
        model: 'PRIVATE-JUDGE-MODEL',
        tokens: { prompt: 4, completion: 1, total: 5 },
        latencyMs: 1,
      }),
    },
  };
}
