import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startMcpSandboxServer } from './server';
import { createDockerWorkspace } from './workspace';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('MCP sandbox server', () => {
  it('exports the server lifecycle from the package entry point', async () => {
    const packageModule = await import('./index');

    expect(packageModule.startMcpSandboxServer).toBeFunction();
  });

  it('retries workspace disposal after an earlier close attempt fails', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);
    const disposeWorkspace = workspace.dispose.bind(workspace);
    let disposalAttempts = 0;
    workspace.dispose = async () => {
      disposalAttempts += 1;
      if (disposalAttempts === 1) throw new Error('injected disposal failure');
      await disposeWorkspace();
    };
    const runningServer = await startMcpSandboxServer({ workspace });

    await expect(runningServer.close()).rejects.toThrow('injected disposal failure');
    await runningServer.close();

    expect(disposalAttempts).toBe(2);
    await expect(workspace.read('scenario.yaml')).rejects.toMatchObject({
      code: 'SANDBOX_DISPOSED',
    });
  });

  it('serves all bounded workspace tools over real loopback Streamable HTTP', async () => {
    const dockerRequests: string[][] = [];
    const workspace = await createDockerWorkspace({
      fixturePath: await makeFixture(),
      dockerRunner: async (request) => {
        dockerRequests.push(request.argv);
        return { exitCode: 0, stdout: 'tests passed\n', stderr: '' };
      },
    });
    temporaryPaths.push(workspace.root);
    const runningServer = await startMcpSandboxServer({ workspace });
    const client = new Client({ name: 'artemiskit-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(runningServer.url);

    try {
      expect(runningServer.url.hostname).toBe('127.0.0.1');
      expect((await fetch(new URL('/health', runningServer.url))).status).toBe(200);
      await client.connect(transport);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
        'workspace_read',
        'workspace_patch',
        'workspace_status',
        'workspace_diff',
        'workspace_run',
      ]);

      expect(
        structured(
          await client.callTool({
            name: 'workspace_read',
            arguments: { path: 'scenario.yaml' },
          })
        )
      ).toMatchObject({ ok: true, path: 'scenario.yaml', content: 'before\n' });
      expect(
        structured(
          await client.callTool({
            name: 'workspace_patch',
            arguments: { path: 'scenario.yaml', oldText: 'before', newText: 'after' },
          })
        )
      ).toMatchObject({ ok: true, path: 'scenario.yaml', replacements: 1 });
      expect(structured(await client.callTool({ name: 'workspace_status' }))).toMatchObject({
        ok: true,
        status: expect.stringContaining(' M scenario.yaml'),
      });
      expect(structured(await client.callTool({ name: 'workspace_diff' }))).toMatchObject({
        ok: true,
        diff: expect.stringContaining('+after'),
      });
      expect(
        structured(
          await client.callTool({
            name: 'workspace_run',
            arguments: { command: 'bun test' },
          })
        )
      ).toMatchObject({ ok: true, exitCode: 0, stdout: 'tests passed\n', stderr: '' });
      expect(dockerRequests).toHaveLength(1);
    } finally {
      await client.close();
      await runningServer.close();
      await runningServer.close();
    }

    await expect(workspace.read('scenario.yaml')).rejects.toMatchObject({
      code: 'SANDBOX_DISPOSED',
    });
  });

  it('advertises only task tools and rejects direct calls outside the task set', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);
    const runningServer = await startMcpSandboxServer({
      workspace,
      allowedTools: ['workspace_read', 'workspace_patch'],
    });
    const client = new Client({ name: 'artemiskit-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(runningServer.url);

    try {
      await client.connect(transport);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
        'workspace_read',
        'workspace_patch',
      ]);
      expect(
        structured(
          await client.callTool({
            name: 'workspace_read',
            arguments: { path: 'scenario.yaml' },
          })
        )
      ).toMatchObject({ ok: true, content: 'before\n' });

      const denied = await client.callTool({ name: 'workspace_status' });
      expect(denied.isError).toBe(true);
      expect(structured(denied)).toEqual({
        ok: false,
        error: { code: 'SANDBOX_TOOL_NOT_FOUND', message: 'SANDBOX_TOOL_NOT_FOUND' },
      });
    } finally {
      await client.close();
      await runningServer.close();
    }
  });

  it('serves allowlisted custom tools with structured success and safe failure results', async () => {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    let deniedHandlerCalled = false;
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);
    const runningServer = await startMcpSandboxServer({
      workspace,
      allowedTools: ['workspace_read', 'invoice_lookup', 'invoice_search'],
      customTools: [
        {
          definition: {
            name: 'invoice_lookup',
            description: 'Look up one synthetic invoice by identifier.',
            inputSchema: {
              type: 'object',
              properties: { invoiceId: { type: 'string' } },
              required: ['invoiceId'],
              additionalProperties: false,
            },
          },
          handler: async (arguments_) => {
            calls.push({ name: 'invoice_lookup', arguments: arguments_ });
            return {
              ok: false,
              error: { code: 'NOT_FOUND', message: 'No synthetic invoice matched.' },
            };
          },
        },
        {
          definition: {
            name: 'invoice_search',
            description: 'Search synthetic invoices by customer email.',
            inputSchema: {
              type: 'object',
              properties: { customerEmail: { type: 'string' } },
              required: ['customerEmail'],
              additionalProperties: false,
            },
          },
          handler: async (arguments_) => {
            calls.push({ name: 'invoice_search', arguments: arguments_ });
            return { ok: true, invoiceId: 'INV-200', status: 'open' };
          },
        },
        {
          definition: {
            name: 'invoice_delete',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          },
          handler: async () => {
            deniedHandlerCalled = true;
            return { ok: true };
          },
        },
      ],
    });
    const client = new Client({ name: 'artemiskit-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(runningServer.url);

    try {
      await client.connect(transport);
      const tools = (await client.listTools()).tools;
      expect(tools.map((tool) => tool.name)).toEqual([
        'workspace_read',
        'invoice_lookup',
        'invoice_search',
      ]);
      expect(tools.find((tool) => tool.name === 'invoice_lookup')?.inputSchema).toEqual({
        type: 'object',
        properties: { invoiceId: { type: 'string' } },
        required: ['invoiceId'],
        additionalProperties: false,
      });

      const denied = await client.callTool({ name: 'workspace_status' });
      expect(denied.isError).toBe(true);
      expect(structured(denied)).toEqual({
        ok: false,
        error: { code: 'SANDBOX_TOOL_NOT_FOUND', message: 'SANDBOX_TOOL_NOT_FOUND' },
      });
      const deniedCustom = await client.callTool({ name: 'invoice_delete' });
      expect(deniedCustom.isError).toBe(true);
      expect(structured(deniedCustom)).toEqual({
        ok: false,
        error: { code: 'SANDBOX_TOOL_NOT_FOUND', message: 'SANDBOX_TOOL_NOT_FOUND' },
      });
      expect(deniedHandlerCalled).toBe(false);

      const missing = await client.callTool({
        name: 'invoice_lookup',
        arguments: { invoiceId: 'INV-404' },
      });
      expect(missing.isError).toBe(true);
      expect(structured(missing)).toEqual({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No synthetic invoice matched.' },
      });

      const recovered = await client.callTool({
        name: 'invoice_search',
        arguments: { customerEmail: 'customer@example.test' },
      });
      expect(recovered.isError).toBeUndefined();
      expect(structured(recovered)).toEqual({
        ok: true,
        invoiceId: 'INV-200',
        status: 'open',
      });
      expect(calls).toEqual([
        { name: 'invoice_lookup', arguments: { invoiceId: 'INV-404' } },
        {
          name: 'invoice_search',
          arguments: { customerEmail: 'customer@example.test' },
        },
      ]);
    } finally {
      await client.close();
      await runningServer.close();
    }
  });

  it('redacts unexpected custom tool failures', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);
    const runningServer = await startMcpSandboxServer({
      workspace,
      allowedTools: ['invoice_lookup'],
      customTools: [
        {
          definition: {
            name: 'invoice_lookup',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          },
          handler: async () => {
            throw new Error('fixture database password must not escape');
          },
        },
      ],
    });
    const client = new Client({ name: 'artemiskit-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(runningServer.url);

    try {
      await client.connect(transport);
      const result = await client.callTool({ name: 'invoice_lookup' });
      expect(result.isError).toBe(true);
      expect(structured(result)).toEqual({
        ok: false,
        error: { code: 'SANDBOX_INTERNAL_ERROR', message: 'SANDBOX_INTERNAL_ERROR' },
      });
      expect(JSON.stringify(result)).not.toContain('fixture database password');
    } finally {
      await client.close();
      await runningServer.close();
    }
  });

  it('rejects duplicate and invalid custom definitions before starting the server', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);
    const invoiceLookup = {
      definition: {
        name: 'invoice_lookup',
        inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false },
      },
      handler: async () => ({ ok: true as const }),
    };

    await expect(
      startMcpSandboxServer({ workspace, customTools: [invoiceLookup, invoiceLookup] })
    ).rejects.toMatchObject({ code: 'SANDBOX_INVALID_ARGUMENT' });
    await expect(
      startMcpSandboxServer({
        workspace,
        customTools: [
          {
            definition: {
              name: 'workspace_read',
              inputSchema: { type: 'object', properties: {}, additionalProperties: false },
            },
            handler: async () => ({ ok: true }),
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'SANDBOX_INVALID_ARGUMENT' });
    await expect(
      startMcpSandboxServer({
        workspace,
        customTools: [
          {
            definition: { name: 'invalid', inputSchema: { type: 'array' } } as never,
            handler: async () => ({ ok: true }),
          },
        ],
      })
    ).rejects.toMatchObject({ code: 'SANDBOX_INVALID_ARGUMENT' });
    await expect(
      startMcpSandboxServer({
        workspace,
        customTools: [{ definition: invoiceLookup.definition, handler: undefined as never }],
      })
    ).rejects.toMatchObject({ code: 'SANDBOX_INVALID_ARGUMENT' });

    expect(await workspace.read('scenario.yaml')).toBe('before\n');
    await workspace.dispose();
  });

  it('rejects unknown task tool names before starting the server', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);
    const result = await startMcpSandboxServer({
      workspace,
      allowedTools: ['workspace_read', 'unknown_tool'],
    }).then(
      async (runningServer) => {
        await runningServer.close();
        return undefined;
      },
      (error: unknown) => error
    );

    expect(result).toMatchObject({ code: 'SANDBOX_INVALID_ARGUMENT' });
    expect(await workspace.read('scenario.yaml')).toBe('before\n');
    await workspace.dispose();
  });

  it('returns stable structured tool errors without leaking internal details', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);
    const runningServer = await startMcpSandboxServer({ workspace });
    const client = new Client({ name: 'artemiskit-test-client', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(runningServer.url);

    try {
      await client.connect(transport);
      const denied = await client.callTool({
        name: 'workspace_read',
        arguments: { path: '../secret' },
      });
      expect(denied.isError).toBe(true);
      expect(structured(denied)).toEqual({
        ok: false,
        error: { code: 'SANDBOX_PATH_DENIED', message: 'SANDBOX_PATH_DENIED' },
      });

      const invalid = await client.callTool({
        name: 'workspace_patch',
        arguments: { path: 'scenario.yaml', oldText: 1, newText: 'after' },
      });
      expect(invalid.isError).toBe(true);
      expect(structured(invalid)).toEqual({
        ok: false,
        error: { code: 'SANDBOX_INVALID_ARGUMENT', message: 'SANDBOX_INVALID_ARGUMENT' },
      });

      const missingArguments = await client.callTool({ name: 'workspace_read' });
      expect(missingArguments.isError).toBe(true);
      expect(structured(missingArguments)).toEqual({
        ok: false,
        error: { code: 'SANDBOX_INVALID_ARGUMENT', message: 'SANDBOX_INVALID_ARGUMENT' },
      });
    } finally {
      await client.close();
      await runningServer.close();
    }
  });

  it('rejects non-loopback binding unless explicitly opted in', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);

    await expect(startMcpSandboxServer({ workspace, hostname: '0.0.0.0' })).rejects.toMatchObject({
      code: 'SANDBOX_REMOTE_BINDING_DENIED',
    });
    expect(await workspace.read('scenario.yaml')).toBe('before\n');
    await workspace.dispose();
  });

  it('rejects hostile Host and Origin headers on loopback', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);
    const runningServer = await startMcpSandboxServer({ workspace });
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'host-validation-test', version: '1.0.0' },
      },
    });

    try {
      const hostileHost = await fetch(runningServer.url, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          Host: 'attacker.example',
        },
        body,
      });
      expect(hostileHost.status).toBe(403);

      const hostileOrigin = await fetch(runningServer.url, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          Origin: 'https://attacker.example',
        },
        body,
      });
      expect(hostileOrigin.status).toBe(403);
    } finally {
      await runningServer.close();
    }
  });
});

function structured(result: { structuredContent?: Record<string, unknown> }): Record<
  string,
  unknown
> {
  expect(result.structuredContent).toBeDefined();
  return result.structuredContent ?? {};
}

async function makeFixture(): Promise<string> {
  const fixturePath = await mkdtemp(join(tmpdir(), 'artemiskit-server-fixture-'));
  temporaryPaths.push(fixturePath);
  await writeFile(join(fixturePath, 'scenario.yaml'), 'before\n');
  return fixturePath;
}
