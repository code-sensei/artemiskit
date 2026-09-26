import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type WorkflowCheckpointPayload,
  parseWorkflowCheckpoint,
  restoreWorkflowCheckpoint,
} from './checkpoint';
import { openWorkflowCheckpointStore } from './checkpoint-store';
import { recoveryTarget, recoveryWorkflow } from './recovery-fixtures/scenario';
import { runAgentWorkflow } from './session';

let root: string;
let payload: WorkflowCheckpointPayload;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'artemis-payload-'));
  const directory = join(root, 'checkpoint');
  const result = await runAgentWorkflow({
    workflow: recoveryWorkflow(),
    target: recoveryTarget(),
    checkpoint: { directory, mode: 'create', configurationId: 'private-transport' },
    pauseAfterActions: 2,
  });
  expect(result.record.reason).toBe('checkpoint_paused');
  const store = await openWorkflowCheckpointStore({ directory, mode: 'resume' });
  try {
    payload = parseWorkflowCheckpoint((await store.read())?.payload);
  } finally {
    await store.close();
  }
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('checkpoint semantic boundaries', () => {
  test('detaches a structurally and semantically valid paused payload', () => {
    const result = restoreWorkflowCheckpoint(
      payload,
      recoveryWorkflow(),
      payload.identity,
      Date.now()
    );
    expect(result).toEqual(payload);
    expect(result).not.toBe(payload);
    expect(result.transcript).not.toBe(payload.transcript);
  });
  test('rejects getters, proxies, unknown fields and schema versions without echoing private data', () => {
    let calls = 0;
    const getter = {
      get schemaVersion() {
        calls++;
        throw new Error('PRIVATE-CREDENTIAL');
      },
    };
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          calls++;
          throw new Error('PRIVATE-CREDENTIAL');
        },
      }
    );
    for (const value of [
      getter,
      proxy,
      { ...payload, extra: 'PRIVATE-CREDENTIAL' },
      { ...payload, schemaVersion: '2' },
    ]) {
      expect(() => parseWorkflowCheckpoint(value)).toThrow('checkpoint_invalid');
    }
    expect(calls).toBe(0);
  });
  test('rejects checksum-valid inconsistent counters, transcript/cursor and unfinished ledger', () => {
    const modifications: ((p: WorkflowCheckpointPayload) => void)[] = [
      (p) => {
        p.measuredRequests++;
      },
      (p) => {
        p.ledger.usage.reported.total++;
      },
      (p) => {
        p.ledger.usage.preflight.prompt = 999;
      },
      (p) => {
        p.ledger.budgets.actions++;
      },
      (p) => {
        p.deadlineAt++;
      },
      (p) => {
        p.ledger.budgets.elapsedMs++;
      },
      (p) => {
        p.cursor.callIndex = 0;
      },
      (p) => {
        p.cursor.stage = 'model';
        p.cursor.callIndex = 0;
        p.transcript.pop();
      },
      (p) => {
        p.transcript[0].content = 'new authority';
      },
      (p) => {
        p.transcript[1].content = 'new user turn';
      },
      (p) => {
        p.seenIds.push(p.seenIds[0]);
      },
      (p) => {
        p.attemptIds.push(p.attemptIds[0]);
      },
      (p) => {
        p.recovery.configurationSha256 = '0'.repeat(64);
      },
      (p) => {
        p.initialStateSha256 = '0'.repeat(64);
      },
      (p) => {
        p.stateSha256 = '0'.repeat(64);
      },
      (p) => {
        p.eventSequence++;
      },
      (p) => {
        p.ledger.events[1].operationId = 'model-99';
      },
      (p) => {
        p.ledger.events[2].status = 'failed';
      },
      (p) => {
        p.ledger.events[2].phase = 'preflight';
      },
      (p) => {
        p.ledger.events.push({ ...p.ledger.events[0], type: 'finished' });
      },
      (p) => {
        p.environmentReleased = false;
      },
      (p) => {
        p.recovery.attemptId = crypto.randomUUID();
      },
    ];
    for (const modify of modifications) {
      const changed = structuredClone(payload);
      modify(changed);
      expect(() =>
        restoreWorkflowCheckpoint(changed, recoveryWorkflow(), payload.identity, Date.now())
      ).toThrow();
    }
  });
  test('refuses incomplete lifecycle states even when their snapshots appear valid', () => {
    for (const lifecycle of ['pending', 'pausing', 'terminal'] as const) {
      const changed = { ...payload, lifecycle };
      expect(() =>
        restoreWorkflowCheckpoint(changed, recoveryWorkflow(), payload.identity, Date.now())
      ).toThrow(lifecycle === 'terminal' ? 'checkpoint_terminal' : 'checkpoint_pending');
    }
  });
});
