import { describe, expect, it } from 'bun:test';
import { type AgentEvaluationEvidence, scoreAgentOutcome } from './scorer';
import type { AgentOutcome, AgentTask } from './types';

const task: AgentTask = {
  id: 'scenario-repair',
  fixturePath: 'fixture',
  allowedPaths: ['scenario.yaml'],
  allowedTools: ['workspace_read', 'workspace_patch', 'workspace_run'],
  maxActions: 8,
  timeoutMs: 60_000,
  acceptanceCommands: ['akit validate scenario.yaml'],
};

function createOutcome(overrides: Partial<AgentOutcome> = {}): AgentOutcome {
  return {
    taskId: task.id,
    completed: true,
    acceptancePassed: true,
    trace: {
      taskId: task.id,
      actions: [],
      changedPaths: ['scenario.yaml'],
      startedAt: '2026-08-21T00:00:00.000Z',
      completedAt: '2026-08-21T00:00:01.000Z',
    },
    finalDiff: '-      type: invalid_type\n+      type: contains',
    ...overrides,
  };
}

function createEvidence(overrides: Partial<AgentEvaluationEvidence> = {}): AgentEvaluationEvidence {
  return {
    termination: { status: 'completed' },
    acceptanceChecks: [
      {
        command: 'akit validate scenario.yaml',
        status: 'passed',
        exitCode: 0,
        durationMs: 25,
      },
    ],
    ...overrides,
  };
}

