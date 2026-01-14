/**
 * Shared adapter configuration builder
 *
 * Config precedence (top wins):
 * 1. CLI options (--provider, --model, etc.)
 * 2. Scenario providerConfig
 * 3. artemis.config.yaml providers.<provider>
 * 4. Environment variables
 * 5. Defaults
 */

import type { AdapterConfig } from '@artemiskit/core';
import type { ProviderConfig } from '@artemiskit/core';
import type { ArtemisConfig } from '../config/schema';

export interface AdapterConfigOptions {
  /** Provider name from CLI or scenario */
  provider: string;
  /** Model name from CLI or scenario (display/identifier) */
  model?: string;
  /** Provider config from scenario file */
  scenarioConfig?: ProviderConfig;
  /** Config from artemis.config.yaml */
  fileConfig?: ArtemisConfig | null;
}

/**
 * Build adapter configuration with proper precedence
 *
 * Resolution order for each field:
 * scenarioConfig > fileConfig.providers[provider] > environment variable > default
 */
export function buildAdapterConfig(options: AdapterConfigOptions): AdapterConfig {
  const { provider, model, scenarioConfig, fileConfig } = options;

  // Get provider-specific config from artemis.config.yaml
  const fileProviderConfig = fileConfig?.providers?.[provider];

  switch (provider) {
    case 'openai':
      return {
        provider: 'openai',
        apiKey: resolveValue(
          scenarioConfig?.apiKey,
          fileProviderConfig?.apiKey,
          process.env.OPENAI_API_KEY
        ),
        baseUrl: resolveValue(scenarioConfig?.baseUrl, fileProviderConfig?.baseUrl),
        organization: resolveValue(
          scenarioConfig?.organization,
          fileProviderConfig?.organization,
          process.env.OPENAI_ORGANIZATION
        ),
        defaultModel: resolveValue(
          model,
          scenarioConfig?.defaultModel,
          fileProviderConfig?.defaultModel
        ),
        timeout: resolveValue(scenarioConfig?.timeout, fileProviderConfig?.timeout),
        maxRetries: resolveValue(scenarioConfig?.maxRetries, fileProviderConfig?.maxRetries),
      };

    case 'azure-openai':
      return {
        provider: 'azure-openai',
        apiKey: resolveValue(
          scenarioConfig?.apiKey,
          fileProviderConfig?.apiKey,
          process.env.AZURE_OPENAI_API_KEY
        ),
        resourceName: resolveValue(
          scenarioConfig?.resourceName,
          fileProviderConfig?.resourceName,
          process.env.AZURE_OPENAI_RESOURCE,
          ''
        ),
        deploymentName: resolveValue(
          scenarioConfig?.deploymentName,
          fileProviderConfig?.deploymentName,
          process.env.AZURE_OPENAI_DEPLOYMENT,
          ''
        ),
        apiVersion: resolveValue(
          scenarioConfig?.apiVersion,
          fileProviderConfig?.apiVersion,
          process.env.AZURE_OPENAI_API_VERSION,
          '2024-02-15-preview'
        ),
        defaultModel: resolveValue(
          model,
          scenarioConfig?.defaultModel,
          fileProviderConfig?.defaultModel
        ),
        timeout: resolveValue(scenarioConfig?.timeout, fileProviderConfig?.timeout),
        maxRetries: resolveValue(scenarioConfig?.maxRetries, fileProviderConfig?.maxRetries),
      };

    case 'vercel-ai':
      return {
        provider: 'vercel-ai',
        underlyingProvider: resolveValue(
          scenarioConfig?.underlyingProvider,
          fileProviderConfig?.underlyingProvider,
          'openai'
        ) as 'openai' | 'anthropic',
        apiKey: resolveValue(
          scenarioConfig?.apiKey,
          fileProviderConfig?.apiKey,
          process.env.OPENAI_API_KEY
        ),
        defaultModel: resolveValue(
          model,
          scenarioConfig?.defaultModel,
          fileProviderConfig?.defaultModel
        ),
        timeout: resolveValue(scenarioConfig?.timeout, fileProviderConfig?.timeout),
        maxRetries: resolveValue(scenarioConfig?.maxRetries, fileProviderConfig?.maxRetries),
      };

    case 'anthropic':
      return {
        provider: 'anthropic',
        apiKey: resolveValue(
          scenarioConfig?.apiKey,
          fileProviderConfig?.apiKey,
          process.env.ANTHROPIC_API_KEY
        ),
        baseUrl: resolveValue(scenarioConfig?.baseUrl, fileProviderConfig?.baseUrl),
        defaultModel: resolveValue(
          model,
          scenarioConfig?.defaultModel,
          fileProviderConfig?.defaultModel
        ),
        timeout: resolveValue(scenarioConfig?.timeout, fileProviderConfig?.timeout),
        maxRetries: resolveValue(scenarioConfig?.maxRetries, fileProviderConfig?.maxRetries),
      };

    default:
      // Fallback for unknown providers - treat as OpenAI-compatible
      return {
        provider: provider as 'openai',
        apiKey: resolveValue(
          scenarioConfig?.apiKey,
          fileProviderConfig?.apiKey,
          process.env.OPENAI_API_KEY
        ),
        baseUrl: resolveValue(scenarioConfig?.baseUrl, fileProviderConfig?.baseUrl),
        defaultModel: resolveValue(
          model,
          scenarioConfig?.defaultModel,
          fileProviderConfig?.defaultModel
        ),
      };
  }
}

/**
 * Resolve a configuration value with precedence
 * Returns the first defined (non-undefined) value
 */
function resolveValue<T>(...values: (T | undefined | null)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * Get the effective provider from various sources
 */
export function resolveProvider(
  cliProvider?: string,
  scenarioProvider?: string,
  configProvider?: string
): string {
  return cliProvider || scenarioProvider || configProvider || 'openai';
}

/**
 * Get the effective model from various sources
 */
export function resolveModel(
  cliModel?: string,
  scenarioModel?: string,
  configModel?: string
): string | undefined {
  return cliModel || scenarioModel || configModel;
}
