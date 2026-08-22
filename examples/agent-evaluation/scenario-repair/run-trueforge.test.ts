import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import type { AgentOutcome, AgentTask } from '@artemiskit/core';
import {
  type BenchmarkTask,
  buildAgentPrompt,
  collectWorkspaceEvidence,
  createSandboxOptions,
  inferTerminationStatus,
  parseChangedPaths,
  parseTaskManifest,
  realAgentEvaluationEnabled,
  resolveLingModel,
  workspaceOperationBudget,
} from './run-trueforge';

const TASK: AgentTask = {
  id: 'scenario-repair',
  fixturePath: 'fixture',
  allowedPaths: ['scenario.yaml'],
  allowedTools: [
    'workspace_read',
    'workspace_patch',
    'workspace_status',
    'workspace_diff',
    'workspace_run',
  ],
  maxActions: 10,
  timeoutMs: 60_000,
  acceptanceCommands: ['akit validate scenario.yaml'],
  requiredArtifactChecks: ['scenario-matches-expected'],
};

const GENERIC_ARTIFACT_TASK = {
  ...TASK,
  id: 'scenario-authoring',
  requiredArtifactChecks: ['first-exact-check', 'second-exact-check'],
  artifactChecks: [
    {
      id: 'first-exact-check',
      path: 'scenario.yaml',
      expectedPath: 'expected/scenario.yaml',
    },
    {
      id: 'second-exact-check',
      path: 'scenario.yaml',
      expectedPath: 'expected/scenario.yaml',
    },
  ],
};

const MANIFEST: BenchmarkTask = {
  ...GENERIC_ARTIFACT_TASK,
  instructions: 'Create the exact expected scenario.',
  fixturePath: 'fixture',
  allowedCommands: ['akit validate scenario.yaml', 'bun test ./acceptance.ts'],
  acceptanceCommands: ['bun test ./acceptance.ts'],
  models: ['Ling-3.0-flash', 'Ling-3.0-tiny'],
};

function outcome(overrides: Partial<AgentOutcome> = {}): AgentOutcome {
  return {
    taskId: TASK.id,
    completed: true,
    acceptancePassed: true,
    trace: {
      taskId: TASK.id,
      actions: [],
      changedPaths: ['scenario.yaml'],
      startedAt: '2026-08-22T00:00:00.000Z',
      completedAt: '2026-08-22T00:00:01.000Z',
    },
    finalDiff: 'diff --git a/scenario.yaml b/scenario.yaml',
    ...overrides,
  };
}

