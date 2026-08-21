import type { AgentHarness, AgentTask } from '@artemiskit/core';
import { TrueForge } from '@truefoundry/trueforge-sdk';
import {
  normalizeTrueForgeActions,
  sanitizeTrueForgeEvents,
  sanitizeTrueForgeText,
} from './mapper';
import type {
  TrueForgeAdapterConfig,
  TrueForgeAgentOutcome,
  TrueForgeClient,
  TrueForgeEvent,
  TrueForgeSetupResult,
} from './types';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8790';

function providerName(
  config: NonNullable<TrueForgeAdapterConfig['setup']>['provider']
): string | undefined {
  if (!config) return undefined;
  return config.type === 'custom' ? config.name : config.type;
}

export class TrueForgeAdapter implements AgentHarness {
  private readonly client: TrueForgeClient;
  private readonly config: TrueForgeAdapterConfig;
  private readonly sensitiveValues: string[];

  constructor(config: TrueForgeAdapterConfig, client?: TrueForgeClient) {
    this.config = config;
    this.client =
      client ??
      (new TrueForge({
        baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
        ...(config.token ? { token: config.token } : { auth: false }),
        ...(config.fetch ? { fetch: config.fetch } : {}),
        maxRetries: config.maxRetries ?? 0,
      }) as TrueForgeClient);
    this.sensitiveValues = this.collectSensitiveValues();
  }

  /** Explicitly upserts configured settings. run() never invokes this method. */
  async setup(): Promise<TrueForgeSetupResult> {
    const setup = this.config.setup;
    if (!setup) return {};

    if (setup.provider) {
      try {
        await this.client.settings.modelProviders.createOrUpdate({
          manifest: setup.provider,
        });
      } catch {
        throw new Error('Failed to configure the TrueForge model provider');
      }
    }

    if (setup.mcpServer) {
      try {
        await this.client.settings.mcpServers.createOrUpdate({
          manifest: setup.mcpServer,
        });
      } catch {
        throw new Error('Failed to configure the TrueForge MCP server');
      }
    }

    return {
      ...(setup.provider ? { providerName: providerName(setup.provider) } : {}),
      ...(setup.mcpServer ? { mcpServerName: setup.mcpServer.name } : {}),
    };
  }

