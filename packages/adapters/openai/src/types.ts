/**
 * OpenAI adapter types
 */

/** Values accepted for `reasoning_effort`; `none` turns thinking off on servers that support it. */
export type OpenAIReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

export interface OpenAIAdapterConfig {
  provider: 'openai';
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
  organization?: string;
  /** Opt-in `reasoning_effort` sent with every chat completion; omitted when unset. */
  reasoningEffort?: OpenAIReasoningEffort;
}

export interface AzureOpenAIAdapterConfig {
  provider: 'azure-openai';
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
  resourceName: string;
  deploymentName: string;
  apiVersion: string;
  /** Optional separate deployment name for embedding models */
  embeddingDeploymentName?: string;
  /**
   * Model family for parameter detection (e.g., 'gpt-5-mini' when deployment is '5-mini')
   * Used to determine which API parameters to use (max_tokens vs max_completion_tokens)
   */
  modelFamily?: string;
}
