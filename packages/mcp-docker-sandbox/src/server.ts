import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SANDBOX_ERROR_CODES, SandboxError, type SandboxErrorCode } from './policy';
import {
  type DockerWorkspace,
  type DockerWorkspaceOptions,
  createDockerWorkspace,
} from './workspace';

export interface McpSandboxServerOptions extends DockerWorkspaceOptions {
  /** Existing workspace whose lifecycle becomes owned by the server. */
  workspace?: DockerWorkspace;
  /** Loopback by default. Non-loopback binding requires allowRemoteBinding. */
  hostname?: string;
  port?: number;
  allowRemoteBinding?: boolean;
}

export interface RunningMcpSandboxServer {
  readonly url: URL;
  readonly workspace: DockerWorkspace;
  close(): Promise<void>;
}

const TOOL_DEFINITIONS: Tool[] = [
  {
    name: 'workspace_read',
    description: 'Read a bounded UTF-8 file inside the disposable workspace.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', minLength: 1 } },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'workspace_patch',
    description: 'Replace one unique text occurrence in a workspace file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1 },
        oldText: { type: 'string', minLength: 1 },
        newText: { type: 'string' },
      },
      required: ['path', 'oldText', 'newText'],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'workspace_status',
    description: 'Return Git status for the disposable workspace.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'workspace_diff',
    description: 'Return the bounded Git diff from the fixture baseline.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'workspace_run',
    description: 'Run one allowlisted validation command in the network-disabled Docker sandbox.',
    inputSchema: {
      type: 'object',
      properties: { command: { type: 'string', minLength: 1 } },
      required: ['command'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];

export async function startMcpSandboxServer(
  options: McpSandboxServerOptions = {}
): Promise<RunningMcpSandboxServer> {
  const hostname = options.hostname ?? '127.0.0.1';
  assertAllowedBinding(hostname, options.allowRemoteBinding ?? false);
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new SandboxError(SANDBOX_ERROR_CODES.invalidArgument);
  }

  const workspace = options.workspace ?? (await createDockerWorkspace(options));
  const protectLoopback = isLoopbackHostname(hostname);
  const activeServers = new Set<Server>();
  let isClosed = false;
  let isDisposed = false;
  let closePromise: Promise<void> | undefined;
  let httpServer: Bun.Server<undefined>;
  try {
    httpServer = Bun.serve({
      hostname,
      port,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === '/health' && request.method === 'GET') {
          return Response.json({ status: isClosed ? 'closing' : 'ok' });
        }
        if (url.pathname !== '/mcp') {
          return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
        }

        const protocolServer = createProtocolServer(workspace);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
          allowedHosts: protectLoopback ? [httpServer.url.host] : undefined,
          allowedOrigins: protectLoopback ? [httpServer.url.origin] : undefined,
          enableDnsRebindingProtection: protectLoopback,
        });
        activeServers.add(protocolServer);
        try {
          await protocolServer.connect(transport);
          return await transport.handleRequest(request);
        } catch {
          return Response.json(
            {
              jsonrpc: '2.0',
              error: { code: -32603, message: SANDBOX_ERROR_CODES.internalError },
              id: null,
            },
            { status: 500 }
          );
        } finally {
          activeServers.delete(protocolServer);
          await protocolServer.close();
        }
      },
    });
  } catch (error) {
    await workspace.dispose();
    throw error;
  }

  const url = new URL('/mcp', httpServer.url);
  return {
    url,
    workspace,
    async close() {
      if (isDisposed) return;
      if (closePromise) return closePromise;
      closePromise = (async () => {
        if (!isClosed) {
          isClosed = true;
          await httpServer.stop(true);
          await Promise.all([...activeServers].map((server) => server.close()));
          activeServers.clear();
        }
        await workspace.dispose();
        isDisposed = true;
      })().finally(() => {
        closePromise = undefined;
      });
      return closePromise;
    },
  };
}

function createProtocolServer(workspace: DockerWorkspace): Server {
  const server = new Server(
    { name: '@artemiskit/mcp-docker-sandbox', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'Use only the listed tools. All paths are relative to one disposable workspace.',
    }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      switch (request.params.name) {
        case 'workspace_read': {
          const args = requireRecord(request.params.arguments);
          const path = requireString(args, 'path');
          return successResult({ ok: true, path, content: await workspace.read(path) });
        }
        case 'workspace_patch': {
          const args = requireRecord(request.params.arguments);
          const path = requireString(args, 'path');
          const result = await workspace.patch({
            path,
            oldText: requireString(args, 'oldText'),
            newText: requireString(args, 'newText', true),
          });
          return successResult({ ok: true, ...result });
        }
        case 'workspace_status':
          requireNoArguments(request.params.arguments);
          return successResult({ ok: true, status: await workspace.status() });
        case 'workspace_diff':
          requireNoArguments(request.params.arguments);
          return successResult({ ok: true, diff: await workspace.diff() });
        case 'workspace_run': {
          const args = requireRecord(request.params.arguments);
          const command = requireString(args, 'command');
          return successResult({ ok: true, command, ...(await workspace.run(command)) });
        }
        default:
          throw new SandboxError(SANDBOX_ERROR_CODES.toolNotFound);
      }
    } catch (error) {
      return errorResult(error);
    }
  });
  return server;
}

function successResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function errorResult(error: unknown): CallToolResult {
  const code: SandboxErrorCode =
    error instanceof SandboxError ? error.code : SANDBOX_ERROR_CODES.internalError;
  const data = { ok: false, error: { code, message: code } };
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
    isError: true,
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SandboxError(SANDBOX_ERROR_CODES.invalidArgument);
  }
  return value as Record<string, unknown>;
}

function requireNoArguments(value: unknown): void {
  if (value === undefined) return;
  const args = requireRecord(value);
  if (Object.keys(args).length > 0) {
    throw new SandboxError(SANDBOX_ERROR_CODES.invalidArgument);
  }
}

function requireString(args: Record<string, unknown>, key: string, allowEmpty = false): string {
  const value = args[key];
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new SandboxError(SANDBOX_ERROR_CODES.invalidArgument);
  }
  return value;
}

function assertAllowedBinding(hostname: string, allowRemoteBinding: boolean): void {
  if (!isLoopbackHostname(hostname) && !allowRemoteBinding) {
    throw new SandboxError(SANDBOX_ERROR_CODES.remoteBindingDenied);
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}
