import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDockerWorkspace } from './workspace';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('Docker workspace', () => {
  it('copies a fixture into a fresh disposable workspace', async () => {
    const fixturePath = await makeFixture();

    const workspace = await createDockerWorkspace({ fixturePath });
    temporaryPaths.push(workspace.root);

    expect(await readFile(join(workspace.root, 'scenario.yaml'), 'utf8')).toBe('before\n');
    expect(workspace.root).not.toBe(fixturePath);
    await workspace.dispose();
    await expect(readFile(workspace.root, 'utf8')).rejects.toThrow();
    await workspace.dispose();
  });

  it('rejects symlinks while ingesting a fixture', async () => {
    const fixturePath = await makeFixture();
    const outsidePath = join(await makeTemporaryDirectory(), 'outside.txt');
    await writeFile(outsidePath, 'outside\n');
    await symlink(outsidePath, join(fixturePath, 'linked.txt'));

    const result = await createDockerWorkspace({ fixturePath }).then(
      async (workspace) => {
        await workspace.dispose();
        return undefined;
      },
      (error: unknown) => error
    );

    expect(result).toMatchObject({
      code: 'SANDBOX_SYMLINK_DENIED',
      message: 'SANDBOX_SYMLINK_DENIED',
    });
  });

  it('reads, patches, and reports the Git status and diff', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);

    expect(await workspace.read('scenario.yaml')).toBe('before\n');
    expect(
      await workspace.patch({ path: 'scenario.yaml', oldText: 'before', newText: 'after' })
    ).toEqual({ path: 'scenario.yaml', replacements: 1 });
    expect(await workspace.status()).toContain(' M scenario.yaml');
    expect(await workspace.diff()).toContain('-before');
    expect(await workspace.diff()).toContain('+after');

    await expect(
      workspace.patch({ path: 'scenario.yaml', oldText: 'missing', newText: 'replacement' })
    ).rejects.toMatchObject({ code: 'SANDBOX_PATCH_CONFLICT' });
    await workspace.dispose();
  });

  it('rejects traversal and symlinks during workspace file operations', async () => {
    const workspace = await createDockerWorkspace({ fixturePath: await makeFixture() });
    temporaryPaths.push(workspace.root);
    const outsidePath = join(await makeTemporaryDirectory(), 'outside.txt');
    await writeFile(outsidePath, 'outside\n');
    await symlink(outsidePath, join(workspace.root, 'linked.txt'));

    await expect(workspace.read('../outside.txt')).rejects.toMatchObject({
      code: 'SANDBOX_PATH_DENIED',
    });
    await expect(workspace.read('linked.txt')).rejects.toMatchObject({
      code: 'SANDBOX_SYMLINK_DENIED',
    });
    await workspace.dispose();
  });

  it('runs an allowlisted command as bounded Docker argv with an operator-owned akit bundle', async () => {
    const requests: Array<{ argv: string[]; timeoutMs: number; maxOutputBytes: number }> = [];
    const fixturePath = await makeFixture();
    const bundlePath = join(await makeTemporaryDirectory(), 'akit-bundle.js');
    await writeFile(bundlePath, '#!/usr/bin/env bun\n');
    const workspace = await createDockerWorkspace({
      fixturePath,
      akitBundlePath: bundlePath,
      commandTimeoutMs: 1_000,
      maxOutputBytes: 2_000,
      dockerRunner: async (request) => {
        requests.push({
          argv: [...request.argv],
          timeoutMs: request.timeoutMs,
          maxOutputBytes: request.maxOutputBytes,
        });
        return { exitCode: 0, stdout: 'valid\n', stderr: '' };
      },
    });
    temporaryPaths.push(workspace.root);

    expect(await workspace.run('akit validate scenario.yaml --strict')).toEqual({
      exitCode: 0,
      stdout: 'valid\n',
      stderr: '',
    });
    expect(requests).toHaveLength(1);
    for (const argument of [
      '--pull',
      'never',
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '128',
      '--memory',
      '512m',
      '--cpus',
      '1',
    ]) {
      expect(requests[0]?.argv).toContain(argument);
    }
    expect(requests[0]?.argv).not.toContain('sh');
    expect(requests[0]?.argv).not.toContain('-lc');
    expect(requests[0]?.argv.slice(-5)).toEqual([
      'bun',
      '/opt/artemiskit/akit',
      'validate',
      'scenario.yaml',
      '--strict',
    ]);
    expect(requests[0]).toMatchObject({ timeoutMs: 1_000, maxOutputBytes: 2_000 });
    const bundleMount = requests[0]?.argv.find((argument) => argument.includes(bundlePath));
    expect(bundleMount).toContain('readonly');
    await workspace.dispose();
  });

  it('requires a configured regular non-symlink akit bundle', async () => {
    const fixturePath = await makeFixture();
    const workspace = await createDockerWorkspace({
      fixturePath,
      dockerRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    temporaryPaths.push(workspace.root);
    await expect(workspace.run('akit validate scenario.yaml')).rejects.toMatchObject({
      code: 'SANDBOX_AKIT_BUNDLE_REQUIRED',
    });
    await workspace.dispose();

    const bundleDirectory = await makeTemporaryDirectory();
    const bundleTarget = join(bundleDirectory, 'bundle.js');
    const bundleLink = join(bundleDirectory, 'bundle-link.js');
    await writeFile(bundleTarget, '#!/usr/bin/env bun\n');
    await symlink(bundleTarget, bundleLink);
    const result = await createDockerWorkspace({ fixturePath, akitBundlePath: bundleLink }).then(
      async (createdWorkspace) => {
        await createdWorkspace.dispose();
        return undefined;
      },
      (error: unknown) => error
    );
    expect(result).toMatchObject({ code: 'SANDBOX_AKIT_BUNDLE_INVALID' });
  });

  it('enforces command budget, timeout, and combined output bounds', async () => {
    const fixturePath = await makeFixture();
    const budgetedWorkspace = await createDockerWorkspace({
      fixturePath,
      maxCommands: 1,
      dockerRunner: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    });
    temporaryPaths.push(budgetedWorkspace.root);
    await budgetedWorkspace.run('bun run typecheck');
    await expect(budgetedWorkspace.run('bun run typecheck')).rejects.toMatchObject({
      code: 'SANDBOX_COMMAND_BUDGET_EXCEEDED',
    });
    await budgetedWorkspace.dispose();

    const outputWorkspace = await createDockerWorkspace({
      fixturePath,
      maxOutputBytes: 4,
      dockerRunner: async () => ({ exitCode: 0, stdout: '1234', stderr: '5' }),
    });
    temporaryPaths.push(outputWorkspace.root);
    await expect(outputWorkspace.run('bun run build')).rejects.toMatchObject({
      code: 'SANDBOX_OUTPUT_LIMIT_EXCEEDED',
    });
    await outputWorkspace.dispose();

    const timeoutWorkspace = await createDockerWorkspace({
      fixturePath,
      commandTimeoutMs: 5,
      dockerRunner: (request) =>
        new Promise((resolve) => {
          request.signal.addEventListener('abort', () =>
            resolve({ exitCode: 143, stdout: '', stderr: '' })
          );
        }),
    });
    temporaryPaths.push(timeoutWorkspace.root);
    await expect(timeoutWorkspace.run('bun test')).rejects.toMatchObject({
      code: 'SANDBOX_COMMAND_TIMEOUT',
    });
    await timeoutWorkspace.dispose();
  });

  it('bounds file reads, patches, and Git output', async () => {
    const fixturePath = await makeFixture();
    const readWorkspace = await createDockerWorkspace({ fixturePath, maxFileBytes: 4 });
    temporaryPaths.push(readWorkspace.root);
    await expect(readWorkspace.read('scenario.yaml')).rejects.toMatchObject({
      code: 'SANDBOX_FILE_TOO_LARGE',
    });
    await readWorkspace.dispose();

    const patchWorkspace = await createDockerWorkspace({ fixturePath, maxFileBytes: 8 });
    temporaryPaths.push(patchWorkspace.root);
    await expect(
      patchWorkspace.patch({ path: 'scenario.yaml', oldText: 'before', newText: 'much-too-large' })
    ).rejects.toMatchObject({ code: 'SANDBOX_FILE_TOO_LARGE' });
    await patchWorkspace.dispose();

    const diffWorkspace = await createDockerWorkspace({ fixturePath, maxOutputBytes: 4 });
    temporaryPaths.push(diffWorkspace.root);
    await diffWorkspace.patch({ path: 'scenario.yaml', oldText: 'before', newText: 'after' });
    await expect(diffWorkspace.diff()).rejects.toMatchObject({
      code: 'SANDBOX_OUTPUT_LIMIT_EXCEEDED',
    });
    await diffWorkspace.dispose();
  });
});

async function makeFixture(): Promise<string> {
  const fixturePath = await makeTemporaryDirectory();
  await writeFile(join(fixturePath, 'scenario.yaml'), 'before\n');
  return fixturePath;
}

async function makeTemporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'artemiskit-fixture-'));
  temporaryPaths.push(path);
  return path;
}
