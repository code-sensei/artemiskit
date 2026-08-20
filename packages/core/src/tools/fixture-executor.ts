import type { ToolCall, ToolDefinition } from '../adapters/types';
import { validateToolArguments } from './schema-validator';
import type {
  FixtureExecutorOptions,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolFixture,
  ToolFixtures,
} from './types';

const DISALLOWED_FIXTURE_FIELDS = new Set(['command', 'url', 'path', 'code', 'environment', 'env']);

export class FixtureToolExecutor {
  private readonly tools = new Map<string, ToolDefinition>();
  private readonly fixtures: ToolFixtures;
  private readonly maxToolResultBytes: number;

  constructor({ tools, fixtures, maxToolResultBytes = 32_768 }: FixtureExecutorOptions) {
    for (const tool of tools) this.tools.set(tool.function.name, tool);
    for (const [name, entries] of Object.entries(fixtures)) {
      if (!this.tools.has(name)) {
        throw new Error(`TOOL_UNKNOWN: fixture declared for undeclared tool '${name}'`);
      }
      entries.forEach(assertSafeFixture);
    }
    this.fixtures = fixtures;
    this.maxToolResultBytes = maxToolResultBytes;
  }

  async execute(call: ToolCall, _context?: ToolExecutionContext): Promise<ToolExecutionResult> {
    const tool = this.tools.get(call.function.name);
    if (!tool) {
      return error('TOOL_UNKNOWN', `Tool '${call.function.name}' is not declared.`);
    }

    const validated = validateToolArguments(call.function.arguments, tool.function.parameters);
    if (!validated.valid) return { status: 'error', error: validated.error };

    const fixture = this.fixtures[call.function.name]?.find((candidate) =>
      matches(candidate.when, validated.arguments ?? {})
    );
    if (!fixture) {
      return error('TOOL_FIXTURE_NOT_FOUND', `No fixture matched tool '${call.function.name}'.`);
    }
    if (fixture.error) return error('TOOL_EXECUTION_FAILED', fixture.error);

    const serialized = JSON.stringify(fixture.result ?? {});
    if (
      serialized === undefined ||
      new TextEncoder().encode(serialized).byteLength > this.maxToolResultBytes
    ) {
      return error(
        'TOOL_RESULT_TOO_LARGE',
        `Tool '${call.function.name}' result exceeds the configured limit.`
      );
    }
    return { status: 'success', result: fixture.result ?? {} };
  }
}

function error(
  code: NonNullable<ToolExecutionResult['error']>['code'],
  message: string
): ToolExecutionResult {
  return { status: 'error', error: { code, message } };
}

function matches(
  when: Record<string, unknown> | undefined,
  args: Record<string, unknown>
): boolean {
  return !when || Object.entries(when).every(([key, value]) => deepEqual(args[key], value));
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(rightRecord);
  return (
    keys.length === Object.keys(leftRecord).length &&
    keys.every((key) => deepEqual(leftRecord[key], rightRecord[key]))
  );
}

function assertSafeFixture(fixture: ToolFixture): void {
  assertSafeValue(fixture.when);
  assertSafeValue(fixture.result);
}

function assertSafeValue(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(assertSafeValue);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (DISALLOWED_FIXTURE_FIELDS.has(key.toLowerCase())) {
      throw new Error(`TOOL_FIXTURE_UNSAFE: '${key}' is not permitted in fixture data.`);
    }
    assertSafeValue(child);
  }
}
