import type { ToolCall, ToolDefinition } from '../adapters/types';

export type ToolLoopTerminationReason =
  | 'completed'
  | 'max_steps'
  | 'timeout'
  | 'duplicate_call'
  | 'invalid_arguments'
  | 'unknown_tool'
  | 'tool_error';

export interface ToolLoopPolicy {
  enabled: boolean;
  maxSteps: number;
  timeoutMs: number;
  maxToolResultBytes: number;
  rejectDuplicateCalls: boolean;
}

export const DEFAULT_TOOL_LOOP_POLICY: ToolLoopPolicy = {
  enabled: false,
  maxSteps: 5,
  timeoutMs: 60_000,
  maxToolResultBytes: 32_768,
  rejectDuplicateCalls: true,
};

export interface ToolExecutionContext {
  caseId: string;
  step: number;
}

export interface ToolExecutionError {
  code:
    | 'TOOL_ARGUMENTS_INVALID'
    | 'TOOL_ARGUMENTS_SCHEMA_INVALID'
    | 'TOOL_UNKNOWN'
    | 'TOOL_FIXTURE_NOT_FOUND'
    | 'TOOL_EXECUTION_FAILED'
    | 'TOOL_RESULT_TOO_LARGE';
  message: string;
}

export interface ToolExecutionResult {
  status: 'success' | 'error';
  result?: unknown;
  error?: ToolExecutionError;
}

export interface ToolExecutor {
  execute(call: ToolCall, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}

export interface ToolTraceEntry {
  step: number;
  toolCall: ToolCall;
  result?: unknown;
  error?: ToolExecutionError;
  latencyMs: number;
}

export interface ToolLoopSummary {
  status: 'completed' | 'error';
  steps: number;
  terminationReason: ToolLoopTerminationReason;
}

export interface ToolFixture {
  when?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export type ToolFixtures = Record<string, ToolFixture[]>;

export interface FixtureExecutorOptions {
  tools: ToolDefinition[];
  fixtures: ToolFixtures;
  maxToolResultBytes?: number;
}
