import { type ModelClient, type WorkflowJudgeOptions, createAdapter } from '@artemiskit/core';
import { loadConfig } from '../config/loader';
import { buildAdapterConfig } from './adapter';

export class WorkflowJudgeConfigError extends Error {
  constructor(readonly exitCode: 1 | 2 | 3) {
    super('Unable to prepare explicit workflow judge configuration');
  }
}

/** Explicit authorization only; loading transport settings must not initialize the judge. */
export async function prepareWorkflowJudge(path: string): Promise<WorkflowJudgeOptions> {
  if (!path.trim()) throw new WorkflowJudgeConfigError(2);
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(path);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    throw new WorkflowJudgeConfigError(code?.startsWith('E') ? 1 : 2);
  }
  if (!config) throw new WorkflowJudgeConfigError(1);
  if (
    !config.provider?.trim() ||
    config.provider.length > 256 ||
    !config.model?.trim() ||
    config.model.length > 256 ||
    !config.workflowJudge
  )
    throw new WorkflowJudgeConfigError(2);
  const provider = config.provider;
  const model = config.model;
  const { adapterConfig } = buildAdapterConfig({
    provider,
    model,
    fileConfig: config,
    providerSource: 'config',
    modelSource: 'config',
  });
  // The general builder supports fallback; explicit assurance configuration must not.
  if (adapterConfig.provider !== provider) throw new WorkflowJudgeConfigError(3);
  let initialized: Promise<ModelClient> | undefined;
  async function getClient(): Promise<ModelClient> {
    initialized ??= createAdapter({ ...adapterConfig, defaultModel: model, maxRetries: 0 });
    const client = await initialized;
    if (client.provider !== provider) throw new Error('judge_provider_mismatch');
    return client;
  }
  const client: ModelClient = {
    provider,
    async capabilities() {
      const adapter = await getClient();
      const capabilities = await adapter.capabilities();
      if (adapter.provider !== provider) throw new Error('judge_provider_mismatch');
      return capabilities;
    },
    async generate(request) {
      if (request.signal?.aborted) throw new Error('judge_cancelled');
      const adapter = await getClient();
      if (request.signal?.aborted) throw new Error('judge_cancelled');
      const result = await adapter.generate({ ...request, model, maxRetries: 0 });
      if (adapter.provider !== provider) throw new Error('judge_provider_mismatch');
      return result;
    },
  };
  return { provider, model, limits: { ...config.workflowJudge }, client };
}
