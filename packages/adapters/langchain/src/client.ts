/**
 * LangChain Adapter
 * Wraps LangChain chains and agents for ArtemisKit testing
 */

import type {
  AdapterConfig,
  GenerateOptions,
  GenerateResult,
  ModelCapabilities,
  ModelClient,
} from '@artemiskit/core';
import { nanoid } from 'nanoid';
import type {
  LangChainAdapterConfig,
  LangChainExecutionMetadata,
  LangChainRunnable,
  LangChainRunnableOutput,
  LangChainRunnableType,
} from './types';

/**
 * Adapter for testing LangChain chains and agents with ArtemisKit
 *
 * @example
 * ```typescript
 * import { LangChainAdapter } from '@artemiskit/adapter-langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 * import { StringOutputParser } from '@langchain/core/output_parsers';
 * import { ChatPromptTemplate } from '@langchain/core/prompts';
 *
 * // Create a LangChain chain
 * const model = new ChatOpenAI({ model: 'gpt-4' });
 * const prompt = ChatPromptTemplate.fromTemplate('Answer: {input}');
 * const chain = prompt.pipe(model).pipe(new StringOutputParser());
 *
 * // Wrap with ArtemisKit adapter
 * const adapter = new LangChainAdapter({
 *   provider: 'langchain',
 *   runnable: chain,
 *   runnableType: 'chain',
 * });
 *
 * // Use in ArtemisKit tests
 * const result = await adapter.generate({ prompt: 'What is 2+2?' });
 * ```
 */
export class LangChainAdapter implements ModelClient {
  private runnable: LangChainRunnable;
  private config: LangChainAdapterConfig;
  private runnableType: LangChainRunnableType;
  readonly provider = 'langchain';

  constructor(config: AdapterConfig, runnable: LangChainRunnable) {
    this.config = config as LangChainAdapterConfig;
    this.runnable = runnable;
    this.runnableType = this.config.runnableType ?? this.detectRunnableType(runnable);
  }

  /**
   * Attempt to detect the type of runnable based on its properties
   */
  private detectRunnableType(runnable: LangChainRunnable): LangChainRunnableType {
    // Check for agent-specific properties
    // Cast through unknown first since LangChainRunnable is a specific interface
    const runnableAny = runnable as unknown as Record<string, unknown>;
    if (
      runnableAny.agent ||
      runnableAny.agentExecutor ||
      typeof runnableAny.runAgent === 'function'
    ) {
      return 'agent';
    }

    // Check for LLM-specific properties
    if (runnableAny.modelName || runnableAny.model || runnableAny._llmType) {
      return 'llm';
    }

    // Default to 'runnable' for generic LCEL chains
    return 'runnable';
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();

    // Prepare input based on options
    const input = this.prepareInput(options);

    // Execute the runnable
    const response = await this.runnable.invoke(input);

    const latencyMs = Date.now() - startTime;

    // Extract text output from various possible response shapes
    const text = this.extractOutput(response);

    // Extract metadata from execution
    const metadata = this.extractMetadata(response);

    return {
      id: nanoid(),
      model: this.config.name || `langchain:${this.runnableType}`,
      text,
      tokens: {
        prompt: 0, // LangChain doesn't expose token counts directly
        completion: 0,
        total: 0,
      },
      latencyMs,
      finishReason: 'stop',
      raw: {
        response,
        metadata,
      },
    };
  }

  async *stream(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string> {
    if (!this.runnable.stream) {
      // Fallback to non-streaming if not supported
      const result = await this.generate(options);
      onChunk(result.text);
      yield result.text;
      return;
    }

    const input = this.prepareInput(options);
    const stream = this.runnable.stream(input);

    for await (const chunk of stream) {
      const text = chunk.content?.toString() || chunk.text || '';
      if (text) {
        onChunk(text);
        yield text;
      }
    }
  }

  async capabilities(): Promise<ModelCapabilities> {
    return {
      streaming: typeof this.runnable.stream === 'function',
      functionCalling: this.runnableType === 'agent',
      toolUse: this.runnableType === 'agent',
      maxContext: 128000, // Varies by underlying model
      vision: false, // Depends on underlying model
      jsonMode: false,
    };
  }

  async close(): Promise<void> {
    // No cleanup needed for most LangChain runnables
  }

  /**
   * Prepare input for the LangChain runnable
   */
  private prepareInput(options: GenerateOptions): Record<string, unknown> | string {
    const inputKey = this.config.inputKey ?? 'input';

    // Handle string prompts
    if (typeof options.prompt === 'string') {
      // Some runnables accept just a string, others need an object
      return { [inputKey]: options.prompt };
    }

    // Handle chat message array - convert to single prompt string
    const messages = options.prompt;
    const lastUserMessage = messages.findLast((m) => m.role === 'user');
    const systemMessage = messages.find((m) => m.role === 'system');

    // Build input with system context if available
    if (systemMessage) {
      return {
        [inputKey]: lastUserMessage?.content || '',
        system: systemMessage.content,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };
    }

    return { [inputKey]: lastUserMessage?.content || '' };
  }

  /**
   * Extract the text output from a LangChain response
   * Handles various response shapes from different runnable types
   */
  private extractOutput(response: LangChainRunnableOutput): string {
    const outputKey = this.config.outputKey ?? 'output';

    // Direct string response (from StringOutputParser)
    if (typeof response === 'string') {
      return response;
    }

    // Check common output keys in order of preference
    const possibleKeys = [outputKey, 'output', 'content', 'text', 'result', 'answer'];

    for (const key of possibleKeys) {
      const value = response[key];
      if (typeof value === 'string') {
        return value;
      }
      if (value && typeof value === 'object' && 'content' in value) {
        return String((value as { content: unknown }).content);
      }
    }

    // For agent responses, extract from intermediate steps
    if (response.intermediateSteps?.length) {
      const steps = response.intermediateSteps;
      const lastStep = steps[steps.length - 1];
      return lastStep?.observation || JSON.stringify(response);
    }

    // Fallback to JSON stringification
    return JSON.stringify(response);
  }

  /**
   * Extract execution metadata from the response
   */
  private extractMetadata(response: LangChainRunnableOutput): LangChainExecutionMetadata {
    const metadata: LangChainExecutionMetadata = {
      runnableType: this.runnableType,
      name: this.config.name,
    };

    // Capture intermediate steps if available and enabled
    if (this.config.captureIntermediateSteps !== false && response.intermediateSteps) {
      metadata.intermediateSteps = response.intermediateSteps;
      metadata.toolsUsed = [...new Set(response.intermediateSteps.map((s) => s.action.tool))];
      metadata.totalToolCalls = response.intermediateSteps.length;
    }

    return metadata;
  }
}

/**
 * Factory function to create a LangChain adapter
 *
 * @example
 * ```typescript
 * const adapter = createLangChainAdapter(myChain, {
 *   name: 'my-rag-chain',
 *   runnableType: 'chain',
 * });
 * ```
 */
export function createLangChainAdapter(
  runnable: LangChainRunnable,
  options?: Partial<LangChainAdapterConfig>
): LangChainAdapter {
  const config: LangChainAdapterConfig = {
    provider: 'langchain',
    ...options,
  };

  return new LangChainAdapter(config, runnable);
}
