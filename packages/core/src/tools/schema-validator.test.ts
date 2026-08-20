import { describe, expect, it } from 'bun:test';
import { validateToolArguments } from './schema-validator';

const weatherSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['city'],
  properties: { city: { type: 'string', minLength: 1 } },
};

describe('validateToolArguments', () => {
  it('returns parsed arguments that satisfy the JSON schema', () => {
    expect(validateToolArguments('{"city":"Lagos"}', weatherSchema)).toEqual({
      valid: true,
      arguments: { city: 'Lagos' },
    });
  });

  it('rejects malformed JSON without echoing the arguments', () => {
    expect(validateToolArguments('{city:Lagos}', weatherSchema)).toEqual({
      valid: false,
      error: { code: 'TOOL_ARGUMENTS_INVALID', message: 'Tool arguments must be valid JSON.' },
    });
  });

  it('rejects arguments that fail the declared schema', () => {
    const result = validateToolArguments('{"city":42}', weatherSchema);

    expect(result.valid).toBe(false);
    expect(result.error?.code).toBe('TOOL_ARGUMENTS_SCHEMA_INVALID');
  });
});
