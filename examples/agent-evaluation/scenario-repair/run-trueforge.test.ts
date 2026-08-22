import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import type { AgentOutcome, AgentTask } from '@artemiskit/core';
import {
  buildAgentPrompt,
  collectWorkspaceEvidence,
  inferTerminationStatus,
  parseChangedPaths,
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
    const prompt = buildAgentPrompt(TASK);

    expect(prompt).toContain('Repair scenario.yaml');
    expect(prompt).toContain('workspace_read');
    expect(prompt).toContain('workspace_patch');
    expect(prompt).toContain('akit validate scenario.yaml');
    expect(prompt).toContain('Do not change files outside: scenario.yaml');
    expect(prompt).toContain('workspace_run may execute only the listed acceptance commands');
  });

  it('reserves workspace operations for independent post-run evidence', () => {
    expect(workspaceOperationBudget(TASK)).toBe(23);
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

  it('collects acceptance, changed-path, diff, and exact-artifact evidence', async () => {
    const result = await collectWorkspaceEvidence(TASK, {
      root: join(import.meta.dir, 'expected'),
      run: async () => ({ exitCode: 0 }),
      status: async () => ' M scenario.yaml\n',
      diff: async () => 'diff --git a/scenario.yaml b/scenario.yaml',
    });

    expect(result.collection).toEqual({
      acceptancePassed: true,
      changedPaths: ['scenario.yaml'],
      finalDiff: 'diff --git a/scenario.yaml b/scenario.yaml',
    });
    expect(result.evidence.acceptanceChecks).toHaveLength(1);
    expect(result.evidence.acceptanceChecks[0]?.status).toBe('passed');
    expect(result.evidence.artifactChecks[0]?.status).toBe('passed');
  });

  it('fails closed when Git evidence cannot be collected', async () => {
    await expect(
      collectWorkspaceEvidence(TASK, {
        root: join(import.meta.dir, 'expected'),
        run: async () => ({ exitCode: 0 }),
        status: async () => {
          throw new Error('workspace unavailable');
        },
        diff: async () => '',
      })
    ).rejects.toThrow('workspace unavailable');
  });
});
