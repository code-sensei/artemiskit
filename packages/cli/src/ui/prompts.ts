/**
 * Interactive prompts module
 * Provides Inquirer-based user prompts for CLI interactivity
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { isTTY } from './utils.js';

/**
 * Check if interactive mode is available
 */
export function isInteractive(): boolean {
  return isTTY && process.stdin.isTTY === true;
}

/**
 * Provider options for selection
 */
export const PROVIDER_CHOICES = [
  { name: 'OpenAI (GPT-4, GPT-4o, etc.)', value: 'openai' },
  { name: 'Azure OpenAI', value: 'azure-openai' },
  { name: 'Anthropic (Claude)', value: 'anthropic' },
  { name: 'Google AI (Gemini)', value: 'google' },
  { name: 'Mistral AI', value: 'mistral' },
  { name: 'Ollama (Local)', value: 'ollama' },
];

/**
 * Common model options by provider
 */
export const MODEL_CHOICES: Record<string, { name: string; value: string }[]> = {
  openai: [
    { name: 'gpt-4o (Latest, recommended)', value: 'gpt-4o' },
    { name: 'gpt-4o-mini (Fast, cost-effective)', value: 'gpt-4o-mini' },
    { name: 'gpt-4-turbo', value: 'gpt-4-turbo' },
    { name: 'gpt-4', value: 'gpt-4' },
    { name: 'gpt-3.5-turbo', value: 'gpt-3.5-turbo' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  'azure-openai': [
    { name: 'Use deployment name from config', value: '' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  anthropic: [
    { name: 'claude-sonnet-4-20250514 (Latest)', value: 'claude-sonnet-4-20250514' },
    { name: 'claude-3-5-sonnet-20241022', value: 'claude-3-5-sonnet-20241022' },
    { name: 'claude-3-opus-20240229', value: 'claude-3-opus-20240229' },
    { name: 'claude-3-haiku-20240307 (Fast)', value: 'claude-3-haiku-20240307' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  google: [
    { name: 'gemini-1.5-pro', value: 'gemini-1.5-pro' },
    { name: 'gemini-1.5-flash', value: 'gemini-1.5-flash' },
    { name: 'gemini-pro', value: 'gemini-pro' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  mistral: [
    { name: 'mistral-large-latest', value: 'mistral-large-latest' },
    { name: 'mistral-medium-latest', value: 'mistral-medium-latest' },
    { name: 'mistral-small-latest', value: 'mistral-small-latest' },
    { name: 'Other (specify)', value: '__custom__' },
  ],
  ollama: [
    { name: 'llama3.2', value: 'llama3.2' },
    { name: 'llama3.1', value: 'llama3.1' },
    { name: 'mistral', value: 'mistral' },
    { name: 'codellama', value: 'codellama' },
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
 * Prompt user to select a model for a given provider
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
    return customModel;
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

  // Model selection
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
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_AI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
  };
  return envVars[provider] || `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}
