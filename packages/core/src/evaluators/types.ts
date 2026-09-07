/**
 * Evaluator types and interfaces
 */

import type { ModelClient } from '../adapters/types';
import type { Expected, TestCase } from '../scenario/schema';
import type { ToolTraceEntry } from '../tools';

/**
 * Context provided to evaluators
 */
export interface EvaluatorContext {
  client?: ModelClient;
  testCase?: TestCase;
  toolTrace?: ToolTraceEntry[];
}

/**
 * Result from an evaluation
 */
export interface EvaluatorResult {
  passed: boolean;
  score: number;
  reason?: string;
  /**
   * Whether this evaluator produced a valid measurement. Omitted by legacy
   * evaluators; the executor derives it from `passed` for compatibility.
   */
  status?: 'passed' | 'failed' | 'invalid';
  /** Bounded evaluator metadata that may be retained in a run artifact. */
  evidence?: {
    threshold?: number;
    model?: string;
    validation?: {
      status: 'valid' | 'invalid';
      code?: string;
    };
  };
  /**
   * Legacy evaluator-private metadata. The standard executor never serializes
   * this field; use `evidence` for reviewed, bounded artifact data.
   */
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
