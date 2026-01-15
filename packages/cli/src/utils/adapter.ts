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
import type { ConfigSource, ResolvedConfig } from '@artemiskit/core';
import type { ProviderConfig } from '@artemiskit/core';
import type { ArtemisConfig } from '../config/schema';

export interface AdapterConfigOptions {
  /** Provider name from CLI or scenario */
  provider: string;
  /** Model name from CLI or scenario (display/identifier) */
  model?: string;
  /** Temperature from CLI */
  temperature?: number;
  /** Max tokens from CLI */
  maxTokens?: number;
  /** Provider config from scenario file */
  scenarioConfig?: ProviderConfig;
  /** Config from artemis.config.yaml */
  fileConfig?: ArtemisConfig | null;
  /** Source of provider (for tracking) */
  providerSource?: ConfigSource;
  /** Source of model (for tracking) */
  modelSource?: ConfigSource;
}

interface ResolvedValue<T> {
  value: T | undefined;
  source: ConfigSource | undefined;
}

/**
 * Result of building adapter configuration
 */
export interface AdapterConfigResult {
  /** Adapter configuration for creating the client */
  adapterConfig: AdapterConfig;
  /** Resolved configuration with source tracking for manifest */
  resolvedConfig: ResolvedConfig;
}

/**
 * Build adapter configuration with proper precedence and source tracking
 *
 * Resolution order for each field:
 * CLI > scenarioConfig > fileConfig.providers[provider] > environment variable > default
 */
export function buildAdapterConfig(options: AdapterConfigOptions): AdapterConfigResult {
  const {
    provider,
    model,
    temperature,
    maxTokens,
    scenarioConfig,
    fileConfig,
    providerSource = 'cli',
    modelSource,
  } = options;

  // Get provider-specific config from artemis.config.yaml
  const fileProviderConfig = fileConfig?.providers?.[provider];

  // Build resolved config based on provider
  switch (provider) {
    case 'openai':
      return buildOpenAIConfig({
        provider,
        providerSource,
        model,
        modelSource,
        temperature,
        maxTokens,
        scenarioConfig,
        fileProviderConfig,
      });

    case 'azure-openai':
      return buildAzureOpenAIConfig({
        provider,
        providerSource,
        model,
        modelSource,
        temperature,
        maxTokens,
        scenarioConfig,
        fileProviderConfig,
      });

    case 'vercel-ai':
      return buildVercelAIConfig({
        provider,
        providerSource,
        model,
        modelSource,
        temperature,
        maxTokens,
        scenarioConfig,
        fileProviderConfig,
      });

    case 'anthropic':
      return buildAnthropicConfig({
        provider,
        providerSource,
        model,
        modelSource,
        temperature,
        maxTokens,
        scenarioConfig,
        fileProviderConfig,
      });

    default:
      // Fallback for unknown providers - treat as OpenAI-compatible
      return buildOpenAIConfig({
        provider,
        providerSource,
        model,
        modelSource,
        temperature,
        maxTokens,
        scenarioConfig,
        fileProviderConfig,
      });
  }
}

interface ProviderBuildOptions {
  provider: string;
  providerSource: ConfigSource;
  model?: string;
  modelSource?: ConfigSource;
  temperature?: number;
  maxTokens?: number;
  scenarioConfig?: ProviderConfig;
  fileProviderConfig?: ProviderConfig;
}