  async run(task: AgentTask): Promise<TrueForgeAgentOutcome> {
    const startedAt = new Date().toISOString();
    const events: TrueForgeEvent[] = [];
    const controller = new AbortController();
    const timeoutMs = Math.max(
      1,
      Math.min(task.timeoutMs, this.config.turnTimeoutMs ?? task.timeoutMs)
    );
    let sessionId: string | undefined;
    let turnId: string | undefined;
    let terminalEvent: Extract<TrueForgeEvent, { type: 'turn.done' }> | undefined;
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const execution = async () => {
      const prompt =
        this.config.buildPrompt !== undefined
          ? await this.config.buildPrompt(task)
          : this.config.prompt;
      if (!prompt.trim()) throw new Error('TrueForge task prompt must not be empty');

      const session = await this.client.sessions.create(
        { agent: { spec: this.config.agent } },
        this.requestOptions(timeoutMs, controller.signal)
      );
      sessionId = session.data.id;
      const stream = await this.client.sessions.createTurnStream(
        sessionId,
        { input: [{ type: 'user.message', content: prompt }] },
        this.requestOptions(timeoutMs, controller.signal)
      );

      for await (const event of stream) {
        events.push(event);
        if (event.type === 'turn.created') turnId = event.turnId;
        if (event.type === 'turn.done') {
          terminalEvent = event;
          break;
        }
      }
    };

    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('turn-timeout'));
      }, timeoutMs);
    });

    try {
      await Promise.race([execution(), timeout]);
    } catch (error) {
      if (timedOut && sessionId) await this.cancelBestEffort(sessionId);
      return this.failureOutcome({
        task,
        events,
        startedAt,
        sessionId,
        turnId,
        terminalEvent,
        error: timedOut
          ? `TrueForge turn timed out after ${String(timeoutMs)}ms`
          : sanitizeTrueForgeText(
              error instanceof Error ? error.message : 'TrueForge execution failed',
              this.sensitiveValues
            ),
      });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    if (!terminalEvent) {
      return this.failureOutcome({
        task,
        events,
        startedAt,
        sessionId,
        turnId,
        error: 'TrueForge turn ended without a terminal event',
      });
    }

    if (terminalEvent.state.status !== 'done') {
      const detail =
        terminalEvent.state.status === 'error'
          ? terminalEvent.state.message
          : `TrueForge turn was ${terminalEvent.state.status}`;
      return this.failureOutcome({
        task,
        events,
        startedAt,
        sessionId,
        turnId,
        terminalEvent,
        error: sanitizeTrueForgeText(detail, this.sensitiveValues),
      });
    }

    if (terminalEvent.state.requiredActions.length > 0) {
      return this.failureOutcome({
        task,
        events,
        startedAt,
        sessionId,
        turnId,
        terminalEvent,
        error: 'TrueForge turn requires additional action before completion',
      });
    }

    if (!sessionId || !turnId) {
      return this.failureOutcome({
        task,
        events,
        startedAt,
        sessionId,
        turnId,
        terminalEvent,
        error: 'TrueForge did not return session and turn identifiers',
      });
    }

    try {
      const collected = await this.config.collectOutcome({
        task,
        sessionId,
        turnId,
        events,
        terminalState: terminalEvent.state,
      });
      return {
        taskId: task.id,
        completed: true,
        acceptancePassed: collected.acceptancePassed,
        ...(collected.finalDiff === undefined ? {} : { finalDiff: collected.finalDiff }),
        sessionId,
        turnId,
        ...(terminalEvent.state.metrics ? { metrics: terminalEvent.state.metrics } : {}),
        trace: {
          taskId: task.id,
          actions: normalizeTrueForgeActions(events, this.sensitiveValues),
          changedPaths: collected.changedPaths,
          startedAt,
          completedAt: terminalEvent.state.completedAt,
        },
        evidence: { events: sanitizeTrueForgeEvents(events, this.sensitiveValues) },
      };
    } catch (error) {
      return this.failureOutcome({
        task,
        events,
        startedAt,
        sessionId,
        turnId,
        terminalEvent,
        error: sanitizeTrueForgeText(
          error instanceof Error ? error.message : 'TrueForge outcome collection failed',
          this.sensitiveValues
        ),
      });
    }
  }

  private requestOptions(timeoutMs: number, abortSignal: AbortSignal) {
    return {
      abortSignal,
      maxRetries: this.config.maxRetries ?? 0,
      timeoutInSeconds: Math.max(1, Math.ceil(timeoutMs / 1_000)),
    };
  }

  private async cancelBestEffort(sessionId: string): Promise<void> {
    try {
      await this.client.sessions.cancel(sessionId, {}, { maxRetries: 0, timeoutInSeconds: 5 });
    } catch {
      // The timeout outcome is still authoritative when cancellation cannot be confirmed.
    }
  }

  private collectSensitiveValues(): string[] {
    const values = [this.config.token, this.config.setup?.provider?.auth?.apiKey];
    const auth = this.config.setup?.mcpServer?.auth;
    if (auth?.type === 'header') values.push(...Object.values(auth.headers));
    return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private failureOutcome(input: {
    error: string;
    events: TrueForgeEvent[];
    sessionId?: string;
    startedAt: string;
    task: AgentTask;
    terminalEvent?: Extract<TrueForgeEvent, { type: 'turn.done' }>;
    turnId?: string;
  }): TrueForgeAgentOutcome {
    const completedAt = input.terminalEvent?.state.completedAt ?? new Date().toISOString();
    return {
      taskId: input.task.id,
      completed: false,
      acceptancePassed: false,
      error: input.error,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.turnId ? { turnId: input.turnId } : {}),
      ...(input.terminalEvent?.state.metrics ? { metrics: input.terminalEvent.state.metrics } : {}),
      trace: {
        taskId: input.task.id,
        actions: normalizeTrueForgeActions(input.events, this.sensitiveValues),
        changedPaths: [],
        startedAt: input.startedAt,
        completedAt,
      },
      evidence: { events: sanitizeTrueForgeEvents(input.events, this.sensitiveValues) },
    };
  }
}
