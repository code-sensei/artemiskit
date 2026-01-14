/**
 * Configuration schema for artemis.config.yaml
 */

import { z } from 'zod';

const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  defaultModel: z.string().optional(),
  timeout: z.number().optional(),
  maxRetries: z.number().optional(),
  // OpenAI specific
  organization: z.string().optional(),
  // Azure specific
  resourceName: z.string().optional(),
  deploymentName: z.string().optional(),
  apiVersion: z.string().optional(),
  // Vercel AI specific
  underlyingProvider: z.enum(['openai', 'azure', 'anthropic', 'google', 'mistral']).optional(),
});

const StorageConfigSchema = z.object({
  type: z.enum(['supabase', 'local']).default('local'),
  url: z.string().optional(),
  anonKey: z.string().optional(),
  bucket: z.string().optional(),
  basePath: z.string().optional(),
});

const OutputConfigSchema = z.object({
  format: z.enum(['json', 'html', 'both']).default('json'),
  dir: z.string().default('./artemis-output'),
});

const CIConfigSchema = z.object({
  failOnRegression: z.boolean().default(true),
  regressionThreshold: z.number().min(0).max(1).default(0.05),
  baselineStrategy: z.enum(['latest', 'tagged', 'specific']).default('latest'),
  baselineRunId: z.string().optional(),
});

export const ArtemisConfigSchema = z.object({
  project: z.string().default('default'),
  provider: z.string().optional(),
  model: z.string().optional(),
  providers: z.record(ProviderConfigSchema).optional(),
  storage: StorageConfigSchema.optional(),
  scenariosDir: z.string().default('./scenarios'),
  output: OutputConfigSchema.optional(),
  ci: CIConfigSchema.optional(),
});

export type ArtemisConfig = z.infer<typeof ArtemisConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