function buildOpenAIConfig(options: ProviderBuildOptions): AdapterConfigResult {
  const {
    provider,
    providerSource,
    model,
    modelSource,
    temperature,
    maxTokens,
    scenarioConfig,
    fileProviderConfig,
  } = options;

  const resolvedModel = resolveValueWithSource<string>(
    { value: model, source: modelSource },
    { value: scenarioConfig?.defaultModel, source: 'scenario' },
    { value: fileProviderConfig?.defaultModel, source: 'config' }
  );

  const resolvedBaseUrl = resolveValueWithSource<string>(
    { value: scenarioConfig?.baseUrl, source: 'scenario' },
    { value: fileProviderConfig?.baseUrl, source: 'config' }
  );

  const resolvedOrganization = resolveValueWithSource<string>(
    { value: scenarioConfig?.organization, source: 'scenario' },
    { value: fileProviderConfig?.organization, source: 'config' },
    { value: process.env.OPENAI_ORGANIZATION, source: 'env' }
  );

  const resolvedTimeout = resolveValueWithSource<number>(
    { value: scenarioConfig?.timeout, source: 'scenario' },
    { value: fileProviderConfig?.timeout, source: 'config' }
  );

  const resolvedMaxRetries = resolveValueWithSource<number>(
    { value: scenarioConfig?.maxRetries, source: 'scenario' },
    { value: fileProviderConfig?.maxRetries, source: 'config' }
  );

  // Temperature and maxTokens only come from CLI options
  const resolvedTemperature = resolveValueWithSource<number>({ value: temperature, source: 'cli' });

  const resolvedMaxTokens = resolveValueWithSource<number>({ value: maxTokens, source: 'cli' });

  return {
    adapterConfig: {
      provider: 'openai',
      apiKey: resolveValue(
        scenarioConfig?.apiKey,
        fileProviderConfig?.apiKey,
        process.env.OPENAI_API_KEY
      ),
      baseUrl: resolvedBaseUrl.value,
      organization: resolvedOrganization.value,
      defaultModel: resolvedModel.value,
      timeout: resolvedTimeout.value,
      maxRetries: resolvedMaxRetries.value,
    },
    resolvedConfig: {
      provider,
      model: resolvedModel.value,
      base_url: resolvedBaseUrl.value,
      organization: resolvedOrganization.value,
      timeout: resolvedTimeout.value,
      max_retries: resolvedMaxRetries.value,
      temperature: resolvedTemperature.value,
      max_tokens: resolvedMaxTokens.value,
      source: {
        provider: providerSource,
        model: resolvedModel.source,
        base_url: resolvedBaseUrl.source,
        organization: resolvedOrganization.source,
        timeout: resolvedTimeout.source,
        max_retries: resolvedMaxRetries.source,
        temperature: resolvedTemperature.source,
        max_tokens: resolvedMaxTokens.source,
      },
    },
  };
}

function buildAzureOpenAIConfig(options: ProviderBuildOptions): AdapterConfigResult {
  const {
    provider,
    providerSource,
    model,
    modelSource,
    temperature,
    maxTokens,
    scenarioConfig,
    fileProviderConfig,
  } = options;

  const resolvedModel = resolveValueWithSource<string>(
    { value: model, source: modelSource },
    { value: scenarioConfig?.defaultModel, source: 'scenario' },
    { value: fileProviderConfig?.defaultModel, source: 'config' }
  );

  const resolvedResourceName = resolveValueWithSource<string>(
    { value: scenarioConfig?.resourceName, source: 'scenario' },
    { value: fileProviderConfig?.resourceName, source: 'config' },
    { value: process.env.AZURE_OPENAI_RESOURCE, source: 'env' }
  );

  const resolvedDeploymentName = resolveValueWithSource<string>(
    { value: scenarioConfig?.deploymentName, source: 'scenario' },
    { value: fileProviderConfig?.deploymentName, source: 'config' },
    { value: process.env.AZURE_OPENAI_DEPLOYMENT, source: 'env' }
  );

  const resolvedApiVersion = resolveValueWithSource<string>(
    { value: scenarioConfig?.apiVersion, source: 'scenario' },
    { value: fileProviderConfig?.apiVersion, source: 'config' },
    { value: process.env.AZURE_OPENAI_API_VERSION, source: 'env' },
    { value: '2024-02-15-preview', source: 'default' }
  );

  const resolvedTimeout = resolveValueWithSource<number>(
    { value: scenarioConfig?.timeout, source: 'scenario' },
    { value: fileProviderConfig?.timeout, source: 'config' }
  );

  const resolvedMaxRetries = resolveValueWithSource<number>(
    { value: scenarioConfig?.maxRetries, source: 'scenario' },
    { value: fileProviderConfig?.maxRetries, source: 'config' }
  );

  // Temperature and maxTokens only come from CLI options
  const resolvedTemperature = resolveValueWithSource<number>({ value: temperature, source: 'cli' });

  const resolvedMaxTokens = resolveValueWithSource<number>({ value: maxTokens, source: 'cli' });

  return {
    adapterConfig: {
      provider: 'azure-openai',
      apiKey: resolveValue(
        scenarioConfig?.apiKey,
        fileProviderConfig?.apiKey,
        process.env.AZURE_OPENAI_API_KEY
      ),
      resourceName: resolvedResourceName.value || '',
      deploymentName: resolvedDeploymentName.value || '',
      apiVersion: resolvedApiVersion.value,
      defaultModel: resolvedModel.value,
      timeout: resolvedTimeout.value,
      maxRetries: resolvedMaxRetries.value,
    },
    resolvedConfig: {
      provider,
      model: resolvedModel.value,
      resource_name: resolvedResourceName.value,
      deployment_name: resolvedDeploymentName.value,
      api_version: resolvedApiVersion.value,
      timeout: resolvedTimeout.value,
      max_retries: resolvedMaxRetries.value,
      temperature: resolvedTemperature.value,
      max_tokens: resolvedMaxTokens.value,
      source: {
        provider: providerSource,
        model: resolvedModel.source,
        resource_name: resolvedResourceName.source,
        deployment_name: resolvedDeploymentName.source,
        api_version: resolvedApiVersion.source,
        timeout: resolvedTimeout.source,
        max_retries: resolvedMaxRetries.source,
        temperature: resolvedTemperature.source,
        max_tokens: resolvedMaxTokens.source,
      },
    },
  };
}

