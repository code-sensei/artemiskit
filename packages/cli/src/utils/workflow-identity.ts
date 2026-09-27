import { createHash } from 'node:crypto';
import type { AdapterConfig } from '@artemiskit/core';

/** Include upstream SDK ambient defaults without initializing a transport or exposing values. */
export function workflowTransportIdentity(config: AdapterConfig): string {
  const value = config as AdapterConfig & Record<string, unknown>;
  const ambient: Record<string, unknown> = {};
  if (['openai', 'azure-openai', 'ling'].includes(config.provider)) {
    ambient.apiKey = value.apiKey ?? process.env.OPENAI_API_KEY;
    ambient.organization =
      config.provider === 'openai'
        ? (value.organization ?? process.env.OPENAI_ORG_ID)
        : process.env.OPENAI_ORG_ID;
    ambient.project = process.env.OPENAI_PROJECT_ID;
    if (config.provider === 'openai')
      ambient.baseUrl = value.baseUrl ?? process.env.OPENAI_BASE_URL;
  } else if (config.provider === 'anthropic') {
    ambient.apiKey = value.apiKey ?? process.env.ANTHROPIC_API_KEY;
    ambient.authToken = process.env.ANTHROPIC_AUTH_TOKEN;
    ambient.baseUrl = value.baseUrl ?? process.env.ANTHROPIC_BASE_URL;
  } else if (config.provider === 'vercel-ai') {
    ambient.apiKey = value.apiKey ?? process.env.OPENAI_API_KEY;
    ambient.baseUrl = value.baseUrl ?? process.env.OPENAI_BASE_URL;
  }
  return createHash('sha256').update(JSON.stringify({ config, ambient })).digest('hex');
}
