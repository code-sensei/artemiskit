import type {
  AdapterConfig,
  GenerateOptions,
  GenerateResult,
  LingAdapterConfig,
  ModelCapabilities,
  ModelClient,
} from '@artemiskit/core';
import { nanoid } from 'nanoid';
import OpenAI from 'openai';

export class LingAdapter implements ModelClient {
  readonly provider = 'ling';
  private readonly client: OpenAI;
  private readonly config: LingAdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config as LingAdapterConfig;
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl ?? 'https://api.ant-ling.com/v1',
      timeout: this.config.timeout ?? 60_000,
      maxRetries: this.config.maxRetries ?? 2,
    });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const start = Date.now();
    const ling = options.providerOptions?.ling;
    const response = await this.client.chat.completions.create({
      model: options.model ?? this.config.defaultModel ?? 'Ling-3.0-flash',
      messages:
        typeof options.prompt === 'string'
          ? [{ role: 'user', content: options.prompt }]
          : options.prompt.map(({ role, content, toolCallId, tool_calls }) => ({
              role: role as 'system' | 'user' | 'assistant' | 'tool',
              content,
              ...(toolCallId ? { tool_call_id: toolCallId } : {}),
              ...(tool_calls ? { tool_calls } : {}),
            })),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      temperature: options.temperature,
      top_p: options.topP,
      stop: options.stop,
      tools: options.tools,
      response_format: options.responseFormat,
      ...((ling?.thinking ?? this.config.thinking)
        ? { thinking: ling?.thinking ?? this.config.thinking }
        : {}),
      ...((ling?.enableSearch ?? this.config.enableSearch)
        ? { enable_search: ling?.enableSearch ?? this.config.enableSearch }
        : {}),
      ...((ling?.searchOptions ?? this.config.searchOptions)
        ? { search_options: ling?.searchOptions ?? this.config.searchOptions }
        : {}),
    } as never);
    const choice = response.choices[0];
    return {
      id: response.id || nanoid(),
      model: response.model,
      text: choice?.message.content || '',
      tokens: {
        prompt: response.usage?.prompt_tokens ?? 0,
        completion: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      latencyMs: Date.now() - start,
      finishReason:
        choice?.finish_reason === 'tool_calls'
          ? 'tool_calls'
          : choice?.finish_reason === 'length'
            ? 'length'
            : 'stop',
      toolCalls: choice?.message.tool_calls?.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.function.name, arguments: call.function.arguments },
      })),
      raw: response,
    };
  }

  async capabilities(): Promise<ModelCapabilities> {
    return {
      streaming: true,
      functionCalling: true,
      toolUse: true,
      maxContext: 256000,
      jsonMode: true,
    };
  }

  async *stream(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: options.model ?? this.config.defaultModel ?? 'Ling-3.0-flash',
      messages:
        typeof options.prompt === 'string'
          ? [{ role: 'user', content: options.prompt }]
          : options.prompt.map(({ role, content, toolCallId, tool_calls }) => ({
              role: role as 'system' | 'user' | 'assistant' | 'tool',
              content,
              ...(toolCallId ? { tool_call_id: toolCallId } : {}),
              ...(tool_calls ? { tool_calls } : {}),
            })),
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      temperature: options.temperature,
      top_p: options.topP,
      stream: true,
    } as never);

    for await (const chunk of stream as unknown as AsyncIterable<{
      choices: { delta?: { content?: string | null } }[];
    }>) {
      const content = chunk.choices[0]?.delta?.content ?? '';
      if (content) {
        onChunk(content);
        yield content;
      }
    }
  }
}
