/** End-to-end CLI smoke tests against a deterministic local provider fixture. */

import { afterEach, describe, expect, it } from 'bun:test';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupTestDir, createTestDir } from '../helpers/test-utils.js';

const cliEntryPoint = fileURLToPath(new URL('../../../bin/artemis.ts', import.meta.url));

describe('run command', () => {
  const testDirs: string[] = [];
  const servers: ReturnType<typeof Bun.serve>[] = [];

  afterEach(async () => {
    for (const server of servers.splice(0)) server.stop(true);
    await Promise.all(testDirs.splice(0).map(cleanupTestDir));
  });

  it('writes execution provenance through the real CLI and local storage path', async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        expect(new URL(request.url).pathname).toBe('/v1/chat/completions');
        return Response.json({
          id: 'fixture-completion',
          model: 'fixture-observed-model',
          choices: [{ message: { role: 'assistant', content: 'assured' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        });
      },
    });
    servers.push(server);

    const testDir = await createTestDir('cli-run-smoke');
    testDirs.push(testDir);
    const scenarioPath = join(testDir, 'scenario.yaml');
    await writeFile(
      scenarioPath,
      'name: CLI execution provenance smoke\nprovider: openai\ncases:\n  - id: assurance-case\n    prompt: Return assured\n    expected:\n      type: exact\n      value: assured\n'
    );
    await writeFile(
      join(testDir, 'artemis.config.yaml'),
      `project: cli-smoke\nstorage:\n  type: local\n  basePath: ./artemis-runs\nproviders:\n  openai:\n    apiKey: fixture-key\n    baseUrl: http://127.0.0.1:${server.port}/v1\n`
    );

    const child = Bun.spawn(
      [
        process.execPath,
        cliEntryPoint,
        'run',
        scenarioPath,
        '--model',
        'fixture-requested-model',
        '--ci',
        '--summary',
        'json',
      ],
      { cwd: testDir, stdout: 'pipe', stderr: 'pipe' }
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toMatchObject({
      success: true,
      cases: {
        totalAttempts: 1,
        validEvaluations: 1,
        invalidEvaluations: 0,
        outcomeRateDenominator: 1,
      },
    });

    const runDirectory = join(testDir, 'artemis-runs', 'cli-smoke');
    const [manifestFile] = await readdir(runDirectory);
    const manifest = JSON.parse(await readFile(join(runDirectory, manifestFile), 'utf8'));
    expect(manifest.version).toBe('1.4');
    expect(manifest.attempt_evidence).toMatchObject({
      schema_version: '1',
      repetition: { index: 1, total: 1 },
      retry_policy: { default_max_retries: 0, backoff: 'exponential', initial_delay_ms: 1000 },
    });
    expect(manifest.cases[0].attempt_evidence).toEqual([
      expect.objectContaining({
        retry_chain_id: `${manifest.run_id}:assurance-case`,
        attempt_number: 1,
        included_in_outcome: true,
        status: 'passed',
      }),
    ]);
    expect(manifest.metrics.cost_provenance).toEqual({
      schema_version: '1',
      status: 'unavailable',
      unavailable_reason: 'provider_billing_not_recorded',
    });
    expect(manifest.execution_provenance).toMatchObject({
      schema_version: '1',
      target: {
        provider: 'openai',
        requested_models: ['fixture-requested-model'],
        observed_models: ['fixture-observed-model'],
      },
    });
    expect(manifest.cases[0].target).toEqual({
      provider: 'openai',
      requested_model: 'fixture-requested-model',
      observed_models: ['fixture-observed-model'],
    });
  });
});