function buildVercelAIConfig(options: ProviderBuildOptions): AdapterConfigResult {
  const {
    provider,
    providerSource,
    model,
    modelSource,
    temperature,
    maxTokens,
    scenarioConfig,
    fileProviderConfig,
  } = options;

  const resolvedModel = resolveValueWithSource<string>(
    { value: model, source: modelSource },
    { value: scenarioConfig?.defaultModel, source: 'scenario' },
    { value: fileProviderConfig?.defaultModel, source: 'config' }
  );

  const resolvedUnderlyingProvider = resolveValueWithSource<string>(
    { value: scenarioConfig?.underlyingProvider, source: 'scenario' },
    { value: fileProviderConfig?.underlyingProvider, source: 'config' },
    { value: 'openai', source: 'default' }
  );

  const resolvedTimeout = resolveValueWithSource<number>(
    { value: scenarioConfig?.timeout, source: 'scenario' },
    { value: fileProviderConfig?.timeout, source: 'config' }
  );

  const resolvedMaxRetries = resolveValueWithSource<number>(
    { value: scenarioConfig?.maxRetries, source: 'scenario' },
    { value: fileProviderConfig?.maxRetries, source: 'config' }
  );

  // Temperature and maxTokens only come from CLI options
  const resolvedTemperature = resolveValueWithSource<number>({ value: temperature, source: 'cli' });

  const resolvedMaxTokens = resolveValueWithSource<number>({ value: maxTokens, source: 'cli' });

  return {
    adapterConfig: {
      provider: 'vercel-ai',
      underlyingProvider: resolvedUnderlyingProvider.value as 'openai' | 'anthropic',
      apiKey: resolveValue(
        scenarioConfig?.apiKey,
        fileProviderConfig?.apiKey,
        process.env.OPENAI_API_KEY
      ),
      defaultModel: resolvedModel.value,
      timeout: resolvedTimeout.value,
      maxRetries: resolvedMaxRetries.value,
    },
    resolvedConfig: {
      provider,
      model: resolvedModel.value,
      underlying_provider: resolvedUnderlyingProvider.value,
      timeout: resolvedTimeout.value,
      max_retries: resolvedMaxRetries.value,
      temperature: resolvedTemperature.value,
      max_tokens: resolvedMaxTokens.value,
      source: {
        provider: providerSource,
        model: resolvedModel.source,
        underlying_provider: resolvedUnderlyingProvider.source,
        timeout: resolvedTimeout.source,
        max_retries: resolvedMaxRetries.source,
        temperature: resolvedTemperature.source,
        max_tokens: resolvedMaxTokens.source,
      },
    },
  };
}

