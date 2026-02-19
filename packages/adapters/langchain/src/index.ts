/**
 * @artemiskit/adapter-langchain
 *
 * LangChain.js adapter for ArtemisKit LLM evaluation toolkit.
 * Enables testing of LangChain chains, agents, and runnables.
 *
 * @example
 * ```typescript
 * import { createLangChainAdapter } from '@artemiskit/adapter-langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 *
 * const model = new ChatOpenAI({ model: 'gpt-4' });
 * const adapter = createLangChainAdapter(model, { name: 'gpt4-direct' });
 *
 * // Use with ArtemisKit
 * const result = await adapter.generate({ prompt: 'Hello!' });
 * ```
 */

export { LangChainAdapter, createLangChainAdapter } from './client';
export type {
  LangChainAdapterConfig,
  LangChainRunnable,
  LangChainRunnableOutput,
  LangChainRunnableType,
  LangChainIntermediateStep,
  LangChainStreamChunk,
  LangChainExecutionMetadata,
} from './types';
