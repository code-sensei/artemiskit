/**
 * Vercel AI SDK adapter types
 */

export interface VercelAIAdapterConfig {
  provider: 'vercel-ai';
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
  underlyingProvider: 'openai' | 'azure' | 'anthropic' | 'google' | 'mistral';
  providerConfig?: Record<string, unknown>;
}
