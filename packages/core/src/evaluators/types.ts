/**
 * Evaluator types and interfaces
 */

import type { ModelClient } from '../adapters/types';
import type { Expected, TestCase } from '../scenario/schema';

/**
 * Context provided to evaluators
 */
export interface EvaluatorContext {
  client?: ModelClient;
  testCase?: TestCase;
}

/**
 * Result from an evaluation
 */
export interface EvaluatorResult {
  passed: boolean;
  score: number;
  reason?: string;
  details?: Record<string, unknown>;
}

/**
 * Evaluator interface - implement to create custom evaluators
 */
export interface Evaluator {
  readonly type: string;

  evaluate(
    response: string,
    expected: Expected,
    context?: EvaluatorContext
  ): Promise<EvaluatorResult>;
}
