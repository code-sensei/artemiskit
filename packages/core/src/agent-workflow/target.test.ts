import { describe, expect, test } from 'bun:test';
import type { GenerateOptions, GenerateResult, ModelClient } from '../adapters/types';
import { type AgentTurnRequest, createModelClientTarget } from './target';

const request: AgentTurnRequest = {
  messages: [{ role: 'user', content: 'Read the declared document.' }],
  tools: [
    {
      type: 'function',
      function: {
        name: 'read_document',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
  ],
  model: 'requested-model',
  generation: { maxTokens: 200, temperature: 0, topP: 1, seed: 1, stop: ['END'] },
  budgets: { timeoutMs: 1000, maxToolCalls: 2 },
};
const call = {
  id: 'call-1',
  type: 'function' as const,
  function: { name: 'read_document', arguments: '{"id":"doc-1"}' },
};
const response: GenerateResult = {
  id: 'response-1',
  model: 'observed-model',
  text: '',
  tokens: { prompt: 10, completion: 2, total: 12 },
  latencyMs: 1,
  finishReason: 'tool_calls',
  toolCalls: [call],
  raw: { secret: 'not-retained' },
};
function client(overrides: Partial<ModelClient> = {}): ModelClient {
  return {
    provider: 'custom-provider',
    capabilities: async () => ({
      streaming: false,
      functionCalling: true,
      toolUse: true,
      maxContext: 1000,
    }),
    generate: async () => structuredClone(response),
    ...overrides,
  };
}

describe('ModelClient agent target', () => {
  test('reports advertised capability and honest cancellation support', async () => {
    expect(await createModelClientTarget(client()).capabilities({ timeoutMs: 100 })).toEqual({
      status: 'available',
      toolUse: true,
      transportCancellation: false,
    });
  });
  test('passes declared settings and returns normalized evidence without raw payloads', async () => {
    let received: GenerateOptions | undefined;
    const target = createModelClientTarget(
      client({
        generate: async (options) => {
          received = options;
          return response;
        },
      })
    );
    const result = await target.turn(request);
    expect(received).toEqual({
      maxRetries: 0,
      prompt: request.messages,
      tools: request.tools,
      model: request.model,
      ...request.generation,
    });
    expect(result).toEqual({
      status: 'completed',
      id: response.id,
      model: response.model,
      message: { role: 'assistant', content: '', tool_calls: [call] },
      tokens: response.tokens,
      latencyMs: 1,
      finishReason: 'tool_calls',
    });
    expect(JSON.stringify(result)).not.toContain('not-retained');
  });
  test('accepts correlated tool results and preserves IDs into continuation', async () => {
    let received: GenerateOptions | undefined;
    const target = createModelClientTarget(
      client({
        generate: async (options) => {
          received = options;
          return { ...response, text: 'Done', toolCalls: undefined, finishReason: 'stop' };
        },
      })
    );
    const messages: AgentTurnRequest['messages'] = [
      ...request.messages,
      { role: 'assistant', content: '', tool_calls: [call] },
      { role: 'tool', content: 'Document text', toolCallId: call.id },
    ];
    expect((await target.turn({ ...request, messages })).status).toBe('completed');
    expect(received?.prompt).toEqual(messages);
  });
  test('unsupported capabilities prevent generate calls', async () => {
    let generated = false;
    const target = createModelClientTarget(
      client({
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 1000,
        }),
        generate: async () => {
          generated = true;
          return response;
        },
      })
    );
    expect(await target.turn(request)).toEqual({
      status: 'unsupported',
      code: 'tool_use_unsupported',
    });
    expect(generated).toBe(false);
  });
  test('capability errors and provider errors do not expose raw exception content', async () => {
    for (const method of ['capabilities', 'generate'] as const) {
      const target = createModelClientTarget(
        client({
          [method]: async () => {
            throw new Error('secret provider credential');
          },
        })
      );
      expect(await target.turn(request)).toEqual({ status: 'error', code: 'target_error' });
    }
  });
  test.each([
    [
      'unknown tool',
      { toolCalls: [{ ...call, function: { ...call.function, name: 'send_money' } }] },
    ],
    ['duplicate ID', { toolCalls: [call, call] }],
    [
      'invalid JSON',
      { toolCalls: [{ ...call, function: { ...call.function, arguments: 'broken' } }] },
    ],
    [
      'nonobject arguments',
      { toolCalls: [{ ...call, function: { ...call.function, arguments: '[]' } }] },
    ],
    [
      'invalid schema arguments',
      { toolCalls: [{ ...call, function: { ...call.function, arguments: '{"id":3}' } }] },
    ],
    ['negative usage', { tokens: { prompt: -1, completion: 2, total: 1 } }],
    ['inconsistent usage', { tokens: { prompt: 1, completion: 2, total: 5 } }],
    ['missing calls', { toolCalls: undefined }],
    ['legacy function call', { functionCall: { name: 'read_document', arguments: '{}' } }],
    ['invalid latency', { latencyMs: Number.NaN }],
    ['missing observed model', { model: '' }],
  ])('rejects malformed response: %s', async (_name, override) => {
    const target = createModelClientTarget(
      client({ generate: async () => ({ ...response, ...override }) })
    );
    expect(await target.turn(request)).toMatchObject({
      status: 'invalid',
      code: 'invalid_response',
    });
  });
  test('rejects tool calls beyond the declared per-turn budget', async () => {
    expect(
      await createModelClientTarget(client()).turn({
        ...request,
        budgets: { ...request.budgets, maxToolCalls: 0 },
      })
    ).toEqual({ status: 'invalid', code: 'invalid_response' });
  });
  test('rejects async tool argument schemas before provider invocation', async () => {
    let reached = false;
    const target = createModelClientTarget(
      client({
        generate: async () => {
          reached = true;
          return response;
        },
      })
    );
    const tool = request.tools[0];
    expect(
      await target.turn({
        ...request,
        tools: [
          {
            ...tool,
            function: {
              ...tool.function,
              parameters: { ...tool.function.parameters, $async: true },
            },
          },
        ],
      })
    ).toEqual({ status: 'invalid', code: 'invalid_request' });
    expect(reached).toBe(false);
  });
  test.each([
    { budgets: { timeoutMs: 0, maxToolCalls: 2 } },
    { generation: { maxTokens: -1 } },
    { messages: [{ role: 'tool', content: 'Orphan', toolCallId: 'missing' }] },
    { messages: [{ role: 'assistant', content: '', tool_calls: [call] }] },
    { tools: [request.tools[0], request.tools[0]] },
  ])('invalid request never reaches provider', async (override) => {
    let reached = false;
    const target = createModelClientTarget(
      client({
        generate: async () => {
          reached = true;
          return response;
        },
      })
    );
    expect(await target.turn({ ...request, ...override } as AgentTurnRequest)).toEqual({
      status: 'invalid',
      code: 'invalid_request',
    });
    expect(reached).toBe(false);
  });
  test('aborting before a turn prevents a provider call', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await createModelClientTarget(client()).turn(request, controller.signal)).toEqual({
      status: 'error',
      code: 'aborted',
    });
  });
  test('timeout bounds waiting even when generation does not settle', async () => {
    const target = createModelClientTarget(client({ generate: () => new Promise(() => {}) }));
    expect(await target.turn({ ...request, budgets: { timeoutMs: 10, maxToolCalls: 2 } })).toEqual({
      status: 'error',
      code: 'timeout',
    });
  });
  test('capabilities settling after timeout cannot start generation', async () => {
    let release: (() => void) | undefined;
    let generated = false;
    const target = createModelClientTarget(
      client({
        capabilities: async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { streaming: false, functionCalling: true, toolUse: true, maxContext: 1 };
        },
        generate: async () => {
          generated = true;
          return response;
        },
      })
    );
    expect(await target.turn({ ...request, budgets: { timeoutMs: 10, maxToolCalls: 2 } })).toEqual({
      status: 'error',
      code: 'timeout',
    });
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(generated).toBe(false);
  });
  test('abort while waiting returns an explicit aborted result', async () => {
    const controller = new AbortController();
    const target = createModelClientTarget(client({ generate: () => new Promise(() => {}) }));
    const pending = target.turn(request, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ status: 'error', code: 'aborted' });
  });
});
