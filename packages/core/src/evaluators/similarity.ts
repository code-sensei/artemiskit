/**
 * Semantic similarity evaluator
 * Uses vector embeddings for semantic similarity matching when available,
 * falls back to LLM-based semantic comparison otherwise.
 */

import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorContext, EvaluatorResult } from './types';

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vector dimensions must match');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Normalize similarity score to 0-1 range
 * Cosine similarity can be -1 to 1, we map it to 0 to 1
 */
function normalizeSimilarity(similarity: number): number {
  return (similarity + 1) / 2;
}

const LLM_SIMILARITY_PROMPT = `You are a semantic similarity evaluator. Compare the semantic meaning of two texts and rate their similarity.

Text A (Reference):
"""
{{expected}}
"""

Text B (Response):
"""
{{response}}
"""

Rate the semantic similarity between these texts on a scale from 0.0 to 1.0:
- 1.0: Identical meaning, same information conveyed
- 0.8-0.9: Very similar meaning, minor differences in phrasing
- 0.6-0.7: Similar topic and general meaning, some differences in detail
- 0.4-0.5: Related topics but different focus or conclusions
- 0.2-0.3: Loosely related, different meanings
- 0.0-0.1: Completely unrelated or contradictory

Respond with ONLY a JSON object in this exact format:
{"score": <number between 0 and 1>, "reason": "<brief 1-sentence explanation>"}`;

export class SimilarityEvaluator implements Evaluator {
  readonly type = 'similarity';

  async evaluate(
    response: string,
    expected: Expected,
    context?: EvaluatorContext
  ): Promise<EvaluatorResult> {
    if (expected.type !== 'similarity') {
      throw new Error('Invalid expected type for SimilarityEvaluator');
    }

    const threshold = expected.threshold ?? 0.75;
    const expectedValue = expected.value;
    const mode = expected.mode; // 'embedding' | 'llm' | undefined (auto)

    // If mode is explicitly 'llm', skip embedding and go straight to LLM
    if (mode === 'llm') {
      return this.evaluateWithLLM(response, expectedValue, expected.model, threshold, context);
    }

    // If mode is 'embedding' or auto (undefined), try embedding first
    if (mode === 'embedding' || mode === undefined) {
      // Check if embedding is available
      if (context?.client?.embed) {
        try {
          const embeddingModel = expected.embeddingModel;
          const [responseEmbedding, expectedEmbedding] = await Promise.all([
            context.client.embed(response, embeddingModel),
            context.client.embed(expectedValue, embeddingModel),
          ]);

          const rawSimilarity = cosineSimilarity(responseEmbedding, expectedEmbedding);
          // For semantic embeddings, cosine similarity is typically 0-1 for similar texts
          // We use raw similarity directly if positive, otherwise normalize
          const similarity =
            rawSimilarity >= 0 ? rawSimilarity : normalizeSimilarity(rawSimilarity);
          const passed = similarity >= threshold;

          return {
            passed,
            score: similarity,
            reason: `Semantic similarity (embedding${embeddingModel ? `: ${embeddingModel}` : ''}): ${(similarity * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(1)}%)`,
            details: {
              method: 'embedding',
              embeddingModel: embeddingModel || 'default',
              similarity,
              threshold,
              expected: expectedValue.slice(0, 200),
              actual: response.slice(0, 200),
            },
          };
        } catch (error) {
          // If mode is explicitly 'embedding', fail instead of falling back
          if (mode === 'embedding') {
            return {
              passed: false,
              score: 0,
              reason: `Embedding evaluation failed: ${(error as Error).message}`,
              details: {
                error: (error as Error).message,
                method: 'embedding',
                embeddingModel: expected.embeddingModel || 'default',
              },
            };
          }
          // Auto mode: fall through to LLM-based evaluation
          console.warn(`Embedding failed, falling back to LLM: ${(error as Error).message}`);
        }
      } else if (mode === 'embedding') {
        // Explicitly requested embedding mode but no embed function available
        return {
          passed: false,
          score: 0,
          reason:
            'Embedding mode requested but no embedding function available. Ensure the provider supports embeddings.',
          details: {
            error: 'No embed function available on client',
            method: 'embedding',
            embeddingModel: expected.embeddingModel || 'not-configured',
          },
        };
      }
    }

    // Fall back to LLM-based semantic comparison (auto mode only reaches here if embedding failed/unavailable)
    return this.evaluateWithLLM(response, expectedValue, expected.model, threshold, context);
  }

  /**
   * Evaluate similarity using LLM-based comparison
   */
  private async evaluateWithLLM(
    response: string,
    expectedValue: string,
    model: string | undefined,
    threshold: number,
    context?: EvaluatorContext
  ): Promise<EvaluatorResult> {
    if (!context?.client) {
      return {
        passed: false,
        score: 0,
        reason: 'Similarity evaluation requires a ModelClient (for embeddings or LLM comparison)',
        details: {
          error: 'No ModelClient provided in context',
          method: 'unavailable',
        },
      };
    }

    try {
      const prompt = LLM_SIMILARITY_PROMPT.replace('{{expected}}', expectedValue).replace(
        '{{response}}',
        response
      );

      const result = await context.client.generate({
        prompt,
        model,
        temperature: 0,
        maxTokens: 150,
      });

      // Parse JSON response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid LLM response format');
      }

      const parsed = JSON.parse(jsonMatch[0]) as { score: number; reason: string };
      const similarity = Math.max(0, Math.min(1, parsed.score));
      const passed = similarity >= threshold;

      return {
        passed,
        score: similarity,
        reason: `Semantic similarity (LLM${model ? `: ${model}` : ''}): ${(similarity * 100).toFixed(1)}% - ${parsed.reason}`,
        details: {
          method: 'llm',
          model: model || 'default',
          similarity,
          threshold,
          expected: expectedValue.slice(0, 200),
          actual: response.slice(0, 200),
          llmReason: parsed.reason,
        },
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Similarity evaluation failed: ${(error as Error).message}`,
        details: {
          error: (error as Error).message,
          method: 'failed',
        },
      };
    }
  }
}
