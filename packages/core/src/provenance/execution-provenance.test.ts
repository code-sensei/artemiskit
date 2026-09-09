import { describe, expect, test } from 'bun:test';
import { createExecutionProvenance } from './execution-provenance';

describe('createExecutionProvenance', () => {
  test('keeps requested, observed target, and evaluator model identities separate', () => {
    const provenance = createExecutionProvenance({
      provider: 'openai',
      requestedModel: 'gpt-requested',
      temperature: 0.2,
      maxTokens: 100,
      seed: 7,
      cases: [
        {
          id: 'one',
          ok: true,
          score: 1,
          matcherType: 'exact',
          latencyMs: 1,
          tokens: { prompt: 1, completion: 1, total: 2 },
          prompt: 'prompt',
          response: 'response',
          expected: { type: 'exact', value: 'response', caseSensitive: true },
          tags: [],
          target: {
            provider: 'openai',
            requested_model: 'gpt-requested',
            observed_models: ['gpt-observed'],
          },
          evidence: { evaluator: 'llm_grader', model: 'judge-model' },
        },
      ],
    });

    expect(provenance).toEqual({
      schema_version: '1',
      target: {
        provider: 'openai',
        requested_models: ['gpt-requested'],
        observed_models: ['gpt-observed'],
        generation: { temperature: 0.2, max_tokens: 100, seed: 7 },
      },
      evaluator: { models: ['judge-model'] },
    });
  });

  test('records an unavailable observed identity without inventing one', () => {
    const provenance = createExecutionProvenance({
      provider: 'custom',
      requestedModel: 'requested-model',
      cases: [],
    });

    expect(provenance.target).toEqual({
      provider: 'custom',
      requested_models: ['requested-model'],
    });
    expect(provenance.evaluator).toBeUndefined();
  });
});
