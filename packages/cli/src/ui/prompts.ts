/**
 * Interactive prompts module
 * Provides Inquirer-based user prompts for CLI interactivity
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { isTTY } from './utils.js';
import { Spinner } from './live-status.js';

/**
 * Check if interactive mode is available
 */
export function isInteractive(): boolean {
  return isTTY && process.stdin.isTTY === true;
}

/**
 * Provider options for selection
 * Note: Only providers with implemented adapters are included
 */
export const PROVIDER_CHOICES = [
  { name: 'OpenAI (GPT-4o, GPT-4.1, o3, etc.)', value: 'openai' },
  { name: 'Azure OpenAI', value: 'azure-openai' },
  { name: 'Vercel AI SDK', value: 'vercel-ai' },
  { name: 'Anthropic (Claude)', value: 'anthropic' },
  // { name: 'Google AI (Gemini)', value: 'google' },
  // { name: 'Mistral AI', value: 'mistral' },
  // { name: 'Ollama (Local)', value: 'ollama' },
];

/**
 * Known models by provider - used for validation
 * Updated January 2026
 */
export const KNOWN_MODELS: Record<string, string[]> = {
  openai: [
    // GPT-5 series
    'gpt-5.2',
    'gpt-5.1',
    'gpt-5',
    // GPT-4.1 series
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    // GPT-4o series
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4o-audio-preview',
    // GPT-4 series
    'gpt-4-turbo',
    'gpt-4-turbo-preview',
    'gpt-4',
    // o-series reasoning models
    'o4-mini',
    'o3',
    'o3-mini',
    'o1',
    'o1-mini',
    'o1-preview',
    // Legacy
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k',
  ],
  'azure-openai': [
    // Azure uses deployment names, so we can't validate strictly
    // Common deployment patterns
  ],
  'vercel-ai': [
    // Vercel AI SDK uses provider/model format or direct model names
    // It wraps other providers, so validation is provider-dependent
  ],
  anthropic: [
    // Claude 4.5 series (latest)
    'claude-opus-4-5-20250901',
    'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5-20251015',
    // Claude 4.1 series
    'claude-opus-4-1-20250805',
    // Claude 4 series
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
    // Claude 3.5 series
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    'claude-3-5-haiku-20241022',
    // Claude 3 series (some deprecated)
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  google: [
    // Gemini 3.0 series (Latest)
    'gemini-3.0-ultra',
    'gemini-3.0-pro',
    'gemini-3.0-flash',
    // Gemini 2.5 series
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-preview-04-17',
    // Gemini 2.0 series
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-thinking-exp',
    'gemini-2.0-pro',
    'gemini-2.0-pro-exp',
    // Gemini 1.5 series
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    // Legacy
    'gemini-pro',
    'gemini-pro-vision',
  ],
  mistral: [
    // Latest models
    'mistral-large-latest',
    'mistral-large-2411',
    'mistral-medium-latest',
    'mistral-small-latest',
    'mistral-small-2409',
    // Specialized
    'codestral-latest',
    'codestral-2405',
    'ministral-8b-latest',
    'ministral-3b-latest',
    // Open models
    'open-mistral-nemo',
    'open-mixtral-8x22b',
    'open-mixtral-8x7b',
  ],
  ollama: [
    // Popular local models
    'llama3.3',
    'llama3.2',
    'llama3.1',
    'llama3',
    'llama2',
    'mistral',
    'mixtral',
    'codellama',
    'phi3',
    'gemma2',
    'qwen2.5',
    'deepseek-coder-v2',
  ],
};

/**
 * Model choices displayed in the prompt
 * Updated January 2026
 */
export const MODEL_CHOICES: Record<string, { name: string; value: string }[]> = {
  openai: [
    { name: 'gpt-4.1 (Latest, best for coding)', value: 'gpt-4.1' },
    { name: 'gpt-4.1-mini (Fast, cost-effective)', value: 'gpt-4.1-mini' },
    { name: 'gpt-4o (Multimodal, audio support)', value: 'gpt-4o' },
    { name: 'gpt-4o-mini (Fast multimodal)', value: 'gpt-4o-mini' },
    { name: 'o3 (Advanced reasoning)', value: 'o3' },
    { name: 'o3-mini (Fast reasoning)', value: 'o3-mini' },
    { name: 'gpt-3.5-turbo (Legacy, budget)', value: 'gpt-3.5-turbo' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  'azure-openai': [
    { name: 'Use deployment name from config', value: '' },
    { name: 'Enter deployment name', value: '__custom__' },
  ],
  'vercel-ai': [
    { name: 'gpt-4.1 (via OpenAI)', value: 'gpt-4.1' },
    { name: 'gpt-4o (via OpenAI)', value: 'gpt-4o' },
    { name: 'claude-sonnet-4-5 (via Anthropic)', value: 'claude-sonnet-4-5-20250929' },
    { name: 'gemini-2.0-flash (via Google)', value: 'gemini-2.0-flash' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  anthropic: [
    { name: 'claude-sonnet-4-5 (Latest, recommended)', value: 'claude-sonnet-4-5-20250929' },
    { name: 'claude-opus-4-5 (Most capable)', value: 'claude-opus-4-5-20250901' },
    { name: 'claude-haiku-4-5 (Fast, efficient)', value: 'claude-haiku-4-5-20251015' },
    { name: 'claude-opus-4-1 (Agentic tasks)', value: 'claude-opus-4-1-20250805' },
    { name: 'claude-sonnet-4 (Previous gen)', value: 'claude-sonnet-4-20250514' },
    { name: 'claude-3-5-sonnet (Legacy)', value: 'claude-3-5-sonnet-20241022' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  google: [
    { name: 'gemini-3.0-pro (Latest, most capable)', value: 'gemini-3.0-pro' },
    { name: 'gemini-3.0-flash (Latest, fast)', value: 'gemini-3.0-flash' },
    { name: 'gemini-2.5-pro (Previous gen, capable)', value: 'gemini-2.5-pro' },
    { name: 'gemini-2.5-flash (Previous gen, fast)', value: 'gemini-2.5-flash' },
    { name: 'gemini-2.0-flash (Fast multimodal)', value: 'gemini-2.0-flash' },
    { name: 'gemini-1.5-pro (Long context)', value: 'gemini-1.5-pro' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  mistral: [
    { name: 'mistral-large-latest (Most capable)', value: 'mistral-large-latest' },
    { name: 'mistral-small-latest (Fast, efficient)', value: 'mistral-small-latest' },
    { name: 'codestral-latest (Code generation)', value: 'codestral-latest' },
    { name: 'ministral-8b-latest (Lightweight)', value: 'ministral-8b-latest' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  ollama: [
    { name: 'llama3.3 (Latest Llama)', value: 'llama3.3' },
    { name: 'llama3.2 (Multimodal)', value: 'llama3.2' },
    { name: 'mistral (7B, fast)', value: 'mistral' },
    { name: 'codellama (Code generation)', value: 'codellama' },
    { name: 'phi3 (Microsoft, efficient)', value: 'phi3' },
    { name: 'qwen2.5 (Alibaba)', value: 'qwen2.5' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
};

/**
 * Prompt user to select a provider
 */
export async function promptProvider(message = 'Select a provider:'): Promise<string> {
  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message,
      choices: PROVIDER_CHOICES,
    },
  ]);
  return provider;
}

/**
 * Vercel AI SDK provider detection patterns
 * Maps model name prefixes to their underlying provider
 * Based on Vercel AI SDK documentation (January 2026)
 */
const VERCEL_AI_PROVIDER_PATTERNS: { pattern: RegExp; provider: string; description: string }[] = [
  // OpenAI patterns
  { pattern: /^gpt-/i, provider: 'openai', description: 'OpenAI GPT models' },
  { pattern: /^o[134]-/i, provider: 'openai', description: 'OpenAI o-series reasoning models' },
  { pattern: /^chatgpt-/i, provider: 'openai', description: 'OpenAI ChatGPT models' },
  { pattern: /^davinci/i, provider: 'openai', description: 'OpenAI Davinci models' },

  // Anthropic patterns
  { pattern: /^claude-/i, provider: 'anthropic', description: 'Anthropic Claude models' },

  // Google patterns
  { pattern: /^gemini-/i, provider: 'google', description: 'Google Gemini models' },
  { pattern: /^models\/gemini/i, provider: 'google', description: 'Google Gemini (full path)' },

  // Mistral patterns
  { pattern: /^mistral-/i, provider: 'mistral', description: 'Mistral AI models' },
  { pattern: /^pixtral-/i, provider: 'mistral', description: 'Mistral Pixtral vision models' },
  { pattern: /^ministral-/i, provider: 'mistral', description: 'Mistral Ministral models' },
  { pattern: /^magistral-/i, provider: 'mistral', description: 'Mistral Magistral models' },
  { pattern: /^codestral/i, provider: 'mistral', description: 'Mistral Codestral models' },
  { pattern: /^open-mistral-/i, provider: 'mistral', description: 'Mistral open models' },
  { pattern: /^open-mixtral-/i, provider: 'mistral', description: 'Mistral Mixtral models' },

  // xAI patterns
  { pattern: /^grok-/i, provider: 'xai', description: 'xAI Grok models' },

  // DeepSeek patterns
  { pattern: /^deepseek-/i, provider: 'deepseek', description: 'DeepSeek models' },

  // Cohere patterns
  { pattern: /^command-/i, provider: 'cohere', description: 'Cohere Command models' },
  { pattern: /^c4ai-/i, provider: 'cohere', description: 'Cohere C4AI models' },

  // Meta/Llama patterns (could be Groq, Together, Fireworks, etc.)
  { pattern: /^llama-/i, provider: 'meta', description: 'Meta Llama models (various providers)' },
  { pattern: /^meta-llama/i, provider: 'meta', description: 'Meta Llama models (full name)' },

  // Groq patterns
  { pattern: /^groq\//i, provider: 'groq', description: 'Groq provider prefix' },

  // Amazon Bedrock patterns
  { pattern: /^amazon\./i, provider: 'amazon-bedrock', description: 'Amazon Bedrock models' },
  { pattern: /^anthropic\./i, provider: 'amazon-bedrock', description: 'Anthropic via Bedrock' },

  // Azure patterns
  { pattern: /^azure\//i, provider: 'azure-openai', description: 'Azure OpenAI deployment' },
];

/**
 * Detect the underlying provider for a Vercel AI SDK model
 */
function detectVercelAIProvider(model: string): { provider: string; description: string } | null {
  for (const { pattern, provider, description } of VERCEL_AI_PROVIDER_PATTERNS) {
    if (pattern.test(model)) {
      return { provider, description };
    }
  }
  return null;
}

/**
 * Check if a model is in the known models list for a provider
 */
function isKnownModel(provider: string, model: string): boolean {
  const knownModels = KNOWN_MODELS[provider];
  if (!knownModels || knownModels.length === 0) {
    // Providers like azure-openai and vercel-ai don't have strict model lists
    return true;
  }
  return knownModels.includes(model);
}

/**
 * Validate a custom model with the user
 * Implements hybrid validation: static check + optional API validation
 */
async function validateCustomModel(provider: string, model: string): Promise<string | null> {
  // Handle Azure OpenAI - deployment names are user-defined
  if (provider === 'azure-openai') {
    console.log(chalk.yellow('\n  ⚠ Azure OpenAI uses deployment names, not model names.\n'));
    console.log(
      chalk.dim(
        '  Ensure your deployment exists in your Azure OpenAI resource.\n' +
          '  Common deployment names: gpt-4o, gpt-4-turbo, gpt-35-turbo\n'
      )
    );

    const { azureAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'azureAction',
        message: 'How would you like to proceed?',
        choices: [
          { name: `Continue with "${model}" (I know this deployment exists)`, value: 'continue' },
          { name: 'Test the deployment with a quick API call', value: 'validate' },
          { name: 'Enter a different deployment name', value: 'retry' },
        ],
      },
    ]);

    if (azureAction === 'continue') {
      console.log(chalk.dim(`\n  Using deployment "${model}".\n`));
      return model;
    }

    if (azureAction === 'retry') {
      return null;
    }

    if (azureAction === 'validate') {
      return await performApiValidation(provider, model);
    }

    return model;
  }

  // Handle Vercel AI SDK - detect underlying provider and validate
  if (provider === 'vercel-ai') {
    const detected = detectVercelAIProvider(model);

    if (detected) {
      console.log(chalk.cyan(`\n  ✓ Detected: ${detected.description} (${detected.provider})\n`));

      // Check if the model is known for the underlying provider
      if (isKnownModel(detected.provider, model)) {
        console.log(chalk.dim(`  Model "${model}" is recognized.\n`));
        return model;
      }

      // Model not known - offer validation
      console.log(
        chalk.yellow(`  ⚠ "${model}" is not in our known models list for ${detected.provider}.\n`)
      );
    } else {
      console.log(
        chalk.yellow(
          `\n  ⚠ Could not detect provider for "${model}".\n` +
            '  This might be a custom model or provider-specific format.\n'
        )
      );
    }

    const { vercelAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'vercelAction',
        message: 'How would you like to proceed?',
        choices: [
          { name: `Continue with "${model}"`, value: 'continue' },
          { name: 'Test the model with a quick API call', value: 'validate' },
          { name: 'Enter a different model', value: 'retry' },
        ],
      },
    ]);

    if (vercelAction === 'continue') {
      console.log(chalk.dim(`\n  Using model "${model}".\n`));
      return model;
    }

    if (vercelAction === 'retry') {
      return null;
    }

    if (vercelAction === 'validate') {
      return await performApiValidation(provider, model);
    }

    return model;
  }

  // Standard provider validation
  // Check if model is in known list
  if (isKnownModel(provider, model)) {
    return model;
  }

  // Model not in known list - prompt user
  console.log(chalk.yellow(`\n  ⚠ "${model}" is not in our known models list for ${provider}.\n`));
  console.log(chalk.dim('  This could be a fine-tuned model, new release, or a typo.\n'));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'How would you like to proceed?',
      choices: [
        { name: 'Continue anyway (I know this model exists)', value: 'continue' },
        { name: 'Test the model with a quick API call', value: 'validate' },
        { name: 'Enter a different model', value: 'retry' },
      ],
    },
  ]);

  if (action === 'continue') {
    console.log(chalk.dim(`\n  Proceeding with model "${model}".\n`));
    return model;
  }

  if (action === 'retry') {
    return null;
  }

  if (action === 'validate') {
    return await performApiValidation(provider, model);
  }

  return model;
}

/**
 * Perform API validation for a model
 */
async function performApiValidation(provider: string, model: string): Promise<string | null> {
  const spinner = new Spinner();
  spinner.start(`Validating model "${model}" with ${provider}...`);

  try {
    // Dynamic import to avoid circular dependencies
    const { createAdapter } = await import('@artemiskit/core');

    const client = await createAdapter({
      provider: provider as 'openai' | 'anthropic' | 'azure-openai' | 'vercel-ai',
      defaultModel: model,
    });

    // Make minimal API call using generate
    await client.generate({
      prompt: [{ role: 'user', content: 'hi' }],
      maxTokens: 1,
    });

    spinner.succeed(`Model "${model}" validated successfully`);
    return model;
  } catch (error) {
    spinner.fail(`Model validation failed: ${(error as Error).message}`);

    const { retryAfterFail } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retryAfterFail',
        message: 'Would you like to enter a different model?',
        default: true,
      },
    ]);

    if (retryAfterFail) {
      return null;
    }

    // User wants to proceed anyway despite failure
    const { forceUse } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'forceUse',
        message: `Use "${model}" anyway? (API call failed but you might have different credentials at runtime)`,
        default: false,
      },
    ]);

    return forceUse ? model : null;
  }
}

