import { describe, expect, it } from 'bun:test';
import type { GenerateOptions } from '@artemiskit/core';
import { LingAdapter } from './client';

function createAdapterWithResponse(response: unknown) {
  const adapter = new LingAdapter({ provider: 'ling', apiKey: 'test-key' });
  const requests: unknown[] = [];
  const client = {
    chat: {
      completions: {
        create: async (request: unknown) => {
          requests.push(request);
          return response;
        },
      },
    },
  };

  (adapter as unknown as { client: typeof client }).client = client;
  return { adapter, requests };
}

describe('LingAdapter', () => {
  it('maps Ling options and normalizes tool-call responses', async () => {
    const { adapter, requests } = createAdapterWithResponse({
      id: 'ling-response-1',
      model: 'Ling-3.0-flash',
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'lookup_order', arguments: '{"orderId":"A-1"}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
    });
    const options: GenerateOptions = {
      prompt: [{ role: 'user', content: 'Find order A-1' }],
      model: 'Ling-3.0-flash',
      maxTokens: 512,
      temperature: 0,
      topP: 0.9,
      stop: ['END'],
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup_order',
            parameters: { type: 'object', properties: { orderId: { type: 'string' } } },
          },
        },
      ],
      responseFormat: { type: 'json_object' },
      providerOptions: {
        ling: {
          thinking: { type: 'enabled' },
          enableSearch: true,
          searchOptions: { search_recency_filter: 'week' },
        },
      },
    };

    const result = await adapter.generate(options);

    expect(requests).toEqual([
      {
        model: 'Ling-3.0-flash',
        messages: [{ role: 'user', content: 'Find order A-1' }],
        max_tokens: 512,
        temperature: 0,
        top_p: 0.9,
        stop: ['END'],
        tools: options.tools,
        response_format: { type: 'json_object' },
        thinking: { type: 'enabled' },
        enable_search: true,
        search_options: { search_recency_filter: 'week' },
      },
    ]);
    expect(result).toMatchObject({
      id: 'ling-response-1',
      model: 'Ling-3.0-flash',
      text: '',
      finishReason: 'tool_calls',
      tokens: { prompt: 12, completion: 5, total: 17 },
      toolCalls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'lookup_order', arguments: '{"orderId":"A-1"}' },
        },
      ],
    });
  });

  it('uses the Flash default and preserves tool-loop message IDs', async () => {
    const { adapter, requests } = createAdapterWithResponse({
      id: 'ling-response-2',
      model: 'Ling-3.0-flash',
      choices: [{ finish_reason: 'stop', message: { content: 'Order delivered.' } }],
    });

    const result = await adapter.generate({
      prompt: [
        { role: 'assistant', content: '' },
        {
          role: 'tool',
          name: 'lookup_order',
          toolCallId: 'call-2',
          content: '{"status":"delivered"}',
        },
      ],
    });

    expect(requests).toEqual([
      {
        model: 'Ling-3.0-flash',
        messages: [
          { role: 'assistant', content: '' },
          { role: 'tool', content: '{"status":"delivered"}', tool_call_id: 'call-2' },
        ],
        temperature: undefined,
        top_p: undefined,
        stop: undefined,
        tools: undefined,
        response_format: undefined,
      },
    ]);
    expect(result).toMatchObject({
      text: 'Order delivered.',
      finishReason: 'stop',
      tokens: { prompt: 0, completion: 0, total: 0 },
    });
  });

  it('reports the documented capabilities', async () => {
    const { adapter } = createAdapterWithResponse({});

    await expect(adapter.capabilities()).resolves.toEqual({
      streaming: true,
      functionCalling: true,
      toolUse: true,
      maxContext: 256000,
      jsonMode: true,
    });
  });

  it('forwards maxTokens to streaming requests', async () => {
    async function* responseStream() {
      yield { choices: [{ delta: { content: 'Hello' } }] };
    }

    const { adapter, requests } = createAdapterWithResponse(responseStream());
    const chunks: string[] = [];

    for await (const chunk of adapter.stream(
      { prompt: 'Say hello', model: 'Ling-3.0-flash', maxTokens: 256 },
      (value) => chunks.push(value)
    )) {
      expect(chunk).toBe('Hello');
    }

    expect(requests).toEqual([
      {
        model: 'Ling-3.0-flash',
        messages: [{ role: 'user', content: 'Say hello' }],
        max_tokens: 256,
        temperature: undefined,
        top_p: undefined,
        stream: true,
      },
    ]);
    expect(chunks).toEqual(['Hello']);
  });
});
