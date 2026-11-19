import { describe, expect, mock, setDefaultTimeout, test } from 'bun:test';
import { appendFile, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
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

// Most tests spawn the CLI two or three times in sequence. Each spawn takes about 1 s idle but
// several seconds under machine load, which exceeded the 5 s default; every spawn keeps its own
// 20 s kill timer.
setDefaultTimeout(30_000);

const cli = fileURLToPath(new URL('../../../bin/artemis.ts', import.meta.url));

/** Preload that makes any HTTP or socket connection attempt fail loudly. */
const OFFLINE_PRELOAD = `
import net from 'node:net';
globalThis.fetch = () => { throw new Error('NETWORK-FORBIDDEN'); };
net.Socket.prototype.connect = function () { throw new Error('NETWORK-FORBIDDEN'); };
`;

/** Preload that allows HTTP only to 127.0.0.1 stub servers and refuses raw sockets. */
const LOOPBACK_ONLY_PRELOAD = `
import net from 'node:net';
const loopbackFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== '127.0.0.1') throw new Error('NETWORK-FORBIDDEN');
  return loopbackFetch(input, init);
};
net.Socket.prototype.connect = function () { throw new Error('NETWORK-FORBIDDEN'); };
`;

/** A CLI that has written its result must exit well inside this; the per-case timeout is 60 s. */
const PROMPT_EXIT_MS = 10_000;
const LONG_PER_CASE_TIMEOUT_MS = '60000';

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
}

