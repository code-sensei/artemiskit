import { afterEach, describe, expect, test } from 'bun:test';
import OpenAI from 'openai';
import { LingAdapter } from './client';

/** What the SDK handed to fetch, with Bun's non-standard `timeout` option visible. */
type CapturedInit = RequestInit & { timeout?: unknown };

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Installs a fetch double that records each init and answers with `respond`. */
function installFetchDouble(respond: (init: CapturedInit) => Promise<Response>): CapturedInit[] {
  const inits: CapturedInit[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const captured = (init ?? {}) as CapturedInit;
    inits.push(captured);
    return respond(captured);
  }) as typeof fetch;
  return inits;
}

/** A response that never arrives unless the request's signal aborts, like a model still thinking. */
function hangUntilAborted(init: CapturedInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () =>
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    );
  });
}

const RESPONSE = {
  id: 'runtime-fetch-fixture',
  object: 'chat.completion',
  created: 0,
  model: 'fixture-model',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }],
};

describe('LingAdapter fetch under Bun', () => {
  test("disables Bun's fetch timeout and keeps the SDK init, including its signal", async () => {
    const inits = installFetchDouble(async () => Response.json(RESPONSE));
    const adapter = new LingAdapter({
      provider: 'ling',
      apiKey: 'test-placeholder',
      maxRetries: 0,
    });

    await adapter.generate({ prompt: 'hi', model: 'fixture-model' });

    expect(inits).toHaveLength(1);
    expect(inits[0].timeout).toBe(false);
    expect(inits[0].method?.toUpperCase()).toBe('POST');
    expect(inits[0].signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(inits[0].body)).model).toBe('fixture-model');
  });

  test('the configured SDK timeout still aborts a request that never answers', async () => {
    const inits = installFetchDouble(hangUntilAborted);
    const adapter = new LingAdapter({
      provider: 'ling',
      apiKey: 'test-placeholder',
      timeout: 50,
      maxRetries: 0,
    });
    const startedAt = Date.now();

    await expect(adapter.generate({ prompt: 'hi', model: 'fixture-model' })).rejects.toBeInstanceOf(
      OpenAI.APIConnectionTimeoutError
    );

    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(inits[0].timeout).toBe(false);
    expect(inits[0].signal?.aborted).toBe(true);
  });
});
