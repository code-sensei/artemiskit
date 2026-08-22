/**
 * JSON Schema evaluator - validates response against a JSON schema
 */

import Ajv, { type ValidateFunction } from 'ajv';
import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorResult } from './types';

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new WeakMap<object, ValidateFunction>();

function getValidator(schema: Record<string, unknown>): ValidateFunction {
  const cached = validators.get(schema);
  if (cached) return cached;

  const validator = ajv.compile(schema);
  validators.set(schema, validator);
  return validator;
}

export class JsonSchemaEvaluator implements Evaluator {
  readonly type = 'json_schema';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'json_schema') {
      throw new Error('Invalid expected type for JsonSchemaEvaluator');
    }

    let validator: ValidateFunction;
    try {
      validator = getValidator(expected.schema);
    } catch {
      return {
        passed: false,
        score: 0,
        reason: 'Invalid JSON schema',
        details: { error: 'Invalid JSON schema' },
      };
    }

    let parsed: unknown;
    try {
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();
      parsed = JSON.parse(jsonStr);
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Failed to parse JSON: ${(error as Error).message}`,
        details: { parseError: (error as Error).message },
      };
    }

    if (validator(parsed)) {
      return {
        passed: true,
        score: 1,
        reason: 'Response matches JSON schema',
        details: { parsed },
      };
    }

    const errors = (validator.errors ?? []).map(
      (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`
    );
    return {
      passed: false,
      score: 0,
      reason: `Schema validation failed: ${errors.join('; ')}`,
      details: { parsed, errors },
    };
  }
}
