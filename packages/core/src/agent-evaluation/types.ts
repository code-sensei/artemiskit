export interface AgentTask {
  id: string;
  fixturePath: string;
  allowedPaths: string[];
  allowedTools: string[];
  maxActions: number;
  timeoutMs: number;
  acceptanceCommands: string[];
  requiredArtifactChecks?: string[];
}

export interface AgentAction {
  type: 'tool' | 'command' | 'file';
  name: string;
  status: 'success' | 'error' | 'rejected';
  durationMs: number;
  summary?: string;
}

export interface AgentTrace {
  taskId: string;
  actions: AgentAction[];
  changedPaths: string[];
  startedAt: string;
  completedAt: string;
}

export interface AgentOutcome {
  taskId: string;
  completed: boolean;
  acceptancePassed: boolean;
  trace: AgentTrace;
  finalDiff?: string;
  error?: string;
}

export interface AgentHarness {
  run(task: AgentTask): Promise<AgentOutcome>;
}

export function actionBudgetExceeded(task: AgentTask, trace: AgentTrace): boolean {
  return trace.actions.length > task.maxActions;
}
