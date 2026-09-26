import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWorkflowCheckpoint } from '../checkpoint';
import { openWorkflowCheckpointStore } from '../checkpoint-store';
import { readWorkflowRecord } from '../records';
import { runAgentWorkflow } from '../session';
import { recoveryTarget, recoveryWorkflow } from './scenario';

const root = await mkdtemp(join(tmpdir(), 'artemis-docker-resume-'));
try {
  const directory = join(root, 'checkpoint');
  const workflow = recoveryWorkflow();
  workflow.environment.type = 'sandbox';
  workflow.environment.policy.budgets.timeout_ms = 120000;
  const checkpoint = {
    directory,
    mode: 'create' as const,
    configurationId: 'local-docker-fixture',
  };
  const first = await runAgentWorkflow({
    workflow,
    target: recoveryTarget(),
    checkpoint,
    pauseAfterActions: 2,
  });
  assert.equal(first.record.reason, 'checkpoint_paused');
  assert.equal(first.record.cleanup.status, 'completed');
  const store = await openWorkflowCheckpointStore({ directory, mode: 'resume' });
  try {
    assert.equal(parseWorkflowCheckpoint((await store.read())?.payload).environmentReleased, true);
  } finally {
    await store.close();
  }
  const second = await runAgentWorkflow({
    workflow,
    target: recoveryTarget(),
    checkpoint: { ...checkpoint, mode: 'resume' },
  });
  assert.equal(second.record.taskVerification, 'passed');
  assert.equal(second.record.cleanup.status, 'completed');
  assert.equal(second.record.budgets.actions, 4);
  assert.equal(second.record.recovery?.attempts, 2);
  assert.deepEqual(second.state?.files, { 'one.txt': 'PRIVATE-ONE', 'two.txt': 'PRIVATE-TWO' });
  assert.deepEqual(readWorkflowRecord(second.record), second.record);
  console.log(
    JSON.stringify({
      status: 'passed',
      environment: 'sandbox',
      pauseCleanup: first.record.cleanup,
      resumeCleanup: second.record.cleanup,
      budgets: second.record.budgets,
      sameRun: first.record.recovery?.runId === second.record.recovery?.runId,
    })
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
