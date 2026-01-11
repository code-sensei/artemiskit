/**
 * Adapter factory for creating model clients
 */

import { adapterRegistry, registerBuiltInAdapters } from './registry';
import type { ModelClient, AdapterConfig, ProviderType } from './types';
import { ArtemisError } from '../utils/errors';

let initialized = false;

/**
 * Create a model adapter from configuration
 */
export async function createAdapter(config: AdapterConfig): Promise<ModelClient> {
  // Only try to register built-in adapters if none are registered yet
  // This allows CLI or other consumers to register adapters before calling createAdapter
  if (!initialized && adapterRegistry.list().length === 0) {
    try {
      await registerBuiltInAdapters();
    } catch {
      // Ignore errors - adapters may be registered externally
    }
    initialized = true;
  }

  if (adapterRegistry.isUnavailable(config.provider)) {
    const reason = adapterRegistry.getUnavailableReason(config.provider);
    throw new ArtemisError(
      `Provider '${config.provider}' is not yet available. ${reason} ` +
        `Available providers: ${adapterRegistry.list().join(', ')}`,
      'PROVIDER_UNAVAILABLE'
    );
  }

  const factory = adapterRegistry.get(config.provider);

  if (!factory) {
    const available = adapterRegistry.list().join(', ');
    const unavailable = adapterRegistry
      .listUnavailable()
      .map((u) => u.provider)
      .join(', ');
    throw new ArtemisError(
      `Unknown provider: ${config.provider}. ` +
        `Available: ${available || 'none'}. ` +
        `Coming soon: ${unavailable || 'none'}`,
      'UNKNOWN_PROVIDER'
    );
  }

  return factory(config);
}

/**
 * Register a custom adapter
 */
export function registerAdapter(
  provider: ProviderType | string,
  factory: (config: AdapterConfig) => Promise<ModelClient>
): void {
  adapterRegistry.register(provider as ProviderType, factory);
}

/**
 * List available adapters
 */
export function listAdapters(): { available: string[]; unavailable: { provider: string; reason: string }[] } {
  return {
    available: adapterRegistry.list(),
    unavailable: adapterRegistry.listUnavailable(),
  };
}
