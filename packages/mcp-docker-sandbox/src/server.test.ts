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
      expect(
        structured(await client.callTool({ name: 'workspace_status', arguments: {} }))
      ).toMatchObject({ ok: true, status: expect.stringContaining(' M scenario.yaml') });
      expect(
        structured(await client.callTool({ name: 'workspace_diff', arguments: {} }))
      ).toMatchObject({ ok: true, diff: expect.stringContaining('+after') });
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