describe('scoreAgentOutcome', () => {
  it('passes a completed task with successful observable checks', () => {
    const result = scoreAgentOutcome(task, createOutcome(), createEvidence());

    expect(result.verdict).toBe('passed');
    expect(result.passed).toBe(true);
    expect(result.recoveredActionCount).toBe(0);
    expect(result.issues).toEqual([]);
  });

  it('passes with recovery after an allowed tool error when final checks pass', () => {
    const outcome = createOutcome();
    outcome.trace.actions = [
      {
        type: 'tool',
        name: 'workspace_run',
        status: 'error',
        durationMs: 10,
        summary: 'Scenario validation failed',
      },
      { type: 'tool', name: 'workspace_patch', status: 'success', durationMs: 5 },
      { type: 'tool', name: 'workspace_run', status: 'success', durationMs: 10 },
    ];

    const result = scoreAgentOutcome(task, outcome, createEvidence());

    expect(result.verdict).toBe('passed_with_recovery');
    expect(result.passed).toBe(true);
    expect(result.recoveredActionCount).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it('reports an infrastructure failure when the run terminates on a tool error', () => {
    const outcome = createOutcome({ completed: false, acceptancePassed: false });
    const evidence = createEvidence({ termination: { status: 'tool_error' } });

    const result = scoreAgentOutcome(task, outcome, evidence);

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('tool-termination-error');
  });

  it('fails the task when a final acceptance command fails', () => {
    const outcome = createOutcome({ acceptancePassed: false });
    outcome.trace.actions = [
      { type: 'tool', name: 'workspace_run', status: 'error', durationMs: 10 },
    ];
    const evidence = createEvidence({
      acceptanceChecks: [
        {
          command: 'akit validate scenario.yaml',
          status: 'failed',
          exitCode: 1,
          durationMs: 25,
        },
      ],
    });

    const result = scoreAgentOutcome(task, outcome, evidence);

    expect(result.verdict).toBe('task_failed');
    expect(result.passed).toBe(false);
    expect(result.recoveredActionCount).toBe(0);
    expect(result.issues.map((issue) => issue.code)).toContain('acceptance-failed');
  });

  it('fails the task when the workspace diff escapes the allowed paths', () => {
    const outcome = createOutcome();
    outcome.trace.changedPaths = ['scenario.yaml', 'README.md'];

    const result = scoreAgentOutcome(task, outcome, createEvidence());

    expect(result.verdict).toBe('task_failed');
    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'changed-path-violation',
      message: 'Changed path is outside the allowed scope: README.md.',
    });
  });

  it('fails the task when the sandbox rejects a prohibited action', () => {
    const outcome = createOutcome();
    outcome.trace.actions = [
      { type: 'tool', name: 'workspace_read', status: 'rejected', durationMs: 1 },
    ];

    const result = scoreAgentOutcome(task, outcome, createEvidence());

    expect(result.verdict).toBe('task_failed');
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('prohibited-action');
  });

  it('reports an infrastructure failure when required acceptance evidence is missing', () => {
    const outcome = createOutcome({ acceptancePassed: false });

    const result = scoreAgentOutcome(task, outcome, createEvidence({ acceptanceChecks: [] }));

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual({
      code: 'acceptance-evidence-missing',
      message: 'No acceptance evidence was recorded for: akit validate scenario.yaml.',
    });
  });

  it('reports an infrastructure failure when the acceptance executor faults', () => {
    const outcome = createOutcome({ acceptancePassed: false });
    const evidence = createEvidence({
      acceptanceChecks: [
        {
          command: 'akit validate scenario.yaml',
          status: 'executor_error',
          exitCode: null,
          durationMs: 2,
        },
      ],
    });

    const result = scoreAgentOutcome(task, outcome, evidence);

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('acceptance-executor-error');
  });

  it('fails the task when the action budget is exceeded', () => {
    const outcome = createOutcome();
    outcome.trace.actions = Array.from({ length: task.maxActions + 1 }, (_, index) => ({
      type: 'tool' as const,
      name: 'workspace_read',
      status: 'success' as const,
      durationMs: index,
    }));

    const result = scoreAgentOutcome(task, outcome, createEvidence());

    expect(result.verdict).toBe('task_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('action-budget-exceeded');
  });

  it('fails the task when the wall-clock time budget is exceeded', () => {
    const outcome = createOutcome();
    outcome.trace.completedAt = '2026-08-21T00:01:00.001Z';

    const result = scoreAgentOutcome(task, outcome, createEvidence());

    expect(result.verdict).toBe('task_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('time-budget-exceeded');
  });

  it('fails the task when the agent terminates before completion', () => {
    const outcome = createOutcome({ completed: false });

    const result = scoreAgentOutcome(
      task,
      outcome,
      createEvidence({ termination: { status: 'agent_error' } })
    );

    expect(result.verdict).toBe('task_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('agent-termination-error');
  });

  it('reports inconsistent completion evidence as an infrastructure failure', () => {
    const outcome = createOutcome({ completed: false });

    const result = scoreAgentOutcome(task, outcome, createEvidence());

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('completion-evidence-mismatch');
  });

  it('reports inconsistent acceptance summaries as an infrastructure failure', () => {
    const outcome = createOutcome({ acceptancePassed: false });

    const result = scoreAgentOutcome(task, outcome, createEvidence());

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('acceptance-evidence-mismatch');
  });

  it('reports task identity mismatches as an infrastructure failure', () => {
    const outcome = createOutcome({ taskId: 'another-task' });

    const result = scoreAgentOutcome(task, outcome, createEvidence());

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('task-evidence-mismatch');
  });

  it('reports invalid trace timestamps as an infrastructure failure', () => {
    const outcome = createOutcome();
    outcome.trace.completedAt = 'not-a-timestamp';

    const result = scoreAgentOutcome(task, outcome, createEvidence());

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('trace-timestamp-invalid');
  });

  it('reports contradictory acceptance status and exit code as an infrastructure failure', () => {
    const outcome = createOutcome({ acceptancePassed: false });
    const evidence = createEvidence({
      acceptanceChecks: [
        {
          command: 'akit validate scenario.yaml',
          status: 'passed',
          exitCode: 1,
          durationMs: 25,
        },
      ],
    });

    const result = scoreAgentOutcome(task, outcome, evidence);

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('acceptance-evidence-invalid');
  });

  it('reports missing final diff evidence when changed paths are declared', () => {
    for (const finalDiff of [undefined, '', '  \n']) {
      const result = scoreAgentOutcome(task, createOutcome({ finalDiff }), createEvidence());

      expect(result.verdict).toBe('infrastructure_failed');
      expect(result.issues.map((issue) => issue.code)).toContain('final-diff-missing');
    }
  });

  it('requires every task-declared artifact check', () => {
    const taskWithArtifactCheck = {
      ...task,
      requiredArtifactChecks: ['scenario-matches-expected'],
    };

    const result = scoreAgentOutcome(taskWithArtifactCheck, createOutcome(), createEvidence());

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('artifact-evidence-missing');
  });

  it('fails the task when a required artifact check fails', () => {
    const taskWithArtifactCheck = {
      ...task,
      requiredArtifactChecks: ['scenario-matches-expected'],
    };
    const evidence = {
      ...createEvidence(),
      artifactChecks: [
        {
          id: 'scenario-matches-expected',
          status: 'failed' as const,
          durationMs: 5,
        },
      ],
    };

    const result = scoreAgentOutcome(taskWithArtifactCheck, createOutcome(), evidence);

    expect(result.verdict).toBe('task_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('artifact-check-failed');
  });

  it('prioritizes missing acceptance evidence over a failed artifact check', () => {
    const taskWithArtifactCheck = {
      ...task,
      requiredArtifactChecks: ['scenario-matches-expected'],
    };
    const evidence = {
      ...createEvidence({ acceptanceChecks: [] }),
      artifactChecks: [
        {
          id: 'scenario-matches-expected',
          status: 'failed' as const,
          durationMs: 5,
        },
      ],
    };

    const result = scoreAgentOutcome(
      taskWithArtifactCheck,
      createOutcome({ acceptancePassed: false }),
      evidence
    );

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('acceptance-evidence-missing');
  });
});
