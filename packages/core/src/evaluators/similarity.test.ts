/**
 * Tests for semantic similarity evaluator
 */

import { describe, expect, test } from 'bun:test';
import { SimilarityEvaluator } from './similarity';
import type { EvaluatorContext } from './types';

describe('SimilarityEvaluator', () => {
  const evaluator = new SimilarityEvaluator();

  test('has correct type', () => {
    expect(evaluator.type).toBe('similarity');
  });

  test('throws on invalid expected type', async () => {
    await expect(
      evaluator.evaluate('response', { type: 'exact', value: 'test' } as any)
    ).rejects.toThrow('Invalid expected type');
  });

  test('fails when no client is provided', async () => {
    const result = await evaluator.evaluate('The capital of France is Paris', {
      type: 'similarity',
      value: 'Paris is the capital of France',
      threshold: 0.75,
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('requires a ModelClient');
    expect(result.details?.method).toBe('unavailable');
  });

  test('uses embedding-based similarity when embed is available', async () => {
    // Mock client with embedding support
    const mockContext: EvaluatorContext = {
      client: {
        provider: 'mock',
        embed: async (text: string) => {
          // Simulate semantic embeddings where similar texts have similar vectors
          if (text.toLowerCase().includes('paris') && text.toLowerCase().includes('france')) {
            return [0.9, 0.3, 0.1, 0.4];
          }
          if (text.toLowerCase().includes('paris') || text.toLowerCase().includes('france')) {
            return [0.85, 0.35, 0.15, 0.38];
          }
          return [0.1, 0.8, 0.5, 0.2];
        },
        generate: async () => ({
          id: '',
          model: '',
          text: '',
          tokens: { prompt: 0, completion: 0, total: 0 },
          latencyMs: 0,
        }),
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 4096,
        }),
      },
    };

    const result = await evaluator.evaluate(
      'The capital of France is Paris',
      {
        type: 'similarity',
        value: 'Paris is the capital city of France',
        threshold: 0.75,
      },
      mockContext
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0.75);
    expect(result.details?.method).toBe('embedding');
    expect(result.reason).toContain('embedding');
  });

  test('uses high threshold correctly', async () => {
    const mockContext: EvaluatorContext = {
      client: {
        provider: 'mock',
        embed: async (text: string) => {
          // Return dissimilar vectors for different texts
          if (text.includes('capital')) {
            return [1.0, 0.0, 0.0, 0.0];
          }
          return [0.0, 1.0, 0.0, 0.0]; // Orthogonal vector = 0 similarity
        },
        generate: async () => ({
          id: '',
          model: '',
          text: '',
          tokens: { prompt: 0, completion: 0, total: 0 },
          latencyMs: 0,
        }),
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 4096,
        }),
      },
    };

    const result = await evaluator.evaluate(
      'Some text about weather',
      {
        type: 'similarity',
        value: 'Related text about capitals',
        threshold: 0.5, // Even moderate threshold should fail
      },
      mockContext
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(0.5);
  });

  test('falls back to LLM when embedding fails', async () => {
    const mockContext: EvaluatorContext = {
      client: {
        provider: 'mock',
        embed: async () => {
          throw new Error('Embedding model not available');
        },
        generate: async () => ({
          id: 'test',
          model: 'mock',
          text: '{"score": 0.85, "reason": "Both texts describe Paris as the capital of France"}',
          tokens: { prompt: 100, completion: 20, total: 120 },
          latencyMs: 100,
        }),
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 4096,
        }),
      },
    };

    const result = await evaluator.evaluate(
      'The capital of France is Paris',
      {
        type: 'similarity',
        value: 'Paris is the capital city of France',
        threshold: 0.75,
      },
      mockContext
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.85);
    expect(result.details?.method).toBe('llm');
    expect(result.reason).toContain('LLM');
  });

  test('uses LLM when embed is not available', async () => {
    const mockContext: EvaluatorContext = {
      client: {
        provider: 'mock',
        // No embed method
        generate: async () => ({
          id: 'test',
          model: 'mock',
          text: '{"score": 0.92, "reason": "Semantically equivalent statements"}',
          tokens: { prompt: 100, completion: 20, total: 120 },
          latencyMs: 100,
        }),
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 4096,
        }),
      },
    };

    const result = await evaluator.evaluate(
      'The weather is nice today',
      {
        type: 'similarity',
        value: "It's a beautiful day outside",
        threshold: 0.8,
      },
      mockContext
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.92);
    expect(result.details?.method).toBe('llm');
  });

  test('handles invalid LLM response gracefully', async () => {
    const mockContext: EvaluatorContext = {
      client: {
        provider: 'mock',
        generate: async () => ({
          id: 'test',
          model: 'mock',
          text: 'This is not valid JSON',
          tokens: { prompt: 100, completion: 20, total: 120 },
          latencyMs: 100,
        }),
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 4096,
        }),
      },
    };

    const result = await evaluator.evaluate(
      'Some text',
      {
        type: 'similarity',
        value: 'Some other text',
        threshold: 0.75,
      },
      mockContext
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details?.method).toBe('failed');
  });

  test('clamps score to 0-1 range', async () => {
    const mockContext: EvaluatorContext = {
      client: {
        provider: 'mock',
        generate: async () => ({
          id: 'test',
          model: 'mock',
          text: '{"score": 1.5, "reason": "Invalid score"}', // Score > 1
          tokens: { prompt: 100, completion: 20, total: 120 },
          latencyMs: 100,
        }),
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 4096,
        }),
      },
    };

    const result = await evaluator.evaluate(
      'Text',
      {
        type: 'similarity',
        value: 'Text',
        threshold: 0.5,
      },
      mockContext
    );

    expect(result.score).toBe(1); // Clamped to 1
  });

  test('uses default threshold of 0.75', async () => {
    const mockContext: EvaluatorContext = {
      client: {
        provider: 'mock',
        generate: async () => ({
          id: 'test',
          model: 'mock',
          text: '{"score": 0.74, "reason": "Just below threshold"}',
          tokens: { prompt: 100, completion: 20, total: 120 },
          latencyMs: 100,
        }),
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 4096,
        }),
      },
    };

    const result = await evaluator.evaluate(
      'Text A',
      {
        type: 'similarity',
        value: 'Text B',
        // No threshold specified, should use default 0.75
      } as any,
      mockContext
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.74);
  });

  test('extracts JSON from LLM response with surrounding text', async () => {
    const mockContext: EvaluatorContext = {
      client: {
        provider: 'mock',
        generate: async () => ({
          id: 'test',
          model: 'mock',
          text: 'Here is my analysis:\n\n{"score": 0.88, "reason": "Very similar meaning"}\n\nHope this helps!',
          tokens: { prompt: 100, completion: 50, total: 150 },
          latencyMs: 100,
        }),
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 4096,
        }),
      },
    };

    const result = await evaluator.evaluate(
      'Hello world',
      {
        type: 'similarity',
        value: 'Hello, world!',
        threshold: 0.8,
      },
      mockContext
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBe(0.88);
  });
});
