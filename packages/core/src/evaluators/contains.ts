/**
 * Contains evaluator - checks if response contains specific values
 */

import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorResult } from './types';

export class ContainsEvaluator implements Evaluator {
  readonly type = 'contains';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'contains') {
      throw new Error('Invalid expected type for ContainsEvaluator');
    }

    const normalizedResponse = response.toLowerCase();
    const results = expected.values.map((value) => ({
      value,
      found: normalizedResponse.includes(value.toLowerCase()),
    }));

    const foundCount = results.filter((r) => r.found).length;
    const passed = expected.mode === 'all' ? foundCount === expected.values.length : foundCount > 0;

    const score = expected.values.length > 0 ? foundCount / expected.values.length : 1;

    return {
      passed,
      score,
      reason: passed
        ? `Found ${foundCount}/${expected.values.length} values (mode: ${expected.mode})`
        : `Missing required values (mode: ${expected.mode})`,
      details: {
        mode: expected.mode,
        results,
        foundCount,
        totalCount: expected.values.length,
      },
    };
  }
}
