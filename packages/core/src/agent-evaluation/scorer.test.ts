import { describe, expect, it } from 'bun:test';
import {
  type AgentAcceptanceCheck,
  type AgentArtifactCheck,
  type AgentEvaluationEvidence,
  type AgentTerminationStatus,
  scoreAgentOutcome,
} from './scorer';
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

function withoutKey(value: Record<string, unknown>, key: string): unknown {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function scoreRuntimeValues(...values: unknown[]) {
  const taskValue = values.length > 0 ? values[0] : task;
  const outcomeValue = values.length > 1 ? values[1] : createOutcome();
  const evidenceValue = values.length > 2 ? values[2] : createEvidence();
  return scoreAgentOutcome(
    taskValue as AgentTask,
    outcomeValue as AgentOutcome,
    evidenceValue as AgentEvaluationEvidence
  );
}

function expectInfrastructureInvalid(code: string, ...values: unknown[]) {
  let result: ReturnType<typeof scoreAgentOutcome> | undefined;

  expect(() => {
    result = scoreRuntimeValues(...values);
  }).not.toThrow();
  expect(result?.verdict).toBe('infrastructure_failed');
  expect(result?.passed).toBe(false);
  expect(result?.issues.map((issue) => issue.code)).toContain(code);
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

  it('fails the task when a successful command action is not allowed', () => {
    const restrictedTask = { ...task, allowedTools: ['workspace_read'] };
    const outcome = createOutcome();
    outcome.trace.actions = [
      { type: 'command', name: 'workspace_run', status: 'success', durationMs: 1 },
    ];

    const result = scoreAgentOutcome(restrictedTask, outcome, createEvidence());

    expect(result.verdict).toBe('task_failed');
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('prohibited-action');
  });

  it('fails the task when a successful file action is not allowed', () => {
    const restrictedTask = { ...task, allowedTools: ['workspace_read'] };
    const outcome = createOutcome();
    outcome.trace.actions = [
      { type: 'file', name: 'workspace_patch', status: 'success', durationMs: 1 },
    ];

    const result = scoreAgentOutcome(restrictedTask, outcome, createEvidence());

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

  it('fails closed for an unknown termination status at runtime', () => {
    const result = scoreAgentOutcome(
      task,
      createOutcome(),
      createEvidence({
        termination: { status: 'unknown' as AgentTerminationStatus },
      })
    );

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('termination-evidence-invalid');
  });

  it('fails closed for an unknown acceptance status even when the summary is false', () => {
    const outcome = createOutcome({ acceptancePassed: false });
    const invalidCheck: AgentAcceptanceCheck = {
      command: 'akit validate scenario.yaml',
      status: 'unknown' as AgentAcceptanceCheck['status'],
      exitCode: null,
      durationMs: 1,
    };

    const result = scoreAgentOutcome(
      task,
      outcome,
      createEvidence({ acceptanceChecks: [invalidCheck] })
    );

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('acceptance-evidence-invalid');
  });

  it('fails closed for any unknown artifact status at runtime', () => {
    const invalidCheck: AgentArtifactCheck = {
      id: 'unrequested-check',
      status: 'unknown' as AgentArtifactCheck['status'],
      durationMs: 1,
    };

    const result = scoreAgentOutcome(task, createOutcome(), {
      ...createEvidence(),
      artifactChecks: [invalidCheck],
    });

    expect(result.verdict).toBe('infrastructure_failed');
    expect(result.issues.map((issue) => issue.code)).toContain('artifact-evidence-invalid');
  });

  describe('runtime boundary validation', () => {
    const sparseArray = Array(1);

    for (const [name, taskValue] of [
      ['missing task', undefined],
      ['null task', null],
      ['primitive task', 1],
      ['array task', []],
      ['missing id', withoutKey(task as unknown as Record<string, unknown>, 'id')],
      ['non-string id', { ...task, id: 7 }],
      [
        'missing fixturePath',
        withoutKey(task as unknown as Record<string, unknown>, 'fixturePath'),
      ],
      ['non-string fixturePath', { ...task, fixturePath: 7 }],
      [
        'missing allowedPaths',
        withoutKey(task as unknown as Record<string, unknown>, 'allowedPaths'),
      ],
      ['non-array allowedPaths', { ...task, allowedPaths: 'scenario.yaml' }],
      ['sparse allowedPaths', { ...task, allowedPaths: sparseArray }],
      ['non-string allowed path', { ...task, allowedPaths: [7] }],
      ['empty allowed path', { ...task, allowedPaths: [''] }],
      ['absolute allowed path', { ...task, allowedPaths: ['/scenario.yaml'] }],
      ['traversing allowed path', { ...task, allowedPaths: ['../scenario.yaml'] }],
      [
        'missing allowedTools',
        withoutKey(task as unknown as Record<string, unknown>, 'allowedTools'),
      ],
      ['non-array allowedTools', { ...task, allowedTools: 'workspace_read' }],
      ['sparse allowedTools', { ...task, allowedTools: sparseArray }],
      ['non-string allowed tool', { ...task, allowedTools: [7] }],
      [
        'missing acceptanceCommands',
        withoutKey(task as unknown as Record<string, unknown>, 'acceptanceCommands'),
      ],
      ['non-array acceptanceCommands', { ...task, acceptanceCommands: 'akit validate' }],
      ['sparse acceptanceCommands', { ...task, acceptanceCommands: sparseArray }],
      ['non-string acceptance command', { ...task, acceptanceCommands: [7] }],
      ['null requiredArtifactChecks', { ...task, requiredArtifactChecks: null }],
      ['non-array requiredArtifactChecks', { ...task, requiredArtifactChecks: 'artifact' }],
      ['sparse requiredArtifactChecks', { ...task, requiredArtifactChecks: sparseArray }],
      ['non-string required artifact check', { ...task, requiredArtifactChecks: [7] }],
      ['missing maxActions', withoutKey(task as unknown as Record<string, unknown>, 'maxActions')],
      ['NaN maxActions', { ...task, maxActions: Number.NaN }],
      ['infinite maxActions', { ...task, maxActions: Number.POSITIVE_INFINITY }],
      ['negative maxActions', { ...task, maxActions: -1 }],
      ['fractional maxActions', { ...task, maxActions: 1.5 }],
      ['numeric-string maxActions', { ...task, maxActions: '8' }],
      ['missing timeoutMs', withoutKey(task as unknown as Record<string, unknown>, 'timeoutMs')],
      ['NaN timeoutMs', { ...task, timeoutMs: Number.NaN }],
      ['infinite timeoutMs', { ...task, timeoutMs: Number.POSITIVE_INFINITY }],
      ['negative timeoutMs', { ...task, timeoutMs: -1 }],
      ['numeric-string timeoutMs', { ...task, timeoutMs: '60000' }],
    ] as const) {
      it(`rejects ${name} as an invalid task definition`, () => {
        expectInfrastructureInvalid('task-definition-invalid', taskValue);
      });
    }

    it('accepts absent or undefined required artifact checks and unknown task properties', () => {
      const withUndefined = { ...task, requiredArtifactChecks: undefined, futureField: true };

      expect(scoreRuntimeValues(task)).toEqual(scoreRuntimeValues(withUndefined));
      expect(scoreRuntimeValues(withUndefined).verdict).toBe('passed');
    });

    for (const [name, outcomeValue] of [
      ['missing outcome', undefined],
      ['null outcome', null],
      ['primitive outcome', false],
      ['array outcome', []],
      [
        'missing taskId',
        withoutKey(createOutcome() as unknown as Record<string, unknown>, 'taskId'),
      ],
      ['non-string taskId', { ...createOutcome(), taskId: 7 }],
      [
        'missing completed',
        withoutKey(createOutcome() as unknown as Record<string, unknown>, 'completed'),
      ],
      ['non-boolean completed', { ...createOutcome(), completed: 'true' }],
      [
        'missing acceptancePassed',
        withoutKey(createOutcome() as unknown as Record<string, unknown>, 'acceptancePassed'),
      ],
      ['non-boolean acceptancePassed', { ...createOutcome(), acceptancePassed: 1 }],
      ['missing trace', withoutKey(createOutcome() as unknown as Record<string, unknown>, 'trace')],
      ['null trace', { ...createOutcome(), trace: null }],
      ['primitive trace', { ...createOutcome(), trace: 'trace' }],
      ['array trace', { ...createOutcome(), trace: [] }],
      ['null error', { ...createOutcome(), error: null }],
      ['non-string error', { ...createOutcome(), error: 7 }],
    ] as const) {
      it(`rejects ${name} as invalid outcome evidence`, () => {
        expectInfrastructureInvalid('outcome-evidence-invalid', task, outcomeValue);
      });
    }

    it('accepts an absent or undefined outcome error and unknown outcome properties', () => {
      const withUndefined = { ...createOutcome(), error: undefined, futureField: true };

      expect(scoreRuntimeValues(task, withUndefined).verdict).toBe('passed');
    });

    for (const [name, trace] of [
      [
        'missing taskId',
        withoutKey(createOutcome().trace as unknown as Record<string, unknown>, 'taskId'),
      ],
      ['non-string taskId', { ...createOutcome().trace, taskId: 7 }],
      [
        'missing actions',
        withoutKey(createOutcome().trace as unknown as Record<string, unknown>, 'actions'),
      ],
      ['non-array actions', { ...createOutcome().trace, actions: {} }],
      [
        'missing changedPaths',
        withoutKey(createOutcome().trace as unknown as Record<string, unknown>, 'changedPaths'),
      ],
      ['non-array changedPaths', { ...createOutcome().trace, changedPaths: 'scenario.yaml' }],
      ['sparse changedPaths', { ...createOutcome().trace, changedPaths: sparseArray }],
      ['non-string changed path', { ...createOutcome().trace, changedPaths: [7] }],
    ] as const) {
      it(`rejects ${name} as invalid trace evidence`, () => {
        expectInfrastructureInvalid('trace-evidence-invalid', task, {
          ...createOutcome(),
          trace,
        });
      });
    }

    for (const [name, action] of [
      ['sparse action', undefined],
      ['null action', null],
      ['primitive action', 'action'],
      ['array action', []],
      ['missing type', { name: 'workspace_read', status: 'success', durationMs: 1 }],
      [
        'unknown action type',
        { type: 'unknown', name: 'workspace_read', status: 'success', durationMs: 1 },
      ],
      ['missing name', { type: 'tool', status: 'success', durationMs: 1 }],
      ['non-string name', { type: 'tool', name: 7, status: 'success', durationMs: 1 }],
      ['missing status', { type: 'tool', name: 'workspace_read', durationMs: 1 }],
      [
        'unknown action status',
        { type: 'tool', name: 'workspace_read', status: 'unknown', durationMs: 1 },
      ],
      ['missing durationMs', { type: 'tool', name: 'workspace_read', status: 'success' }],
      [
        'NaN durationMs',
        { type: 'tool', name: 'workspace_read', status: 'success', durationMs: Number.NaN },
      ],
      [
        'infinite durationMs',
        {
          type: 'tool',
          name: 'workspace_read',
          status: 'success',
          durationMs: Number.POSITIVE_INFINITY,
        },
      ],
      [
        'negative durationMs',
        { type: 'tool', name: 'workspace_read', status: 'success', durationMs: -1 },
      ],
      [
        'numeric-string durationMs',
        { type: 'tool', name: 'workspace_read', status: 'success', durationMs: '1' },
      ],
      [
        'null summary',
        {
          type: 'tool',
          name: 'workspace_read',
          status: 'success',
          durationMs: 1,
          summary: null,
        },
      ],
      [
        'non-string summary',
        {
          type: 'tool',
          name: 'workspace_read',
          status: 'success',
          durationMs: 1,
          summary: 7,
        },
      ],
    ] as const) {
      it(`rejects ${name} as invalid action evidence`, () => {
        const actions = name === 'sparse action' ? sparseArray : [action];
        expectInfrastructureInvalid('action-evidence-invalid', task, {
          ...createOutcome(),
          trace: { ...createOutcome().trace, actions },
        });
      });
    }

    it('accepts an absent or undefined action summary and unknown action properties', () => {
      const outcome = createOutcome();
      outcome.trace.actions = [
        {
          type: 'tool',
          name: 'workspace_read',
          status: 'success',
          durationMs: 1,
          summary: undefined,
          futureField: true,
        } as AgentOutcome['trace']['actions'][number],
      ];

      expect(scoreAgentOutcome(task, outcome, createEvidence()).verdict).toBe('passed');
    });

    for (const [name, evidenceValue] of [
      ['missing evidence', undefined],
      ['null evidence', null],
      ['primitive evidence', 'evidence'],
      ['array evidence', []],
    ] as const) {
      it(`rejects ${name} as invalid top-level evaluation evidence`, () => {
        expectInfrastructureInvalid(
          'evaluation-evidence-invalid',
          task,
          createOutcome(),
          evidenceValue
        );
      });
    }

    for (const [name, termination] of [
      ['missing termination', undefined],
      ['null termination', null],
      ['primitive termination', 'completed'],
      ['array termination', []],
      ['missing termination status', {}],
      ['unknown termination status', { status: 'unknown' }],
    ] as const) {
      it(`rejects ${name} as invalid termination evidence`, () => {
        const evidenceValue =
          name === 'missing termination'
            ? withoutKey(createEvidence() as unknown as Record<string, unknown>, 'termination')
            : { ...createEvidence(), termination };
        expectInfrastructureInvalid(
          'termination-evidence-invalid',
          task,
          createOutcome(),
          evidenceValue
        );
      });
    }

    for (const [name, acceptanceChecks] of [
      ['missing acceptanceChecks', undefined],
      ['null acceptanceChecks', null],
      ['non-array acceptanceChecks', {}],
      ['sparse acceptanceChecks', sparseArray],
      ['null acceptance check', [null]],
      ['primitive acceptance check', ['check']],
      ['array acceptance check', [[]]],
      ['missing command', [{ status: 'passed', exitCode: 0, durationMs: 1 }]],
      ['non-string command', [{ command: 7, status: 'passed', exitCode: 0, durationMs: 1 }]],
      ['missing status', [{ command: 'akit validate scenario.yaml', exitCode: 0, durationMs: 1 }]],
      [
        'unknown status',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'unknown',
            exitCode: 0,
            durationMs: 1,
          },
        ],
      ],
      [
        'missing exitCode',
        [{ command: 'akit validate scenario.yaml', status: 'passed', durationMs: 1 }],
      ],
      [
        'NaN exitCode',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'failed',
            exitCode: Number.NaN,
            durationMs: 1,
          },
        ],
      ],
      [
        'infinite exitCode',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'failed',
            exitCode: Number.POSITIVE_INFINITY,
            durationMs: 1,
          },
        ],
      ],
      [
        'fractional exitCode',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'failed',
            exitCode: 1.5,
            durationMs: 1,
          },
        ],
      ],
      [
        'numeric-string exitCode',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'failed',
            exitCode: '1',
            durationMs: 1,
          },
        ],
      ],
      [
        'contradictory passed exitCode',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'passed',
            exitCode: 1,
            durationMs: 1,
          },
        ],
      ],
      [
        'contradictory failed exitCode',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'failed',
            exitCode: 0,
            durationMs: 1,
          },
        ],
      ],
      [
        'contradictory executor exitCode',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'executor_error',
            exitCode: 1,
            durationMs: 1,
          },
        ],
      ],
      [
        'missing durationMs',
        [{ command: 'akit validate scenario.yaml', status: 'passed', exitCode: 0 }],
      ],
      [
        'NaN durationMs',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'passed',
            exitCode: 0,
            durationMs: Number.NaN,
          },
        ],
      ],
      [
        'infinite durationMs',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'passed',
            exitCode: 0,
            durationMs: Number.POSITIVE_INFINITY,
          },
        ],
      ],
      [
        'negative durationMs',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'passed',
            exitCode: 0,
            durationMs: -1,
          },
        ],
      ],
      [
        'numeric-string durationMs',
        [
          {
            command: 'akit validate scenario.yaml',
            status: 'passed',
            exitCode: 0,
            durationMs: '1',
          },
        ],
      ],
    ] as const) {
      it(`rejects ${name} as invalid acceptance evidence`, () => {
        const evidenceValue =
          name === 'missing acceptanceChecks'
            ? withoutKey(createEvidence() as unknown as Record<string, unknown>, 'acceptanceChecks')
            : { ...createEvidence(), acceptanceChecks };
        expectInfrastructureInvalid(
          'acceptance-evidence-invalid',
          task,
          createOutcome(),
          evidenceValue
        );
      });
    }

    for (const [name, artifactChecks] of [
      ['null artifactChecks', null],
      ['non-array artifactChecks', {}],
      ['sparse artifactChecks', sparseArray],
      ['null artifact check', [null]],
      ['primitive artifact check', ['check']],
      ['array artifact check', [[]]],
      ['missing id', [{ status: 'passed', durationMs: 1 }]],
      ['non-string id', [{ id: 7, status: 'passed', durationMs: 1 }]],
      ['missing status', [{ id: 'artifact', durationMs: 1 }]],
      ['unknown status', [{ id: 'artifact', status: 'unknown', durationMs: 1 }]],
      ['missing durationMs', [{ id: 'artifact', status: 'passed' }]],
      ['NaN durationMs', [{ id: 'artifact', status: 'passed', durationMs: Number.NaN }]],
      [
        'infinite durationMs',
        [{ id: 'artifact', status: 'passed', durationMs: Number.POSITIVE_INFINITY }],
      ],
      ['negative durationMs', [{ id: 'artifact', status: 'passed', durationMs: -1 }]],
      ['numeric-string durationMs', [{ id: 'artifact', status: 'passed', durationMs: '1' }]],
    ] as const) {
      it(`rejects ${name} as invalid artifact evidence`, () => {
        expectInfrastructureInvalid('artifact-evidence-invalid', task, createOutcome(), {
          ...createEvidence(),
          artifactChecks,
        });
      });
    }

    it('accepts absent or undefined artifact checks and unknown evidence properties', () => {
      const withUndefined = { ...createEvidence(), artifactChecks: undefined, futureField: true };

      expect(scoreRuntimeValues(task, createOutcome(), withUndefined).verdict).toBe('passed');
    });

    it('allows unknown object properties throughout otherwise valid runtime input', () => {
      const outcome = createOutcome();
      const evidence = createEvidence();

      expect(
        scoreRuntimeValues(
          { ...task, futureField: true },
          {
            ...outcome,
            futureField: true,
            trace: {
              ...outcome.trace,
              futureField: true,
              actions: [
                {
                  type: 'tool',
                  name: 'workspace_read',
                  status: 'success',
                  durationMs: 1,
                  futureField: true,
                },
              ],
            },
          },
          {
            ...evidence,
            futureField: true,
            termination: { ...evidence.termination, futureField: true },
            acceptanceChecks: evidence.acceptanceChecks.map((check) => ({
              ...check,
              futureField: true,
            })),
            artifactChecks: [
              {
                id: 'unrequested-check',
                status: 'passed',
                durationMs: 1,
                futureField: true,
              },
            ],
          }
        ).verdict
      ).toBe('passed');
    });

    for (const finalDiff of [null, 1, {}, []]) {
      it(`rejects present non-string final diff ${JSON.stringify(finalDiff)}`, () => {
        expectInfrastructureInvalid('final-diff-invalid', task, {
          ...createOutcome(),
          finalDiff,
        });
      });
    }

    const requiredArtifactTask: AgentTask = {
      ...task,
      requiredArtifactChecks: ['scenario-matches-expected'],
    };
    const passedArtifactCheck: AgentArtifactCheck = {
      id: 'scenario-matches-expected',
      status: 'passed',
      durationMs: 1,
    };
    const precedenceCases: Array<{
      name: string;
      taskValue: AgentTask;
      outcomeValue: AgentOutcome;
      evidenceValue: AgentEvaluationEvidence;
    }> = [
      {
        name: 'task mismatch',
        taskValue: task,
        outcomeValue: createOutcome({ taskId: 'other-task' }),
        evidenceValue: createEvidence(),
      },
      ...(['agent_error', 'tool_error', 'infrastructure_error', 'timed_out'] as const).map(
        (status) => ({
          name: `${status} termination`,
          taskValue: task,
          outcomeValue: createOutcome({ completed: false, acceptancePassed: false }),
          evidenceValue: createEvidence({ termination: { status } }),
        })
      ),
      {
        name: 'completion mismatch',
        taskValue: task,
        outcomeValue: createOutcome({ completed: false }),
        evidenceValue: createEvidence(),
      },
      {
        name: 'artifact executor error',
        taskValue: requiredArtifactTask,
        outcomeValue: createOutcome(),
        evidenceValue: createEvidence({
          artifactChecks: [{ ...passedArtifactCheck, status: 'executor_error' }],
        }),
      },
      {
        name: 'missing artifact evidence',
        taskValue: requiredArtifactTask,
        outcomeValue: createOutcome(),
        evidenceValue: createEvidence(),
      },
      {
        name: 'duplicate artifact evidence',
        taskValue: requiredArtifactTask,
        outcomeValue: createOutcome(),
        evidenceValue: createEvidence({
          artifactChecks: [{ ...passedArtifactCheck }, { ...passedArtifactCheck }],
        }),
      },
      {
        name: 'failed artifact check',
        taskValue: requiredArtifactTask,
        outcomeValue: createOutcome(),
        evidenceValue: createEvidence({
          artifactChecks: [{ ...passedArtifactCheck, status: 'failed' }],
        }),
      },
      {
        name: 'acceptance executor error',
        taskValue: task,
        outcomeValue: createOutcome({ acceptancePassed: false }),
        evidenceValue: createEvidence({
          acceptanceChecks: [
            {
              command: 'akit validate scenario.yaml',
              status: 'executor_error',
              exitCode: null,
              durationMs: 1,
            },
          ],
        }),
      },
      {
        name: 'missing acceptance evidence',
        taskValue: task,
        outcomeValue: createOutcome({ acceptancePassed: false }),
        evidenceValue: createEvidence({ acceptanceChecks: [] }),
      },
      {
        name: 'duplicate acceptance evidence',
        taskValue: task,
        outcomeValue: createOutcome(),
        evidenceValue: createEvidence({
          acceptanceChecks: [
            { ...createEvidence().acceptanceChecks[0] },
            { ...createEvidence().acceptanceChecks[0] },
          ],
        }),
      },
      {
        name: 'acceptance evidence mismatch',
        taskValue: task,
        outcomeValue: createOutcome({ acceptancePassed: false }),
        evidenceValue: createEvidence(),
      },
      {
        name: 'failed acceptance check',
        taskValue: task,
        outcomeValue: createOutcome({ acceptancePassed: false }),
        evidenceValue: createEvidence({
          acceptanceChecks: [
            {
              command: 'akit validate scenario.yaml',
              status: 'failed',
              exitCode: 1,
              durationMs: 1,
            },
          ],
        }),
      },
      {
        name: 'missing final diff',
        taskValue: task,
        outcomeValue: createOutcome({ finalDiff: undefined }),
        evidenceValue: createEvidence(),
      },
      {
        name: 'changed path violation',
        taskValue: task,
        outcomeValue: createOutcome({
          trace: { ...createOutcome().trace, changedPaths: ['README.md'] },
        }),
        evidenceValue: createEvidence(),
      },
      {
        name: 'prohibited action',
        taskValue: task,
        outcomeValue: createOutcome({
          trace: {
            ...createOutcome().trace,
            actions: [{ type: 'tool', name: 'workspace_read', status: 'rejected', durationMs: 1 }],
          },
        }),
        evidenceValue: createEvidence(),
      },
      {
        name: 'action budget violation',
        taskValue: task,
        outcomeValue: createOutcome({
          trace: {
            ...createOutcome().trace,
            actions: Array.from({ length: task.maxActions + 1 }, () => ({
              type: 'tool' as const,
              name: 'workspace_read',
              status: 'success' as const,
              durationMs: 1,
            })),
          },
        }),
        evidenceValue: createEvidence(),
      },
    ];

    for (const [timestampName, timestampOverrides] of [
      ['nonparseable', { completedAt: 'not-a-timestamp' }],
      [
        'out-of-order',
        {
          startedAt: '2026-08-21T00:00:01.000Z',
          completedAt: '2026-08-21T00:00:00.000Z',
        },
      ],
    ] as const) {
      for (const { name, taskValue, outcomeValue, evidenceValue } of precedenceCases) {
        it(`prioritizes ${timestampName} timestamps over ${name}`, () => {
          const result = scoreAgentOutcome(
            taskValue,
            {
              ...outcomeValue,
              trace: { ...outcomeValue.trace, ...timestampOverrides },
            },
            evidenceValue
          );

          expect(result.verdict).toBe('infrastructure_failed');
          expect(result.passed).toBe(false);
          expect(result.issues.map((issue) => issue.code)).toEqual(['trace-timestamp-invalid']);
        });
      }
    }

    for (const [name, timestampOverrides] of [
      ['missing startedAt', { startedAt: undefined }],
      ['null startedAt', { startedAt: null }],
      ['numeric startedAt', { startedAt: 0 }],
      ['missing completedAt', { completedAt: undefined }],
      ['null completedAt', { completedAt: null }],
      ['numeric completedAt', { completedAt: 0 }],
      [
        'out-of-order timestamps',
        {
          startedAt: '2026-08-21T00:00:01.000Z',
          completedAt: '2026-08-21T00:00:00.000Z',
        },
      ],
    ] as const) {
      it(`rejects ${name} as invalid trace timestamps`, () => {
        expectInfrastructureInvalid('trace-timestamp-invalid', task, {
          ...createOutcome(),
          trace: { ...createOutcome().trace, ...timestampOverrides },
        });
      });
    }

    it('allows an absent final diff when no changed paths are recorded', () => {
      const outcome = createOutcome({ finalDiff: undefined });
      outcome.trace.changedPaths = [];

      expect(scoreAgentOutcome(task, outcome, createEvidence()).verdict).toBe('passed');
    });

    for (const changedPath of ['', '.', '..', '/scenario.yaml', 'C:\\scenario.yaml']) {
      it(`reports the invalid changed path ${JSON.stringify(changedPath)} without a truthiness gap`, () => {
        const result = scoreRuntimeValues(task, {
          ...createOutcome(),
          trace: { ...createOutcome().trace, changedPaths: [changedPath] },
        });

        expect(result.verdict).toBe('task_failed');
        expect(result.passed).toBe(false);
        expect(result.issues.map((issue) => issue.code)).toContain('changed-path-violation');
      });
    }

    it('keeps well-typed task identity mismatches as task evidence mismatches', () => {
      const result = scoreRuntimeValues(task, createOutcome({ taskId: 'other-task' }));

      expect(result.issues.map((issue) => issue.code)).toContain('task-evidence-mismatch');
    });
  });
});
