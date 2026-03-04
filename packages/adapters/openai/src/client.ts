/**
 * OpenAI SDK Adapter
 * Supports: OpenAI, Azure OpenAI, OpenAI-compatible APIs
 */

import type {
  AdapterConfig,
  GenerateOptions,
  GenerateResult,
  ModelCapabilities,
  ModelClient,
} from '@artemiskit/core';
import { nanoid } from 'nanoid';
import OpenAI from 'openai';
import type { AzureOpenAIAdapterConfig, OpenAIAdapterConfig } from './types';

export class OpenAIAdapter implements ModelClient {
  private client: OpenAI;
  private embeddingClient: OpenAI | null = null;
  private config: OpenAIAdapterConfig | AzureOpenAIAdapterConfig;
  readonly provider: string;

  constructor(config: AdapterConfig) {
    this.config = config as OpenAIAdapterConfig | AzureOpenAIAdapterConfig;

    if (config.provider === 'azure-openai') {
      const azureConfig = config as AzureOpenAIAdapterConfig;
      this.provider = 'azure-openai';

      this.client = new OpenAI({
        apiKey: azureConfig.apiKey,
        baseURL: `https://${azureConfig.resourceName}.openai.azure.com/openai/deployments/${azureConfig.deploymentName}`,
        defaultQuery: { 'api-version': azureConfig.apiVersion },
        defaultHeaders: { 'api-key': azureConfig.apiKey ?? '' },
        timeout: azureConfig.timeout ?? 60000,
        maxRetries: azureConfig.maxRetries ?? 2,
      });

      // Create separate client for embeddings if a different deployment is specified
      if (azureConfig.embeddingDeploymentName) {
        this.embeddingClient = new OpenAI({
          apiKey: azureConfig.apiKey,
          baseURL: `https://${azureConfig.resourceName}.openai.azure.com/openai/deployments/${azureConfig.embeddingDeploymentName}`,
          defaultQuery: { 'api-version': azureConfig.apiVersion },
          defaultHeaders: { 'api-key': azureConfig.apiKey ?? '' },
          timeout: azureConfig.timeout ?? 60000,
          maxRetries: azureConfig.maxRetries ?? 2,
        });
      }
    } else {
      const openaiConfig = config as OpenAIAdapterConfig;
      this.provider = 'openai';

      this.client = new OpenAI({
        apiKey: openaiConfig.apiKey,
        baseURL: openaiConfig.baseUrl,
        organization: openaiConfig.organization,
        timeout: openaiConfig.timeout ?? 60000,
        maxRetries: openaiConfig.maxRetries ?? 2,
      });
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const model = options.model || this.config.defaultModel || 'gpt-4';

    const messages = this.normalizePrompt(options.prompt);

    // Determine which token limit parameter to use
    // Newer models (GPT-4o, GPT-5, o1, o3) use max_completion_tokens
    // Older models use max_tokens
    const useNewTokenParam = this.shouldUseMaxCompletionTokens(model);
    const tokenParams = options.maxTokens
      ? useNewTokenParam
        ? { max_completion_tokens: options.maxTokens }
        : { max_tokens: options.maxTokens }
      : {};

    const response = await this.client.chat.completions.create({
      model,
      messages,
      ...tokenParams,
      temperature: options.temperature,
      top_p: options.topP,
      seed: options.seed,
      stop: options.stop,
      tools: options.tools,
      response_format: options.responseFormat,
    });

    const latencyMs = Date.now() - startTime;
    const choice = response.choices[0];

    return {
      id: response.id || nanoid(),
      model: response.model,
      text: choice.message.content || '',
      tokens: {
        prompt: response.usage?.prompt_tokens ?? 0,
        completion: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      latencyMs,
      finishReason: this.mapFinishReason(choice.finish_reason),
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: tc.type as 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      raw: response,
    };
  }

  async *stream(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string> {
    const model = options.model || this.config.defaultModel || 'gpt-4';
    const messages = this.normalizePrompt(options.prompt);

    // Determine which token limit parameter to use (same logic as generate)
    const useNewTokenParam = this.shouldUseMaxCompletionTokens(model);
    const tokenParams = options.maxTokens
      ? useNewTokenParam
        ? { max_completion_tokens: options.maxTokens }
        : { max_tokens: options.maxTokens }
      : {};

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      ...tokenParams,
      temperature: options.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        onChunk(content);
        yield content;
      }
    }
  }

  async embed(text: string, model?: string): Promise<number[]> {
    // Use provided model, or fall back to provider defaults
    const embeddingModel =
      model ||
      (this.config.provider === 'azure-openai'
        ? 'text-embedding-3-large'
        : 'text-embedding-3-small');

    // For Azure, use the dedicated embedding client if available
    // Otherwise fall back to main client (which may fail if deployment doesn't support embeddings)
    const client = this.embeddingClient || this.client;

    const response = await client.embeddings.create({
      model: embeddingModel,
      input: text,
    });
    return response.data[0].embedding;
  }

  async capabilities(): Promise<ModelCapabilities> {
    return {
      streaming: true,
      functionCalling: true,
      toolUse: true,
      maxContext: 128000,
      vision: true,
      jsonMode: true,
    };
  }

  async close(): Promise<void> {
    // No cleanup needed
  }

  private normalizePrompt(prompt: GenerateOptions['prompt']) {
    if (typeof prompt === 'string') {
      return [{ role: 'user' as const, content: prompt }];
    }
    return prompt.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));
  }

  private mapFinishReason(reason: string | null): GenerateResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /**
   * Determine if model requires max_completion_tokens instead of max_tokens
   * Newer models (GPT-4o, GPT-4.5, GPT-5, o1, o3, mini variants) require the new parameter
   *
   * @param model - The deployment name or model name used in the API call
   */
  private shouldUseMaxCompletionTokens(model: string): boolean {
    const azureConfig = this.config as AzureOpenAIAdapterConfig;

    // For Azure, we have multiple sources to check:
    // 1. modelFamily (explicit config) - most reliable
    // 2. deploymentName - the actual Azure deployment
    // 3. model parameter - what was passed to generate()
    const modelsToCheck = [azureConfig.modelFamily, azureConfig.deploymentName, model].filter(
      Boolean
    ) as string[];

    // Models that require max_completion_tokens:
    // - GPT-4o and variants (gpt-4o, gpt-4o-mini, chatgpt-4o)
    // - GPT-4.5 and variants
    // - GPT-4-turbo
    // - GPT-5 and variants (gpt-5, gpt-5-mini, 5-mini)
    // - o1 and o3 reasoning models
    // - Any "mini" model (these are all newer architecture)
    const newParamPatterns = [
      'gpt-4o',
      'gpt-4.5',
      'gpt-4-turbo',
      'gpt-5',
      '5-mini', // Azure deployment names like "5-mini"
      'o1',
      'o3',
      'chatgpt-4o',
      '-mini', // Catches any mini variant (gpt-4o-mini, gpt-5-mini, etc.)
      'mini', // Standalone mini patterns
    ];

    // Check if ANY of the model identifiers match ANY of the patterns
    return modelsToCheck.some((modelName) => {
      const modelLower = modelName.toLowerCase();
      return newParamPatterns.some((pattern) => modelLower.includes(pattern));
    });
  }
}
