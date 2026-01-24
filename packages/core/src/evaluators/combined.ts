/**
 * Combined evaluator - evaluates multiple expectations with and/or logic
 */

import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorContext, EvaluatorResult } from './types';

/**
 * Get an evaluator by type (imported dynamically to avoid circular deps)
 */
async function getEvaluatorForType(type: string): Promise<Evaluator> {
  // Dynamic import to avoid circular dependency with index.ts
  const { getEvaluator } = await import('./index.js');
  return getEvaluator(type);
}

export class CombinedEvaluator implements Evaluator {
  readonly type = 'combined';

  async evaluate(
    response: string,
    expected: Expected,
    context?: EvaluatorContext
  ): Promise<EvaluatorResult> {
    if (expected.type !== 'combined') {
      throw new Error('Invalid expected type for CombinedEvaluator');
    }

    const { operator, expectations } = expected;

    if (!expectations || expectations.length === 0) {
      return {
        passed: true,
        score: 1,
        reason: 'No expectations to evaluate',
        details: { operator, results: [] },
      };
    }

    // Evaluate all sub-expectations
    const results: Array<{
      type: string;
      passed: boolean;
      score: number;
      reason?: string;
    }> = [];

    for (const subExpected of expectations) {
      const evaluator = await getEvaluatorForType(subExpected.type);
      const result = await evaluator.evaluate(response, subExpected, context);
      results.push({
        type: subExpected.type,
        passed: result.passed,
        score: result.score,
        reason: result.reason,
      });
    }

    // Calculate combined result based on operator
    let passed: boolean;
    let score: number;
    let reason: string;

    if (operator === 'and') {
      // AND: all must pass
      passed = results.every((r) => r.passed);
      score = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      const passedCount = results.filter((r) => r.passed).length;
      reason = passed
        ? `All ${results.length} expectations passed`
        : `${passedCount}/${results.length} expectations passed (all required)`;
    } else {
      // OR: at least one must pass
      passed = results.some((r) => r.passed);
      // For OR, take the max score
      score = Math.max(...results.map((r) => r.score));
      const passedCount = results.filter((r) => r.passed).length;
      reason = passed
        ? `${passedCount}/${results.length} expectations passed (at least one required)`
        : `No expectations passed (at least one required)`;
    }

    return {
      passed,
      score,
      reason,
      details: {
        operator,
        results,
        passedCount: results.filter((r) => r.passed).length,
        totalCount: results.length,
      },
    };
  }
}
