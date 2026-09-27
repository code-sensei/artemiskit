import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { validCheckpointFaultSchedule, validWorkflowFaultEvidence } from './fault-evidence';
import { summarizeWorkflowFault } from './faults';
import type { WorkflowRecoveryEvidence } from './recovery';
import { AgentWorkflowSchema } from './schema';

const fault = {
  id: 'outage',
  kind: 'unavailable_tool',
  tool: 'calculator',
  occurrence: 1,
} as const;
function evidence(): WorkflowRecoveryEvidence {
  const id = randomUUID();
  return {
    schemaVersion: '1',
    runId: id,
    attemptId: id,
    attempts: 1,
    checkpoint: 'disabled',
    reason: 'finished',
    pendingOperations: 0,
    faults: {
      declared: 1,
      injected: 1,
      entries: [{ ...summarizeWorkflowFault(fault, 0), operationId: 'tool-1' }],
    },
    retries: {
      maxAttempts: 2,
      attempted: 1,
      recovered: 1,
      exhausted: 0,
      entries: [{ operationId: 'tool-2', previousOperationId: 'tool-1', attempt: 2 }],
      omitted: 0,
    },
    stateChanges: { total: 0, entries: [], omitted: 0 },
  };
}
const events = [1, 2].flatMap((attempt) => [
  {
    type: 'tool_requested',
    phase: 'execution',
    operationId: `tool-${attempt}`,
    requestedCallIdHash: 'a'.repeat(64),
    tool: 'calculator',
  },
  {
    type: 'tool_completed',
    phase: 'execution',
    operationId: `tool-${attempt}`,
    requestedCallIdHash: 'a'.repeat(64),
    tool: 'calculator',
    status: attempt === 1 ? 'failed' : 'completed',
  },
]);
describe('fault evidence provenance', () => {
  test('accepts a charged successful retry and a retained prefix without inventing events', () => {
    expect(validWorkflowFaultEvidence(evidence(), events, 2, 0, true)).toBe(true);
    expect(validWorkflowFaultEvidence(evidence(), events.slice(0, 1), 2, 3, true)).toBe(true);
    expect(validWorkflowFaultEvidence(evidence(), events.slice(0, 1), 2, 0, true)).toBe(false);
  });
  test('rejects forged retry links, attempt counts, successful injected failures and fixture metadata', () => {
    for (const mutate of [
      (r: WorkflowRecoveryEvidence) => {
        r.retries.entries[0].previousOperationId = 'tool-2';
      },
      (r: WorkflowRecoveryEvidence) => {
        r.retries.entries[0].attempt = 3;
      },
      (r: WorkflowRecoveryEvidence) => {
        r.retries.recovered = 0;
      },
      (r: WorkflowRecoveryEvidence) => {
        r.faults.entries[0].operationId = 'tool-2';
      },
      (r: WorkflowRecoveryEvidence) => {
        r.faults.entries[0].kind = 'stale_data';
      },
      (r: WorkflowRecoveryEvidence) => {
        r.faults.entries[0].fixture_bytes = 1;
      },
    ]) {
      const r = evidence();
      mutate(r);
      expect(validWorkflowFaultEvidence(r, events, 2, 0, true)).toBe(false);
    }
  });
  test('completed evidence cannot hide an unrecovered pre-effect fault behind truncated events', () => {
    const exhausted = evidence();
    exhausted.retries.exhausted = 1;
    expect(validWorkflowFaultEvidence(exhausted, [], 2, 4, true)).toBe(false);
    const unrecovered = evidence();
    unrecovered.retries = {
      maxAttempts: 1,
      attempted: 0,
      recovered: 0,
      exhausted: 0,
      entries: [],
      omitted: 0,
    };
    expect(validWorkflowFaultEvidence(unrecovered, events.slice(0, 2), 1, 0, true)).toBe(false);
    expect(validWorkflowFaultEvidence(unrecovered, [], 1, 2, true)).toBe(false);
    // A global timeout/cancellation can stop an injected delay before retry-policy exhaustion.
    expect(validWorkflowFaultEvidence(unrecovered, events.slice(0, 2), 1, 0, false)).toBe(true);
  });
  test('retry cannot switch logical call, phase or tool identity', () => {
    for (const mutate of [
      (event: (typeof events)[number]) => {
        event.requestedCallIdHash = 'b'.repeat(64);
      },
      (event: (typeof events)[number]) => {
        event.tool = 'read_file';
      },
      (event: (typeof events)[number]) => {
        event.phase = 'preflight';
      },
    ]) {
      const altered = structuredClone(events);
      mutate(altered[2]);
      expect(validWorkflowFaultEvidence(evidence(), altered, 2, 0, true)).toBe(false);
    }
  });
  test('private transcript reconstructs consumed declaration and original logical occurrence', () => {
    const workflow = AgentWorkflowSchema.parse({
      version: '1',
      kind: 'agent_workflow',
      name: 'provenance',
      target: { provider: 'openai', model: 'fixture' },
      environment: {
        type: 'simulated',
        policy: {
          network: 'denied',
          side_effects: 'denied',
          permissions: {},
          budgets: { max_actions: 10, timeout_ms: 10000 },
        },
      },
      tools: ['calculator'],
      workflow: {
        system_instructions: 'Use calculator.',
        initial_state: {},
        turns: [{ role: 'user', content: 'Add.' }],
      },
      faults: [fault],
      retry: { max_attempts: 2 },
      outcomes: { deterministic: [{ type: 'tool_trace', tool: 'calculator', minimum_calls: 1 }] },
      evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
    });
    const transcript = [
      {
        role: 'assistant' as const,
        content: '',
        tool_calls: [
          {
            id: 'one',
            type: 'function' as const,
            function: { name: 'calculator', arguments: '{"operation":"add","a":1,"b":1}' },
          },
        ],
      },
      { role: 'tool' as const, content: '{"value":2}', toolCallId: 'one' },
    ];
    expect(validCheckpointFaultSchedule(workflow, transcript, evidence(), false)).toBe(true);
    const changed = evidence();
    changed.faults.entries[0].id_sha256 = 'a'.repeat(64);
    expect(validCheckpointFaultSchedule(workflow, transcript, changed, false)).toBe(false);
    expect(validCheckpointFaultSchedule(workflow, transcript, evidence(), true)).toBe(false);
  });
});
