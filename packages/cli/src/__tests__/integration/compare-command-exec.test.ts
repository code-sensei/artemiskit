/** End-to-end comparison eligibility behavior through the CLI entry point. */

import { afterEach, describe, expect, it } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanupTestDir, createTestDir } from '../helpers/test-utils.js';

const cliEntryPoint = fileURLToPath(new URL('../../../bin/artemis.ts', import.meta.url));

describe('compare command execution', () => {
  const testDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(cleanupTestDir));
  });

  it('refuses an incompatible workload without emitting a metric delta', async () => {
    const testDir = await createTestDir('cli-compare-eligibility');
    testDirs.push(testDir);
    const runDir = join(testDir, 'artemis-runs', 'comparison-project');
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(testDir, 'artemis.config.yaml'),
      'storage:\n  type: local\n  basePath: ./artemis-runs\n'
    );

    const baseManifest = {
      version: '1.3',
      project: 'comparison-project',
      start_time: '2026-09-10T00:00:00.000Z',
      end_time: '2026-09-10T00:00:01.000Z',
      duration_ms: 1000,
      config: { scenario: 'customer-service', provider: 'openai', model: 'model-a' },
      workload_identity: {
        schema_version: '1',
        workload: { schema_version: '1', algorithm: 'sha256', digest: 'a'.repeat(64) },
        rubric: { schema_version: '1', algorithm: 'sha256', digest: 'b'.repeat(64) },
      },
      execution_provenance: { schema_version: '1', target: { provider: 'openai' } },
      metrics: {
        success_rate: 1,
        total_cases: 1,
        passed_cases: 1,
        failed_cases: 0,
        median_latency_ms: 1,
        p95_latency_ms: 1,
        total_tokens: 1,
        total_prompt_tokens: 1,
        total_completion_tokens: 0,
      },
      git: { commit: 'test', branch: 'main', dirty: false },
      provenance: { run_by: 'test' },
      environment: { node_version: 'test', platform: 'test', arch: 'test' },
      cases: [],
    };
    await writeFile(
      join(runDir, 'baseline.json'),
      JSON.stringify({ ...baseManifest, run_id: 'baseline' })
    );
    await writeFile(
      join(runDir, 'current.json'),
      JSON.stringify({
        ...baseManifest,
        run_id: 'current',
        workload_identity: {
          ...baseManifest.workload_identity,
          workload: { ...baseManifest.workload_identity.workload, digest: 'c'.repeat(64) },
        },
      })
    );

    const jsonPath = join(testDir, 'comparison.json');
    const htmlPath = join(testDir, 'comparison.html');
    const child = Bun.spawn(
      [
        process.execPath,
        cliEntryPoint,
        'compare',
        'baseline',
        'current',
        '--json',
        jsonPath,
        '--html',
        htmlPath,
      ],
      { cwd: testDir, stdout: 'pipe', stderr: 'pipe' }
    );
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toBe('');
    expect(stdout).toContain('Comparison eligibility: incomparable');
    expect(stdout).toContain('workload_mismatch');
    expect(stdout).toContain('No deltas calculated.');

    const json = JSON.parse(await readFile(jsonPath, 'utf8'));
    expect(json.eligibility).toEqual({
      schema_version: '1',
      status: 'incomparable',
      reasons: [{ code: 'workload_mismatch' }],
    });
    expect(json.metrics).toBeUndefined();

    const html = await readFile(htmlPath, 'utf8');
    expect(html).toContain('Run comparison unavailable');
    expect(html).not.toContain('Metrics Overview');
  });
});
