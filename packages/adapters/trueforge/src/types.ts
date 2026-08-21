import type { AgentOutcome, AgentTask } from '@artemiskit/core';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

export type TrueForgeEvent = TrueForgeApi.TurnStreamingEvent;

export interface TrueForgeRequestOptions {
  abortSignal?: AbortSignal;
  maxRetries?: number;
  timeoutInSeconds?: number;
}

/** Narrow SDK seam used to keep unit tests deterministic and offline. */
export interface TrueForgeClient {
  settings: {
    modelProviders: {
      createOrUpdate(
        request: { manifest: TrueForgeApi.ModelProviderManifest },
        options?: TrueForgeRequestOptions
      ): PromiseLike<unknown>;
    };
    mcpServers: {
      createOrUpdate(
        request: { manifest: TrueForgeApi.McpServerManifest },
        options?: TrueForgeRequestOptions
      ): PromiseLike<unknown>;
    };
  };
  sessions: {
    create(
      request: TrueForgeApi.CreateSessionRequest,
      options?: TrueForgeRequestOptions
    ): PromiseLike<{ data: { id: string } }>;
    createTurnStream(
      sessionId: string,
      request: TrueForgeApi.CreateTurnSessionsStreamRequest,
      options?: TrueForgeRequestOptions
    ): PromiseLike<AsyncIterable<TrueForgeEvent>>;
    cancel(
      sessionId: string,
      request?: TrueForgeApi.CancelSessionRequest,
      options?: TrueForgeRequestOptions
    ): PromiseLike<unknown>;
  };
}

export interface TrueForgeOutcomeCollection {
  acceptancePassed: boolean;
  changedPaths: string[];
  finalDiff?: string;
}

export interface TrueForgeOutcomeContext {
  events: readonly TrueForgeEvent[];
  sessionId: string;
  task: AgentTask;
  terminalState: TrueForgeApi.TurnDoneEventState;
  turnId: string;
}

export type TrueForgeOutcomeCollector = (
  context: TrueForgeOutcomeContext
) => Promise<TrueForgeOutcomeCollection>;

export interface TrueForgeSetupConfig {
  mcpServer?: TrueForgeApi.McpServerManifest;
  provider?: TrueForgeApi.ModelProviderManifest;
}

export interface TrueForgeSetupResult {
  mcpServerName?: string;
  providerName?: string;
}

interface TrueForgeAdapterConfigBase {
  /** Inline TrueForge agent definition used for each isolated evaluation session. */
  agent: TrueForgeApi.AgentSpec;
  baseUrl?: string;
  collectOutcome: TrueForgeOutcomeCollector;
  fetch?: typeof fetch;
  maxRetries?: number;
  /** Settings are changed only when setup() is explicitly called. */
  setup?: TrueForgeSetupConfig;
  /** OIDC ID token. Standalone TrueForge does not require one. */
  token?: string;
  /** Adapter ceiling; the task timeout remains authoritative when lower. */
  turnTimeoutMs?: number;
}

export type TrueForgeAdapterConfig = TrueForgeAdapterConfigBase &
  (
    | { buildPrompt: (task: AgentTask) => Promise<string> | string; prompt?: never }
    | { buildPrompt?: never; prompt: string }
  );

export interface SanitizedTrueForgeEvent extends Record<string, unknown> {
  type: string;
}

export interface TrueForgeEvidence {
  events: SanitizedTrueForgeEvent[];
}

export interface TrueForgeAgentOutcome extends AgentOutcome {
  evidence: TrueForgeEvidence;
  metrics?: TrueForgeApi.TurnMetrics;
  sessionId?: string;
  turnId?: string;
}

export interface LingProviderSetupOptions {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
  modelName?: string;
  modelProperties?: TrueForgeApi.ModelProperties;
  providerName?: string;
}

export interface LingProviderSetup {
  model: TrueForgeApi.Model;
  provider: TrueForgeApi.CustomModelProvider;
}

/** Builds TrueForge's custom OpenAI-compatible provider payload for Ling. */
export function createLingProviderSetup(options: LingProviderSetupOptions = {}): LingProviderSetup {
  const providerName = options.providerName ?? 'ling';
  const modelName = options.modelName ?? 'ling-3-flash';
  return {
    model: { name: `${providerName}/${modelName}` },
    provider: {
      type: 'custom',
      name: providerName,
      baseUrl: options.baseUrl ?? 'https://api.ant-ling.com/v1',
      ...(options.apiKey ? { auth: { apiKey: options.apiKey } } : {}),
      models: [
        {
          modelId: options.modelId ?? 'Ling-3.0-flash',
          name: modelName,
          properties: options.modelProperties ?? {},
        },
      ],
    },
  };
}
