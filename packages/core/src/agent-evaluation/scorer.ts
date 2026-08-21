import { type AgentOutcome, type AgentTask, actionBudgetExceeded } from './types';

export type AgentTerminationStatus =
  | 'completed'
  | 'agent_error'
  | 'tool_error'
  | 'infrastructure_error'
  | 'timed_out';

export interface AgentTerminationEvidence {
  status: AgentTerminationStatus;
}

export interface AgentAcceptanceCheck {
  command: string;
  status: 'passed' | 'failed' | 'executor_error';
  exitCode: number | null;
  durationMs: number;
}

export interface AgentEvaluationEvidence {
  termination: AgentTerminationEvidence;
  acceptanceChecks: AgentAcceptanceCheck[];
}

export type AgentEvaluationVerdict =
  | 'passed'
  | 'passed_with_recovery'
  | 'task_failed'
  | 'infrastructure_failed';

export interface AgentEvaluationIssue {
  code: string;
  message: string;
}

export interface AgentEvaluationScore {
  taskId: string;
  verdict: AgentEvaluationVerdict;
  passed: boolean;
  recoveredActionCount: number;
  issues: AgentEvaluationIssue[];
}

function normalizeRelativePath(path: string): string | undefined {
  const slashPath = path.replaceAll('\\', '/');
  if (slashPath.startsWith('/') || /^[A-Za-z]:\//.test(slashPath) || slashPath.includes('\0')) {
    return undefined;
  }

  const segments = slashPath.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0 || segments.includes('..')) {
    return undefined;
  }

  return segments.join('/');
}

function isAllowedChangedPath(changedPath: string, allowedPaths: string[]): boolean {
  const normalizedChangedPath = normalizeRelativePath(changedPath);
  if (!normalizedChangedPath) {
    return false;
  }

  return allowedPaths.some((allowedPath) => {
    const normalizedAllowedPath = normalizeRelativePath(allowedPath);
    return (
      normalizedAllowedPath !== undefined &&
      (normalizedChangedPath === normalizedAllowedPath ||
        normalizedChangedPath.startsWith(`${normalizedAllowedPath}/`))
    );
  });
}

