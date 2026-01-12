/**
 * Vercel AI SDK Adapter
 * Provides unified interface to multiple providers via Vercel's AI SDK
 */

import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import type {
  AdapterConfig,
  GenerateOptions,
  GenerateResult,
  ModelCapabilities,
  ModelClient,
} from '@artemiskit/core';
import { generateText, streamText } from 'ai';
import { nanoid } from 'nanoid';
import type { VercelAIAdapterConfig } from './types';

type AIProvider = ReturnType<typeof createOpenAI> | ReturnType<typeof createAzure>;

export class VercelAIAdapter implements ModelClient {
  private aiProvider: AIProvider;
  private config: VercelAIAdapterConfig;
  readonly provider: string;

  constructor(config: AdapterConfig) {
    this.config = config as VercelAIAdapterConfig;
    this.provider = `vercel-ai:${this.config.underlyingProvider}`;
    this.aiProvider = this.createProvider();
  }

  private createProvider(): AIProvider {
    const { underlyingProvider, apiKey, baseUrl, providerConfig } = this.config;

    switch (underlyingProvider) {
      case 'openai':
        return createOpenAI({
          apiKey,
          baseURL: baseUrl,
          ...providerConfig,
        });

      case 'azure':
        return createAzure({
          apiKey,
          resourceName: providerConfig?.resourceName as string,
          ...providerConfig,
        });

      // ============================================
      // POST-MVP PROVIDERS - Uncomment when ready
      // ============================================

      /*
      case 'anthropic':
        // Requires: @ai-sdk/anthropic
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({
          apiKey,
          baseURL: baseUrl,
          ...providerConfig,
        });

      case 'google':
        // Requires: @ai-sdk/google
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        return createGoogleGenerativeAI({
          apiKey,
          baseURL: baseUrl,
          ...providerConfig,
        });

      case 'mistral':
        // Requires: @ai-sdk/mistral
        const { createMistral } = await import('@ai-sdk/mistral');
        return createMistral({
          apiKey,
          baseURL: baseUrl,
          ...providerConfig,
        });
      */

      default:
        throw new Error(
          `Unsupported Vercel AI provider: ${underlyingProvider}. MVP supports: openai, azure. Coming soon: anthropic, google, mistral and more.`
        );
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const model = options.model || this.config.defaultModel;

    if (!model) {
      throw new Error('Model must be specified');
    }

    const messages = this.normalizePrompt(options.prompt);

    const result = await generateText({
      model: this.aiProvider(model),
      messages,
      maxOutputTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      seed: options.seed,
      stopSequences: options.stop,
    });

    const latencyMs = Date.now() - startTime;
    const inputTokens = result.usage?.inputTokens ?? 0;
    const outputTokens = result.usage?.outputTokens ?? 0;

    return {
      id: nanoid(),
      model,
      text: result.text,
      tokens: {
        prompt: inputTokens,
        completion: outputTokens,
        total: inputTokens + outputTokens,
      },
      latencyMs,
      finishReason: this.mapFinishReason(result.finishReason),
      raw: result,
    };
  }

  async *stream(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string> {
    const model = options.model || this.config.defaultModel;

    if (!model) {
      throw new Error('Model must be specified');
    }

    const messages = this.normalizePrompt(options.prompt);

    const result = await streamText({
      model: this.aiProvider(model),
      messages,
      maxOutputTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      seed: options.seed,
    });

    for await (const chunk of result.textStream) {
      onChunk(chunk);
      yield chunk;
    }
  }

  async capabilities(): Promise<ModelCapabilities> {
    const caps: Record<string, Partial<ModelCapabilities>> = {
      openai: {
        streaming: true,
        functionCalling: true,
        toolUse: true,
        maxContext: 128000,
        vision: true,
        jsonMode: true,
      },
      azure: {
        streaming: true,
        functionCalling: true,
        toolUse: true,
        maxContext: 128000,
        vision: true,
        jsonMode: true,
      },
      anthropic: {
        streaming: true,
        functionCalling: true,
        toolUse: true,
        maxContext: 200000,
        vision: true,
        jsonMode: false,
      },
      google: {
        streaming: true,
        functionCalling: true,
        toolUse: true,
        maxContext: 128000,
        vision: true,
        jsonMode: false,
      },
    };

    return {
      streaming: true,
      functionCalling: true,
      toolUse: true,
      maxContext: 128000,
      ...caps[this.config.underlyingProvider],
    } as ModelCapabilities;
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

  private mapFinishReason(reason: string | undefined): GenerateResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool-calls':
        return 'tool_calls';
      case 'content-filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
