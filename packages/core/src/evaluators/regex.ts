/**
 * Regex pattern evaluator
 */

import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorResult } from './types';

export class RegexEvaluator implements Evaluator {
  readonly type = 'regex';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'regex') {
      throw new Error('Invalid expected type for RegexEvaluator');
    }

    try {
      const regex = new RegExp(expected.pattern, expected.flags);
      const match = regex.exec(response);
      const passed = match !== null;

      return {
        passed,
        score: passed ? 1 : 0,
        reason: passed
          ? `Matched pattern: ${expected.pattern}`
          : `Did not match pattern: ${expected.pattern}`,
        details: {
          pattern: expected.pattern,
          flags: expected.flags,
          match: match ? match[0] : null,
          groups: match ? match.groups : null,
        },
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Invalid regex pattern: ${(error as Error).message}`,
        details: { error: (error as Error).message },
      };
    }
  }
}