/**
 * Prompt user to select a model for a given provider
 * Includes hybrid validation for custom models
 */
export async function promptModel(provider: string, message = 'Select a model:'): Promise<string> {
  const choices = MODEL_CHOICES[provider] || [{ name: 'Enter model name', value: '__custom__' }];

  const { model } = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message,
      choices,
    },
  ]);

  if (model === '__custom__') {
    const { customModel } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customModel',
        message: 'Enter model name:',
        validate: (input: string) => input.trim().length > 0 || 'Model name is required',
      },
    ]);

    // Validate the custom model
    const validatedModel = await validateCustomModel(provider, customModel.trim());

    if (validatedModel === null) {
      // User wants to retry - recursively call promptModel
      return promptModel(provider, message);
    }

    return validatedModel;
  }

  return model;
}

/**
 * Prompt user to select scenarios from a list
 */
export async function promptScenarios(
  scenarios: { path: string; name: string }[],
  message = 'Select scenarios to run:'
): Promise<string[]> {
  if (scenarios.length === 0) {
    return [];
  }

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message,
      choices: scenarios.map((s) => ({
        name: `${s.name} ${chalk.dim(`(${s.path})`)}`,
        value: s.path,
        checked: true,
      })),
      validate: (input: string[]) => input.length > 0 || 'Please select at least one scenario',
    },
  ]);

  return selected;
}

