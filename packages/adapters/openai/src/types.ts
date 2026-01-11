/**
 * OpenAI adapter types
 */

export interface OpenAIAdapterConfig {
  provider: 'openai';
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
  organization?: string;
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
}
