import { describe, expect, it } from 'bun:test';
import type { AgentTask } from '@artemiskit/core';
import { TrueForgeAdapter } from './client';
import { normalizeTrueForgeActions, sanitizeTrueForgeEvents } from './mapper';
import { type TrueForgeClient, createLingProviderSetup } from './types';

const TASK: AgentTask = {
  id: 'scenario-repair',
  fixturePath: '/fixtures/scenario-repair',
  allowedPaths: ['scenario.yaml'],
  allowedTools: ['workspace_read', 'workspace_patch', 'workspace_run'],
  maxActions: 8,
  timeoutMs: 1_000,
  acceptanceCommands: ['akit validate scenario.yaml'],
};

const TURN_CREATED = {
  type: 'turn.created' as const,
  id: 'event-1',
  turnId: 'turn-1',
  previousTurnId: null,
  state: { status: 'running' as const },
  createdAt: '2026-08-21T10:00:00.000Z',
  threadId: null,
};

const TURN_DONE = {
  type: 'turn.done' as const,
  id: 'event-4',
  threadId: null,
  createdAt: '2026-08-21T10:00:01.000Z',
  state: {
    status: 'done' as const,
    output: null,
    requiredActions: [],
    completedAt: '2026-08-21T10:00:01.000Z',
    metrics: { totalInputTokens: 20, totalOutputTokens: 5, totalTokens: 25 },
  },
};

function createClient(events = [TURN_CREATED, TURN_DONE]) {
  const calls = {
    sessions: [] as unknown[],
    turns: [] as unknown[],
    cancellations: [] as string[],
    providers: [] as unknown[],
    mcpServers: [] as unknown[],
  };

  const client: TrueForgeClient = {
    settings: {
      modelProviders: {
        async createOrUpdate(request) {
          calls.providers.push(request);
          return { data: { name: request.manifest.type } };
        },
      },
      mcpServers: {
        async createOrUpdate(request) {
          calls.mcpServers.push(request);
          return { data: { name: request.manifest.name } };
        },
      },
    },
    sessions: {
      async create(request) {
        calls.sessions.push(request);
        return { data: { id: 'session-1' } };
      },
      async createTurnStream(sessionId, request) {
        calls.turns.push({ sessionId, request });
        return (async function* () {
          for (const event of events) yield event;
        })();
      },
      async cancel(sessionId) {
        calls.cancellations.push(sessionId);
        return {};
      },
    },
  };

  return { client, calls };
}

