/**
 * Adapter registry for dynamic adapter management
 */

import type { ModelClient, AdapterConfig, ProviderType } from './types';

type AdapterFactory = (config: AdapterConfig) => Promise<ModelClient>;

interface UnavailableInfo {
  provider: ProviderType;
  reason: string;
}

/**
 * Registry for adapter factories
 */
class AdapterRegistry {
  private adapters: Map<ProviderType, AdapterFactory> = new Map();
  private unavailableProviders: Map<ProviderType, string> = new Map();

  /**
   * Register an adapter factory for a provider type
   */
  register(provider: ProviderType, factory: AdapterFactory): void {
    this.adapters.set(provider, factory);
    this.unavailableProviders.delete(provider);
  }

  /**
   * Mark a provider as unavailable (post-MVP)
   */
  markUnavailable(provider: ProviderType, reason: string): void {
    this.unavailableProviders.set(provider, reason);
  }

  /**
   * Get an adapter factory by provider type
   */
  get(provider: ProviderType): AdapterFactory | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Check if a provider is registered
   */
  has(provider: ProviderType): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Check if a provider is marked as unavailable
   */
  isUnavailable(provider: ProviderType): boolean {
    return this.unavailableProviders.has(provider);
  }

  /**
   * Get the reason why a provider is unavailable
   */
  getUnavailableReason(provider: ProviderType): string | undefined {
    return this.unavailableProviders.get(provider);
  }

  /**
   * List all registered providers
   */
  list(): ProviderType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * List unavailable providers with reasons
   */
  listUnavailable(): UnavailableInfo[] {
    return Array.from(this.unavailableProviders.entries()).map(([provider, reason]) => ({
      provider,
      reason,
    }));
  }
}

export const adapterRegistry = new AdapterRegistry();

/**
 * Register built-in adapters
 * Note: Dynamic imports are resolved at runtime, not compile time
 */
export async function registerBuiltInAdapters(): Promise<void> {
  // ============================================
  // MVP ADAPTERS - Fully implemented
  // ============================================

  adapterRegistry.register('openai', async (config) => {
    // Dynamic import resolved at runtime
    const mod = await import('@artemis/adapter-openai' as string);
    return new mod.OpenAIAdapter(config);
  });

  adapterRegistry.register('azure-openai', async (config) => {
    const mod = await import('@artemis/adapter-openai' as string);
    return new mod.OpenAIAdapter(config);
  });

  adapterRegistry.register('vercel-ai', async (config) => {
    const mod = await import('@artemis/adapter-vercel-ai' as string);
    return new mod.VercelAIAdapter(config);
  });

  // ============================================
  // POST-MVP ADAPTERS - Not yet available
  // ============================================

  adapterRegistry.markUnavailable('anthropic', 'Anthropic adapter coming in v0.2.0');
  adapterRegistry.markUnavailable('google', 'Google adapter coming in v0.3.0');
  adapterRegistry.markUnavailable('mistral', 'Mistral adapter coming in v0.3.0');
  adapterRegistry.markUnavailable('ollama', 'Ollama adapter coming in v0.3.0');
  adapterRegistry.markUnavailable('huggingface', 'Hugging Face adapter coming in v0.4.0');
  adapterRegistry.markUnavailable('cohere', 'Cohere adapter coming in v0.4.0');
}
