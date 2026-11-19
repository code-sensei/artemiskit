import { afterEach, expect, spyOn, test } from 'bun:test';
import * as childProcess from 'node:child_process';
import type { ModelClient } from '../adapters/types';
import { clearGitInfoCache } from '../provenance/git';
import { ScenarioSchema } from '../scenario/schema';
import { runScenario } from './runner';

const GIT_COMMANDS_PER_READ = 4;

const client: ModelClient = {
  provider: 'openai',
  async generate() {
    return {
      id: 'r1',
      model: 'fixture-model',
      text: 'ok',
      tokens: { prompt: 1, completion: 1, total: 2 },
      latencyMs: 1,
      finishReason: 'stop',
    };
  },
  async capabilities() {
    return { streaming: false, functionCalling: false, toolUse: false, maxContext: 8192 };
  },
};

const scenario = ScenarioSchema.parse({
  name: 'git-provenance',
  provider: 'openai',
  model: 'fixture-model',
  cases: [{ id: 'one', prompt: 'Say ok.', expected: { type: 'contains', values: ['ok'] } }],
});

afterEach(() => {
  clearGitInfoCache();
});

test('repeated scenario runs in one working directory read git provenance once', async () => {
  clearGitInfoCache();
  const execSync = spyOn(childProcess, 'execSync');
  try {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      runs.push(await runScenario({ scenario, client }));
    }

    const gitCommands = execSync.mock.calls.filter(([command]) =>
      String(command).startsWith('git ')
    );
    expect(gitCommands).toHaveLength(GIT_COMMANDS_PER_READ);

    // Every manifest records the same provenance, and each has its own object.
    for (const run of runs) {
      expect(run.manifest.git).toEqual(runs[0].manifest.git);
    }
    expect(runs[1].manifest.git).not.toBe(runs[0].manifest.git);
  } finally {
    execSync.mockRestore();
  }
});
