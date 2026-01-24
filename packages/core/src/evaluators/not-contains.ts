/**
 * Not Contains evaluator - checks if response does NOT contain specific values
 */

import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorResult } from './types';

export class NotContainsEvaluator implements Evaluator {
  readonly type = 'not_contains';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'not_contains') {
      throw new Error('Invalid expected type for NotContainsEvaluator');
    }

    const normalizedResponse = response.toLowerCase();
    const results = expected.values.map((value) => ({
      value,
      found: normalizedResponse.includes(value.toLowerCase()),
    }));

    const notFoundCount = results.filter((r) => !r.found).length;

    // mode: 'all' means ALL values must be absent
    // mode: 'any' means AT LEAST ONE value must be absent
    const passed =
      expected.mode === 'all' ? notFoundCount === expected.values.length : notFoundCount > 0;

    const score = expected.values.length > 0 ? notFoundCount / expected.values.length : 1;

    return {
      passed,
      score,
      reason: passed
        ? `Correctly absent: ${notFoundCount}/${expected.values.length} values (mode: ${expected.mode})`
        : `Found forbidden values (mode: ${expected.mode})`,
      details: {
        mode: expected.mode,
        results,
        notFoundCount,
        totalCount: expected.values.length,
      },
    };
  }
}
