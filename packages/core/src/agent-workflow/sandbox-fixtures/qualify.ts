/** Explicit local Docker qualification. Run with ARTEMISKIT_DOCKER_TESTS=1 under Bun or bundled Node. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { WorkflowEnvironmentInitializationError } from '../environment';
import { validateAgentWorkflow } from '../parser';
import { createDockerWorkflowEnvironmentFactory } from '../sandbox';
const exec = promisify(execFile);
const enabled = process.env.ARTEMISKIT_DOCKER_TESTS === '1';
if (!enabled) {
  process.stdout.write('Docker qualification skipped; set ARTEMISKIT_DOCKER_TESTS=1.\n');
  process.exit(0);
}
function workflow() {
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'sandbox-qualification',
    target: { provider: 'custom', model: 'fixture' },
    environment: {
      type: 'sandbox',
      policy: {
        network: 'denied',
        side_effects: 'approval_required',
        permissions: { files: 'write', workflow_state: 'write' },
        paths: { read: ['nested/note.txt', 'new.txt'], write: ['new.txt'] },
        budgets: { max_actions: 10, timeout_ms: 10000 },
      },
    },
    tools: ['read_file', 'write_file', 'request_approval'],
    workflow: {
      system_instructions: 'Use declared tools.',
      initial_state: {},
      turns: [{ role: 'user', content: 'Read.' }],
    },
    outcomes: {
      deterministic: [{ type: 'policy', rule: 'permissions_respected', expected: 'passed' }],
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}
const signal = () => new AbortController().signal;
const artifact = 'Àyẹ̀wò 🧪 العربية 日本語'.repeat(300);
const factory = createDockerWorkflowEnvironmentFactory();
const initialState = {
  files: { 'nested/note.txt': 'original', 'forbidden.txt': 'private' },
  workflow_state: {},
};
async function names() {
  return (
    await exec(
      'docker',
      ['ps', '--all', '--filter', 'label=artemiskit.workflow=true', '--format', '{{.Names}}'],
      { timeout: 5000 }
    )
  ).stdout
    .trim()
    .split('\n')
    .filter(Boolean);
}
if (process.argv.includes('--unavailable-daemon') || process.argv.includes('--unavailable-image')) {
  try {
    await factory({ workflow: workflow(), initialState, signal: signal() });
    assert.fail('expected unavailable daemon');
  } catch (error) {
    assert(error instanceof WorkflowEnvironmentInitializationError);
    assert.equal(error.cleanup.status, 'completed');
    assert.equal(error.cleanup.artifacts, 'discarded');
  }
  process.stdout.write('Unavailable daemon rejected before creating resources.\n');
  process.exit(0);
}
const before = new Set(await names());
const environment = await factory({ workflow: workflow(), initialState, signal: signal() });
const owned = (await names()).filter((name) => !before.has(name));
assert.equal(owned.length, 1);
const name = owned[0];
try {
  const config = JSON.parse((await exec('docker', ['inspect', name], { timeout: 5000 })).stdout)[0];
  assert.equal(config.HostConfig.NetworkMode, 'none');
  assert.equal(config.HostConfig.ReadonlyRootfs, true);
  assert.deepEqual(config.HostConfig.CapDrop, ['ALL']);
  assert(config.HostConfig.SecurityOpt.includes('no-new-privileges'));
  assert.equal(config.Config.User, '1000:1000');
  assert.equal(config.HostConfig.Binds, null);
  assert.equal(config.HostConfig.Memory, 134217728);
  assert.equal(config.HostConfig.PidsLimit, 64);
  assert.equal(config.HostConfig.NanoCpus, 500000000);
  assert(!config.Config.Env.some((entry: string) => /^(NPM_|OPENAI_|ANTHROPIC_|AWS_)/.test(entry)));
  const read = await environment.execute(
    { tool: 'read_file', input: { path: 'nested/note.txt' } },
    signal()
  );
  assert.equal(read.status, 'succeeded');
  if (read.status === 'succeeded') assert.deepEqual(read.output, { content: 'original' });
  const written = await environment.execute(
    { tool: 'write_file', input: { path: 'new.txt', content: artifact } },
    signal()
  );
  assert.equal(written.status, 'succeeded');
  assert.equal(
    (
      await exec(
        'docker',
        [
          'exec',
          name,
          'bun',
          '--eval',
          "process.stdout.write(require('node:fs').readFileSync('/workspace/new.txt','utf8'))",
        ],
        { timeout: 5000 }
      )
    ).stdout,
    artifact
  );
  assert.equal(
    (await environment.execute({ tool: 'read_file', input: { path: 'forbidden.txt' } }, signal()))
      .status,
    'denied'
  );
  assert.equal(
    (
      await environment.execute(
        { tool: 'write_file', input: { path: '../escape', content: 'no' } },
        signal()
      )
    ).status,
    'invalid'
  );
  assert.equal(
    (await environment.execute({ tool: 'run_command', input: { command: 'whoami' } }, signal()))
      .status,
    'denied'
  );
  const approval = await environment.execute(
    { tool: 'request_approval', input: { reason: 'Review' } },
    signal()
  );
  assert.equal(approval.status, 'succeeded');
  if (approval.status === 'succeeded')
    assert.deepEqual(approval.output, { requested: true, status: 'pending' });
  const snapshot = await environment.snapshot(signal());
  assert.equal((snapshot.files as Record<string, string>)['new.txt'], artifact);
  assert.deepEqual(initialState.files, {
    'nested/note.txt': 'original',
    'forbidden.txt': 'private',
  });
  const second = await factory({ workflow: workflow(), initialState, signal: signal() });
  try {
    assert.equal(
      (await second.snapshot(signal())).files &&
        ((await second.snapshot(signal())).files as Record<string, string>)['new.txt'],
      undefined
    );
  } finally {
    assert.equal((await second.close(signal())).status, 'completed');
  }
  const rootWrite = await exec(
    'docker',
    [
      'exec',
      name,
      'bun',
      '--eval',
      "try { require('node:fs').writeFileSync('/unauthorized','x'); process.exit(1); } catch { process.stdout.write('denied'); }",
    ],
    { timeout: 5000 }
  );
  assert.equal(rootWrite.stdout, 'denied');
  const network = await exec(
    'docker',
    [
      'exec',
      name,
      'bun',
      '--eval',
      "try { await fetch('http://192.0.2.1', {signal: AbortSignal.timeout(200)}); process.exit(1); } catch { process.stdout.write('denied'); }",
    ],
    { timeout: 5000 }
  );
  assert.equal(network.stdout, 'denied');
  // An out-of-band local test fixture introduces a symlink; the production fixed file program must reject it.
  await exec(
    'docker',
    [
      'exec',
      name,
      'bun',
      '--eval',
      "require('node:fs').unlinkSync('/workspace/nested/note.txt'); require('node:fs').symlinkSync('/etc/passwd','/workspace/nested/note.txt')",
    ],
    { timeout: 5000 }
  );
  assert.equal(
    (await environment.execute({ tool: 'read_file', input: { path: 'nested/note.txt' } }, signal()))
      .status,
    'invalid'
  );
} finally {
  assert.equal((await environment.close(signal())).status, 'completed');
}
assert(!(await names()).includes(name));
// Cancel while the fixed exec program is in flight; admission remains closed after the run signal aborts.
const cancelled = new AbortController();
const pending = factory({ workflow: workflow(), initialState, signal: cancelled.signal });
setTimeout(() => cancelled.abort(), 20);
try {
  const env = await pending;
  await env.close(signal());
} catch (error) {
  assert(error instanceof WorkflowEnvironmentInitializationError);
  assert(['completed', 'unresolved'].includes(error.cleanup.status));
}
// A separately isolated Docker client endpoint proves unavailable-daemon behavior without changing user configuration.
const child = await exec(process.execPath, [process.argv[1], '--unavailable-daemon'], {
  timeout: 10000,
  env: {
    PATH: process.env.PATH,
    ARTEMISKIT_DOCKER_TESTS: '1',
    DOCKER_HOST: 'unix:///tmp/artemiskit-deliberately-missing-docker.sock',
  },
});
assert(child.stdout.includes('Unavailable daemon'));
const fakeBin = await mkdtemp(join(tmpdir(), 'artemis-docker-missing-image-'));
await writeFile(join(fakeBin, 'docker'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
const missingImage = await exec(process.execPath, [process.argv[1], '--unavailable-image'], {
  timeout: 10000,
  env: { PATH: fakeBin, ARTEMISKIT_DOCKER_TESTS: '1' },
});
assert(missingImage.stdout.includes('Unavailable daemon'));
try {
  await factory({
    workflow: workflow(),
    initialState: { files: { a: 'not-a-directory', 'a/child.txt': 'invalid topology' } },
    signal: signal(),
  });
  assert.fail('expected failed initialization');
} catch (error) {
  assert(error instanceof WorkflowEnvironmentInitializationError);
  assert.equal(error.cleanup.status, 'completed');
  assert.equal(error.cleanup.artifacts, 'discarded');
}
const deniedWorkflow = workflow();
deniedWorkflow.environment.policy.paths = { read: [], write: [] };
const deniedEnvironment = await factory({
  workflow: deniedWorkflow,
  initialState,
  signal: signal(),
});
try {
  const present = await deniedEnvironment.execute(
    { tool: 'read_file', input: { path: 'nested/note.txt' } },
    signal()
  );
  const absent = await deniedEnvironment.execute(
    { tool: 'read_file', input: { path: 'absent.txt' } },
    signal()
  );
  assert.deepEqual(present, {
    status: 'denied',
    code: 'permission_denied',
    evidence: { tool: 'read_file', version: '1', status: 'denied', code: 'permission_denied' },
  });
  assert.deepEqual(absent, present);
  const malformed = await deniedEnvironment.execute(
    { tool: 'read_file', input: { path: 42 } },
    signal()
  );
  assert.equal(malformed.status, 'invalid');
  assert.equal(malformed.code, 'invalid_input');
} finally {
  assert.equal((await deniedEnvironment.close(signal())).status, 'completed');
}
const lifetime = new AbortController();
const active = await factory({ workflow: workflow(), initialState, signal: lifetime.signal });
const work = active.execute(
  { tool: 'read_file', input: { path: 'nested/note.txt' } },
  lifetime.signal
);
lifetime.abort();
assert.equal((await work).status, 'failed');
assert.equal(
  (await active.execute({ tool: 'read_file', input: { path: 'nested/note.txt' } }, signal()))
    .status,
  'failed'
);
assert.equal((await active.close(signal())).status, 'completed');
assert.deepEqual(new Set(await names()), before);
process.stdout.write(
  `${JSON.stringify({
    status: 'passed',
    runtime: process.versions.bun ? 'bun' : 'node',
    isolation: true,
    files: true,
    policy: true,
    symlinks: true,
    cleanup: true,
    cancellation: true,
    unavailableDaemon: true,
  })}\n`
);
