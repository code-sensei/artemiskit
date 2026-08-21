import type { AgentHarness, AgentTask } from '@artemiskit/core';
import { TrueForge } from '@truefoundry/trueforge-sdk';
import {
  normalizeTrueForgeActions,
  sanitizeTrueForgeEvents,
  sanitizeTrueForgeText,
  sanitizeTrueForgeValue,
} from './mapper';
import type {
  TrueForgeAdapterConfig,
  TrueForgeAgentOutcome,
  TrueForgeClient,
  TrueForgeEvent,
  TrueForgeOutcomeCollection,
  TrueForgeOutcomeContext,
  TrueForgeSetupResult,
} from './types';

const DEFAULT_BASE_URL = 'http://localhost:8790';
const CANCELLATION_GRACE_MS = 100;
const DEFAULT_FAILURE_COLLECTION_GRACE_MS = 250;
const MAX_FAILURE_COLLECTION_GRACE_MS = 1_000;

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
    let outcomeCollection: Promise<TrueForgeOutcomeCollection> | undefined;
    let cancellationStarted = false;
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const cancelSession = async () => {
      if (!sessionId || cancellationStarted) return;
      cancellationStarted = true;
      await this.cancelBestEffort(sessionId);
    };

    const execution = async (): Promise<TrueForgeOutcomeCollection> => {
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
      if (controller.signal.aborted) {
        await cancelSession();
        throw new Error('turn-aborted');
      }
      const stream = await this.client.sessions.createTurnStream(
        sessionId,
        { input: [{ type: 'user.message', content: prompt }] },
        this.requestOptions(timeoutMs, controller.signal)
      );
      if (controller.signal.aborted) throw new Error('turn-aborted');

      for await (const event of stream) {
        if (controller.signal.aborted) throw new Error('turn-aborted');
        events.push(event);
        if (event.type === 'turn.created') turnId = event.turnId;
        if (event.type === 'turn.done') {
          terminalEvent = event;
          break;
        }
      }

      if (!terminalEvent) throw new Error('TrueForge turn ended without a terminal event');
      if (terminalEvent.state.status !== 'done') {
        throw new Error(
          terminalEvent.state.status === 'error'
            ? terminalEvent.state.message
            : `TrueForge turn was ${terminalEvent.state.status}`
        );
      }
      if (terminalEvent.state.requiredActions.length > 0) {
        throw new Error('TrueForge turn requires additional action before completion');
      }
      if (!sessionId || !turnId) {
        throw new Error('TrueForge did not return session and turn identifiers');
      }

      outcomeCollection = this.invokeOutcomeCollector({
        task,
        sessionId,
        turnId,
        events,
        terminalState: terminalEvent.state,
      });
      return outcomeCollection;
    };

    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('turn-timeout'));
      }, timeoutMs);
    });

    try {
      const collected = await Promise.race([execution(), timeout]);
      if (!terminalEvent || terminalEvent.state.status !== 'done' || !sessionId || !turnId) {
        throw new Error('TrueForge execution completed without a valid terminal state');
      }

      return this.sanitizeOutcome({
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
      });
    } catch (error) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
      if (sessionId && (timedOut || !terminalEvent)) {
        controller.abort();
        await cancelSession();
      }
      const collected = await this.collectFailureEvidence(
        {
          task,
          sessionId,
          turnId,
          events,
          terminalState: terminalEvent?.state,
        },
        outcomeCollection
      );
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
        collected,
      });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
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
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timeoutHandle = setTimeout(resolve, CANCELLATION_GRACE_MS);
    });
    const cancellation = Promise.resolve()
      .then(() =>
        this.client.sessions.cancel(sessionId, {}, { maxRetries: 0, timeoutInSeconds: 1 })
      )
      .then(() => undefined)
      .catch(() => {
        // The run outcome remains authoritative when cancellation cannot be confirmed.
      });

    try {
      await Promise.race([cancellation, timeout]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private collectSensitiveValues(): string[] {
    const values = [this.config.token, this.config.setup?.provider?.auth?.apiKey];
    const auth = this.config.setup?.mcpServer?.auth;
    if (auth?.type === 'header') values.push(...Object.values(auth.headers));
    return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private invokeOutcomeCollector(context: TrueForgeOutcomeContext) {
    return Promise.resolve().then(() =>
      this.config.collectOutcome({
        ...context,
        events: context.events.map((event) => structuredClone(event)),
      })
    );
  }

  private async collectFailureEvidence(
    context: TrueForgeOutcomeContext,
    existingCollection?: Promise<TrueForgeOutcomeCollection>
  ): Promise<TrueForgeOutcomeCollection | undefined> {
    const collection = existingCollection ?? this.invokeOutcomeCollector(context);
    const graceMs = Math.max(
      1,
      Math.min(
        this.config.failureCollectionGraceMs ?? DEFAULT_FAILURE_COLLECTION_GRACE_MS,
        MAX_FAILURE_COLLECTION_GRACE_MS
      )
    );
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(undefined), graceMs);
    });

    try {
      return await Promise.race([collection.catch(() => undefined), timeout]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private sanitizeOutcome(outcome: TrueForgeAgentOutcome): TrueForgeAgentOutcome {
    return sanitizeTrueForgeValue(outcome, this.sensitiveValues);
  }

  private failureOutcome(input: {
    collected?: TrueForgeOutcomeCollection;
    error: string;
    events: TrueForgeEvent[];
    sessionId?: string;
    startedAt: string;
    task: AgentTask;
    terminalEvent?: Extract<TrueForgeEvent, { type: 'turn.done' }>;
    turnId?: string;
  }): TrueForgeAgentOutcome {
    const completedAt = input.terminalEvent?.state.completedAt ?? new Date().toISOString();
    return this.sanitizeOutcome({
      taskId: input.task.id,
      completed: false,
      acceptancePassed: input.collected?.acceptancePassed ?? false,
      error: input.error,
      ...(input.collected?.finalDiff === undefined ? {} : { finalDiff: input.collected.finalDiff }),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.turnId ? { turnId: input.turnId } : {}),
      ...(input.terminalEvent?.state.metrics ? { metrics: input.terminalEvent.state.metrics } : {}),
      trace: {
        taskId: input.task.id,
        actions: normalizeTrueForgeActions(input.events, this.sensitiveValues),
        changedPaths: input.collected?.changedPaths ?? [],
        startedAt: input.startedAt,
        completedAt,
      },
      evidence: { events: sanitizeTrueForgeEvents(input.events, this.sensitiveValues) },
    });
  }
}
