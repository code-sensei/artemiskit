/**
 * Fuzzy match evaluator using Levenshtein distance
 */

import { distance } from 'fastest-levenshtein';
import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorResult } from './types';

export class FuzzyEvaluator implements Evaluator {
  readonly type = 'fuzzy';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'fuzzy') {
      throw new Error('Invalid expected type for FuzzyEvaluator');
    }

    const normalizedResponse = response.trim().toLowerCase();
    const normalizedExpected = expected.value.trim().toLowerCase();

    const maxLen = Math.max(normalizedResponse.length, normalizedExpected.length);
    const dist = distance(normalizedResponse, normalizedExpected);
    const similarity = maxLen > 0 ? 1 - dist / maxLen : 1;

    const passed = similarity >= expected.threshold;

    return {
      passed,
      score: similarity,
      reason: `Similarity: ${(similarity * 100).toFixed(1)}% (threshold: ${(expected.threshold * 100).toFixed(1)}%)`,
      details: {
        levenshteinDistance: dist,
        similarity,
        threshold: expected.threshold,
        expected: expected.value,
        actual: response,
      },
    };
  }
}