function buildAnthropicConfig(options: ProviderBuildOptions): AdapterConfigResult {
  const {
    provider,
    providerSource,
    model,
    modelSource,
    temperature,
    maxTokens,
    scenarioConfig,
    fileProviderConfig,
  } = options;

  const resolvedModel = resolveValueWithSource<string>(
    { value: model, source: modelSource },
    { value: scenarioConfig?.defaultModel, source: 'scenario' },
    { value: fileProviderConfig?.defaultModel, source: 'config' }
  );

  const resolvedBaseUrl = resolveValueWithSource<string>(
    { value: scenarioConfig?.baseUrl, source: 'scenario' },
    { value: fileProviderConfig?.baseUrl, source: 'config' }
  );

  const resolvedTimeout = resolveValueWithSource<number>(
    { value: scenarioConfig?.timeout, source: 'scenario' },
    { value: fileProviderConfig?.timeout, source: 'config' }
  );

  const resolvedMaxRetries = resolveValueWithSource<number>(
    { value: scenarioConfig?.maxRetries, source: 'scenario' },
    { value: fileProviderConfig?.maxRetries, source: 'config' }
  );

  // Temperature and maxTokens only come from CLI options
  const resolvedTemperature = resolveValueWithSource<number>({ value: temperature, source: 'cli' });

  const resolvedMaxTokens = resolveValueWithSource<number>({ value: maxTokens, source: 'cli' });

  return {
    adapterConfig: {
      provider: 'anthropic',
      apiKey: resolveValue(
        scenarioConfig?.apiKey,
        fileProviderConfig?.apiKey,
        process.env.ANTHROPIC_API_KEY
      ),
      baseUrl: resolvedBaseUrl.value,
      defaultModel: resolvedModel.value,
      timeout: resolvedTimeout.value,
      maxRetries: resolvedMaxRetries.value,
    },
    resolvedConfig: {
      provider,
      model: resolvedModel.value,
      base_url: resolvedBaseUrl.value,
      timeout: resolvedTimeout.value,
      max_retries: resolvedMaxRetries.value,
      temperature: resolvedTemperature.value,
      max_tokens: resolvedMaxTokens.value,
      source: {
        provider: providerSource,
        model: resolvedModel.source,
        base_url: resolvedBaseUrl.source,
        timeout: resolvedTimeout.source,
        max_retries: resolvedMaxRetries.source,
        temperature: resolvedTemperature.source,
        max_tokens: resolvedMaxTokens.source,
      },
    },
  };
}

/**
 * Resolve a configuration value with source tracking
 * Returns the first defined (non-undefined) value and its source
 */
function resolveValueWithSource<T>(
  ...options: { value: T | undefined | null; source: ConfigSource | undefined }[]
): ResolvedValue<T> {
  for (const option of options) {
    if (option.value !== undefined && option.value !== null && option.value !== '') {
      return { value: option.value as T, source: option.source };
    }
  }
  return { value: undefined, source: undefined };
}

/**
 * Resolve a configuration value with precedence (without source tracking)
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
 * Get the effective provider from various sources with source tracking
 */
export function resolveProviderWithSource(
  cliProvider?: string,
  scenarioProvider?: string,
  configProvider?: string
): { provider: string; source: ConfigSource } {
  if (cliProvider) return { provider: cliProvider, source: 'cli' };
  if (scenarioProvider) return { provider: scenarioProvider, source: 'scenario' };
  if (configProvider) return { provider: configProvider, source: 'config' };
  return { provider: 'openai', source: 'default' };
}

/**
 * Get the effective model from various sources with source tracking
 */
export function resolveModelWithSource(
  cliModel?: string,
  scenarioModel?: string,
  configModel?: string
): { model: string | undefined; source: ConfigSource | undefined } {
  if (cliModel) return { model: cliModel, source: 'cli' };
  if (scenarioModel) return { model: scenarioModel, source: 'scenario' };
  if (configModel) return { model: configModel, source: 'config' };
  return { model: undefined, source: undefined };
}

/**
 * Get the effective provider from various sources (legacy - without source tracking)
 */
export function resolveProvider(
  cliProvider?: string,
  scenarioProvider?: string,
  configProvider?: string
): string {
  return cliProvider || scenarioProvider || configProvider || 'openai';
}

/**
 * Get the effective model from various sources (legacy - without source tracking)
 */
export function resolveModel(
  cliModel?: string,
  scenarioModel?: string,
  configModel?: string
): string | undefined {
  return cliModel || scenarioModel || configModel;
}
