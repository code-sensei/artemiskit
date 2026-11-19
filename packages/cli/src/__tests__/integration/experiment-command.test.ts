import { describe, expect, mock, test } from 'bun:test';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as realCore from '../../../../core/src/index';

// Bun shares module mocks across test files in one run, and SDK test files stub
// `@artemiskit/core` without restoring it. The SDK parity checks below need the real engine.
mock.module('@artemiskit/core', () => ({ ...realCore }));

import { runExperimentFile, validateExperimentFile } from '@artemiskit/sdk';
import {
  LIVE_CONTROLS,
  writeExperimentFixture,
} from '../../../../sdk/src/__tests__/experiment-fixtures';

const cli = fileURLToPath(new URL('../../../bin/artemis.ts', import.meta.url));

/** Preload that makes any HTTP or socket connection attempt fail loudly. */
const OFFLINE_PRELOAD = `
import net from 'node:net';
globalThis.fetch = () => { throw new Error('NETWORK-FORBIDDEN'); };
net.Socket.prototype.connect = function () { throw new Error('NETWORK-FORBIDDEN'); };
`;

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function invoke(directory: string, args: string[]): Promise<CliResult> {
  const preload = path.join(directory, 'offline-preload.ts');
  await writeFile(preload, OFFLINE_PRELOAD);
  const child = Bun.spawn([process.execPath, '--preload', preload, cli, 'experiment', ...args], {
    cwd: directory,
    env: { PATH: process.env.PATH, OPENAI_API_KEY: 'sk-ambient-must-not-print' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timer = setTimeout(() => child.kill(), 20_000);
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

function expectNoNetworkOrSecrets(result: CliResult): void {
  const output = result.stdout + result.stderr;
  expect(output).not.toContain('NETWORK-FORBIDDEN');
  expect(output).not.toContain('sk-ambient-must-not-print');
}

const LIVE = {
  mode: 'live',
  budgets: { max_requests: 20, max_tokens: 10_000 },
  live: LIVE_CONTROLS,
};

describe('akit experiment validate', () => {
  test('accepts a valid two-target experiment', async () => {
    const fixture = await writeExperimentFixture();
    const result = await invoke(fixture.directory, ['validate', fixture.file]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('✓ task pass: tasks/pass.yaml: digest verified');
    expect(result.stdout).toContain('✓ target qwen-small');
    expect(result.stdout).toContain('Experiment is valid.');
    expectNoNetworkOrSecrets(result);
  });

  test('prints machine-readable JSON without the manifest body', async () => {
    const fixture = await writeExperimentFixture();
    const result = await invoke(fixture.directory, ['validate', fixture.file, '--json']);
    const parsed = JSON.parse(result.stdout);

    expect(result.code).toBe(0);
    expect(parsed).toMatchObject({ valid: true, experimentId: 'two-target-fixture', exitCode: 0 });
    expect(parsed.manifest).toBeUndefined();
  });

  test.each([
    ['digest mismatch', { digestOverride: { pass: 'e'.repeat(64) } }, 'source_digest_mismatch'],
    ['missing source', { omitSources: ['tasks/pass.yaml'] }, 'does not exist'],
    [
      'non-loopback cost-not-applicable target',
      {
        target: (target: Record<string, unknown>) => ({
          ...target,
          settings: { base_url: 'http://10.0.0.5:11434/v1' },
        }),
      },
      'cost not applicable is only accepted for loopback endpoints',
    ],
  ])('rejects a %s with the same exit code as the SDK', async (_name, options, expected) => {
    const fixture = await writeExperimentFixture(options);
    const result = await invoke(fixture.directory, ['validate', fixture.file]);
    const sdk = await validateExperimentFile(fixture.file);

    expect(result.code).toBe(2);
    expect(result.code).toBe(sdk.exitCode);
    expect(result.stderr).toContain('Experiment is invalid.');
    if (expected === 'source_digest_mismatch') {
      expect(result.stderr).toContain('does not match the declared digest');
    } else {
      expect(result.stderr).toContain(expected);
    }
    expect(result.stderr).not.toContain('10.0.0.5');
  });

  test('exits 1 for an unreadable file', async () => {
    const fixture = await writeExperimentFixture();
    const result = await invoke(fixture.directory, ['validate', 'missing.yaml']);

    expect(result.code).toBe(1);
  });
});

describe('akit experiment run', () => {
  test('runs a two-target fixture experiment offline and saves result and evidence', async () => {
    const fixture = await writeExperimentFixture();
    const result = await invoke(fixture.directory, ['run', fixture.file]);
    const sdk = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'sdk-out'),
    });

    expect(result.code).toBe(0);
    expect(result.code).toBe(sdk.exitCode);
    expectNoNetworkOrSecrets(result);
    expect(result.stdout).toContain('fixture mode');
    expect(result.stdout).toContain('open-weight, run locally via ollama; cost not applicable');
    expect(result.stdout).toContain('No ranking or winner is implied');
    expect(result.stdout.toLowerCase()).not.toContain('winner:');

    const base = path.join(
      fixture.directory,
      'artemis-output',
      'experiments',
      'two-target-fixture'
    );
    const [stamp] = await readdir(base);
    const outputDir = path.join(base, stamp as string);
    const saved = JSON.parse(await readFile(path.join(outputDir, 'result.json'), 'utf8'));
    expect(saved.schema_version).toBe('1');
    expect(saved.summaries.overall).toEqual(sdk.result?.summaries.overall);
    expect(await readdir(path.join(outputDir, 'evidence'))).toHaveLength(4);
    // The child's working directory is realpath-resolved (for example /private/var on macOS).
    expect(result.stdout).toContain(
      `${path.join('two-target-fixture', stamp as string, 'result.json')}\n`
    );
  });

  test('coverage-incomplete exit code matches the SDK', async () => {
    const fixture = await writeExperimentFixture({
      overrides: {
        exclusions: [{ id: 'skip', reason: 'declared for test', task_id: 'fail' }],
      },
    });
    const result = await invoke(fixture.directory, [
      'run',
      fixture.file,
      '--output-dir',
      'cli-out',
    ]);
    const sdk = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'sdk-out'),
    });

    expect(result.code).toBe(5);
    expect(result.code).toBe(sdk.exitCode);
  });

  test('refuses an invalid experiment before running', async () => {
    const fixture = await writeExperimentFixture({ digestOverride: { fail: '1'.repeat(64) } });
    const result = await invoke(fixture.directory, ['run', fixture.file]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Experiment run refused');
    await expect(stat(path.join(fixture.directory, 'artemis-output'))).rejects.toThrow();
  });

  test('refuses a live experiment without approval flags and runs nothing', async () => {
    const fixture = await writeExperimentFixture({ overrides: LIVE });
    const result = await invoke(fixture.directory, ['run', fixture.file]);
    const sdk = await runExperimentFile({ experiment: fixture.file });

    expect(result.code).toBe(3);
    expect(result.code).toBe(sdk.exitCode);
    expect(result.stderr).toContain('pass --approve with --approved-by <name> and --reason <text>');
    expectNoNetworkOrSecrets(result);
    await expect(stat(path.join(fixture.directory, 'artemis-output'))).rejects.toThrow();
  });

  test('refuses a live experiment with incomplete approval', async () => {
    const fixture = await writeExperimentFixture({ overrides: LIVE });
    const result = await invoke(fixture.directory, ['run', fixture.file, '--approve']);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain('Live approval needs an approver');
    await expect(stat(path.join(fixture.directory, 'artemis-output'))).rejects.toThrow();
  });

  test('notes that approval flags are ignored for fixture experiments', async () => {
    const fixture = await writeExperimentFixture();
    const result = await invoke(fixture.directory, [
      'run',
      fixture.file,
      '--approve',
      '--approved-by',
      'operator',
      '--reason',
      'not needed',
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Approval flags ignored');
  });
});

describe('akit experiment report', () => {
  test('regenerates every view and format offline from a saved result', async () => {
    const fixture = await writeExperimentFixture();
    const run = await invoke(fixture.directory, ['run', fixture.file, '--output-dir', 'run']);
    expect(run.code).toBe(0);

    const result = await invoke(fixture.directory, ['report', 'run/result.json']);

    expect(result.code).toBe(0);
    expectNoNetworkOrSecrets(result);
    expect((await readdir(path.join(fixture.directory, 'run', 'reports'))).sort()).toEqual([
      'comprehensive.html',
      'comprehensive.md',
      'executive.html',
      'executive.md',
      'technical.html',
      'technical.md',
    ]);
  });

  test('selects views and formats', async () => {
    const fixture = await writeExperimentFixture();
    await invoke(fixture.directory, ['run', fixture.file, '--output-dir', 'run']);
    const result = await invoke(fixture.directory, [
      'report',
      'run/result.json',
      '--view',
      'executive',
      '--format',
      'markdown',
      '--output-dir',
      'exec',
    ]);

    expect(result.code).toBe(0);
    expect(await readdir(path.join(fixture.directory, 'exec'))).toEqual(['executive.md']);
  });

  test('exits 2 for an invalid saved result and 1 for a missing one', async () => {
    const fixture = await writeExperimentFixture();
    const invalid = await invoke(fixture.directory, ['report', fixture.file]);
    const missing = await invoke(fixture.directory, ['report', 'missing.json']);
    const badView = await invoke(fixture.directory, ['report', fixture.file, '--view', 'summary']);

    expect(invalid.code).toBe(2);
    expect(invalid.stderr).toContain('no report generated');
    expect(missing.code).toBe(1);
    expect(badView.code).toBe(2);
  });
});
