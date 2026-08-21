import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  SANDBOX_ERROR_CODES,
  SandboxError,
  assertAllowedCommand,
  assertWorkspacePath,
} from './policy';

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface WorkspacePatch {
  path: string;
  oldText: string;
  newText: string;
}

export interface DockerWorkspace {
  readonly root: string;
  read(path: string): Promise<string>;
  patch(patch: WorkspacePatch): Promise<{ path: string; replacements: 1 }>;
  status(): Promise<string>;
  diff(): Promise<string>;
  run(command: string): Promise<CommandResult>;
  dispose(): Promise<void>;
}

export interface DockerWorkspaceOptions {
  fixturePath?: string;
  akitBundlePath?: string;
  commandTimeoutMs?: number;
  maxCommands?: number;
  maxFileBytes?: number;
  maxOutputBytes?: number;
  dockerRunner?: DockerRunner;
}

export interface DockerRunRequest {
  argv: string[];
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputBytes: number;
}

export type DockerRunner = (request: DockerRunRequest) => Promise<CommandResult>;

const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_COMMANDS = 20;
const DEFAULT_MAX_FILE_BYTES = 1_000_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;
const DOCKER_IMAGE = 'oven/bun:1.3.10';

export async function createDockerWorkspace(
  options: DockerWorkspaceOptions = {}
): Promise<DockerWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'artemiskit-agent-'));
  let akitBundlePath: string | undefined;
  try {
    akitBundlePath = await resolveAkitBundle(options.akitBundlePath);
    if (options.fixturePath) {
      await copyFixture(options.fixturePath, root);
    }
    await initializeGitBaseline(root);
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    if (error instanceof SandboxError) throw error;
    throw new SandboxError(SANDBOX_ERROR_CODES.fixtureInvalid, undefined, { cause: error });
  }

  const commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const maxCommands = options.maxCommands ?? DEFAULT_MAX_COMMANDS;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const dockerRunner = options.dockerRunner ?? runDocker;
  let commandCount = 0;
  let isDisposed = false;
  const assertActive = (): void => {
    if (isDisposed) throw new SandboxError(SANDBOX_ERROR_CODES.disposed);
  };

  return {
    root,
    async read(path) {
      assertActive();
      const resolvedPath = await resolveWorkspaceFile(root, path);
      await assertFileWithinLimit(resolvedPath, maxFileBytes);
      return readFile(resolvedPath, 'utf8');
    },
    async patch({ path, oldText, newText }) {
      assertActive();
      if (!oldText) throw new SandboxError(SANDBOX_ERROR_CODES.patchConflict);
      const resolvedPath = await resolveWorkspaceFile(root, path);
      await assertFileWithinLimit(resolvedPath, maxFileBytes);
      const contents = await readFile(resolvedPath, 'utf8');
      const firstMatch = contents.indexOf(oldText);
      if (firstMatch < 0 || contents.indexOf(oldText, firstMatch + oldText.length) >= 0) {
        throw new SandboxError(SANDBOX_ERROR_CODES.patchConflict);
      }
      const updated = `${contents.slice(0, firstMatch)}${newText}${contents.slice(
        firstMatch + oldText.length
      )}`;
      if (Buffer.byteLength(updated) > maxFileBytes) {
        throw new SandboxError(SANDBOX_ERROR_CODES.fileTooLarge);
      }
      await writeFile(resolvedPath, updated);
      return { path, replacements: 1 };
    },
    async status() {
      assertActive();
      const result = await runGit(
        root,
        ['status', '--short', '--untracked-files=all'],
        maxOutputBytes
      );
      return result.stdout;
    },
    async diff() {
      assertActive();
      const result = await runGit(
        root,
        ['diff', '--no-ext-diff', '--no-color', '--'],
        maxOutputBytes
      );
      return result.stdout;
    },
    async run(command) {
      assertActive();
      const allowed = assertAllowedCommand(command);
      if (allowed.requiresAkitBundle && !akitBundlePath) {
        throw new SandboxError(SANDBOX_ERROR_CODES.akitBundleRequired);
      }
      if (commandCount >= maxCommands) {
        throw new SandboxError(SANDBOX_ERROR_CODES.commandBudgetExceeded);
      }
      commandCount += 1;

      const argv = buildDockerArgv(root, akitBundlePath, allowed.executable, allowed.args);
      const controller = new AbortController();
      let didTimeout = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          didTimeout = true;
          controller.abort();
          reject(new SandboxError(SANDBOX_ERROR_CODES.commandTimeout));
        }, commandTimeoutMs);
      });
      try {
        const result = await Promise.race([
          dockerRunner({
            argv,
            signal: controller.signal,
            timeoutMs: commandTimeoutMs,
            maxOutputBytes,
          }),
          timeoutPromise,
        ]);
        if (didTimeout) throw new SandboxError(SANDBOX_ERROR_CODES.commandTimeout);
        if (combinedByteLength(result) > maxOutputBytes) {
          throw new SandboxError(SANDBOX_ERROR_CODES.outputLimitExceeded);
        }
        return result;
      } catch (error) {
        if (didTimeout) throw new SandboxError(SANDBOX_ERROR_CODES.commandTimeout);
        throw error;
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
    async dispose() {
      if (isDisposed) return;
      isDisposed = true;
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function resolveAkitBundle(bundlePath: string | undefined): Promise<string | undefined> {
  if (!bundlePath) return undefined;
  try {
    const bundleStat = await lstat(bundlePath);
    if (bundleStat.isSymbolicLink() || !bundleStat.isFile() || bundlePath.includes(',')) {
      throw new SandboxError(SANDBOX_ERROR_CODES.akitBundleInvalid);
    }
    return await realpath(bundlePath);
  } catch (error) {
    if (error instanceof SandboxError) throw error;
    throw new SandboxError(SANDBOX_ERROR_CODES.akitBundleInvalid, undefined, { cause: error });
  }
}

function buildDockerArgv(
  root: string,
  akitBundlePath: string | undefined,
  executable: string,
  args: string[]
): string[] {
  const argv = [
    'docker',
    'run',
    '--rm',
    '--pull',
    'never',
    '--network',
    'none',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
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
    '--mount',
    `type=bind,source=${root},target=/workspace`,
  ];
  if (akitBundlePath) {
    argv.push('--mount', `type=bind,source=${akitBundlePath},target=/opt/artemiskit/akit,readonly`);
  }
  argv.push('--workdir', '/workspace', DOCKER_IMAGE, executable, ...args);
  return argv;
}

async function runDocker(request: DockerRunRequest): Promise<CommandResult> {
  const child = Bun.spawn(request.argv, {
    stdout: 'pipe',
    stderr: 'pipe',
    signal: request.signal,
  });
  const totalBytes = { value: 0 };
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      readBoundedStream(child.stdout, request.maxOutputBytes, totalBytes),
      readBoundedStream(child.stderr, request.maxOutputBytes, totalBytes),
    ]);
    return { exitCode, stdout, stderr };
  } catch (error) {
    child.kill('SIGKILL');
    await child.exited;
    throw error;
  }
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  maxOutputBytes: number,
  totalBytes: { value: number }
): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes.value += value.byteLength;
    if (totalBytes.value > maxOutputBytes) {
      throw new SandboxError(SANDBOX_ERROR_CODES.outputLimitExceeded);
    }
    chunks.push(value);
  }
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(output);
}

