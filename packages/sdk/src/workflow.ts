import { dirname, resolve } from 'node:path';
import {
  type AdapterConfig,
  type AgentWorkflowSession,
  ArtemisError,
  createAdapter,
  createAgentWorkflowSession,
  createModelClientTarget,
  loadAgentWorkflow,
  validateAgentWorkflow,
} from '@artemiskit/core';
import type { ArtemisKitConfig, WorkflowRunOptions } from './types';

export async function prepareWorkflowSession(
  options: WorkflowRunOptions,
  config: ArtemisKitConfig
): Promise<AgentWorkflowSession> {
  if (options.client && options.target) throw new Error('Choose a workflow client or target');
  const file = typeof options.workflow === 'string' ? resolve(options.workflow) : undefined;
  const workflow = file ? await loadAgentWorkflow(file) : validateAgentWorkflow(options.workflow);
  let target = options.target;
  if (!target) {
    let client = options.client;
    if (!client) {
      try {
        client = await createAdapter({
          ...config.providerConfig,
          ...options.providerConfig,
          provider: workflow.target.provider,
          defaultModel: workflow.target.model,
          maxRetries: 0,
        } as AdapterConfig);
      } catch {
        // Provider factories may put credentials or configuration values in their diagnostics.
        throw new ArtemisError('Unable to initialize workflow target', 'PROVIDER_UNAVAILABLE');
      }
    }
    target = createModelClientTarget(client);
  }
  return createAgentWorkflowSession({
    workflow,
    target,
    fixtureRoot: options.fixtureRoot ?? (file ? dirname(file) : undefined),
    environmentFactory: options.environmentFactory,
    preflight: options.preflight,
    preflightOnly: options.preflightOnly,
    signal: options.signal,
    cleanupTimeoutMs: options.cleanupTimeoutMs,
    onEvent: options.onEvent,
  });
}
