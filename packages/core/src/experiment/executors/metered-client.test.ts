import { describe, expect, test } from 'bun:test';
import type { GenerateResult, ModelClient } from '../../adapters/types';
import { meterClient } from './metered-client';

function fixtureClient(overrides: Partial<ModelClient> = {}): ModelClient {
  return {
    provider: 'fixture',
    capabilities: async () => ({
      streaming: true,
      functionCalling: false,
      toolUse: false,
      maxContext: 1024,
    }),
    generate: async (): Promise<GenerateResult> => ({
      id: 'fixture',
      model: 'fixture-model',
      text: 'ok',
      tokens: { prompt: 4, completion: 2, total: 6 },
      latencyMs: 1,
    }),
    ...overrides,
  };
}

describe('meterClient', () => {
  test('counts generate requests and sums reported tokens', async () => {
    const meter = meterClient(fixtureClient(), 5);
    await meter.client.generate({ prompt: 'a' });
    await meter.client.generate({ prompt: 'b' });
    expect(meter.usage()).toEqual({ requests: 2, tokens: 12 });
    expect(meter.client.provider).toBe('fixture');
    expect((await meter.client.capabilities()).maxContext).toBe(1024);
  });

  test('reports zero tokens when no request was made', () => {
    expect(meterClient(fixtureClient(), 1).usage()).toEqual({ requests: 0, tokens: 0 });
  });

  test('counts embedding requests but leaves tokens unreported', async () => {
    const meter = meterClient(fixtureClient({ embed: async () => [0.1, 0.2] }), 5);
    expect(await meter.client.embed?.('text')).toEqual([0.1, 0.2]);
    expect(meter.usage()).toEqual({ requests: 1 });
  });

  test('leaves tokens unreported for a rejected request', async () => {
    const meter = meterClient(
      fixtureClient({
        generate: async () => {
          throw new Error('boom');
        },
      }),
      5
    );
    await expect(meter.client.generate({ prompt: 'a' })).rejects.toThrow('boom');
    expect(meter.usage()).toEqual({ requests: 1 });
  });

  test('refuses requests beyond the budget without calling the client', async () => {
    let calls = 0;
    const meter = meterClient(
      fixtureClient({
        generate: async () => {
          calls += 1;
          return {
            id: 'fixture',
            model: 'fixture-model',
            text: 'ok',
            tokens: { prompt: 1, completion: 1, total: 2 },
            latencyMs: 1,
          };
        },
        embed: async () => [1],
      }),
      1
    );
    await meter.client.generate({ prompt: 'a' });
    await expect(meter.client.generate({ prompt: 'b' })).rejects.toThrow('budget');
    await expect(meter.client.embed?.('c')).rejects.toThrow('budget');
    expect(calls).toBe(1);
    expect(meter.budgetStopped()).toBe(true);
    expect(meter.usage()).toEqual({ requests: 1, tokens: 2 });
  });

  test('does not expose an unmetered streaming path', () => {
    const meter = meterClient(
      fixtureClient({
        stream: async function* () {
          yield 'x';
        },
      }),
      1
    );
    expect(meter.client.stream).toBeUndefined();
  });
});
