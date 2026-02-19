/**
 * Register adapters for CLI usage
 * This imports adapters directly to avoid dynamic import issues in bundled code
 */

import { OpenAIAdapter } from '@artemiskit/adapter-openai';
import { VercelAIAdapter } from '@artemiskit/adapter-vercel-ai';
import { type AdapterConfig, type ModelClient, adapterRegistry } from '@artemiskit/core';

export async function registerAdapters(): Promise<void> {
  // OpenAI adapter
  adapterRegistry.register('openai', async (config: AdapterConfig): Promise<ModelClient> => {
    return new OpenAIAdapter(config);
  });

  // Azure OpenAI uses the same adapter
  adapterRegistry.register('azure-openai', async (config: AdapterConfig): Promise<ModelClient> => {
    return new OpenAIAdapter(config);
  });

  // Vercel AI SDK adapter
  adapterRegistry.register('vercel-ai', async (config: AdapterConfig): Promise<ModelClient> => {
    return new VercelAIAdapter(config);
  });

  // LangChain adapter - requires runnable via metadata
  adapterRegistry.register('langchain', async (config: AdapterConfig): Promise<ModelClient> => {
    const { LangChainAdapter } = await import('@artemiskit/adapter-langchain');
    const runnable = (config as { metadata?: { runnable?: unknown } }).metadata?.runnable;
    if (!runnable) {
      throw new Error(
        'LangChain adapter requires a runnable instance. ' +
          'Pass it via config.metadata.runnable or use createLangChainAdapter() directly.'
      );
    }
    return new LangChainAdapter(config, runnable);
  });

  // DeepAgents adapter - requires system via metadata
  adapterRegistry.register('deepagents', async (config: AdapterConfig): Promise<ModelClient> => {
    const { DeepAgentsAdapter } = await import('@artemiskit/adapter-deepagents');
    const system = (config as { metadata?: { system?: unknown } }).metadata?.system;
    if (!system) {
      throw new Error(
        'DeepAgents adapter requires a system instance. ' +
          'Pass it via config.metadata.system or use createDeepAgentsAdapter() directly.'
      );
    }
    return new DeepAgentsAdapter(config, system);
  });

  // Mark post-MVP adapters as unavailable
  adapterRegistry.markUnavailable('anthropic', 'Anthropic adapter coming in v0.2.0');
  adapterRegistry.markUnavailable('google', 'Google adapter coming in v0.3.0');
  adapterRegistry.markUnavailable('mistral', 'Mistral adapter coming in v0.3.0');
  adapterRegistry.markUnavailable('ollama', 'Ollama adapter coming in v0.3.0');
  adapterRegistry.markUnavailable('huggingface', 'Hugging Face adapter coming in v0.4.0');
  adapterRegistry.markUnavailable('cohere', 'Cohere adapter coming in v0.4.0');
}