describe('TrueForge event mapping', () => {
  it('maps correlated MCP calls to semantic actions and redacts retained content', () => {
    const events = [
      TURN_CREATED,
      {
        type: 'model.message' as const,
        id: 'event-2',
        threadId: 'main',
        createdAt: '2026-08-21T10:00:00.100Z',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function' as const,
            function: { name: 'workspace_run', arguments: '{"command":"akit validate"}' },
            providerSpecificFields: {
              authorization: 'fixture-sensitive-value',
              authToken: 'auth-token-fixture',
              clientSecret: 'client-secret-fixture',
              credentials: { value: 'credentials-fixture' },
              inputTokens: 12,
              'private-key-pem': 'private-key-fixture',
            },
            toolInfo: {
              type: 'mcp' as const,
              serverId: 'server-1',
              serverName: 'sandbox',
              name: 'workspace_run',
            },
          },
        ],
      },
      {
        type: 'tool.response' as const,
        id: 'event-3',
        threadId: 'main',
        toolCallId: 'call-1',
        content:
          '{"exitCode":0,"stdout":"token=fixture-sensitive-value","contact":"owner@example.com"}',
        createdAt: '2026-08-21T10:00:00.350Z',
      },
      TURN_DONE,
    ];
    const originalEvents = structuredClone(events);

    expect(normalizeTrueForgeActions(events, ['fixture-sensitive-value'])).toEqual([
      {
        type: 'command',
        name: 'workspace_run',
        status: 'success',
        durationMs: 250,
        summary: '{"exitCode":0,"stdout":"[REDACTED]","contact":"[REDACTED]"}',
      },
    ]);
    const sanitized = sanitizeTrueForgeEvents(events, ['fixture-sensitive-value']);
    expect(JSON.stringify(sanitized)).not.toContain('fixture-sensitive-value');
    expect(JSON.stringify(sanitized)).not.toContain('owner@example.com');
    expect(JSON.stringify(sanitized)).not.toContain('auth-token-fixture');
    expect(JSON.stringify(sanitized)).not.toContain('client-secret-fixture');
    expect(JSON.stringify(sanitized)).not.toContain('credentials-fixture');
    expect(JSON.stringify(sanitized)).not.toContain('private-key-fixture');
    expect(
      (sanitized[1].toolCalls as Array<{ providerSpecificFields: Record<string, unknown> }>)[0]
        .providerSpecificFields.inputTokens
    ).toBe(12);
    expect(events).toEqual(originalEvents);
  });

  it('normalizes qualified tool names and marks non-zero command exits as errors', () => {
    const events = [
      {
        type: 'model.message' as const,
        id: 'event-1',
        threadId: 'main',
        createdAt: '2026-08-21T10:00:00.000Z',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function' as const,
            function: { name: 'sandbox__workspace_run', arguments: '{}' },
            toolInfo: {
              type: 'mcp' as const,
              serverId: 'server-1',
              serverName: 'sandbox',
              name: 'sandbox__workspace_run',
            },
          },
        ],
      },
      {
        type: 'tool.response' as const,
        id: 'event-2',
        threadId: 'main',
        toolCallId: 'call-1',
        content: '{"exitCode":2,"stderr":"validation failed"}',
        createdAt: '2026-08-21T10:00:00.010Z',
      },
    ];

    expect(normalizeTrueForgeActions(events)).toEqual([
      {
        type: 'command',
        name: 'workspace_run',
        status: 'error',
        durationMs: 10,
        summary: '{"exitCode":2,"stderr":"validation failed"}',
      },
    ]);
  });

  it('merges SDK message deltas before correlating tool responses without mutating events', () => {
    const events = [
      {
        type: 'model.message' as const,
        id: 'message-1',
        threadId: 'main',
        createdAt: '2026-08-21T10:00:00.000Z',
        content: '',
      },
      {
        type: 'model.message.delta' as const,
        id: 'message-1',
        threadId: 'main',
        createdAt: '2026-08-21T10:00:00.005Z',
        toolCalls: [
          {
            index: 0,
            id: 'call-delta',
            type: 'function' as const,
            function: { name: 'sandbox__workspace_read', arguments: '{"path":"scenario.yaml"}' },
            toolInfo: {
              type: 'mcp' as const,
              serverId: 'server-1',
              serverName: 'sandbox',
              name: 'sandbox__workspace_read',
            },
          },
        ],
      },
      {
        type: 'tool.response' as const,
        id: 'event-response',
        threadId: 'main',
        toolCallId: 'call-delta',
        content: '{"content":"scenario"}',
        createdAt: '2026-08-21T10:00:00.020Z',
      },
    ];
    const originalEvents = structuredClone(events);

    expect(normalizeTrueForgeActions(events)).toEqual([
      {
        type: 'file',
        name: 'workspace_read',
        status: 'success',
        durationMs: 20,
        summary: '{"content":"scenario"}',
      },
    ]);
    expect(events).toEqual(originalEvents);
  });

  it('detects nested MCP command failures in structured content', () => {
    const events = [
      {
        type: 'model.message' as const,
        id: 'event-1',
        threadId: 'main',
        createdAt: '2026-08-21T10:00:00.000Z',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function' as const,
            function: { name: 'workspace_run', arguments: '{}' },
            toolInfo: {
              type: 'mcp' as const,
              serverId: 'server-1',
              serverName: 'sandbox',
              name: 'workspace_run',
            },
          },
        ],
      },
      {
        type: 'tool.response' as const,
        id: 'event-2',
        threadId: 'main',
        toolCallId: 'call-1',
        content: '{"structuredContent":{"exitCode":7,"stderr":"invalid scenario"}}',
        createdAt: '2026-08-21T10:00:00.010Z',
      },
    ];

    expect(normalizeTrueForgeActions(events)[0]?.status).toBe('error');
  });
});