describe('TrueForge scenario-repair runner helpers', () => {
  it('parses a strict benchmark task manifest', () => {
    expect(parseTaskManifest(MANIFEST)).toEqual(MANIFEST);
  });

  it.each([
    ['empty task id', { ...MANIFEST, id: ' ' }],
    ['duplicate allowed path', { ...MANIFEST, allowedPaths: ['scenario.yaml', 'scenario.yaml'] }],
    ['empty allowed tools', { ...MANIFEST, allowedTools: [] }],
    ['Windows absolute path', { ...MANIFEST, fixturePath: 'C:/fixture' }],
    ['traversing fixture path', { ...MANIFEST, fixturePath: '../fixture' }],
    [
      'artifact outside the fixture',
      {
        ...MANIFEST,
        artifactChecks: [
          { ...MANIFEST.artifactChecks[0], path: '../scenario.yaml' },
          MANIFEST.artifactChecks[1],
        ],
      },
    ],
    ['mismatched artifact ids', { ...MANIFEST, requiredArtifactChecks: ['different-artifact-id'] }],
    ['unsupported model', { ...MANIFEST, models: ['Ling-3.0-thinking'] }],
    ['duplicate model', { ...MANIFEST, models: ['Ling-3.0-flash', 'Ling-3.0-flash'] }],
    [
      'non-exact command',
      { ...MANIFEST, allowedCommands: ['bun test acceptance.test.ts --watch'] },
    ],
    ['traversing command', { ...MANIFEST, allowedCommands: ['bun test ../acceptance.ts'] }],
    [
      'acceptance command outside authority',
      { ...MANIFEST, allowedCommands: ['akit validate scenario.yaml'] },
    ],
  ])('rejects %s', (_name, manifest) => {
    expect(() => parseTaskManifest(manifest)).toThrow('task.yaml');
  });

  it('requires both explicit opt-in and a Ling API key', () => {
    expect(realAgentEvaluationEnabled({})).toBe(false);
    expect(realAgentEvaluationEnabled({ LING_API_KEY: 'key' })).toBe(false);
    expect(realAgentEvaluationEnabled({ LING_REAL_AGENT_TESTS: '1' })).toBe(false);
    expect(realAgentEvaluationEnabled({ LING_REAL_AGENT_TESTS: '1', LING_API_KEY: 'key' })).toBe(
      true
    );
  });

  it('accepts only the documented Flash and Tiny model IDs', () => {
    expect(resolveLingModel({})).toEqual({ modelId: 'Ling-3.0-flash', modelName: 'ling-3-flash' });
    expect(resolveLingModel({ LING_REAL_AGENT_MODEL: 'Ling-3.0-tiny' })).toEqual({
      modelId: 'Ling-3.0-tiny',
      modelName: 'ling-3-tiny',
    });
    expect(() => resolveLingModel({ LING_REAL_AGENT_MODEL: 'unknown' })).toThrow(
      'LING_REAL_AGENT_MODEL'
    );
  });

  it('parses modified, untracked, renamed, and whitespace-containing paths', () => {
    expect(
      parseChangedPaths(
        ' M scenario.yaml\n?? notes.txt\nR  old-name.yaml -> new-name.yaml\n M folder/a file.yaml\n'
      )
    ).toEqual(['scenario.yaml', 'notes.txt', 'new-name.yaml', 'folder/a file.yaml']);
  });

  it('builds a constrained prompt from the task contract', () => {
    const prompt = buildAgentPrompt(MANIFEST);

    expect(prompt).toContain('Repair scenario.yaml');
    expect(prompt).toContain('workspace_read');
    expect(prompt).toContain('workspace_patch');
    expect(prompt).toContain(
      'Allowed commands: akit validate scenario.yaml, bun test ./acceptance.ts'
    );
    expect(prompt).toContain('Acceptance commands: bun test ./acceptance.ts');
    expect(prompt).toContain('Do not change files outside: scenario.yaml');
    expect(prompt).toContain('workspace_run may execute only the listed allowed commands');
  });

  it('reserves workspace operations for independent post-run evidence', () => {
    expect(workspaceOperationBudget(TASK)).toBe(23);
  });

  it('scopes the sandbox to task paths, tools, and optional command authority', () => {
    expect(
      createSandboxOptions(MANIFEST, {
        fixturePath: '/tmp/fixture',
        akitBundlePath: '/tmp/akit.js',
      })
    ).toMatchObject({
      fixturePath: '/tmp/fixture',
      akitBundlePath: '/tmp/akit.js',
      allowedPaths: ['scenario.yaml'],
      allowedCommands: ['akit validate scenario.yaml', 'bun test ./acceptance.ts'],
      allowedTools: TASK.allowedTools,
    });

    expect(
      createSandboxOptions(
        { ...MANIFEST, allowedCommands: undefined },
        { fixturePath: '/tmp/fixture', akitBundlePath: '/tmp/akit.js' }
      ).allowedCommands
    ).toEqual(MANIFEST.acceptanceCommands);
  });

  it('maps completed, timed-out, terminal-agent, and infrastructure outcomes', () => {
    expect(inferTerminationStatus(outcome())).toBe('completed');
    expect(
      inferTerminationStatus(
        outcome({ completed: false, acceptancePassed: false, error: 'timed out after 60000ms' })
      )
    ).toBe('timed_out');
    expect(
      inferTerminationStatus(
        outcome({ completed: false, acceptancePassed: false, error: 'terminal agent error' }),
        'error'
      )
    ).toBe('agent_error');
    expect(
      inferTerminationStatus(
        outcome({ completed: false, acceptancePassed: false, error: 'connection refused' })
      )
    ).toBe('infrastructure_error');
  });

  it('collects exact bytes for every declared artifact without task-specific imports', async () => {
    const taskRoot = join(import.meta.dir, '..', 'ling-benchmark', 'tasks', 'scenario-authoring');
    const result = await collectWorkspaceEvidence(
      GENERIC_ARTIFACT_TASK,
      {
        root: join(taskRoot, 'expected'),
        run: async () => ({ exitCode: 0 }),
        status: async () => ' M scenario.yaml\n',
        diff: async () => 'diff --git a/scenario.yaml b/scenario.yaml',
      },
      taskRoot
    );

    expect(result.collection).toEqual({
      acceptancePassed: true,
      changedPaths: ['scenario.yaml'],
      finalDiff: 'diff --git a/scenario.yaml b/scenario.yaml',
    });
    expect(result.evidence.acceptanceChecks).toHaveLength(1);
    expect(result.evidence.acceptanceChecks[0]?.status).toBe('passed');
    expect(result.evidence.artifactChecks).toEqual([
      { id: 'first-exact-check', status: 'passed', durationMs: expect.any(Number) },
      { id: 'second-exact-check', status: 'passed', durationMs: expect.any(Number) },
    ]);
  });

  it('fails closed when Git evidence cannot be collected', async () => {
    await expect(
      collectWorkspaceEvidence(
        GENERIC_ARTIFACT_TASK,
        {
          root: join(import.meta.dir, 'expected'),
          run: async () => ({ exitCode: 0 }),
          status: async () => {
            throw new Error('workspace unavailable');
          },
          diff: async () => '',
        },
        join(import.meta.dir, '..', 'ling-benchmark', 'tasks', 'scenario-authoring')
      )
    ).rejects.toThrow('workspace unavailable');
  });
});
