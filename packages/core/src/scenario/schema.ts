/**
 * Scenario schema definitions using Zod
 */

import { z } from 'zod';

/**
 * Provider schema - supports all providers
 */
export const ProviderSchema = z.enum([
  'openai',
  'azure-openai',
  'vercel-ai',
  'anthropic',
  'google',
  'mistral',
  'cohere',
  'huggingface',
  'ollama',
  'custom',
]);

/**
 * Provider config schema - optional overrides for provider settings
 * Supports ${ENV_VAR} and ${ENV_VAR:-default} syntax for values
 * All fields are optional - only specified fields override defaults
 */
export const ProviderConfigSchema = z
  .object({
    // Common fields
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    defaultModel: z.string().optional(),
    timeout: z.number().optional(),
    maxRetries: z.number().optional(),

    // OpenAI specific
    organization: z.string().optional(),

    // Azure OpenAI specific
    resourceName: z.string().optional(),
    deploymentName: z.string().optional(),
    apiVersion: z.string().optional(),

    // Vercel AI specific
    underlyingProvider: z.enum(['openai', 'azure', 'anthropic', 'google', 'mistral']).optional(),
  })
  .optional();

/**
 * Expected result types - how to evaluate responses
 */
export const ExpectedSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('exact'),
    value: z.string(),
    caseSensitive: z.boolean().optional().default(true),
  }),

  z.object({
    type: z.literal('regex'),
    pattern: z.string(),
    flags: z.string().optional(),
  }),

  z.object({
    type: z.literal('fuzzy'),
    value: z.string(),
    threshold: z.number().min(0).max(1).default(0.8),
  }),

  z.object({
    type: z.literal('llm_grader'),
    rubric: z.string(),
    model: z.string().optional(),
    provider: ProviderSchema.optional(),
    threshold: z.number().min(0).max(1).default(0.7),
  }),

  z.object({
    type: z.literal('contains'),
    values: z.array(z.string()),
    mode: z.enum(['all', 'any']).default('all'),
  }),

  z.object({
    type: z.literal('json_schema'),
    schema: z.record(z.unknown()),
  }),

  z.object({
    type: z.literal('custom'),
    evaluator: z.string(),
    config: z.record(z.unknown()).optional(),
  }),
]);

/**
 * Chat message schema
 */
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

/**
 * Test case schema
 */
export const TestCaseSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  prompt: z.union([z.string(), z.array(ChatMessageSchema)]),
  expected: ExpectedSchema,
  tags: z.array(z.string()).optional().default([]),
  metadata: z.record(z.unknown()).optional().default({}),
  timeout: z.number().optional(),
  retries: z.number().optional().default(0),
  provider: ProviderSchema.optional(),
  model: z.string().optional(),
});

/**
 * Scenario schema - a collection of test cases
 */
export const ScenarioSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional().default('1.0'),
  provider: ProviderSchema.optional(),
  model: z.string().optional(),
  providerConfig: ProviderConfigSchema,
  seed: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().optional(),
  tags: z.array(z.string()).optional().default([]),
  setup: z
    .object({
      systemPrompt: z.string().optional(),
      functions: z.array(z.unknown()).optional(),
    })
    .optional(),
  cases: z.array(TestCaseSchema).min(1),
  teardown: z
    .object({
      cleanup: z.boolean().optional(),
    })
    .optional(),
});

export type Expected = z.infer<typeof ExpectedSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ChatMessageType = z.infer<typeof ChatMessageSchema>;
