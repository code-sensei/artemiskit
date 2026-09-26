import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type WorkflowCheckpointStore, openWorkflowCheckpointStore } from './checkpoint-store';

const roots: string[] = [];
const leases: WorkflowCheckpointStore[] = [];
const children: ChildProcessWithoutNullStreams[] = [];
let bundleRoot: string;
let moduleUrl: string;
beforeAll(async () => {
  bundleRoot = await mkdtemp(join(tmpdir(), 'artemis-checkpoint-bundle-'));
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'checkpoint-store.ts')],
    target: 'node',
    outdir: bundleRoot,
    naming: 'store.mjs',
  });
  expect(result.success).toBe(true);
  moduleUrl = pathToFileURL(join(bundleRoot, 'store.mjs')).href;
});
afterAll(async () => {
  await rm(bundleRoot, { recursive: true, force: true });
});
afterEach(async () => {
  for (const child of children.splice(0))
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  for (const lease of leases.splice(0)) await lease.close().catch(() => {});
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'artemis-checkpoint-'));
  roots.push(root);
  return join(root, 'private');
}
async function create(directory: string) {
  const lease = await openWorkflowCheckpointStore({ directory, mode: 'create' });
  leases.push(lease);
  return lease;
}
async function resume(directory: string) {
  const lease = await openWorkflowCheckpointStore({ directory, mode: 'resume' });
  leases.push(lease);
  return lease;
}
async function fixture() {
  const path = await directory();
  const lease = await create(path);
  await lease.write({ conversation: ['sensitive working input'], remainingTokens: 90 });
  await lease.close();
  return path;
}
function child(source: string, runtime = 'node') {
  const process = spawn(
    runtime,
    [
      '--input-type=module',
      '-e',
      `import {openWorkflowCheckpointStore as open} from ${JSON.stringify(moduleUrl)}; ${source}`,
    ],
    { stdio: 'pipe' }
  );
  children.push(process);
  return process;
}
function firstLine(process: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      process.kill('SIGKILL');
      reject(new Error('Child timed out'));
    }, 6000);
    process.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('\n')) {
        clearTimeout(timer);
        resolve(output.split('\n')[0]);
      }
    });
    process.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    process.on('exit', () => {
      clearTimeout(timer);
      if (!output.includes('\n')) reject(new Error('Child exited before result'));
    });
  });
}
function exited(process: ChildProcessWithoutNullStreams): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => process.once('exit', () => resolve()));
}
async function putOwner(path: string, updates: Record<string, unknown> = {}) {
  await writeFile(
    join(path, 'owner.lock'),
    JSON.stringify({
      schemaVersion: '1',
      pid: process.pid,
      hostname: hostname(),
      ownerId: randomUUID(),
      ...updates,
    }),
    { mode: 0o600 }
  );
}

