import { dirname, resolve } from 'node:path';
import {
  type AdapterConfig,
  type AgentTarget,
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
    if (options.client) target = createModelClientTarget(options.client);
    else {
      let initialized: Promise<AgentTarget> | undefined;
      const getTarget = () => {
        initialized ??= createAdapter({
          ...config.providerConfig,
          ...options.providerConfig,
          provider: workflow.target.provider,
          defaultModel: workflow.target.model,
          maxRetries: 0,
        } as AdapterConfig)
          .then(createModelClientTarget)
          .catch(() => {
            throw new ArtemisError('Unable to initialize workflow target', 'PROVIDER_UNAVAILABLE');
          });
        return initialized;
      };
      target = options.checkpoint
        ? {
            provider: workflow.target.provider,
            capabilities: async (limits, signal) =>
              (await getTarget()).capabilities(limits, signal),
            turn: async (request, signal) => (await getTarget()).turn(request, signal),
            drain: async (limits) =>
              initialized
                ? ((await initialized).drain?.(limits) ?? { pendingOperations: 0 })
                : { pendingOperations: 0 },
          }
        : await getTarget();
    }
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
    semanticJudge: options.semanticJudge,
    onEvent: options.onEvent,
    checkpoint: options.checkpoint,
    pauseAfterActions: options.pauseAfterActions,
  });
}
