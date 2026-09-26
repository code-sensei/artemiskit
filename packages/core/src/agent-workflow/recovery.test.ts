import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { type WorkflowRecoveryEvidence, validWorkflowRecovery, workflowDigest } from './recovery';

const evidence = (): WorkflowRecoveryEvidence => ({
  schemaVersion: '1',
  runId: randomUUID(),
  attemptId: randomUUID(),
  attempts: 1,
  checkpoint: 'disabled',
  reason: 'fresh',
  pendingOperations: 0,
  faults: { declared: 0, injected: 0, entries: [] },
  retries: { maxAttempts: 1, attempted: 0, recovered: 0, exhausted: 0, entries: [], omitted: 0 },
  stateChanges: { total: 0, entries: [], omitted: 0 },
});

describe('bounded recovery metadata', () => {
  test('accepts fresh metadata and refuses working data', () => {
    expect(validWorkflowRecovery(evidence())).toBe(true);
    expect(validWorkflowRecovery({ ...evidence(), transcript: 'private content' })).toBe(false);
    expect(validWorkflowRecovery({ ...evidence(), directory: '/private/checkpoints' })).toBe(false);
  });
  test('checks omission and retry denominators', () => {
    const record = evidence();
    record.retries.attempted = 1;
    expect(validWorkflowRecovery(record)).toBe(false);
    record.retries.omitted = 1;
    expect(validWorkflowRecovery(record)).toBe(true);
    record.retries.recovered = 2;
    expect(validWorkflowRecovery(record)).toBe(false);
    const state = evidence();
    state.stateChanges.total = 1;
    expect(validWorkflowRecovery(state)).toBe(false);
    state.stateChanges.omitted = 1;
    expect(validWorkflowRecovery(state)).toBe(true);
  });
  test('refuses duplicate and out-of-range fault evidence', () => {
    const record = evidence();
    const entry = {
      index: 0,
      kind: 'unavailable_tool' as const,
      tool: 'calculator' as const,
      operationId: 'tool-1',
      id_sha256: workflowDigest('private-id'),
    };
    record.faults = { declared: 2, injected: 2, entries: [entry, entry] };
    expect(validWorkflowRecovery(record)).toBe(false);
    record.faults = { declared: 1, injected: 1, entries: [{ ...entry, index: 1 }] };
    expect(validWorkflowRecovery(record)).toBe(false);
    record.faults.entries[0].index = 0;
    expect(validWorkflowRecovery(record)).toBe(true);
    expect(JSON.stringify(record)).not.toContain('private-id');
  });
  test('rejects nested and revoked proxies without executing traps', () => {
    let calls = 0;
    const proxy = new Proxy(
      {},
      {
        getPrototypeOf() {
          calls++;
          throw new Error('private');
        },
        get() {
          calls++;
          throw new Error('private');
        },
      }
    );
    expect(validWorkflowRecovery(proxy)).toBe(false);
    expect(validWorkflowRecovery({ ...evidence(), faults: proxy })).toBe(false);
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(validWorkflowRecovery(revoked.proxy)).toBe(false);
    expect(calls).toBe(0);
  });
  test('does not execute getters or accept a retry beyond authority', () => {
    let called = false;
    const record = {
      ...evidence(),
      get configurationSha256() {
        called = true;
        return 'x';
      },
    };
    expect(validWorkflowRecovery(record)).toBe(false);
    expect(called).toBe(false);
    const retry = evidence();
    retry.retries.attempted = 1;
    retry.retries.entries.push({
      operationId: 'tool-2',
      previousOperationId: 'tool-1',
      attempt: 2,
    });
    expect(validWorkflowRecovery(retry)).toBe(false);
  });
});
