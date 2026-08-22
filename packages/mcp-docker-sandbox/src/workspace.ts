import { randomUUID } from 'node:crypto';
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
  assertAllowedWritePath,
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
  cleanupTimeoutMs?: number;
  maxCommands?: number;
  operationTimeoutMs?: number;
  maxOperations?: number;
  maxFileBytes?: number;
  maxOutputBytes?: number;
  allowedWritePaths?: string[];
  allowedCommands?: string[];
  dockerRunner?: DockerRunner;
  gitRunner?: DockerRunner;
}

export interface DockerRunRequest {
  argv: string[];
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputBytes: number;
}

export type DockerRunner = (request: DockerRunRequest) => Promise<CommandResult>;

interface UnsafeContainerState {
  launchSettled: boolean;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 10_000;
const DEFAULT_CONTAINER_CLEANUP_TIMEOUT_MS = 5_000;
const DEFAULT_ABORT_SETTLE_TIMEOUT_MS = 1_000;
const DEFAULT_MAX_COMMANDS = 20;
const DEFAULT_MAX_OPERATIONS = 100;
const DEFAULT_MAX_FILE_BYTES = 1_000_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;
const DOCKER_IMAGE = 'oven/bun:1.3.10';

export async function createDockerWorkspace(
  options: DockerWorkspaceOptions = {}
): Promise<DockerWorkspace> {
  const controlRoot = await mkdtemp(join(tmpdir(), 'artemiskit-agent-'));
  const root = join(controlRoot, 'workspace');
  const gitDirectory = join(controlRoot, 'git');
  const operationTimeoutMs = options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  const gitRunner = options.gitRunner ?? runGitProcess;
  let akitBundlePath: string | undefined;
  try {
    await mkdir(root);
    akitBundlePath = await resolveAkitBundle(options.akitBundlePath);
    if (options.fixturePath) {
      await copyFixture(options.fixturePath, root);
    }
    await initializeGitBaseline(
      root,
      gitDirectory,
      operationTimeoutMs,
      options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      gitRunner
    );
  } catch (error) {
    await rm(controlRoot, { recursive: true, force: true });
    if (error instanceof SandboxError) throw error;
    throw new SandboxError(SANDBOX_ERROR_CODES.fixtureInvalid, undefined, { cause: error });
  }

  const commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? DEFAULT_CONTAINER_CLEANUP_TIMEOUT_MS;
  const maxCommands = options.maxCommands ?? DEFAULT_MAX_COMMANDS;
  const maxOperations = options.maxOperations ?? DEFAULT_MAX_OPERATIONS;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const allowedWritePaths = options.allowedWritePaths?.slice();
  const allowedCommands = options.allowedCommands?.slice();
  const dockerRunner = options.dockerRunner ?? runDocker;
  const serialize = createOperationQueue(operationTimeoutMs);
  const unsafeContainers = new Map<string, UnsafeContainerState>();
  let commandCount = 0;
  let operationCount = 0;
  let isDisposed = false;
  let disposalRequested = false;
  let disposalPromise: Promise<void> | undefined;
  const assertActive = (): void => {
    if (isDisposed || disposalRequested) throw new SandboxError(SANDBOX_ERROR_CODES.disposed);
    if (unsafeContainers.size > 0) {
      throw new SandboxError(SANDBOX_ERROR_CODES.cleanupUnconfirmed);
    }
  };
  const markCleanupUnconfirmed = (containerName: string, pendingLaunch?: Promise<void>): void => {
    // An aborted Docker client can still create its named container later. Keep the workspace
    // poisoned until that launch settles and a subsequent exact-name cleanup confirms safety.
    const state = { launchSettled: pendingLaunch === undefined };
    unsafeContainers.set(containerName, state);
    if (pendingLaunch) {
      void pendingLaunch.then(() => {
        state.launchSettled = true;
      });
    }
  };
  const reserveOperation = (): void => {
    if (operationCount >= maxOperations) {
      throw new SandboxError(SANDBOX_ERROR_CODES.operationBudgetExceeded);
    }
    operationCount += 1;
  };

  return {
    root,
    async read(path) {
      assertActive();
      reserveOperation();
      return serialize(() => {
        assertActive();
        return withOperationTimeout(async (signal) => {
          const resolvedPath = await resolveWorkspaceFile(root, path);
          await assertFileWithinLimit(resolvedPath, maxFileBytes);
          return readFile(resolvedPath, { encoding: 'utf8', signal });
        }, operationTimeoutMs);
      });
    },
    async patch({ path, oldText, newText }) {
      assertActive();
      reserveOperation();
      if (!oldText) throw new SandboxError(SANDBOX_ERROR_CODES.patchConflict);
      return serialize(() => {
        assertActive();
        return withOperationTimeout(async (signal) => {
          const resolvedPath = await resolveWorkspaceFile(root, path, allowedWritePaths);
          await assertFileWithinLimit(resolvedPath, maxFileBytes);
          const contents = await readFile(resolvedPath, { encoding: 'utf8', signal });
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
          await writeFile(resolvedPath, updated, { signal });
          return { path, replacements: 1 as const };
        }, operationTimeoutMs);
      });
    },
    async status() {
      assertActive();
      reserveOperation();
      const result = await serialize(() => {
        assertActive();
        return runGit(
          root,
          gitDirectory,
          ['status', '--short', '--untracked-files=all'],
          maxOutputBytes,
          operationTimeoutMs,
          gitRunner
        );
      });
      return result.stdout;
    },
    async diff() {
      assertActive();
      reserveOperation();
      const result = await serialize(() => {
        assertActive();
        return runGit(
          root,
          gitDirectory,
          ['diff', '--no-ext-diff', '--no-color', '--'],
          maxOutputBytes,
          operationTimeoutMs,
          gitRunner
        );
      });
      return result.stdout;
    },
    async run(command) {
      assertActive();
      reserveOperation();
      const allowed = assertAllowedCommand(command, allowedCommands);
      if (allowed.requiresAkitBundle && !akitBundlePath) {
        throw new SandboxError(SANDBOX_ERROR_CODES.akitBundleRequired);
      }
      if (commandCount >= maxCommands) {
        throw new SandboxError(SANDBOX_ERROR_CODES.commandBudgetExceeded);
      }
      commandCount += 1;
      return serialize(() => {
        assertActive();
        return runDockerCommand(
          root,
          akitBundlePath,
          allowed.executable,
          allowed.args,
          commandTimeoutMs,
          cleanupTimeoutMs,
          maxOutputBytes,
          dockerRunner,
          markCleanupUnconfirmed
        );
      });
    },
    async dispose() {
      if (isDisposed) return;
      if (disposalPromise) return disposalPromise;
      disposalRequested = true;
      disposalPromise = serialize(async () => {
        for (const [containerName, state] of unsafeContainers) {
          if (!state.launchSettled) continue;
          if (
            await cleanupContainer(containerName, maxOutputBytes, cleanupTimeoutMs, dockerRunner)
          ) {
            unsafeContainers.delete(containerName);
          }
        }
        if (unsafeContainers.size > 0) {
          throw new SandboxError(SANDBOX_ERROR_CODES.cleanupUnconfirmed);
        }
        await rm(controlRoot, { recursive: true, force: true });
        isDisposed = true;
      }).finally(() => {
        disposalPromise = undefined;
      });
      return disposalPromise;
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
  containerName: string,
  executable: string,
  args: string[]
): string[] {
  const argv = [
    'docker',
    'run',
    '--rm',
    '--name',
    containerName,
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

async function runDockerCommand(
  root: string,
  akitBundlePath: string | undefined,
  executable: string,
  args: string[],
  timeoutMs: number,
  cleanupTimeoutMs: number,
  maxOutputBytes: number,
  dockerRunner: DockerRunner,
  markCleanupUnconfirmed: (containerName: string, pendingLaunch?: Promise<void>) => void
): Promise<CommandResult> {
  const containerName = `artemiskit-agent-${randomUUID()}`;
  const argv = buildDockerArgv(root, akitBundlePath, containerName, executable, args);
  let pendingLaunch: Promise<void> | undefined;
  try {
    const result = await runWithTimeout(
      dockerRunner,
      { argv, timeoutMs, maxOutputBytes },
      SANDBOX_ERROR_CODES.commandTimeout,
      (settlement) => {
        pendingLaunch = settlement;
      }
    );
    if (combinedByteLength(result) > maxOutputBytes) {
      throw new SandboxError(SANDBOX_ERROR_CODES.outputLimitExceeded);
    }
    return result;
  } catch (error) {
    if (pendingLaunch) markCleanupUnconfirmed(containerName, pendingLaunch);
    if (
      !(await cleanupContainer(containerName, maxOutputBytes, cleanupTimeoutMs, dockerRunner)) &&
      !pendingLaunch
    ) {
      markCleanupUnconfirmed(containerName);
    }
    throw error;
  }
}

async function cleanupContainer(
  containerName: string,
  maxOutputBytes: number,
  timeoutMs: number,
  dockerRunner: DockerRunner
): Promise<boolean> {
  let removalResult: CommandResult | undefined;
  try {
    removalResult = await runWithTimeout(
      dockerRunner,
      {
        argv: ['docker', 'rm', '-f', containerName],
        timeoutMs,
        maxOutputBytes,
      },
      SANDBOX_ERROR_CODES.operationTimeout
    );
  } catch {
    // Inspect below: a failed removal is safe only if Docker confirms absence.
  }
  if (removalResult?.exitCode === 0) return true;

  let inspectionResult: CommandResult;
  try {
    inspectionResult = await runWithTimeout(
      dockerRunner,
      {
        argv: ['docker', 'container', 'inspect', containerName],
        timeoutMs,
        maxOutputBytes,
      },
      SANDBOX_ERROR_CODES.operationTimeout
    );
  } catch {
    return false;
  }
  return (
    inspectionResult.exitCode !== 0 &&
    inspectionResult.stderr.includes(`No such container: ${containerName}`)
  );
}

async function runWithTimeout(
  runner: DockerRunner,
  request: Omit<DockerRunRequest, 'signal'>,
  timeoutCode:
    | typeof SANDBOX_ERROR_CODES.commandTimeout
    | typeof SANDBOX_ERROR_CODES.operationTimeout,
  onUnsettledTimeout?: (settlement: Promise<void>) => void
): Promise<CommandResult> {
  const controller = new AbortController();
  let didTimeout = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new SandboxError(timeoutCode));
    }, request.timeoutMs);
  });
  const runnerPromise = runner({ ...request, signal: controller.signal });
  const settlement = runnerPromise.then(
    () => undefined,
    () => undefined
  );
  try {
    const result = await Promise.race([runnerPromise, timeoutPromise]);
    if (didTimeout) throw new SandboxError(timeoutCode);
    return result;
  } catch (error) {
    if (didTimeout) {
      if (!(await waitForSettlement(settlement, DEFAULT_ABORT_SETTLE_TIMEOUT_MS))) {
        onUnsettledTimeout?.(settlement);
      }
      throw new SandboxError(timeoutCode);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForSettlement(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let didSettle = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise.then(
        () => {
          didSettle = true;
        },
        () => {
          didSettle = true;
        }
      ),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
    return didSettle;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function runDocker(request: DockerRunRequest): Promise<CommandResult> {
  return runSubprocess(request);
}

async function runGitProcess(request: DockerRunRequest): Promise<CommandResult> {
  return runSubprocess(request, {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    LC_ALL: 'C',
    PATH: process.env.PATH ?? '',
  });
}

async function runSubprocess(
  request: DockerRunRequest,
  env?: Record<string, string>
): Promise<CommandResult> {
  const child = Bun.spawn(request.argv, {
    stdout: 'pipe',
    stderr: 'pipe',
    signal: request.signal,
    env,
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
    try {
      child.kill('SIGKILL');
    } catch {}
    await child.exited.catch(() => undefined);
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

async function resolveWorkspaceFile(
  root: string,
  candidate: string,
  allowedWritePaths?: readonly string[]
): Promise<string> {
  const resolvedPath =
    allowedWritePaths === undefined
      ? assertWorkspacePath(root, candidate)
      : assertAllowedWritePath(root, candidate, allowedWritePaths);
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

async function initializeGitBaseline(
  root: string,
  gitDirectory: string,
  timeoutMs: number,
  maxOutputBytes: number,
  gitRunner: DockerRunner
): Promise<void> {
  await runGit(root, gitDirectory, ['init', '--quiet'], maxOutputBytes, timeoutMs, gitRunner);
  await runGit(root, gitDirectory, ['add', '--all'], maxOutputBytes, timeoutMs, gitRunner);
  await runGit(
    root,
    gitDirectory,
    [
      '-c',
      'user.name=ArtemisKit Sandbox',
      '-c',
      'user.email=sandbox@invalid',
      'commit',
      '--quiet',
      '--allow-empty',
      '-m',
      'fixture baseline',
    ],
    maxOutputBytes,
    timeoutMs,
    gitRunner
  );
}

async function runGit(
  root: string,
  gitDirectory: string,
  args: string[],
  maxOutputBytes: number,
  timeoutMs: number,
  gitRunner: DockerRunner
): Promise<CommandResult> {
  const result = await runWithTimeout(
    gitRunner,
    {
      argv: ['git', '--git-dir', gitDirectory, '--work-tree', root, ...args],
      timeoutMs,
      maxOutputBytes,
    },
    SANDBOX_ERROR_CODES.operationTimeout
  );
  if (combinedByteLength(result) > maxOutputBytes) {
    throw new SandboxError(SANDBOX_ERROR_CODES.outputLimitExceeded);
  }
  if (result.exitCode !== 0) {
    throw new SandboxError(SANDBOX_ERROR_CODES.commandFailed);
  }
  return result;
}

function createOperationQueue(timeoutMs: number) {
  let tail = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    let didStart = false;
    let didExpire = false;
    let release: () => void = () => undefined;
    const previous = tail;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (didStart) return;
        didExpire = true;
        reject(new SandboxError(SANDBOX_ERROR_CODES.operationTimeout));
      }, timeoutMs);
      void previous.then(async () => {
        if (didExpire) {
          release();
          return;
        }
        didStart = true;
        clearTimeout(timeout);
        try {
          resolve(await operation());
        } catch (error) {
          reject(error);
        } finally {
          release();
        }
      });
    });
  };
}

async function withOperationTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let didTimeout = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      reject(new SandboxError(SANDBOX_ERROR_CODES.operationTimeout));
    }, timeoutMs);
  });
  const operationPromise = operation(controller.signal);
  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } catch (error) {
    if (didTimeout) {
      await waitForSettlement(operationPromise, DEFAULT_ABORT_SETTLE_TIMEOUT_MS);
      throw new SandboxError(SANDBOX_ERROR_CODES.operationTimeout);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
