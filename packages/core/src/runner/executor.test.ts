import { describe, expect, it } from 'bun:test';
import type { GenerateOptions, ModelClient } from '../adapters/types';
import { ScenarioSchema } from '../scenario/schema';
import { executeCase } from './executor';

function createEnabledToolLoopScenario() {
  return ScenarioSchema.parse({
    name: 'fixture-backed tool loop',
    provider: 'ling',
    model: 'Ling-3.0-flash',
    setup: {
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup_order',
            parameters: { type: 'object', properties: { orderId: { type: 'string' } } },
          },
        },
      ],
      fixtures: {
        lookup_order: [{ when: { orderId: 'A-1' }, result: { status: 'delivered' } }],
      },
      toolLoop: { enabled: true, maxSteps: 2 },
    },
    cases: [
      {
        id: 'order-status',
        prompt: 'Where is order A-1?',
        expected: { type: 'exact', value: 'Order A-1 was delivered.' },
      },
    ],
  });
}

function createToolCallResponse() {
  return {
    id: 'first',
    model: 'Ling-3.0-flash',
    text: '',
    tokens: { prompt: 7, completion: 2, total: 9 },
    latencyMs: 4,
    finishReason: 'tool_calls' as const,
    toolCalls: [
      {
        id: 'call-order',
        type: 'function' as const,
        function: { name: 'lookup_order', arguments: '{"orderId":"A-1"}' },
      },
    ],
  };
}

describe('executeCase tool loop', () => {
  it('preserves tool call IDs while resolving fixture-backed calls', async () => {
    const scenario = createEnabledToolLoopScenario();
    const requests: GenerateOptions[] = [];
    const responses = [
      {
        id: 'first',
        model: 'Ling-3.0-flash',
        text: '',
        tokens: { prompt: 10, completion: 3, total: 13 },
        latencyMs: 1,
        finishReason: 'tool_calls' as const,
        toolCalls: [
          {
            id: 'call-order',
            type: 'function' as const,
            function: { name: 'lookup_order', arguments: '{"orderId":"A-1"}' },
          },
        ],
      },
      {
        id: 'second',
        model: 'Ling-3.0-flash',
        text: 'Order A-1 was delivered.',
        tokens: { prompt: 20, completion: 5, total: 25 },
        latencyMs: 1,
        finishReason: 'stop' as const,
      },
    ];
    const client: ModelClient = {
      provider: 'ling',
      generate: async (options) => {
        requests.push(options);
        const response = responses.shift();
        if (!response) throw new Error('Unexpected generation request');
        return response;
      },
      capabilities: async () => ({
        streaming: true,
        functionCalling: true,
        toolUse: true,
        maxContext: 256000,
      }),
    };

    const result = await executeCase(scenario.cases[0], { client, scenario });

    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBe(2);
    expect(result.tokens).toEqual({ prompt: 30, completion: 8, total: 38 });
    expect(requests).toHaveLength(2);
    expect(requests[1].prompt).toEqual([
      { role: 'user', content: 'Where is order A-1?' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-order',
            type: 'function',
            function: { name: 'lookup_order', arguments: '{"orderId":"A-1"}' },
          },
        ],
      },
      {
        role: 'tool',
        name: 'lookup_order',
        toolCallId: 'call-order',
        content: '{"status":"delivered"}',
      },
    ]);
  });

  it('retains generation metrics when the tool loop cannot start', async () => {
    const scenario = ScenarioSchema.parse({
      name: 'invalid tool loop',
      provider: 'ling',
      model: 'Ling-3.0-flash',
      setup: { toolLoop: { enabled: true } },
      cases: [
        {
          id: 'missing-tools',
          prompt: 'Use a tool',
          expected: { type: 'exact', value: '' },
        },
      ],
    });
    const client: ModelClient = {
      provider: 'ling',
      generate: async () => ({
        id: 'first',
        model: 'Ling-3.0-flash',
        text: '',
        tokens: { prompt: 7, completion: 2, total: 9 },
        latencyMs: 4,
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-order',
            type: 'function',
            function: { name: 'lookup_order', arguments: '{"orderId":"A-1"}' },
          },
        ],
      }),
      capabilities: async () => ({
        streaming: true,
        functionCalling: true,
        toolUse: true,
        maxContext: 256000,
      }),
    };

    const result = await executeCase(scenario.cases[0], { client, scenario });

    expect(result.error).toBe('TOOL_EXECUTOR_REQUIRED');
    expect(result.latencyMs).toBe(4);
    expect(result.tokens).toEqual({ prompt: 7, completion: 2, total: 9 });
  });

  it('retains prior generation metrics when a later generation rejects', async () => {
    const scenario = createEnabledToolLoopScenario();
    let calls = 0;
    const client: ModelClient = {
      provider: 'ling',
      generate: async () => {
        calls++;
        if (calls === 1) return createToolCallResponse();
        throw new Error('later generation failed');
      },
      capabilities: async () => ({
        streaming: true,
        functionCalling: true,
        toolUse: true,
        maxContext: 256000,
      }),
    };

    const result = await executeCase(scenario.cases[0], { client, scenario });

    expect(calls).toBe(2);
    expect(result.error).toBe('TOOL_GENERATION_FAILED');
    expect(result.latencyMs).toBe(4);
    expect(result.tokens).toEqual({ prompt: 7, completion: 2, total: 9 });
    expect(result.toolLoop).toEqual({
      status: 'error',
      steps: 1,
      terminationReason: 'tool_error',
    });
  });

  it('retains prior generation metrics when a later generation times out', async () => {
    const scenario = createEnabledToolLoopScenario();
    let calls = 0;
    const client: ModelClient = {
      provider: 'ling',
      generate: async () => {
        calls++;
        if (calls === 1) return createToolCallResponse();
        return await new Promise<never>(() => {});
      },
      capabilities: async () => ({
        streaming: true,
        functionCalling: true,
        toolUse: true,
        maxContext: 256000,
      }),
    };

    const result = await executeCase(scenario.cases[0], { client, scenario, timeout: 10 });

    expect(calls).toBe(2);
    expect(result.error).toBe('TOOL_LOOP_TIMEOUT');
    expect(result.latencyMs).toBe(4);
    expect(result.tokens).toEqual({ prompt: 7, completion: 2, total: 9 });
    expect(result.toolLoop).toEqual({
      status: 'error',
      steps: 1,
      terminationReason: 'timeout',
    });
  });
});
