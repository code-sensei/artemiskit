/**
 * @artemis/adapter-anthropic
 * Anthropic SDK adapter for Artemis
 *
 * STATUS: Post-MVP - Not yet implemented
 * This adapter will be available in v0.2.0
 */

import { ArtemisError } from '@artemis/core';

/**
 * Anthropic Adapter - Coming in v0.2.0
 *
 * This adapter is planned for a future release.
 * For now, you can use the Vercel AI SDK adapter with Anthropic
 * once we enable that provider.
 */
export class AnthropicAdapter {
  constructor() {
    throw new ArtemisError(
      'Anthropic adapter is not yet available. Coming in v0.2.0. ' +
        'For now, use the OpenAI adapter or Vercel AI SDK adapter.',
      'PROVIDER_UNAVAILABLE'
    );
  }
}

/*
// ============================================
// UNCOMMENT WHEN IMPLEMENTING ANTHROPIC ADAPTER
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import type {
  ModelClient,
  GenerateOptions,
  GenerateResult,
  ModelCapabilities,
  AnthropicAdapterConfig,
  AdapterConfig,
} from '@artemis/core';
import { nanoid } from 'nanoid';

export class AnthropicAdapter implements ModelClient {
  private client: Anthropic;
  private config: AnthropicAdapterConfig;
  readonly provider = 'anthropic';

  constructor(config: AdapterConfig) {
    this.config = config as AnthropicAdapterConfig;

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout ?? 60000,
      maxRetries: this.config.maxRetries ?? 2,
    });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const model = options.model || this.config.defaultModel || 'claude-3-opus-20240229';

    const { systemPrompt, messages } = this.normalizePrompt(options.prompt);

    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      top_p: options.topP,
      stop_sequences: options.stop,
      system: systemPrompt,
      messages,
    });

    const latencyMs = Date.now() - startTime;
    const textContent = response.content.find(c => c.type === 'text');

    return {
      id: response.id || nanoid(),
      model: response.model,
      text: textContent?.type === 'text' ? textContent.text : '',
      tokens: {
        prompt: response.usage.input_tokens,
        completion: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      latencyMs,
      finishReason: this.mapStopReason(response.stop_reason),
      raw: response,
    };
  }

  async *stream(
    options: GenerateOptions,
    onChunk: (chunk: string) => void
  ): AsyncIterable<string> {
    const model = options.model || this.config.defaultModel || 'claude-3-opus-20240229';
    const { systemPrompt, messages } = this.normalizePrompt(options.prompt);

    const stream = await this.client.messages.stream({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        onChunk(text);
        yield text;
      }
    }
  }

  async capabilities(): Promise<ModelCapabilities> {
    return {
      streaming: true,
      functionCalling: true,
      toolUse: true,
      maxContext: 200000,
      vision: true,
      jsonMode: false,
    };
  }

  async close(): Promise<void> {}

  private normalizePrompt(prompt: GenerateOptions['prompt']): {
    systemPrompt?: string;
    messages: Anthropic.MessageParam[];
  } {
    if (typeof prompt === 'string') {
      return { messages: [{ role: 'user', content: prompt }] };
    }

    let systemPrompt: string | undefined;
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of prompt) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    return { systemPrompt, messages };
  }

  private mapStopReason(reason: string | null): GenerateResult['finishReason'] {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'max_tokens': return 'length';
      case 'tool_use': return 'tool_calls';
      default: return 'stop';
    }
  }
}
*/