async function invoke(
  directory: string,
  args: string[],
  preloadSource: string = OFFLINE_PRELOAD
): Promise<CliResult> {
  const preload = path.join(directory, 'offline-preload.ts');
  await writeFile(preload, preloadSource);
  const startedAt = Date.now();
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
    return { code, stdout, stderr, elapsedMs: Date.now() - startedAt };
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
    expect(result.stdout).toContain('Concurrency: 1 (serial)');
    expect(result.stdout).toContain('Experiment is valid.');
    expectNoNetworkOrSecrets(result);
  });

  test('states a declared concurrency limit and the approval it needs live', async () => {
    const fixture = await writeExperimentFixture({ overrides: { concurrency: 3 } });
    const text = await invoke(fixture.directory, ['validate', fixture.file]);
    const json = await invoke(fixture.directory, ['validate', fixture.file, '--json']);

    expect(text.code).toBe(0);
    expect(text.stdout).toContain(
      'Concurrency: up to 3 coordinates in flight (declared limit; live runs need --max-concurrency 3)'
    );
    expect(JSON.parse(json.stdout)).toMatchObject({ valid: true, concurrency: 3 });
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

  test('parses an agent workflow task source', async () => {
    const fixture = await writeExperimentFixture({ workflow: true });
    const result = await invoke(fixture.directory, ['validate', fixture.file]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      '✓ task workflow: tasks/workflow.yaml: digest verified; agent workflow parsed (simulated environment, network denied)'
    );
    expectNoNetworkOrSecrets(result);
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
    expect(result.stdout).toContain(
      'Coordinate level: counts below are task × target × repetition'
    );
    expect(result.stdout).toContain(
      'Case level: counts below are individual scenario cases from 4 SHA-256-verified evidence file(s)'
    );
    expect(result.stdout).toContain(
      '  - qwen-small: passed 1 and failed 1 of 2 valid case(s) (passed/valid 1/2 (50%))'
    );
    expect(result.stdout).toContain('Overall cases: passed 2 and failed 2 of 4 valid case(s)');

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

  test('runs one scenario and one workflow task on two targets offline', async () => {
    const fixture = await writeExperimentFixture({ workflow: true });
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

    expect(result.code).toBe(0);
    expect(result.code).toBe(sdk.exitCode);
    expectNoNetworkOrSecrets(result);
    const outputDir = path.join(fixture.directory, 'cli-out');
    const saved = JSON.parse(await readFile(path.join(outputDir, 'result.json'), 'utf8'));
    expect(saved.summaries.overall).toEqual(sdk.result?.summaries.overall);
    expect(saved.summaries.overall).toMatchObject({ planned: 4, valid: 4, passed: 4 });
    const workflow = saved.results.filter(
      (item: { coordinate: { task_kind: string } }) =>
        item.coordinate.task_kind === 'agent_workflow'
    );
    expect(workflow).toHaveLength(2);
    for (const item of workflow) {
      const [attempt] = item.attempts;
      expect(attempt.evidence).toMatchObject({ kind: 'agent_workflow', availability: 'available' });
      const file = path.join(outputDir, 'evidence', `${attempt.evidence.artifact.digest}.json`);
      const record = JSON.parse(await readFile(file, 'utf8'));
      expect(record).toMatchObject({ engine: 'native', taskVerification: 'passed' });
    }
    expect(await readdir(path.join(outputDir, 'evidence'))).toHaveLength(4);
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

  test('refuses a concurrent live experiment unless --max-concurrency covers it', async () => {
    const fixture = await writeExperimentFixture({
      overrides: { ...LIVE, concurrency: 2, live: { ...LIVE_CONTROLS, concurrency_ceiling: 2 } },
    });
    const approval = ['--approve', '--approved-by', 'operator', '--reason', 'local run'];
    const missing = await invoke(fixture.directory, ['run', fixture.file, ...approval]);
    const low = await invoke(fixture.directory, [
      'run',
      fixture.file,
      ...approval,
      '--max-concurrency',
      '1',
    ]);
    const malformed = await invoke(fixture.directory, [
      'run',
      fixture.file,
      ...approval,
      '--max-concurrency',
      'nine',
    ]);

    for (const result of [missing, low]) {
      expect(result.code).toBe(3);
      expect(result.stderr).toContain('approve it explicitly (--max-concurrency 2)');
    }
    expect(malformed.code).toBe(3);
    expect(malformed.stderr).toContain('--max-concurrency must be an integer from 1 to 8');
    expectNoNetworkOrSecrets(missing);
    await expect(stat(path.join(fixture.directory, 'artemis-output'))).rejects.toThrow();
  });

  test('prints the concurrency limit and recorded peak after a concurrent run', async () => {
    const fixture = await writeExperimentFixture({ overrides: { concurrency: 2 } });
    const result = await invoke(fixture.directory, ['run', fixture.file, '--output-dir', 'out']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      'Concurrency: up to 2 coordinates in flight (declared limit); recorded peak'
    );
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

describe('akit experiment run process lifetime', () => {
  test('exits promptly after a fixture run with a long per-case timeout', async () => {
    const fixture = await writeExperimentFixture();
    const result = await invoke(fixture.directory, [
      'run',
      fixture.file,
      '--output-dir',
      'out',
      '--timeout',
      LONG_PER_CASE_TIMEOUT_MS,
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Result: ');
    expect(result.elapsedMs).toBeLessThan(PROMPT_EXIT_MS);
  }, 30_000);

  test('exits promptly after a live run against a loopback stub server', async () => {
    let requests = 0;
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        requests += 1;
        const body = (await request.json()) as { model: string };
        return Response.json({
          id: 'local',
          object: 'chat.completion',
          created: 0,
          model: body.model,
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: 'Fixture response, Abuja' },
            },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
        });
      },
    });
    try {
      const baseUrl = `http://127.0.0.1:${server.port}/v1`;
      const fixture = await writeExperimentFixture({
        overrides: LIVE,
        target: (target) => ({ ...target, settings: { base_url: baseUrl } }),
      });
      const result = await invoke(
        fixture.directory,
        [
          'run',
          fixture.file,
          '--output-dir',
          'out',
          '--approve',
          '--approved-by',
          'test-operator',
          '--reason',
          'loopback stub server only',
          '--timeout',
          LONG_PER_CASE_TIMEOUT_MS,
        ],
        LOOPBACK_ONLY_PRELOAD
      );

      expect(result.code).toBe(0);
      expect(requests).toBe(4);
      expect(result.stdout).toContain('Result: ');
      expectNoNetworkOrSecrets(result);
      expect(result.elapsedMs).toBeLessThan(PROMPT_EXIT_MS);
    } finally {
      server.stop(true);
    }
  }, 30_000);
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

  test('prints the case-level summary and marks altered or absent evidence unavailable', async () => {
    const fixture = await writeExperimentFixture();
    await invoke(fixture.directory, ['run', fixture.file, '--output-dir', 'run']);

    const verified = await invoke(fixture.directory, ['report', 'run/result.json']);
    expect(verified.code).toBe(0);
    expect(verified.stdout).toContain('Overall cases: passed 2 and failed 2 of 4 valid case(s)');

    const evidenceDir = path.join(fixture.directory, 'run', 'evidence');
    const [first] = (await readdir(evidenceDir)).sort();
    await appendFile(path.join(evidenceDir, first as string), ' ');
    const altered = await invoke(fixture.directory, [
      'report',
      'run/result.json',
      '--output-dir',
      'altered',
    ]);
    expect(altered.code).toBe(0);
    expect(altered.stdout).toContain('Case level: unavailable. Case-level summary withheld: 1');
    const html = await readFile(path.join(fixture.directory, 'altered', 'executive.html'), 'utf8');
    expect(html).toContain('<strong>Unavailable.</strong> Case-level summary withheld');

    // Old results saved without an evidence directory still report every view.
    await rename(evidenceDir, `${evidenceDir}-elsewhere`);
    const old = await invoke(fixture.directory, [
      'report',
      'run/result.json',
      '--output-dir',
      'old',
    ]);
    expect(old.code).toBe(0);
    expect(old.stdout).toContain('Case level: unavailable');
    expect(await readdir(path.join(fixture.directory, 'old'))).toHaveLength(6);

    const explicit = await invoke(fixture.directory, [
      'report',
      'run/result.json',
      '--output-dir',
      'explicit',
      '--evidence-dir',
      'run/evidence-elsewhere',
    ]);
    expect(explicit.code).toBe(0);
    expect(explicit.stdout).toContain('Case level: unavailable. Case-level summary withheld: 1');
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
