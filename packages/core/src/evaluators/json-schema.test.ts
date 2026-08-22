import { describe, expect, it } from 'bun:test';
import type { Expected } from '../scenario/schema';
import { JsonSchemaEvaluator } from './json-schema';

const expected: Expected = {
  type: 'json_schema',
  schema: {
    type: 'object',
    required: ['profile', 'status', 'version'],
    additionalProperties: false,
    properties: {
      profile: {
        type: 'object',
        required: ['roles'],
        additionalProperties: false,
        properties: {
          roles: {
            type: 'array',
            items: { type: 'string', enum: ['admin', 'member'] },
          },
        },
      },
      status: { enum: ['active', 'disabled'] },
      version: { const: 'v1' },
    },
  },
};

describe('JsonSchemaEvaluator', () => {
  const evaluator = new JsonSchemaEvaluator();

  it('accepts a response matching a nested JSON schema', async () => {
    const result = await evaluator.evaluate(
      JSON.stringify({ profile: { roles: ['admin'] }, status: 'active', version: 'v1' }),
      expected
    );

    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it('rejects a missing nested required property', async () => {
    const result = await evaluator.evaluate(
      JSON.stringify({ profile: {}, status: 'active', version: 'v1' }),
      expected
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('rejects values outside enum constraints', async () => {
    const result = await evaluator.evaluate(
      JSON.stringify({ profile: { roles: ['owner'] }, status: 'pending', version: 'v1' }),
      expected
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('allowed values');
  });

  it('rejects values that violate const constraints', async () => {
    const result = await evaluator.evaluate(
      JSON.stringify({ profile: { roles: ['member'] }, status: 'active', version: 'v2' }),
      expected
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('constant');
  });

  it('rejects additional properties in closed objects', async () => {
    const result = await evaluator.evaluate(
      JSON.stringify({
        profile: { roles: ['admin'], internal: true },
        status: 'active',
        version: 'v1',
      }),
      expected
    );

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('additional properties');
  });

  it('reports invalid schemas without exposing response content', async () => {
    const sensitiveResponse = 'sensitive-response-value';
    const result = await evaluator.evaluate(sensitiveResponse, {
      type: 'json_schema',
      schema: { type: 'not-a-json-schema-type' },
    });

    expect(result).toEqual({
      passed: false,
      score: 0,
      reason: 'Invalid JSON schema',
      details: { error: 'Invalid JSON schema' },
    });
    expect(JSON.stringify(result)).not.toContain('sensitive-response-value');
  });
});