/**
 * Prompt for confirmation
 */
export async function promptConfirm(message: string, defaultValue = true): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue,
    },
  ]);
  return confirmed;
}

/**
 * Prompt for text input
 */
export async function promptInput(
  message: string,
  options: {
    default?: string;
    validate?: (input: string) => boolean | string;
  } = {}
): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'input',
      name: 'value',
      message,
      default: options.default,
      validate: options.validate,
    },
  ]);
  return value;
}

/**
 * Prompt for a password/secret (hidden input)
 */
export async function promptPassword(
  message: string,
  options: {
    validate?: (input: string) => boolean | string;
  } = {}
): Promise<string> {
  const { value } = await inquirer.prompt([
    {
      type: 'password',
      name: 'value',
      message,
      mask: '*',
      validate: options.validate,
    },
  ]);
  return value;
}

/**
 * Prompt for selection from a list
 */
export async function promptSelect<T extends string>(
  message: string,
  choices: { name: string; value: T }[]
): Promise<T> {
  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message,
      choices,
    },
  ]);
  return selected;
}

/**
 * Interactive init wizard configuration
 */
export interface InitWizardResult {
  projectName: string;
  provider: string;
  model: string;
  storageType: 'local' | 'supabase';
  createExample: boolean;
}

/**
 * Run the interactive init wizard
 */
