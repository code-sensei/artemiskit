/**
 * Types for LangChain adapter
 */

import type { BaseAdapterConfig } from '@artemiskit/core';

/**
 * Supported LangChain runnable types
 */
export type LangChainRunnableType = 'chain' | 'agent' | 'llm' | 'runnable';

/**
 * Configuration for LangChain adapter
 */
export interface LangChainAdapterConfig extends BaseAdapterConfig {
  provider: 'langchain';
  /**
   * The type of LangChain runnable being wrapped
   */
  runnableType?: LangChainRunnableType;
  /**
   * Name identifier for the chain/agent (for logging/tracking)
   */
  name?: string;
  /**
   * Whether to capture intermediate steps from agents
   * @default true
   */
  captureIntermediateSteps?: boolean;
  /**
   * Custom input key for the runnable (default: 'input')
   */
  inputKey?: string;
  /**
   * Custom output key for the runnable (default: 'output')
   */
  outputKey?: string;
}

/**
 * Generic interface for LangChain-like runnables
 * Supports both chains and agents with invoke() method
 */
export interface LangChainRunnable {
  invoke(
    input: Record<string, unknown> | string,
    config?: Record<string, unknown>
  ): Promise<LangChainRunnableOutput>;
  stream?(
    input: Record<string, unknown> | string,
    config?: Record<string, unknown>
  ): AsyncIterable<LangChainStreamChunk>;
}

/**
 * Output from a LangChain runnable
 */
export interface LangChainRunnableOutput {
  /** Main text output - can be in various forms */
  output?: string;
  content?: string;
  text?: string;
  result?: string;
  /** For agent outputs with intermediate steps */
  intermediateSteps?: LangChainIntermediateStep[];
  /** Raw response for other properties */
  [key: string]: unknown;
}

/**
 * Intermediate step from agent execution
 */
export interface LangChainIntermediateStep {
  action: {
    tool: string;
    toolInput: unknown;
    log?: string;
  };
  observation: string;
}

/**
 * Streaming chunk from LangChain
 */
export interface LangChainStreamChunk {
  content?: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Metadata extracted from LangChain execution
 */
export interface LangChainExecutionMetadata {
  runnableType: LangChainRunnableType;
  name?: string;
  intermediateSteps?: LangChainIntermediateStep[];
  toolsUsed?: string[];
  totalToolCalls?: number;
}
