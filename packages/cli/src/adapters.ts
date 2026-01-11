/**
 * Register adapters for CLI usage
 * This imports adapters directly to avoid dynamic import issues in bundled code
 */

import { adapterRegistry, type AdapterConfig, type ModelClient } from '@artemis/core';
import { OpenAIAdapter } from '@artemis/adapter-openai';
import { VercelAIAdapter } from '@artemis/adapter-vercel-ai';

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

  // Mark post-MVP adapters as unavailable
  adapterRegistry.markUnavailable('anthropic', 'Anthropic adapter coming in v0.2.0');
  adapterRegistry.markUnavailable('google', 'Google adapter coming in v0.3.0');
  adapterRegistry.markUnavailable('mistral', 'Mistral adapter coming in v0.3.0');
  adapterRegistry.markUnavailable('ollama', 'Ollama adapter coming in v0.3.0');
  adapterRegistry.markUnavailable('huggingface', 'Hugging Face adapter coming in v0.4.0');
  adapterRegistry.markUnavailable('cohere', 'Cohere adapter coming in v0.4.0');
}
