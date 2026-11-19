import { describe, expect, test } from 'bun:test';
import type { GenerateOptions, ModelClient } from '../adapters/types';
import { ScenarioSchema } from '../scenario/schema';
import { readGenerationSettings, toGenerationOverrides } from './generation';
import { runScenario } from './runner';

describe('readGenerationSettings', () => {
  test('accepts every key at its range limits', () => {
    const { settings, issues } = readGenerationSettings({
      temperature: 2,
      top_p: 0,
      top_k: 1,
      min_p: 1,
      presence_penalty: -2,
      max_output_tokens: 131072,
      base_url: 'http://127.0.0.1:11434/v1',
    });
    expect(issues).toEqual([]);
    expect(settings).toEqual({
      temperature: 2,
      top_p: 0,
      top_k: 1,
      min_p: 1,
      presence_penalty: -2,
      max_output_tokens: 131072,
    });
  });

  test.each([
    ['temperature', 2.1, 'a number from 0 to 2'],
    ['temperature', '0.7', 'a number from 0 to 2'],
    ['top_p', 1.01, 'a number from 0 to 1'],
    ['top_k', 0, 'an integer of at least 1'],
    ['top_k', 2.5, 'an integer of at least 1'],
    ['min_p', -0.1, 'a number from 0 to 1'],
    ['presence_penalty', 2.5, 'a number from -2 to 2'],
    ['max_output_tokens', 0, 'an integer from 1 to 131072'],
    ['max_output_tokens', 131073, 'an integer from 1 to 131072'],
    ['max_output_tokens', 1024.5, 'an integer from 1 to 131072'],
  ])('rejects %s = %p', (key, value, range) => {
    const { settings, issues } = readGenerationSettings({ [key]: value });
    expect(settings).toEqual({});
    expect(issues).toEqual([{ key, message: `settings.${key} must be ${range}` }] as never);
  });

  test('maps declared settings onto request overrides without top_k or min_p', () => {
    expect(
      toGenerationOverrides({
        temperature: 1,
        top_p: 0.95,
        top_k: 20,
        min_p: 0,
        presence_penalty: 1.5,
        max_output_tokens: 32768,
      })
    ).toEqual({ temperature: 1, topP: 0.95, presencePenalty: 1.5, maxTokens: 32768 });
  });
});

describe('runScenario generation overrides', () => {
  function scenario(expected: Record<string, unknown>) {
    return ScenarioSchema.parse({
      name: 'generation-overrides',
      provider: 'openai',
      model: 'fixture-model',
      temperature: 0,
      maxTokens: 4096,
      seed: 7,
      cases: [{ id: 'one', prompt: 'Say ok.', expected }],
    });
  }

  function recordingClient(): { client: ModelClient; requests: GenerateOptions[] } {
    const requests: GenerateOptions[] = [];
    const client: ModelClient = {
      provider: 'openai',
      async generate(options) {
        requests.push(options);
        const grader = typeof options.prompt === 'string' && options.prompt.includes('rubric');
        return {
          id: `r${requests.length}`,
          model: 'fixture-model',
          text: grader ? '{"score": 1, "reason": "ok"}' : 'ok',
          tokens: { prompt: 1, completion: 1, total: 2 },
          latencyMs: 1,
          finishReason: 'stop',
        };
      },
      async capabilities() {
        return { streaming: false, functionCalling: false, toolUse: false, maxContext: 8192 };
      },
    };
    return { client, requests };
  }

  test('target requests carry the overrides instead of the scenario values', async () => {
    const { client, requests } = recordingClient();
    const run = await runScenario({
      scenario: scenario({ type: 'contains', values: ['ok'] }),
      client,
      resolvedConfig: { provider: 'openai', model: 'fixture-model', source: {} },
      generation: { temperature: 1, topP: 0.95, presencePenalty: 1.5, maxTokens: 32768 },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      temperature: 1,
      topP: 0.95,
      presencePenalty: 1.5,
      maxTokens: 32768,
      seed: 7,
    });
    expect(run.manifest.config.temperature).toBe(1);
    expect(run.manifest.execution_provenance?.target.generation).toEqual({
      temperature: 1,
      max_tokens: 32768,
      seed: 7,
    });
  });

  test('without overrides the scenario values are sent and nothing else is added', async () => {
    const { client, requests } = recordingClient();
    await runScenario({ scenario: scenario({ type: 'contains', values: ['ok'] }), client });

    expect(requests[0]).toMatchObject({ temperature: 0, maxTokens: 4096, seed: 7 });
    expect(requests[0]).not.toHaveProperty('topP');
    expect(requests[0]).not.toHaveProperty('presencePenalty');
  });

  test('llm_grader requests keep their own settings', async () => {
    const { client, requests } = recordingClient();
    await runScenario({
      scenario: scenario({ type: 'llm_grader', rubric: 'Says ok', threshold: 0.5 }),
      client,
      generation: { temperature: 1, topP: 0.95, presencePenalty: 1.5, maxTokens: 32768 },
    });

    expect(requests).toHaveLength(2);
    const grader = requests[1];
    expect(grader.maxTokens).toBe(1000);
    expect(grader).not.toHaveProperty('temperature');
    expect(grader).not.toHaveProperty('topP');
    expect(grader).not.toHaveProperty('presencePenalty');
  });
});
