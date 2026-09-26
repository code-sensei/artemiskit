import { createHash, randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { type FileHandle, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { types } from 'node:util';

export type WorkflowCheckpointValue =
  | null
  | boolean
  | number
  | string
  | WorkflowCheckpointValue[]
  | { [key: string]: WorkflowCheckpointValue };

export interface WorkflowCheckpointEnvelope {
  schemaVersion: '1';
  generation: number;
  payload: WorkflowCheckpointValue;
  sha256: string;
}

export interface WorkflowCheckpointStore {
  read(): Promise<WorkflowCheckpointEnvelope | null>;
  write(payload: unknown): Promise<WorkflowCheckpointEnvelope>;
  close(): Promise<void>;
}

export class WorkflowCheckpointStoreError extends Error {
  constructor(
    public readonly code:
      | 'invalid_options'
      | 'unsafe_storage'
      | 'busy'
      | 'missing'
      | 'exists'
      | 'invalid_checkpoint'
      | 'invalid_payload'
      | 'closed'
      | 'stale_lease'
      | 'storage_failure'
  ) {
    super(`Workflow checkpoint store: ${code}`);
    this.name = 'WorkflowCheckpointStoreError';
  }
}

const MAX_BYTES = 2 * 1024 * 1024;
const CHECKPOINT = 'checkpoint.json';
const LOCK = 'owner.lock';
const GUARD = 'recovery.lock';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const temporary = /^checkpoint-[a-f0-9-]{36}\.tmp$/;
function fail(code: WorkflowCheckpointStoreError['code']): never {
  throw new WorkflowCheckpointStoreError(code);
}
const errorCode = (error: unknown): string | undefined =>
  error instanceof Error && 'code' in error ? String(error.code) : undefined;
const sameFile = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino;
const safeError = (error: unknown): WorkflowCheckpointStoreError =>
  error instanceof WorkflowCheckpointStoreError
    ? error
    : new WorkflowCheckpointStoreError('storage_failure');

function privateStat(stat: Stats, directory = false): void {
  if (
    (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) ||
    (stat.mode & 0o7777) !== (directory ? 0o700 : 0o600) ||
    typeof process.getuid !== 'function' ||
    stat.uid !== process.getuid()
  ) {
    fail('unsafe_storage');
  }
}

/** Inspect descriptors before serialization so getters and toJSON cannot run. */
function plainJson(input: unknown): WorkflowCheckpointValue {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number): WorkflowCheckpointValue => {
    if (++nodes > 100_000 || depth > 64) fail('invalid_payload');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      bytes += Buffer.byteLength(value);
      if (bytes > MAX_BYTES) fail('invalid_payload');
      return value;
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      types.isProxy(value) ||
      ancestors.has(value)
    ) {
      return fail('invalid_payload');
    }
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (
      array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
    ) {
      fail('invalid_payload');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) fail('invalid_payload');
    ancestors.add(value);
    let result: WorkflowCheckpointValue;
    if (array) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > 100_000) fail('invalid_payload');
      if (Object.keys(descriptors).length !== length + 1) fail('invalid_payload');
      const items: WorkflowCheckpointValue[] = [];
      for (let index = 0; index < length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          fail('invalid_payload');
        items.push(visit(descriptor.value, depth + 1));
      }
      result = items;
    } else {
      const object: Record<string, WorkflowCheckpointValue> = Object.create(null);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        bytes += Buffer.byteLength(key);
        if (bytes > MAX_BYTES || !('value' in descriptor) || !descriptor.enumerable) {
          fail('invalid_payload');
        }
        object[key] = visit(descriptor.value, depth + 1);
      }
      result = object;
    }
    ancestors.delete(value);
    return result;
  };
  return visit(input, 0);
}

function digest(generation: number, payload: WorkflowCheckpointValue): string {
  return createHash('sha256').update(JSON.stringify({ generation, payload })).digest('hex');
}

function decodeEnvelope(source: string): WorkflowCheckpointEnvelope {
  try {
    const data = JSON.parse(source);
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      Object.keys(data).join(',') !== 'schemaVersion,generation,payload,sha256' ||
      data.schemaVersion !== '1' ||
      !Number.isSafeInteger(data.generation) ||
      data.generation < 1 ||
      typeof data.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.sha256) ||
      JSON.stringify(data) !== source
    ) {
      fail('invalid_checkpoint');
    }
    const payload = plainJson(data.payload);
    if (digest(data.generation, payload) !== data.sha256) fail('invalid_checkpoint');
    return { schemaVersion: '1', generation: data.generation, payload, sha256: data.sha256 };
  } catch {
    return fail('invalid_checkpoint');
  }
}

