/**
 * Types for DeepAgents adapter
 */

import type { BaseAdapterConfig } from '@artemiskit/core';

/**
 * Configuration for DeepAgents adapter
 */
export interface DeepAgentsAdapterConfig extends BaseAdapterConfig {
  provider: 'deepagents';
  /**
   * Name identifier for the agent system (for logging/tracking)
   */
  name?: string;
  /**
   * Whether to capture agent traces and execution history
   * @default true
   */
  captureTraces?: boolean;
  /**
   * Whether to capture inter-agent messages
   * @default true
   */
  captureMessages?: boolean;
  /**
   * Maximum execution time in milliseconds
   * @default 300000 (5 minutes)
   */
  executionTimeout?: number;
  /**
   * Custom input transformer function name
   */
  inputTransformer?: string;
  /**
   * Custom output transformer function name
   */
  outputTransformer?: string;
}

/**
 * Generic interface for DeepAgents systems
 * Supports multi-agent orchestration with invoke() or run() methods
 */
export interface DeepAgentsSystem {
  invoke?(input: DeepAgentsInput, config?: DeepAgentsConfig): Promise<DeepAgentsOutput>;
  run?(input: DeepAgentsInput, config?: DeepAgentsConfig): Promise<DeepAgentsOutput>;
  execute?(input: DeepAgentsInput, config?: DeepAgentsConfig): Promise<DeepAgentsOutput>;
  stream?(input: DeepAgentsInput, config?: DeepAgentsConfig): AsyncIterable<DeepAgentsStreamEvent>;
}

/**
 * Input format for DeepAgents systems
 */
export interface DeepAgentsInput {
  /** The main task/query to process */
  task?: string;
  query?: string;
  input?: string;
  message?: string;
  /** Optional context/memory from previous interactions */
  context?: Record<string, unknown>;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Configuration for DeepAgents execution
 */
export interface DeepAgentsConfig {
  /** Maximum iterations for agent loops */
  maxIterations?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Callback handlers */
  callbacks?: DeepAgentsCallbacks;
  [key: string]: unknown;
}

/**
 * Callback handlers for DeepAgents execution
 */
export interface DeepAgentsCallbacks {
  onAgentStart?: (agent: string, input: unknown) => void;
  onAgentEnd?: (agent: string, output: unknown) => void;
  onMessage?: (from: string, to: string, message: unknown) => void;
  onToolUse?: (agent: string, tool: string, input: unknown) => void;
  onError?: (agent: string, error: Error) => void;
}

/**
 * Output from DeepAgents system execution
 */
export interface DeepAgentsOutput {
  /** Main result/output */
  result?: string;
  output?: string;
  response?: string;
  answer?: string;
  /** Execution traces from agents */
  traces?: DeepAgentsTrace[];
  /** Messages exchanged between agents */
  messages?: DeepAgentsMessage[];
  /** Agents that participated in the execution */
  agents?: string[];
  /** Total execution time */
  executionTimeMs?: number;
  /** Token usage if available */
  tokenUsage?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  /** Raw response data */
  [key: string]: unknown;
}

/**
 * Trace of a single agent's execution
 */
export interface DeepAgentsTrace {
  /** Agent identifier */
  agent: string;
  /** Action taken by the agent */
  action: string;
  /** Input to the action */
  input?: unknown;
  /** Output/result of the action */
  output?: unknown;
  /** Timestamp */
  timestamp?: number;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Tools used during this action */
  toolsUsed?: string[];
}

/**
 * Message exchanged between agents
 */
export interface DeepAgentsMessage {
  /** Sender agent */
  from: string;
  /** Recipient agent */
  to: string;
  /** Message content */
  content: string;
  /** Message type */
  type?: 'request' | 'response' | 'broadcast' | 'delegation';
  /** Timestamp */
  timestamp?: number;
}

/**
 * Streaming event from DeepAgents
 */
export interface DeepAgentsStreamEvent {
  /** Event type */
  type: 'agent_start' | 'agent_end' | 'message' | 'tool_use' | 'token' | 'error' | 'done';
  /** Agent involved */
  agent?: string;
  /** Event data */
  data?: unknown;
  /** Text content (for token events) */
  content?: string;
  /** Timestamp */
  timestamp?: number;
}

/**
 * Metadata extracted from DeepAgents execution
 */
export interface DeepAgentsExecutionMetadata {
  /** System/workflow name */
  name?: string;
  /** Agents that participated */
  agentsInvolved: string[];
  /** Total agent invocations */
  totalAgentCalls: number;
  /** Total messages exchanged */
  totalMessages: number;
  /** Total tool calls across all agents */
  totalToolCalls: number;
  /** Unique tools used */
  toolsUsed: string[];
  /** Execution traces */
  traces?: DeepAgentsTrace[];
  /** Messages log */
  messages?: DeepAgentsMessage[];
  /** Total execution time */
  executionTimeMs?: number;
}
