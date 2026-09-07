import { describe, expect, it } from 'bun:test';
import type { GenerateOptions, ModelClient } from '../adapters/types';
import { registerEvaluator } from '../evaluators';
import type { Evaluator } from '../evaluators';
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

describe('executeCase measurement integrity', () => {
  const scenario = ScenarioSchema.parse({
    name: 'measurement integrity',
    cases: [
      {
        id: 'custom-evaluation',
        prompt: 'Evaluate this',
        expected: { type: 'custom', evaluator: 'test' },
      },
    ],
  });

  const client: ModelClient = {
    provider: 'test',
    generate: async () => ({
      id: 'response',
      model: 'target-model',
      text: 'target response',
      tokens: { prompt: 1, completion: 1, total: 2 },
      latencyMs: 1,
      finishReason: 'stop',
    }),
    capabilities: async () => ({
      streaming: false,
      functionCalling: false,
      toolUse: false,
      maxContext: 1,
    }),
  };

  it('marks an evaluator exception invalid after a target response is received', async () => {
    registerEvaluator('custom', {
      type: 'custom',
      evaluate: async () => {
        throw new Error('judge offline');
      },
    });

    const result = await executeCase(scenario.cases[0], { client, scenario });

    expect(result).toMatchObject({
      ok: false,
      status: 'invalid',
      response: 'target response',
      evidence: {
        evaluator: 'custom',
        validation: { status: 'invalid', code: 'evaluator_failure' },
      },
    });
  });

  it('marks a target generation failure as an execution error', async () => {
    const unavailableClient: ModelClient = {
      ...client,
      generate: async () => {
        throw new Error('provider unavailable');
      },
    };

    const result = await executeCase(scenario.cases[0], {
      client: unavailableClient,
      scenario,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'error',
      response: '',
      error: 'provider unavailable',
    });
  });

  it('retains only the bounded evidence contract rather than evaluator details', async () => {
    const evaluator: Evaluator = {
      type: 'custom',
      evaluate: async () => ({
        passed: true,
        score: 1,
        status: 'passed',
        evidence: {
          threshold: 0.7,
          model: 'reviewer-model',
          validation: { status: 'valid', code: 'accepted' },
        },
        details: { rawJudgeOutput: 'secret judge transcript', rubric: 'secret rubric' },
      }),
    };
    registerEvaluator('custom', evaluator);

    const result = await executeCase(scenario.cases[0], { client, scenario });

    expect(result.status).toBe('passed');
    expect(result.evidence).toEqual({
      evaluator: 'custom',
      score: 1,
      threshold: 0.7,
      model: 'reviewer-model',
      validation: { status: 'valid', code: 'accepted' },
    });
    expect(JSON.stringify(result)).not.toContain('secret judge transcript');
    expect(JSON.stringify(result)).not.toContain('secret rubric');
  });
});
