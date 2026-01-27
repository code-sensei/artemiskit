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

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens,
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

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens,
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

    const response = await this.client.embeddings.create({
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
}
