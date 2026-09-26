import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readWorkflowRecord } from './records';

const historical = JSON.parse(
  readFileSync(
    new URL('../../../../docs/releases/0.6.1-local-models.json', import.meta.url),
    'utf8'
  )
).runs as { record: Record<string, unknown> }[];

describe('saved workflow record compatibility', () => {
  test('real historical records remain execution-only and detached', () => {
    for (const { record } of historical) {
      const parsed = readWorkflowRecord(record);
      expect(parsed).toEqual(record);
      expect(parsed.schemaVersion).toBe('1');
      expect(parsed.taskVerification).toBe('unavailable');
      expect(parsed).not.toBe(record);
      expect(readWorkflowRecord(JSON.stringify(record))).toEqual(parsed);
    }
  });
  test('historical records cannot claim task passes or silently acquire outcomes', () => {
    const record = historical[0].record;
    expect(() => readWorkflowRecord({ ...record, taskVerification: 'passed' })).toThrow(
      'Invalid or unsupported workflow record'
    );
    expect(() => readWorkflowRecord({ ...record, outcomes: {} })).toThrow(
      'Invalid or unsupported workflow record'
    );
    expect(() => readWorkflowRecord({ ...record, schemaVersion: '2' })).toThrow(
      'Invalid or unsupported workflow record'
    );
    expect(() => readWorkflowRecord({ ...record, schemaVersion: '99' })).toThrow(
      'Invalid or unsupported workflow record'
    );
  });
  test('contradictory token, counter and identity evidence is rejected', () => {
    const record = historical[0].record;
    for (const mutate of [
      (value: ReturnType<typeof readWorkflowRecord>) => {
        value.usage.reported.total++;
      },
      (value: ReturnType<typeof readWorkflowRecord>) => {
        value.budgets.actions++;
      },
      (value: ReturnType<typeof readWorkflowRecord>) => {
        if (value.configuration) value.configuration.model.sha256 = 'a'.repeat(64);
      },
      (value: ReturnType<typeof readWorkflowRecord>) => {
        value.cleanup.pendingOperations = 1;
      },
    ]) {
      const value = readWorkflowRecord(record);
      mutate(value);
      expect(() => readWorkflowRecord(value)).toThrow('Invalid or unsupported workflow record');
    }
  });
  test('hostile getters and diagnostics cannot expose raw evidence', () => {
    let invoked = 0;
    const input = { ...historical[0].record };
    Object.defineProperty(input, 'private', {
      enumerable: true,
      get() {
        invoked++;
        throw new Error('PRIVATE-CREDENTIAL');
      },
    });
    expect(() => readWorkflowRecord(input)).toThrow('Invalid or unsupported workflow record');
    expect(invoked).toBe(0);
    expect(() => readWorkflowRecord('{"PRIVATE-CREDENTIAL":')).toThrow(
      'Invalid or unsupported workflow record'
    );
  });
});