export async function runInitWizard(): Promise<InitWizardResult> {
  console.log(chalk.cyan("\n  Let's set up ArtemisKit for your project!\n"));

  // Project name
  const { projectName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: 'my-project',
      validate: (input: string) =>
        /^[a-z0-9-]+$/i.test(input) || 'Project name must be alphanumeric with dashes',
    },
  ]);

  // Provider selection
  const provider = await promptProvider('Select your primary provider:');

  // Model selection (with validation)
  const model = await promptModel(provider, 'Select your default model:');

  // Storage type
  const { storageType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'storageType',
      message: 'Where should test results be stored?',
      choices: [
        { name: 'Local filesystem (./artemis-runs)', value: 'local' },
        { name: 'Supabase (cloud storage)', value: 'supabase' },
      ],
    },
  ]);

  // Create example scenario
  const createExample = await promptConfirm('Create an example scenario?', true);

  return {
    projectName,
    provider,
    model,
    storageType,
    createExample,
  };
}

/**
 * Prompt for API key if not set
 */
export async function promptApiKeyIfNeeded(
  provider: string,
  envVarName: string
): Promise<string | null> {
  const existingKey = process.env[envVarName];
  if (existingKey) {
    return null; // Already set
  }

  console.log(chalk.yellow(`\n  ${chalk.bold(envVarName)} is not set in your environment.\n`));

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `How would you like to provide the ${provider} API key?`,
      choices: [
        { name: 'Enter it now (for this session only)', value: 'enter' },
        { name: "Skip (I'll set it later)", value: 'skip' },
      ],
    },
  ]);

  if (action === 'skip') {
    return null;
  }

  const apiKey = await promptPassword(`Enter your ${provider} API key:`, {
    validate: (input) => input.trim().length > 0 || 'API key is required',
  });

  return apiKey;
}

/**
 * Get the environment variable name for a provider's API key
 */
export function getApiKeyEnvVar(provider: string): string {
  const envVars: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    'azure-openai': 'AZURE_OPENAI_API_KEY',
    'vercel-ai': 'OPENAI_API_KEY', // Vercel AI typically uses underlying provider keys
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_AI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
  };
  return envVars[provider] || `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}
