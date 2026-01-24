/**
 * Evaluators module - exports all evaluator types and utilities
 */

import { ContainsEvaluator } from './contains';
import { ExactEvaluator } from './exact';
import { FuzzyEvaluator } from './fuzzy';
import { JsonSchemaEvaluator } from './json-schema';
import { LLMGraderEvaluator } from './llm-grader';
import { NotContainsEvaluator } from './not-contains';
import { RegexEvaluator } from './regex';
import type { Evaluator } from './types';

const evaluators = new Map<string, Evaluator>();
evaluators.set('exact', new ExactEvaluator());
evaluators.set('regex', new RegexEvaluator());
evaluators.set('fuzzy', new FuzzyEvaluator());
evaluators.set('contains', new ContainsEvaluator());
evaluators.set('not_contains', new NotContainsEvaluator());
evaluators.set('json_schema', new JsonSchemaEvaluator());
evaluators.set('llm_grader', new LLMGraderEvaluator());

/**
 * Get an evaluator by type
 */
export function getEvaluator(type: string): Evaluator {
  const evaluator = evaluators.get(type);
  if (!evaluator) {
    const available = Array.from(evaluators.keys()).join(', ');
    throw new Error(`Unknown evaluator type: ${type}. Available: ${available}`);
  }
  return evaluator;
}

/**
 * Register a custom evaluator
 */
export function registerEvaluator(type: string, evaluator: Evaluator): void {
  evaluators.set(type, evaluator);
}

/**
 * List available evaluator types
 */
export function listEvaluators(): string[] {
  return Array.from(evaluators.keys());
}

export * from './types';
export { ExactEvaluator } from './exact';
export { RegexEvaluator } from './regex';
export { FuzzyEvaluator } from './fuzzy';
export { ContainsEvaluator } from './contains';
export { NotContainsEvaluator } from './not-contains';
export { JsonSchemaEvaluator } from './json-schema';
export { LLMGraderEvaluator } from './llm-grader';
