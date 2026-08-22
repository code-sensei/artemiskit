import { describe, expect, it } from 'bun:test';
import { type AgentTask, type AgentTrace, actionBudgetExceeded } from './types';

describe('real agent evaluation contracts', () => {
  it('detects action-budget violations', () => {
    const task: AgentTask = {
      id: 'repair',
      fixturePath: '/tmp/fixture',
      allowedPaths: ['scenario.yaml'],
      allowedTools: ['workspace_read'],
      maxActions: 1,
      timeoutMs: 60_000,
      acceptanceCommands: ['akit validate scenario.yaml'],
    };
    const trace: AgentTrace = {
      taskId: 'repair',
      actions: [
        { type: 'tool', name: 'workspace_read', status: 'success', durationMs: 1 },
        { type: 'command', name: 'akit validate', status: 'success', durationMs: 1 },
      ],
      changedPaths: [],
      startedAt: '2026-08-21T00:00:00Z',
      completedAt: '2026-08-21T00:00:01Z',
    };
    expect(actionBudgetExceeded(task, trace)).toBe(true);
  });
});