export function scoreAgentOutcome(
  task: AgentTask,
  outcome: AgentOutcome,
  evidence: AgentEvaluationEvidence
): AgentEvaluationScore {
  if (outcome.taskId !== task.id || outcome.trace.taskId !== task.id) {
    return {
      taskId: task.id,
      verdict: 'infrastructure_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'task-evidence-mismatch',
          message: 'Outcome or trace evidence belongs to a different task.',
        },
      ],
    };
  }

  const recoveredActionCount = outcome.trace.actions.filter(
    (action) => action.status === 'error'
  ).length;
  const infrastructureTerminationCodes: Partial<Record<AgentTerminationStatus, string>> = {
    tool_error: 'tool-termination-error',
    infrastructure_error: 'infrastructure-termination-error',
  };
  const infrastructureTerminationCode = infrastructureTerminationCodes[evidence.termination.status];

  if (infrastructureTerminationCode) {
    return {
      taskId: task.id,
      verdict: 'infrastructure_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: infrastructureTerminationCode,
          message: `Run terminated with ${evidence.termination.status}.`,
        },
      ],
    };
  }

  const taskTerminationCodes: Partial<Record<AgentTerminationStatus, string>> = {
    agent_error: 'agent-termination-error',
    timed_out: 'agent-timed-out',
  };
  const taskTerminationCode = taskTerminationCodes[evidence.termination.status];
  if (taskTerminationCode) {
    return {
      taskId: task.id,
      verdict: 'task_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: taskTerminationCode,
          message: `Run terminated with ${evidence.termination.status}.`,
        },
      ],
    };
  }

  if (!outcome.completed) {
    return {
      taskId: task.id,
      verdict: 'infrastructure_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'completion-evidence-mismatch',
          message: 'Termination evidence reports completion but the outcome does not.',
        },
      ],
    };
  }

  for (const command of task.acceptanceCommands) {
    const matchingChecks = evidence.acceptanceChecks.filter((check) => check.command === command);
    if (matchingChecks.length === 0) {
      return {
        taskId: task.id,
        verdict: 'infrastructure_failed',
        passed: false,
        recoveredActionCount: 0,
        issues: [
          {
            code: 'acceptance-evidence-missing',
            message: `No acceptance evidence was recorded for: ${command}.`,
          },
        ],
      };
    }
    if (matchingChecks.length > 1) {
      return {
        taskId: task.id,
        verdict: 'infrastructure_failed',
        passed: false,
        recoveredActionCount: 0,
        issues: [
          {
            code: 'acceptance-evidence-duplicate',
            message: `Multiple acceptance results were recorded for: ${command}.`,
          },
        ],
      };
    }
  }

  const invalidAcceptanceCheck = evidence.acceptanceChecks.find(
    (check) =>
      !Number.isFinite(check.durationMs) ||
      check.durationMs < 0 ||
      (check.status === 'passed' && check.exitCode !== 0) ||
      (check.status === 'failed' && (check.exitCode === null || check.exitCode === 0)) ||
      (check.status === 'executor_error' && check.exitCode !== null)
  );
  if (invalidAcceptanceCheck) {
    return {
      taskId: task.id,
      verdict: 'infrastructure_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'acceptance-evidence-invalid',
          message: `Acceptance status, exit code, or duration is inconsistent for: ${invalidAcceptanceCheck.command}.`,
        },
      ],
    };
  }

  const executorError = evidence.acceptanceChecks.find(
    (check) => check.status === 'executor_error'
  );
  if (executorError) {
    return {
      taskId: task.id,
      verdict: 'infrastructure_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'acceptance-executor-error',
          message: `Acceptance command could not be executed: ${executorError.command}.`,
        },
      ],
    };
  }

  const acceptancePassed = task.acceptanceCommands.every((command) => {
    const check = evidence.acceptanceChecks.find((candidate) => candidate.command === command);
    return check?.status === 'passed' && check.exitCode === 0;
  });
  if (outcome.acceptancePassed !== acceptancePassed) {
    return {
      taskId: task.id,
      verdict: 'infrastructure_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'acceptance-evidence-mismatch',
          message: 'The outcome acceptance summary does not match the recorded command evidence.',
        },
      ],
    };
  }

  if (outcome.trace.changedPaths.length > 0 && !outcome.finalDiff?.trim()) {
    return {
      taskId: task.id,
      verdict: 'infrastructure_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'final-diff-missing',
          message: 'Changed paths were recorded without a non-empty final diff.',
        },
      ],
    };
  }

  const failedAcceptanceCheck = evidence.acceptanceChecks.find(
    (check) => check.status === 'failed'
  );
  if (failedAcceptanceCheck) {
    return {
      taskId: task.id,
      verdict: 'task_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'acceptance-failed',
          message: `Acceptance command failed: ${failedAcceptanceCheck.command}.`,
        },
      ],
    };
  }

  const disallowedChangedPath = outcome.trace.changedPaths.find(
    (changedPath) => !isAllowedChangedPath(changedPath, task.allowedPaths)
  );
  if (disallowedChangedPath) {
    return {
      taskId: task.id,
      verdict: 'task_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'changed-path-violation',
          message: `Changed path is outside the allowed scope: ${disallowedChangedPath}.`,
        },
      ],
    };
  }

  const prohibitedAction = outcome.trace.actions.find(
    (action) =>
      action.status === 'rejected' ||
      (action.type === 'tool' && !task.allowedTools.includes(action.name))
  );
  if (prohibitedAction) {
    return {
      taskId: task.id,
      verdict: 'task_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'prohibited-action',
          message: `Tool action was prohibited or rejected: ${prohibitedAction.name}.`,
        },
      ],
    };
  }

  if (actionBudgetExceeded(task, outcome.trace)) {
    return {
      taskId: task.id,
      verdict: 'task_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'action-budget-exceeded',
          message: `Action budget exceeded: ${outcome.trace.actions.length}/${task.maxActions}.`,
        },
      ],
    };
  }

  const startedAtMs = Date.parse(outcome.trace.startedAt);
  const completedAtMs = Date.parse(outcome.trace.completedAt);
  const elapsedMs = completedAtMs - startedAtMs;
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || elapsedMs < 0) {
    return {
      taskId: task.id,
      verdict: 'infrastructure_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'trace-timestamp-invalid',
          message: 'Trace timestamps are missing, invalid, or out of order.',
        },
      ],
    };
  }
  if (elapsedMs > task.timeoutMs) {
    return {
      taskId: task.id,
      verdict: 'task_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'time-budget-exceeded',
          message: `Time budget exceeded: ${elapsedMs}/${task.timeoutMs}ms.`,
        },
      ],
    };
  }

  return {
    taskId: task.id,
    verdict: recoveredActionCount > 0 ? 'passed_with_recovery' : 'passed',
    passed: true,
    recoveredActionCount,
    issues: [],
  };
}
