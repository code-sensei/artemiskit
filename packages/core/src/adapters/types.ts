/**
 * Core types and interfaces for model adapters
 */

/**
 * Chat message format compatible with OpenAI/Anthropic
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Options for generating a completion
 */
export interface GenerateOptions {
  prompt: string | ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  seed?: number;
  stop?: string[];
  functions?: FunctionDefinition[];
  tools?: ToolDefinition[];
  responseFormat?: { type: 'text' | 'json_object' };
  metadata?: Record<string, unknown>;
}

/**
 * Function/Tool definitions for function calling
 */
export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/**
 * Result from a generation request
 */
export interface GenerateResult {
  id: string;
  model: string;
  text: string;
  tokens: TokenUsage;
  latencyMs: number;
  finishReason?: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter';
  functionCall?: {
    name: string;
    arguments: string;
  };
  toolCalls?: ToolCall[];
  raw?: unknown;
}

/**
 * Model capabilities
 */
export interface ModelCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  toolUse: boolean;
  maxContext: number;
  vision?: boolean;
  jsonMode?: boolean;
}

/**
 * ModelClient interface - All adapters must implement this
 */
export interface ModelClient {
  readonly provider: string;

  generate(options: GenerateOptions): Promise<GenerateResult>;

  stream?(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string>;

  embed?(text: string, model?: string): Promise<number[]>;

  capabilities(): Promise<ModelCapabilities>;

  close?(): Promise<void>;
}

/**
 * Provider types - all supported providers
 */
export type ProviderType =
  | 'openai'
  | 'azure-openai'
  | 'vercel-ai'
  | 'anthropic'
  | 'google'
  | 'mistral'
  | 'cohere'
  | 'huggingface'
  | 'ollama'
  | 'custom';

/**
 * Base adapter configuration
 */
export interface BaseAdapterConfig {
  provider: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * OpenAI-specific configuration
 */
export interface OpenAIAdapterConfig extends BaseAdapterConfig {
  provider: 'openai';
  organization?: string;
}

/**
 * Azure OpenAI-specific configuration
 */
export interface AzureOpenAIAdapterConfig extends BaseAdapterConfig {
  provider: 'azure-openai';
  resourceName: string;
  deploymentName: string;
  apiVersion: string;
  /** Optional separate deployment name for embedding models */
  embeddingDeploymentName?: string;
}

/**
 * Vercel AI SDK configuration
 */
export interface VercelAIAdapterConfig extends BaseAdapterConfig {
  provider: 'vercel-ai';
  underlyingProvider: 'openai' | 'azure' | 'anthropic' | 'google' | 'mistral';
  providerConfig?: Record<string, unknown>;
}

/**
 * Anthropic-specific configuration (Post-MVP)
 */
export interface AnthropicAdapterConfig extends BaseAdapterConfig {
  provider: 'anthropic';
}

/**
 * Union type for all adapter configs
 */
export type AdapterConfig =
  | OpenAIAdapterConfig
  | AzureOpenAIAdapterConfig
  | VercelAIAdapterConfig
  | AnthropicAdapterConfig
  | BaseAdapterConfig;
