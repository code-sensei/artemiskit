import { afterEach, describe, expect, test } from 'bun:test';
import { OpenAIAdapter } from './client';

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

/** Loopback stub of the chat completions endpoint returning `usage` exactly as given. */
function adapterReturning(usage: unknown): OpenAIAdapter {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      Response.json({
        id: 'usage-fixture',
        object: 'chat.completion',
        created: 0,
        model: 'fixture-model',
        choices: [
          { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } },
        ],
        ...(usage === undefined ? {} : { usage }),
      }),
  });
  servers.push(server);
  return new OpenAIAdapter({
    provider: 'openai',
    apiKey: 'test-placeholder',
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    maxRetries: 0,
  });
}

describe('OpenAIAdapter usage availability', () => {
  test('reports usage as available when the response carries consistent counts', async () => {
    const result = await adapterReturning({
      prompt_tokens: 7,
      completion_tokens: 3,
      total_tokens: 10,
    }).generate({ prompt: 'hi', model: 'fixture-model' });

    expect(result.usageAvailable).toBe(true);
    expect(result.tokens).toEqual({ prompt: 7, completion: 3, total: 10 });
  });

  test('reports usage as unavailable when the server omits it', async () => {
    const result = await adapterReturning(undefined).generate({
      prompt: 'hi',
      model: 'fixture-model',
    });

    // Zero counts are placeholders, not a measured zero.
    expect(result.usageAvailable).toBe(false);
    expect(result.tokens).toEqual({ prompt: 0, completion: 0, total: 0 });
  });

  test.each([
    ['null usage', null],
    ['inconsistent total', { prompt_tokens: 7, completion_tokens: 3, total_tokens: 11 }],
    ['negative count', { prompt_tokens: -1, completion_tokens: 3, total_tokens: 2 }],
    ['fractional count', { prompt_tokens: 1.5, completion_tokens: 1.5, total_tokens: 3 }],
  ])('reports usage as unavailable for %s', async (_name, usage) => {
    const result = await adapterReturning(usage).generate({
      prompt: 'hi',
      model: 'fixture-model',
    });

    expect(result.usageAvailable).toBe(false);
  });
});
