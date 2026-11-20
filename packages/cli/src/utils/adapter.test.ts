import { describe, expect, test } from 'bun:test';
import { ArtemisConfigSchema } from '../config/schema';
import { buildAdapterConfig } from './adapter';

describe('reasoning settings reach the adapter', () => {
  test('a config-file reasoningEffort survives loading and reaches the openai adapter', () => {
    const fileConfig = ArtemisConfigSchema.parse({
      provider: 'openai',
      providers: {
        openai: { apiKey: 'test', baseUrl: 'http://127.0.0.1:1/v1', reasoningEffort: 'high' },
      },
    });
    const { adapterConfig, resolvedConfig } = buildAdapterConfig({
      provider: 'openai',
      model: 'm',
      fileConfig,
    });
    expect((adapterConfig as { reasoningEffort?: string }).reasoningEffort).toBe('high');
    expect(resolvedConfig.reasoning_effort).toBe('high');
    expect(resolvedConfig.source.reasoning_effort).toBe('config');
  });

  test('a scenario reasoningEffort overrides the config file', () => {
    const fileConfig = ArtemisConfigSchema.parse({
      providers: { openai: { reasoningEffort: 'low' } },
    });
    const { adapterConfig } = buildAdapterConfig({
      provider: 'openai',
      model: 'm',
      fileConfig,
      scenarioConfig: { reasoningEffort: 'xhigh' },
    });
    expect((adapterConfig as { reasoningEffort?: string }).reasoningEffort).toBe('xhigh');
  });

  test('no reasoning setting means none is sent or recorded', () => {
    const { adapterConfig, resolvedConfig } = buildAdapterConfig({
      provider: 'openai',
      model: 'm',
    });
    expect('reasoningEffort' in adapterConfig).toBe(false);
    expect(resolvedConfig.reasoning_effort).toBeUndefined();
  });

  test('an unknown reasoning effort is rejected when the config loads', () => {
    expect(() =>
      ArtemisConfigSchema.parse({ providers: { openai: { reasoningEffort: 'maximum' } } })
    ).toThrow();
  });

  test('a config-file Ling thinking switch survives loading and reaches the ling adapter', () => {
    const fileConfig = ArtemisConfigSchema.parse({
      providers: { ling: { apiKey: 'test', thinking: { type: 'disabled' } } },
    });
    const { adapterConfig } = buildAdapterConfig({
      provider: 'ling',
      model: 'Ling-3.2-flash',
      fileConfig,
    });
    expect((adapterConfig as { thinking?: { type: string } }).thinking).toEqual({
      type: 'disabled',
    });
  });

  test('a scenario Ling thinking switch overrides the config file', () => {
    const fileConfig = ArtemisConfigSchema.parse({
      providers: { ling: { thinking: { type: 'disabled' } } },
    });
    const { adapterConfig } = buildAdapterConfig({
      provider: 'ling',
      model: 'Ling-3.2-flash',
      fileConfig,
      scenarioConfig: { thinking: { type: 'enabled' } },
    });
    expect((adapterConfig as { thinking?: { type: string } }).thinking).toEqual({
      type: 'enabled',
    });
  });
});
