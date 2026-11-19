import { afterEach, describe, expect, test } from 'bun:test';
import { OpenAIAdapter } from './client';

const COMPLETION = {
  id: 'token-param-fixture',
  object: 'chat.completion',
  created: 0,
  model: 'fixture-model',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }],
};

/** One streamed content chunk followed by the terminator, as OpenAI-compatible servers send it. */
const STREAM_BODY = [
  `data: ${JSON.stringify({
    id: 'token-param-fixture',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'fixture-model',
    choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
  })}`,
  'data: [DONE]',
  '',
].join('\n\n');

const servers: ReturnType<typeof Bun.serve>[] = [];
const originalFetch = globalThis.fetch;
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
  globalThis.fetch = originalFetch;
});

/** 127.0.0.1 stub of the chat completions endpoint that records each request body. */
function loopbackAdapter() {
  const bodies: Record<string, unknown>[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      if (body.stream) {
        return new Response(STREAM_BODY, { headers: { 'content-type': 'text/event-stream' } });
      }
      return Response.json(COMPLETION);
    },
  });
  servers.push(server);
  const adapter = new OpenAIAdapter({
    provider: 'openai',
    apiKey: 'test-placeholder',
    baseUrl: `http://127.0.0.1:${server.port}/v1`,
    maxRetries: 0,
  });
  return { adapter, bodies };
}

async function drain(stream: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of stream) text += chunk;
  return text;
}

describe('OpenAIAdapter token limit parameter', () => {
  describe('loopback endpoint', () => {
    test.each(['ministral-3:8b', 'gpt-5-mini', 'phi4-mini', 'o3'])(
      'generate sends max_tokens for %s',
      async (model) => {
        const { adapter, bodies } = loopbackAdapter();
        await adapter.generate({ prompt: 'hi', model, maxTokens: 64 });
        expect(bodies[0].max_tokens).toBe(64);
        expect(bodies[0]).not.toHaveProperty('max_completion_tokens');
      }
    );

    test.each(['ministral-3:8b', 'gpt-5-mini'])('stream sends max_tokens for %s', async (model) => {
      const { adapter, bodies } = loopbackAdapter();
      const text = await drain(adapter.stream({ prompt: 'hi', model, maxTokens: 64 }, () => {}));
      expect(text).toBe('ok');
      expect(bodies[0].stream).toBe(true);
      expect(bodies[0].max_tokens).toBe(64);
      expect(bodies[0]).not.toHaveProperty('max_completion_tokens');
    });

    test('sends no token limit when none is given', async () => {
      const { adapter, bodies } = loopbackAdapter();
      await adapter.generate({ prompt: 'hi', model: 'ministral-3:8b' });
      expect(bodies[0]).not.toHaveProperty('max_tokens');
      expect(bodies[0]).not.toHaveProperty('max_completion_tokens');
    });
  });

  describe('non-loopback endpoint', () => {
    /**
     * Adapter aimed at api.openai.com whose requests are captured by a fetch double, so the
     * selection is checked without any external network call.
     */
    function remoteAdapter() {
      const bodies: Record<string, unknown>[] = [];
      const urls: string[] = [];
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        urls.push(String(input instanceof Request ? input.url : input));
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Response.json(COMPLETION);
      }) as typeof fetch;
      const adapter = new OpenAIAdapter({
        provider: 'openai',
        apiKey: 'test-placeholder',
        baseUrl: 'https://api.openai.com/v1',
        maxRetries: 0,
      });
      return { adapter, bodies, urls };
    }

    test('keeps max_completion_tokens for gpt-5-mini', async () => {
      const { adapter, bodies, urls } = remoteAdapter();
      await adapter.generate({ prompt: 'hi', model: 'gpt-5-mini', maxTokens: 64 });
      expect(urls[0]).toStartWith('https://api.openai.com/v1/');
      expect(bodies[0].max_completion_tokens).toBe(64);
      expect(bodies[0]).not.toHaveProperty('max_tokens');
    });

    test('keeps max_tokens for models outside the new-parameter patterns', async () => {
      const { adapter, bodies } = remoteAdapter();
      await adapter.generate({ prompt: 'hi', model: 'gpt-3.5-turbo', maxTokens: 64 });
      expect(bodies[0].max_tokens).toBe(64);
      expect(bodies[0]).not.toHaveProperty('max_completion_tokens');
    });
  });
});