interface Owner {
  schemaVersion: '1';
  pid: number;
  hostname: string;
  ownerId: string;
}
function decodeOwner(source: string): Owner {
  try {
    const owner = JSON.parse(source);
    if (
      Object.keys(owner).join(',') !== 'schemaVersion,pid,hostname,ownerId' ||
      owner.schemaVersion !== '1' ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid < 1 ||
      typeof owner.hostname !== 'string' ||
      owner.hostname.length < 1 ||
      owner.hostname.length > 256 ||
      typeof owner.ownerId !== 'string' ||
      !uuid.test(owner.ownerId) ||
      JSON.stringify(owner) !== source
    ) {
      fail('unsafe_storage');
    }
    return owner;
  } catch {
    return fail('unsafe_storage');
  }
}

/**
 * Sensitive, trusted same-user working data, not public evidence or signed data.
 * Host-local POSIX filesystem only; copying a directory bypasses duplicate-restore
 * protection. No automatic retention/deletion. A crashed recovery guard fails
 * closed and requires operator investigation rather than unsafe lock stealing.
 */
export async function openWorkflowCheckpointStore(options: {
  directory: string;
  mode: 'create' | 'resume';
}): Promise<WorkflowCheckpointStore> {
  let directoryHandle: FileHandle | undefined;
  const owner: Owner = {
    schemaVersion: '1',
    pid: process.pid,
    hostname: hostname(),
    ownerId: randomUUID(),
  };
  try {
    if (!options || typeof options !== 'object' || types.isProxy(options)) fail('invalid_options');
    const descriptors = Object.getOwnPropertyDescriptors(options);
    if (
      Reflect.ownKeys(options).length !== 2 ||
      Object.keys(descriptors).sort().join(',') !== 'directory,mode' ||
      !('value' in descriptors.directory) ||
      !('value' in descriptors.mode) ||
      typeof descriptors.directory.value !== 'string' ||
      !descriptors.directory.value ||
      (descriptors.mode.value !== 'create' && descriptors.mode.value !== 'resume') ||
      typeof process.getuid !== 'function'
    ) {
      fail('invalid_options');
    }
    const mode: 'create' | 'resume' = descriptors.mode.value;
    const directory = resolve(descriptors.directory.value);
    if (mode === 'create') {
      try {
        await mkdir(directory, { mode: 0o700 });
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error;
      }
    }
    let directoryStat: Stats;
    try {
      directoryStat = await lstat(directory);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') fail('missing');
      throw error;
    }
    privateStat(directoryStat, true);
    directoryHandle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    if (!sameFile(directoryStat, await directoryHandle.stat())) fail('unsafe_storage');
    const directoryFile = directoryHandle;
    const checkDirectory = async () => {
      const current = await lstat(directory);
      privateStat(current, true);
      if (!sameFile(directoryStat, current)) fail('stale_lease');
      const names = await readdir(directory);
      for (const name of names) {
        if (![CHECKPOINT, LOCK, GUARD].includes(name) && !temporary.test(name))
          fail('unsafe_storage');
        try {
          privateStat(await lstat(join(directory, name)));
        } catch (error) {
          // Another claimant may finish its short-lived guard between listing and stat.
          if (errorCode(error) !== 'ENOENT') throw error;
        }
      }
    };
    const readFile = async (name: string, limit = MAX_BYTES): Promise<string | null> => {
      let handle: FileHandle;
      try {
        handle = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return null;
        fail('unsafe_storage');
      }
      try {
        const stat = await handle.stat();
        privateStat(stat);
        if (stat.size > limit) fail('invalid_checkpoint');
        const buffer = Buffer.alloc(limit + 1);
        let length = 0;
        while (length < buffer.length) {
          const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
          if (!bytesRead) break;
          length += bytesRead;
        }
        if (length > limit || length !== stat.size) fail('invalid_checkpoint');
        const text = buffer.subarray(0, length).toString('utf8');
        if (!Buffer.from(text).equals(buffer.subarray(0, length))) fail('invalid_checkpoint');
        return text;
      } finally {
        await handle.close();
      }
    };
    const exclusiveFile = async (name: string, text: string) => {
      const file = await open(
        join(directory, name),
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
        0o600
      );
      try {
        privateStat(await file.stat());
        await file.writeFile(text);
        await file.sync();
      } finally {
        await file.close();
      }
    };
    const withGuard = async <T>(operation: () => Promise<T>): Promise<T> => {
      await checkDirectory();
      const text = JSON.stringify(owner);
      let acquired = false;
      // A bounded wait lets a live claimant finish without ever stealing its guard.
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          await exclusiveFile(GUARD, text);
          acquired = true;
          break;
        } catch (error) {
          if (errorCode(error) !== 'EEXIST') throw error;
          if (attempt < 99) await new Promise((done) => setTimeout(done, 10));
        }
      }
      if (!acquired) fail('busy');
      try {
        await checkDirectory();
        return await operation();
      } finally {
        if ((await readFile(GUARD, 1024)) === text) {
          await unlink(join(directory, GUARD));
          await directoryFile.sync();
        }
      }
    };
    const ownerText = JSON.stringify(owner);
    const release = () =>
      withGuard(async () => {
        if ((await readFile(LOCK, 1024)) !== ownerText) fail('stale_lease');
        await unlink(join(directory, LOCK));
        await directoryFile.sync();
      });
    await withGuard(async () => {
      const previous = await readFile(LOCK, 1024);
      if (previous !== null) {
        const oldOwner = decodeOwner(previous);
        if (mode !== 'resume' || oldOwner.hostname !== owner.hostname) fail('busy');
        try {
          process.kill(oldOwner.pid, 0);
          fail('busy');
        } catch (error) {
          if (errorCode(error) !== 'ESRCH') fail('busy');
        }
        // All cooperating acquire/release/recovery mutations hold this guard.
        if ((await readFile(LOCK, 1024)) !== previous) fail('busy');
        await unlink(join(directory, LOCK));
      }
      await exclusiveFile(LOCK, ownerText);
      await directoryFile.sync();
    });
    let current: WorkflowCheckpointEnvelope | null;
    try {
      const source = await readFile(CHECKPOINT);
      if (mode === 'create' && source !== null) fail('exists');
      if (mode === 'resume' && source === null) fail('missing');
      current = source === null ? null : decodeEnvelope(source);
    } catch (error) {
      await release();
      throw error;
    }
    let closed = false;
    let closing = false;
    let queue: Promise<unknown> = Promise.resolve();
    const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
      if (closing || closed) return Promise.reject(new WorkflowCheckpointStoreError('closed'));
      const result = queue.then(operation).catch((error) => {
        throw safeError(error);
      });
      queue = result.catch(() => {});
      return result;
    };
    const checkLease = async () => {
      await checkDirectory();
      if ((await readFile(LOCK, 1024)) !== ownerText) fail('stale_lease');
      const source = await readFile(CHECKPOINT);
      const observed = source === null ? null : decodeEnvelope(source);
      if (observed?.generation !== current?.generation || observed?.sha256 !== current?.sha256)
        fail('stale_lease');
    };
    let closePromise: Promise<void> | undefined;
    return {
      read: () =>
        enqueue(async () => {
          await checkLease();
          return current === null ? null : decodeEnvelope(JSON.stringify(current));
        }),
      write: (payload) =>
        enqueue(async () => {
          await checkLease();
          const value = plainJson(payload);
          const generation = (current?.generation ?? 0) + 1;
          if (!Number.isSafeInteger(generation)) fail('invalid_checkpoint');
          const envelope: WorkflowCheckpointEnvelope = {
            schemaVersion: '1',
            generation,
            payload: value,
            sha256: digest(generation, value),
          };
          const text = JSON.stringify(envelope);
          if (Buffer.byteLength(text) > MAX_BYTES) fail('invalid_payload');
          const name = `checkpoint-${randomUUID()}.tmp`;
          let created = false;
          try {
            await exclusiveFile(name, text);
            created = true;
            await checkLease();
            await rename(join(directory, name), join(directory, CHECKPOINT));
            created = false;
            // Track an already-renamed generation even if the durability sync fails.
            current = envelope;
            await directoryFile.sync();
            return decodeEnvelope(text);
          } finally {
            if (created) await unlink(join(directory, name));
          }
        }),
      close: () => {
        if (closePromise) return closePromise;
        closing = true;
        closePromise = queue
          .then(async () => {
            try {
              await release();
            } finally {
              closed = true;
              await directoryFile.close();
            }
          })
          .catch((error) => {
            throw safeError(error);
          });
        return closePromise;
      },
    };
  } catch (error) {
    // Failed setup never exposes native filesystem diagnostics or working data.
    if (directoryHandle) await directoryHandle.close().catch(() => {});
    // If ownership could not be safely released, retaining its marker is fail-closed.
    throw safeError(error);
  }
}
