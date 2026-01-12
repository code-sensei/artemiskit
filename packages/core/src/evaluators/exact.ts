/**
 * Exact match evaluator
 */

import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorResult } from './types';

export class ExactEvaluator implements Evaluator {
  readonly type = 'exact';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'exact') {
      throw new Error('Invalid expected type for ExactEvaluator');
    }

    const normalize = (s: string) => (expected.caseSensitive ? s.trim() : s.trim().toLowerCase());

    const passed = normalize(response) === normalize(expected.value);

    return {
      passed,
      score: passed ? 1 : 0,
      reason: passed
        ? 'Exact match'
        : `Expected "${expected.value}", got "${response.slice(0, 100)}${response.length > 100 ? '...' : ''}"`,
      details: {
        expected: expected.value,
        actual: response,
        caseSensitive: expected.caseSensitive,
      },
    };
  }
}