describe('private durable workflow checkpoint storage', () => {
  test('writes private atomic generations, detached reads and serialized concurrent writes', async () => {
    const path = await directory();
    const lease = await create(path);
    expect(await lease.read()).toBeNull();
    const first = await lease.write({ state: 'one' });
    expect(first.generation).toBe(1);
    expect(first.sha256).toBe(
      createHash('sha256')
        .update(JSON.stringify({ generation: 1, payload: { state: 'one' } }))
        .digest('hex')
    );
    first.payload = 'caller changed';
    expect((await lease.read())?.payload).toEqual({ state: 'one' });
    const writes = await Promise.all([
      lease.write({ state: 'two' }),
      lease.write({ state: 'three' }),
    ]);
    expect(writes.map((value) => value.generation)).toEqual([2, 3]);
    expect((await stat(path)).mode & 0o777).toBe(0o700);
    for (const name of await readdir(path))
      expect((await stat(join(path, name))).mode & 0o777).toBe(0o600);
    expect(await readdir(path)).toEqual(['checkpoint.json', 'owner.lock']);
    await lease.close();
    expect((await (await resume(path)).read())?.generation).toBe(3);
  });

  test('does not create on resume or overwrite an existing checkpoint on create', async () => {
    await expect(resume(await directory())).rejects.toMatchObject({ code: 'missing' });
    const path = await fixture();
    const original = await readFile(join(path, 'checkpoint.json'));
    await expect(create(path)).rejects.toMatchObject({ code: 'exists' });
    expect(await readFile(join(path, 'checkpoint.json'))).toEqual(original);
    expect(await readdir(path)).toEqual(['checkpoint.json']);
  });

  test('close is idempotent, drains accepted writes and rejects stale queued work', async () => {
    const lease = await create(await directory());
    const writing = lease.write({ state: true });
    const closing = lease.close();
    expect(await writing).toMatchObject({ generation: 1 });
    await closing;
    await lease.close();
    await expect(lease.write(null)).rejects.toMatchObject({ code: 'closed' });
    await expect(lease.read()).rejects.toMatchObject({ code: 'closed' });
  });

  test('refuses concurrent opens and detects stolen ownership without deleting its replacement', async () => {
    const path = await directory();
    const lease = await create(path);
    await lease.write({ ok: true });
    await expect(resume(path)).rejects.toMatchObject({ code: 'busy' });
    await putOwner(path);
    await expect(lease.write(null)).rejects.toMatchObject({ code: 'stale_lease' });
    await expect(lease.close()).rejects.toMatchObject({ code: 'stale_lease' });
    expect((await readdir(path)).includes('owner.lock')).toBe(true);
  });

  test('rejects accessors, proxies, sparse arrays, executable values and bounded JSON violations without invoking them', async () => {
    const lease = await create(await directory());
    let called = 0;
    const getter = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        called++;
        return 'sensitive';
      },
    });
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          called++;
          return [];
        },
      }
    );
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const deep: unknown[] = [];
    let cursor = deep;
    for (let index = 0; index < 66; index++) {
      const next: unknown[] = [];
      cursor.push(next);
      cursor = next;
    }
    for (const input of [
      getter,
      proxy,
      cycle,
      deep,
      new Date(),
      [undefined],
      [Number.NaN],
      new Array(3),
      {
        toJSON() {
          called++;
          return 'bad';
        },
      },
      { [Symbol('x')]: 1 },
      'x'.repeat(2 * 1024 * 1024),
      Array(100001).fill(0),
    ]) {
      await expect(lease.write(input)).rejects.toMatchObject({ code: 'invalid_payload' });
    }
    expect(called).toBe(0);
    expect(await lease.read()).toBeNull();
  });

  test('does not execute option getters or proxies', async () => {
    let called = 0;
    const options = {
      get directory() {
        called++;
        return '/sensitive';
      },
      mode: 'create' as const,
    };
    await expect(openWorkflowCheckpointStore(options)).rejects.toMatchObject({
      code: 'invalid_options',
    });
    await expect(
      openWorkflowCheckpointStore(
        new Proxy(options, {
          ownKeys() {
            called++;
            return [];
          },
        })
      )
    ).rejects.toMatchObject({ code: 'invalid_options' });
    expect(called).toBe(0);
  });

  test('rejects symlink directories, linked checkpoint files, unsafe permissions and unknown entries', async () => {
    const destination = await fixture();
    const alias = await directory();
    await symlink(destination, alias);
    await expect(resume(alias)).rejects.toMatchObject({ code: 'unsafe_storage' });
    await chmod(destination, 0o755);
    await expect(resume(destination)).rejects.toMatchObject({ code: 'unsafe_storage' });
    await chmod(destination, 0o700);
    await chmod(join(destination, 'checkpoint.json'), 0o644);
    await expect(resume(destination)).rejects.toMatchObject({ code: 'unsafe_storage' });
    await chmod(join(destination, 'checkpoint.json'), 0o600);
    const linked = await directory();
    await mkdir(linked, { mode: 0o700 });
    await link(join(destination, 'checkpoint.json'), join(linked, 'checkpoint.json'));
    await expect(resume(linked)).rejects.toMatchObject({ code: 'unsafe_storage' });
    const other = await fixture();
    await writeFile(join(other, 'unrelated.txt'), 'leave intact', { mode: 0o600 });
    await expect(resume(other)).rejects.toMatchObject({ code: 'unsafe_storage' });
    expect(await readFile(join(other, 'unrelated.txt'), 'utf8')).toBe('leave intact');
    const symlinked = await directory();
    await mkdir(symlinked, { mode: 0o700 });
    await symlink(join(other, 'checkpoint.json'), join(symlinked, 'checkpoint.json'));
    await expect(resume(symlinked)).rejects.toMatchObject({ code: 'unsafe_storage' });
  });

  test('rejects corrupt, truncated, oversized, duplicate, extra-key and unknown-version envelopes without leaking diagnostics', async () => {
    const path = await fixture();
    const source = await readFile(join(path, 'checkpoint.json'), 'utf8');
    const data = JSON.parse(source);
    const invalid = [
      source.slice(0, -3),
      'sensitive-token-should-not-leak',
      'x'.repeat(2 * 1024 * 1024 + 1),
      JSON.stringify({ ...data, schemaVersion: '2' }),
      JSON.stringify({ ...data, extra: 'secret' }),
      JSON.stringify({ ...data, generation: 0 }),
      JSON.stringify({ ...data, payload: 'tampered' }),
      source.replace('"generation":1', '"generation":1,"generation":1'),
    ];
    for (const text of invalid) {
      await writeFile(join(path, 'checkpoint.json'), text);
      const error = await resume(path).catch((value) => value);
      expect(error.code).toBe('invalid_checkpoint');
      expect(error.message).toBe('Workflow checkpoint store: invalid_checkpoint');
      expect(await readdir(path)).toEqual(['checkpoint.json']);
    }
  });

  test('refuses foreign, alive, malformed owners and stale recovery guards', async () => {
    const path = await fixture();
    await putOwner(path, { hostname: 'other-host' });
    await expect(resume(path)).rejects.toMatchObject({ code: 'busy' });
    await putOwner(path);
    await expect(resume(path)).rejects.toMatchObject({ code: 'busy' });
    await writeFile(join(path, 'owner.lock'), 'broken');
    await expect(resume(path)).rejects.toMatchObject({ code: 'unsafe_storage' });
    const guarded = await fixture();
    await writeFile(join(guarded, 'recovery.lock'), 'orphaned guard', { mode: 0o600 });
    await expect(resume(guarded)).rejects.toMatchObject({ code: 'busy' });
    expect(await readFile(join(guarded, 'recovery.lock'), 'utf8')).toBe('orphaned guard');
  });

  test('detects external generation rollback on a live lease', async () => {
    const path = await directory();
    const lease = await create(path);
    await lease.write({ value: 1 });
    const old = await readFile(join(path, 'checkpoint.json'));
    await lease.write({ value: 2 });
    await writeFile(join(path, 'checkpoint.json'), old);
    await expect(lease.read()).rejects.toMatchObject({ code: 'stale_lease' });
    await expect(lease.write({ value: 3 })).rejects.toMatchObject({ code: 'stale_lease' });
  });

  test('separate Node process resumes a closed checkpoint with its remaining budget intact', async () => {
    const path = await fixture();
    const worker = child(
      `const s=await open({directory:${JSON.stringify(path)},mode:'resume'}); const e=await s.read(); await s.write({...e.payload,remainingTokens:80}); await s.close(); console.log(JSON.stringify(e));`
    );
    const prior = JSON.parse(await firstLine(worker));
    await exited(worker);
    expect(worker.exitCode).toBe(0);
    expect(prior.payload.remainingTokens).toBe(90);
    expect((await (await resume(path)).read())?.generation).toBe(2);
  });

  test('dead local process is recovered once and an interrupted temporary generation is not replayed', async () => {
    const path = await fixture();
    const worker = child(
      `const s=await open({directory:${JSON.stringify(path)},mode:'resume'}); console.log('ready'); setInterval(()=>{},1000);`
    );
    expect(await firstLine(worker)).toBe('ready');
    await expect(resume(path)).rejects.toMatchObject({ code: 'busy' });
    const orphan = join(path, `checkpoint-${randomUUID()}.tmp`);
    await writeFile(orphan, 'interrupted newer working data', { mode: 0o600 });
    worker.kill('SIGKILL');
    await exited(worker);
    const lease = await resume(path);
    expect((await lease.read())?.generation).toBe(1);
    expect((await lease.write({ recovered: true })).generation).toBe(2);
    expect(await readFile(orphan, 'utf8')).toBe('interrupted newer working data');
  });

  test('two separate recovery contenders cannot both own the same dead checkpoint', async () => {
    const path = await fixture();
    const old = child(
      `const s=await open({directory:${JSON.stringify(path)},mode:'resume'});console.log('ready');setInterval(()=>{},1000);`
    );
    await firstLine(old);
    old.kill('SIGKILL');
    await exited(old);
    const code = `try {const s=await open({directory:${JSON.stringify(path)},mode:'resume'});console.log('owned');setInterval(()=>{},1000);}catch(e){console.log(e.code);}`;
    const contenders = [child(code), child(code)];
    const outcomes = await Promise.all(contenders.map(firstLine));
    expect(outcomes.sort()).toEqual(['busy', 'owned']);
  });
});