describe('TrueForgeAdapter', () => {
  it('builds a Ling-compatible custom provider and model reference', () => {
    expect(createLingProviderSetup()).toEqual({
      model: { name: 'ling/ling-3-flash' },
      provider: {
        type: 'custom',
        name: 'ling',
        baseUrl: 'https://api.ant-ling.com/v1',
        models: [{ modelId: 'Ling-3.0-flash', name: 'ling-3-flash', properties: {} }],
      },
    });
  });

  it('runs a session and streamed turn without mutating settings', async () => {
    const { client, calls } = createClient();
    const adapter = new TrueForgeAdapter(
      {
        agent: {
          model: { name: 'ling/ling-3-flash' },
          mcpServers: [{ name: 'sandbox', enableTools: ['@all'], requireApprovalForTools: [] }],
        },
        buildPrompt: (task) => `Repair the fixture at ${task.fixturePath}`,
        collectOutcome: async () => ({
          acceptancePassed: true,
          changedPaths: ['scenario.yaml'],
          finalDiff: 'diff --git a/scenario.yaml b/scenario.yaml',
        }),
      },
      client
    );

    const outcome = await adapter.run(TASK);

    expect(calls.providers).toEqual([]);
    expect(calls.mcpServers).toEqual([]);
    expect(calls.sessions).toEqual([
      {
        agent: {
          spec: {
            model: { name: 'ling/ling-3-flash' },
            mcpServers: [{ name: 'sandbox', enableTools: ['@all'], requireApprovalForTools: [] }],
          },
        },
      },
    ]);
    expect(calls.turns).toEqual([
      {
        sessionId: 'session-1',
        request: {
          input: [
            { type: 'user.message', content: 'Repair the fixture at /fixtures/scenario-repair' },
          ],
        },
      },
    ]);
    expect(outcome).toMatchObject({
      taskId: 'scenario-repair',
      completed: true,
      acceptancePassed: true,
      sessionId: 'session-1',
      turnId: 'turn-1',
      metrics: { totalTokens: 25 },
      finalDiff: 'diff --git a/scenario.yaml b/scenario.yaml',
      trace: { changedPaths: ['scenario.yaml'] },
    });
    expect(outcome.evidence.events).toHaveLength(2);
  });

  it('uses the current local TrueForge URL by default', async () => {
    let requestedUrl = '';
    const adapter = new TrueForgeAdapter({
      agent: { model: { name: 'ling/ling-3-flash' } },
      prompt: 'Repair the supplied scenario.',
      collectOutcome: async () => ({ acceptancePassed: false, changedPaths: [] }),
      fetch: async (input) => {
        requestedUrl = String(input);
        throw new Error('offline fixture');
      },
    });

    await adapter.run(TASK);

    expect(requestedUrl).toBe('http://localhost:8790/api/v1/sessions');
  });

  it('redacts configured secrets from all collected outcome strings', async () => {
    const { client } = createClient();
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        token: 'configured-exact-secret',
        collectOutcome: async () => ({
          acceptancePassed: true,
          changedPaths: ['reports/configured-exact-secret.txt'],
          finalDiff: 'diff containing configured-exact-secret',
        }),
      },
      client
    );

    const outcome = await adapter.run(TASK);

    expect(outcome.trace.changedPaths).toEqual(['reports/[REDACTED].txt']);
    expect(outcome.finalDiff).toBe('diff containing [REDACTED]');
    expect(JSON.stringify(outcome)).not.toContain('configured-exact-secret');
  });

  it('upserts provider and MCP settings only through explicit setup', async () => {
    const { client, calls } = createClient();
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        collectOutcome: async () => ({ acceptancePassed: false, changedPaths: [] }),
        setup: {
          provider: {
            type: 'custom',
            name: 'ling',
            baseUrl: 'https://api.ant-ling.com/v1',
            models: [{ modelId: 'Ling-3.0-flash', name: 'ling-3-flash', properties: {} }],
          },
          mcpServer: {
            type: 'remote',
            name: 'sandbox',
            url: 'http://127.0.0.1:8787/mcp',
            description: 'Local evaluation sandbox',
          },
        },
      },
      client
    );

    const result = await adapter.setup();

    expect(calls.providers).toHaveLength(1);
    expect(calls.mcpServers).toHaveLength(1);
    expect(result).toEqual({ providerName: 'ling', mcpServerName: 'sandbox' });
  });

  it('does not treat pending required actions as a completed outcome', async () => {
    const pending = {
      ...TURN_DONE,
      state: {
        ...TURN_DONE.state,
        requiredActions: [
          {
            type: 'tool.approval_required' as const,
            id: 'approval-1',
            createdAt: '2026-08-21T10:00:01.000Z',
            threadId: 'main',
            toolCalls: [{ id: 'call-1', sourceEventId: 'event-2' }],
          },
        ],
      },
    };
    const { client } = createClient([TURN_CREATED, pending]);
    let collected = false;
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        collectOutcome: async () => {
          collected = true;
          return {
            acceptancePassed: true,
            changedPaths: ['pending-change.yaml'],
            finalDiff: 'pending diff',
          };
        },
      },
      client
    );

    const outcome = await adapter.run(TASK);

    expect(collected).toBe(true);
    expect(outcome.completed).toBe(false);
    expect(outcome.acceptancePassed).toBe(true);
    expect(outcome.trace.changedPaths).toEqual(['pending-change.yaml']);
    expect(outcome.finalDiff).toBe('pending diff');
    expect(outcome.error).toContain('requires additional action');
  });

  it('aborts timed-out turns and best-effort cancels their session', async () => {
    const { client, calls } = createClient();
    client.sessions.createTurnStream = async (_sessionId, _request, options) =>
      (async function* () {
        yield TURN_CREATED;
        await new Promise<void>((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      })();
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        collectOutcome: async ({ sessionId, terminalState }) => {
          expect(sessionId).toBe('session-1');
          expect(terminalState).toBeUndefined();
          return {
            acceptancePassed: true,
            changedPaths: ['timeout-change.yaml'],
            finalDiff: 'timeout diff',
          };
        },
        turnTimeoutMs: 5,
      },
      client
    );

    const outcome = await adapter.run(TASK);

    expect(outcome.completed).toBe(false);
    expect(outcome.acceptancePassed).toBe(true);
    expect(outcome.error).toBe('TrueForge turn timed out after 5ms');
    expect(outcome.trace.changedPaths).toEqual(['timeout-change.yaml']);
    expect(outcome.finalDiff).toBe('timeout diff');
    expect(calls.cancellations).toEqual(['session-1']);
  });

  it('applies the task deadline to outcome collection and bounds its failure grace', async () => {
    const { client, calls } = createClient();
    let collections = 0;
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        collectOutcome: async () => {
          collections += 1;
          return new Promise(() => {});
        },
        failureCollectionGraceMs: 5,
        turnTimeoutMs: 5,
      },
      client
    );

    const outcome = await Promise.race([
      adapter.run(TASK),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('collector was not bounded')), 100)
      ),
    ]);

    expect(outcome.completed).toBe(false);
    expect(outcome.error).toBe('TrueForge turn timed out after 5ms');
    expect(collections).toBe(1);
    expect(calls.cancellations).toEqual(['session-1']);
  });

  it('cancels a session that finishes creation after the task deadline', async () => {
    const { client, calls } = createClient();
    client.sessions.create = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { data: { id: 'session-1' } };
    };
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        collectOutcome: async () => ({ acceptancePassed: false, changedPaths: [] }),
        failureCollectionGraceMs: 5,
        turnTimeoutMs: 5,
      },
      client
    );

    const outcome = await adapter.run(TASK);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(outcome.completed).toBe(false);
    expect(outcome.error).toBe('TrueForge turn timed out after 5ms');
    expect(calls.cancellations).toEqual(['session-1']);
    expect(calls.turns).toEqual([]);
  });

  it('does not let best-effort cancellation hang a timed-out outcome', async () => {
    const { client } = createClient();
    client.sessions.createTurnStream = async (_sessionId, _request, options) =>
      (async function* () {
        yield TURN_CREATED;
        await new Promise<void>((_resolve, reject) => {
          options?.abortSignal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        });
      })();
    client.sessions.cancel = async () => new Promise(() => {});
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        collectOutcome: async () => ({ acceptancePassed: false, changedPaths: [] }),
        failureCollectionGraceMs: 5,
        turnTimeoutMs: 5,
      },
      client
    );

    const outcome = await Promise.race([
      adapter.run(TASK),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('cancellation was not bounded')), 300)
      ),
    ]);

    expect(outcome.completed).toBe(false);
    expect(outcome.error).toBe('TrueForge turn timed out after 5ms');
  });

  it('cancels a non-terminal stream failure and retains collected failure evidence', async () => {
    const { client, calls } = createClient();
    client.sessions.createTurnStream = async () =>
      (async function* () {
        yield TURN_CREATED;
        throw new Error('stream disconnected');
      })();
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        collectOutcome: async ({ sessionId, turnId, terminalState }) => {
          expect(sessionId).toBe('session-1');
          expect(turnId).toBe('turn-1');
          expect(terminalState).toBeUndefined();
          return {
            acceptancePassed: false,
            changedPaths: ['stream-change.yaml'],
            finalDiff: 'stream diff',
          };
        },
      },
      client
    );

    const outcome = await adapter.run(TASK);

    expect(outcome.completed).toBe(false);
    expect(outcome.trace.changedPaths).toEqual(['stream-change.yaml']);
    expect(outcome.finalDiff).toBe('stream diff');
    expect(calls.cancellations).toEqual(['session-1']);
  });

  it('retains collected evidence after a terminal TrueForge error', async () => {
    const terminalError = {
      type: 'turn.done' as const,
      id: 'event-error',
      threadId: null,
      createdAt: '2026-08-21T10:00:01.000Z',
      state: {
        status: 'error' as const,
        message: 'agent failed',
        completedAt: '2026-08-21T10:00:01.000Z',
      },
    };
    const { client } = createClient([TURN_CREATED, terminalError]);
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        collectOutcome: async ({ terminalState }) => {
          expect(terminalState?.status).toBe('error');
          return {
            acceptancePassed: false,
            changedPaths: ['terminal-error-change.yaml'],
            finalDiff: 'terminal error diff',
          };
        },
      },
      client
    );

    const outcome = await adapter.run(TASK);

    expect(outcome.completed).toBe(false);
    expect(outcome.trace.changedPaths).toEqual(['terminal-error-change.yaml']);
    expect(outcome.finalDiff).toBe('terminal error diff');
    expect(outcome.error).toBe('agent failed');
  });

  it('returns a redacted structured outcome for routine API failures', async () => {
    const { client } = createClient();
    client.sessions.create = async () => {
      throw new Error('request failed: Authorization: Bearer not-a-real-token');
    };
    const adapter = new TrueForgeAdapter(
      {
        agent: { model: { name: 'ling/ling-3-flash' } },
        prompt: 'Repair the supplied scenario.',
        token: 'not-a-real-token',
        collectOutcome: async () => ({ acceptancePassed: false, changedPaths: [] }),
      },
      client
    );

    const outcome = await adapter.run(TASK);

    expect(outcome.completed).toBe(false);
    expect(outcome.acceptancePassed).toBe(false);
    expect(outcome.error).toContain('[REDACTED]');
    expect(JSON.stringify(outcome)).not.toContain('not-a-real-token');
  });
});
