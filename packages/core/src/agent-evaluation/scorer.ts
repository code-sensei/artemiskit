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

export interface AgentArtifactCheck {
  id: string;
  status: 'passed' | 'failed' | 'executor_error';
  durationMs: number;
}

export interface AgentEvaluationEvidence {
  termination: AgentTerminationEvidence;
  acceptanceChecks: AgentAcceptanceCheck[];
  artifactChecks?: AgentArtifactCheck[];
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

const TERMINATION_STATUSES = new Set<unknown>([
  'completed',
  'agent_error',
  'tool_error',
  'infrastructure_error',
  'timed_out',
]);

const CHECK_STATUSES = new Set<unknown>(['passed', 'failed', 'executor_error']);
const ACTION_TYPES = new Set<unknown>(['tool', 'command', 'file']);
const ACTION_STATUSES = new Set<unknown>(['success', 'error', 'rejected']);

type RuntimeRecord = Record<string, unknown>;

function isRuntimeRecord(value: unknown): value is RuntimeRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return false;
    }
  }

  return true;
}

function isDenseStringArray(value: unknown): value is string[] {
  return isDenseArray(value) && value.every((item) => typeof item === 'string');
}

function isFiniteNonnegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function invalidEvidenceScore(task: unknown, code: string, message: string): AgentEvaluationScore {
  return {
    taskId: isRuntimeRecord(task) && typeof task.id === 'string' ? task.id : '',
    verdict: 'infrastructure_failed',
    passed: false,
    recoveredActionCount: 0,
    issues: [{ code, message }],
  };
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

function validateScoreInputs(
  task: unknown,
  outcome: unknown,
  evidence: unknown
): AgentEvaluationScore | undefined {
  if (
    !isRuntimeRecord(task) ||
    typeof task.id !== 'string' ||
    typeof task.fixturePath !== 'string' ||
    !isDenseStringArray(task.allowedPaths) ||
    task.allowedPaths.some((path) => normalizeRelativePath(path) === undefined) ||
    !isDenseStringArray(task.allowedTools) ||
    !isDenseStringArray(task.acceptanceCommands) ||
    (task.requiredArtifactChecks !== undefined &&
      !isDenseStringArray(task.requiredArtifactChecks)) ||
    !isFiniteNonnegativeNumber(task.maxActions) ||
    !Number.isInteger(task.maxActions) ||
    !isFiniteNonnegativeNumber(task.timeoutMs)
  ) {
    return invalidEvidenceScore(
      task,
      'task-definition-invalid',
      'Task definition is malformed or contains invalid runtime values.'
    );
  }

  if (
    !isRuntimeRecord(outcome) ||
    typeof outcome.taskId !== 'string' ||
    typeof outcome.completed !== 'boolean' ||
    typeof outcome.acceptancePassed !== 'boolean' ||
    !isRuntimeRecord(outcome.trace) ||
    (outcome.error !== undefined && typeof outcome.error !== 'string')
  ) {
    return invalidEvidenceScore(
      task,
      'outcome-evidence-invalid',
      'Outcome evidence is malformed or contains invalid runtime values.'
    );
  }

  const trace = outcome.trace;
  if (
    typeof trace.taskId !== 'string' ||
    !Array.isArray(trace.actions) ||
    !isDenseStringArray(trace.changedPaths)
  ) {
    return invalidEvidenceScore(
      task,
      'trace-evidence-invalid',
      'Trace evidence is malformed or contains invalid runtime values.'
    );
  }

  for (let index = 0; index < trace.actions.length; index += 1) {
    const action = trace.actions[index];
    if (
      !isRuntimeRecord(action) ||
      !ACTION_TYPES.has(action.type) ||
      typeof action.name !== 'string' ||
      !ACTION_STATUSES.has(action.status) ||
      !isFiniteNonnegativeNumber(action.durationMs) ||
      (action.summary !== undefined && typeof action.summary !== 'string')
    ) {
      return invalidEvidenceScore(
        task,
        'action-evidence-invalid',
        `Action evidence is invalid at index ${index}.`
      );
    }
  }

  if (typeof trace.startedAt !== 'string' || typeof trace.completedAt !== 'string') {
    return invalidEvidenceScore(
      task,
      'trace-timestamp-invalid',
      'Trace timestamps are missing, invalid, or out of order.'
    );
  }

  if (outcome.finalDiff !== undefined && typeof outcome.finalDiff !== 'string') {
    return invalidEvidenceScore(
      task,
      'final-diff-invalid',
      'Final diff evidence must be a string when present.'
    );
  }

  if (!isRuntimeRecord(evidence)) {
    return invalidEvidenceScore(
      task,
      'evaluation-evidence-invalid',
      'Evaluation evidence is malformed or contains invalid runtime values.'
    );
  }

  if (
    !isRuntimeRecord(evidence.termination) ||
    !TERMINATION_STATUSES.has(evidence.termination.status)
  ) {
    return invalidEvidenceScore(
      task,
      'termination-evidence-invalid',
      'Termination evidence contains an unknown or malformed status.'
    );
  }

  if (!isDenseArray(evidence.acceptanceChecks)) {
    return invalidEvidenceScore(
      task,
      'acceptance-evidence-invalid',
      'Acceptance evidence is malformed or contains invalid runtime values.'
    );
  }

  for (const check of evidence.acceptanceChecks) {
    if (
      !isRuntimeRecord(check) ||
      typeof check.command !== 'string' ||
      !CHECK_STATUSES.has(check.status) ||
      !isFiniteNonnegativeNumber(check.durationMs) ||
      (check.status === 'passed' && check.exitCode !== 0) ||
      (check.status === 'failed' && (!Number.isInteger(check.exitCode) || check.exitCode === 0)) ||
      (check.status === 'executor_error' && check.exitCode !== null)
    ) {
      return invalidEvidenceScore(
        task,
        'acceptance-evidence-invalid',
        'Acceptance evidence is malformed or internally inconsistent.'
      );
    }
  }

  if (evidence.artifactChecks !== undefined) {
    if (!isDenseArray(evidence.artifactChecks)) {
      return invalidEvidenceScore(
        task,
        'artifact-evidence-invalid',
        'Artifact evidence is malformed or contains invalid runtime values.'
      );
    }

    for (const check of evidence.artifactChecks) {
      if (
        !isRuntimeRecord(check) ||
        typeof check.id !== 'string' ||
        !CHECK_STATUSES.has(check.status) ||
        !isFiniteNonnegativeNumber(check.durationMs)
      ) {
        return invalidEvidenceScore(
          task,
          'artifact-evidence-invalid',
          'Artifact evidence is malformed or contains invalid runtime values.'
        );
      }
    }
  }

  return undefined;
}

export function scoreAgentOutcome(
  task: AgentTask,
  outcome: AgentOutcome,
  evidence: AgentEvaluationEvidence
): AgentEvaluationScore {
  const invalidInputs = validateScoreInputs(task, outcome, evidence);
  if (invalidInputs) {
    return invalidInputs;
  }

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

  const artifactChecks = evidence.artifactChecks ?? [];
  const artifactExecutorError = artifactChecks.find((check) => check.status === 'executor_error');
  if (artifactExecutorError) {
    return {
      taskId: task.id,
      verdict: 'infrastructure_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'artifact-executor-error',
          message: `Artifact check could not be executed: ${artifactExecutorError.id}.`,
        },
      ],
    };
  }

  for (const checkId of task.requiredArtifactChecks ?? []) {
    const matchingChecks = artifactChecks.filter((check) => check.id === checkId);
    if (matchingChecks.length === 0) {
      return {
        taskId: task.id,
        verdict: 'infrastructure_failed',
        passed: false,
        recoveredActionCount: 0,
        issues: [
          {
            code: 'artifact-evidence-missing',
            message: `No artifact evidence was recorded for: ${checkId}.`,
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
            code: 'artifact-evidence-duplicate',
            message: `Multiple artifact results were recorded for: ${checkId}.`,
          },
        ],
      };
    }
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

  const failedArtifactCheck = artifactChecks.find(
    (check) => task.requiredArtifactChecks?.includes(check.id) === true && check.status === 'failed'
  );
  if (failedArtifactCheck) {
    return {
      taskId: task.id,
      verdict: 'task_failed',
      passed: false,
      recoveredActionCount: 0,
      issues: [
        {
          code: 'artifact-check-failed',
          message: `Required artifact check failed: ${failedArtifactCheck.id}.`,
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

  const disallowedChangedPathIndex = outcome.trace.changedPaths.findIndex(
    (changedPath) => !isAllowedChangedPath(changedPath, task.allowedPaths)
  );
  if (disallowedChangedPathIndex !== -1) {
    const disallowedChangedPath = outcome.trace.changedPaths[disallowedChangedPathIndex];
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
