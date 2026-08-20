import Ajv, { type ValidateFunction } from 'ajv';

export interface ToolArgumentValidation {
  valid: boolean;
  arguments?: Record<string, unknown>;
  error?: { code: 'TOOL_ARGUMENTS_INVALID' | 'TOOL_ARGUMENTS_SCHEMA_INVALID'; message: string };
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new WeakMap<object, ValidateFunction>();

function getValidator(schema: Record<string, unknown>): ValidateFunction {
  const cached = validators.get(schema);
  if (cached) return cached;
  const validator = ajv.compile(schema);
  validators.set(schema, validator);
  return validator;
}

export function validateToolArguments(
  rawArguments: string,
  schema: Record<string, unknown>
): ToolArgumentValidation {
  let args: unknown;
  try {
    args = JSON.parse(rawArguments);
  } catch {
    return {
      valid: false,
      error: { code: 'TOOL_ARGUMENTS_INVALID', message: 'Tool arguments must be valid JSON.' },
    };
  }

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {
      valid: false,
      error: { code: 'TOOL_ARGUMENTS_INVALID', message: 'Tool arguments must be a JSON object.' },
    };
  }

  const validator = getValidator(schema);
  if (!validator(args)) {
    const details = (validator.errors ?? [])
      .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
      .join('; ');
    return {
      valid: false,
      error: {
        code: 'TOOL_ARGUMENTS_SCHEMA_INVALID',
        message: `Tool arguments do not match the schema: ${details}`,
      },
    };
  }

  return { valid: true, arguments: args as Record<string, unknown> };
}
