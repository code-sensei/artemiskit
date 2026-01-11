/**
 * JSON Schema evaluator - validates response against a JSON schema
 */

import { z } from 'zod';
import type { Evaluator, EvaluatorResult } from './types';
import type { Expected } from '../scenario/schema';

export class JsonSchemaEvaluator implements Evaluator {
  readonly type = 'json_schema';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'json_schema') {
      throw new Error('Invalid expected type for JsonSchemaEvaluator');
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

    try {
      const zodSchema = this.jsonSchemaToZod(expected.schema);
      const result = zodSchema.safeParse(parsed);

      if (result.success) {
        return {
          passed: true,
          score: 1,
          reason: 'Response matches JSON schema',
          details: { parsed },
        };
      } else {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
        return {
          passed: false,
          score: 0,
          reason: `Schema validation failed: ${issues.join(', ')}`,
          details: {
            parsed,
            errors: issues,
          },
        };
      }
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Schema error: ${(error as Error).message}`,
        details: { error: (error as Error).message },
      };
    }
  }

  private jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
    const type = schema.type as string;

    switch (type) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'integer':
        return z.number().int();
      case 'boolean':
        return z.boolean();
      case 'null':
        return z.null();
      case 'array':
        if (schema.items) {
          return z.array(this.jsonSchemaToZod(schema.items as Record<string, unknown>));
        }
        return z.array(z.unknown());
      case 'object':
        if (schema.properties) {
          const shape: Record<string, z.ZodTypeAny> = {};
          const required = (schema.required as string[]) || [];

          for (const [key, value] of Object.entries(
            schema.properties as Record<string, unknown>
          )) {
            const fieldSchema = this.jsonSchemaToZod(value as Record<string, unknown>);
            shape[key] = required.includes(key) ? fieldSchema : fieldSchema.optional();
          }
          return z.object(shape);
        }
        return z.record(z.unknown());
      default:
        return z.unknown();
    }
  }
}
