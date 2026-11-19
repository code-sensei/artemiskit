import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { writeConsumerExperiment } from './fixtures/package-consumers/experiment.mjs';

// Each case spawns a runtime that imports the built @artemiskit/sdk (run `bun run build` first).
setDefaultTimeout(60_000);

const fixture = resolve(import.meta.dir, 'fixtures/package-consumers/experiment.mjs');
const pack = resolve(import.meta.dir, '../packs/ng-egov-services');

function consumerDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'artemis-consumer-experiment-'));
  cpSync(pack, join(directory, 'packs/ng-egov-services'), { recursive: true });
  return directory;
}

function runFixture(runtime: string, directory: string) {
  return spawnSync(runtime, [fixture, 'packs/ng-egov-services/experiment.yaml'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 50_000,
  });
}

describe('package-consumer experiment fixture', () => {
  test('writes task sources whose SHA-256 matches the declared digests', () => {
    const directory = mkdtempSync(join(tmpdir(), 'artemis-consumer-experiment-'));
    const { fixture: file, live } = writeConsumerExperiment(directory);
    const manifest = JSON.parse(readFileSync(file, 'utf8'));

    expect(manifest.mode).toBe('fixture');
    expect(manifest.tasks.map((task: { kind: string }) => task.kind)).toEqual([
      'scenario_evaluation',
      'agent_workflow',
    ]);
    for (const task of manifest.tasks) {
      const bytes = readFileSync(join(directory, task.source.path));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(task.source.artifact.digest);
    }
    expect(JSON.parse(readFileSync(live, 'utf8'))).toMatchObject({
      mode: 'live',
      tasks: manifest.tasks,
    });
  });

  test.each(['node', 'bun'])(
    'validates, runs, reports and refuses live mode through the SDK on %s',
    (runtime) => {
      const result = runFixture(runtime, consumerDirectory());

      expect(result.stderr).not.toContain('NETWORK-FORBIDDEN');
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '')).toMatchObject({
        runtime,
        overall: { planned: 4, valid: 4, passed: 4 },
        packsValidated: 1,
      });
    }
  );

  test('fails when a pack task no longer matches its declared digest', () => {
    const directory = consumerDirectory();
    appendFileSync(join(directory, 'packs/ng-egov-services/tasks/egov-01-eligibility.yaml'), '\n');
    const result = runFixture('bun', directory);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('pack experiment must validate');
  });
});