function combinedByteLength(result: CommandResult): number {
  return Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr);
}

async function copyFixture(fixturePath: string, destinationRoot: string): Promise<void> {
  const rootStat = await lstat(fixturePath);
  if (rootStat.isSymbolicLink()) {
    throw new SandboxError(SANDBOX_ERROR_CODES.symlinkDenied);
  }
  if (!rootStat.isDirectory()) {
    throw new SandboxError(SANDBOX_ERROR_CODES.fixtureInvalid);
  }
  await copyFixtureDirectory(fixturePath, destinationRoot, destinationRoot);
}

async function copyFixtureDirectory(
  sourceDirectory: string,
  destinationDirectory: string,
  destinationRoot: string
): Promise<void> {
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    const sourcePath = join(sourceDirectory, entry.name);
    const entryStat = await lstat(sourcePath);
    if (entryStat.isSymbolicLink()) {
      throw new SandboxError(SANDBOX_ERROR_CODES.symlinkDenied);
    }
    if (entry.name === '.git') continue;

    const destinationPath = join(destinationDirectory, entry.name);
    assertWorkspacePath(destinationRoot, relative(destinationRoot, destinationPath));
    if (entryStat.isDirectory()) {
      await mkdir(destinationPath);
      await copyFixtureDirectory(sourcePath, destinationPath, destinationRoot);
    } else if (entryStat.isFile()) {
      await copyFile(sourcePath, destinationPath);
    } else {
      throw new SandboxError(SANDBOX_ERROR_CODES.fixtureInvalid);
    }
  }
}

async function resolveWorkspaceFile(root: string, candidate: string): Promise<string> {
  const resolvedPath = assertWorkspacePath(root, candidate);
  const pathParts = relative(root, resolvedPath).split('/');
  let currentPath = root;
  for (const part of pathParts) {
    currentPath = join(currentPath, part);
    let pathStat: Awaited<ReturnType<typeof lstat>>;
    try {
      pathStat = await lstat(currentPath);
    } catch (error) {
      throw new SandboxError(SANDBOX_ERROR_CODES.pathNotFound, undefined, { cause: error });
    }
    if (pathStat.isSymbolicLink()) {
      throw new SandboxError(SANDBOX_ERROR_CODES.symlinkDenied);
    }
  }
  const fileStat = await lstat(resolvedPath);
  if (!fileStat.isFile()) throw new SandboxError(SANDBOX_ERROR_CODES.pathDenied);
  return resolvedPath;
}

async function assertFileWithinLimit(path: string, maxFileBytes: number): Promise<void> {
  if ((await lstat(path)).size > maxFileBytes) {
    throw new SandboxError(SANDBOX_ERROR_CODES.fileTooLarge);
  }
}

async function initializeGitBaseline(root: string): Promise<void> {
  await runGit(root, ['init', '--quiet']);
  await runGit(root, ['add', '--all']);
  await runGit(root, [
    '-c',
    'user.name=ArtemisKit Sandbox',
    '-c',
    'user.email=sandbox@invalid',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'fixture baseline',
  ]);
}

async function runGit(
  root: string,
  args: string[],
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES
): Promise<CommandResult> {
  const child = Bun.spawn(['git', ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      LC_ALL: 'C',
      PATH: process.env.PATH ?? '',
    },
  });
  const totalBytes = { value: 0 };
  let result: CommandResult;
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      readBoundedStream(child.stdout, maxOutputBytes, totalBytes),
      readBoundedStream(child.stderr, maxOutputBytes, totalBytes),
    ]);
    result = { exitCode, stdout, stderr };
  } catch (error) {
    child.kill('SIGKILL');
    await child.exited;
    throw error;
  }
  if (result.exitCode !== 0) {
    throw new SandboxError(SANDBOX_ERROR_CODES.commandFailed);
  }
  return result;
}
