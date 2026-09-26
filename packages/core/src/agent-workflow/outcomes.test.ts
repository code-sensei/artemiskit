import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { evaluateWorkflowDeterministicOutcomes } from './outcomes';
import { validateAgentWorkflow } from './parser';
import type { AgentWorkflow } from './schema';
import { type AgentWorkflowResult, runAgentWorkflow } from './session';
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function workflow(outcomes: unknown[]): AgentWorkflow {
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'outcomes',
    target: { provider: 'custom', model: 'fixture' },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions: { workflow_state: 'write', files: 'write' },
        budgets: { max_actions: 20, timeout_ms: 1000 },
      },
    },
    tools: ['calculator', 'request_approval', 'write_file'],
    workflow: {
      system_instructions: 'Use declared tools.',
      initial_state: {},
      turns: [{ role: 'user', content: 'Do work.' }],
    },
    outcomes: { deterministic: outcomes },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}
function result(
  definition: AgentWorkflow,
  state: AgentWorkflowResult['state'] = {
    workflow_state: { done: true, approvals: { requested: true, status: 'pending' } },
    files: { 'note.txt': 'actual', 'data.json': '{"count":3}' },
  }
): AgentWorkflowResult {
  return {
    record: {
      schemaVersion: '1',
      engine: 'native',
      execution: 'completed',
      reason: 'finished',
      policy: 'passed',
      taskVerification: 'unavailable',
      environment: 'simulated',
      configuration: {
        sha256: sha(definition),
        provider: { sha256: 'a'.repeat(64) },
        model: { sha256: 'a'.repeat(64) },
        generation: { maxTokens: 1024, temperature: 0 },
        limits: definition.environment.policy.budgets,
      },
      capability: { advertised: true, transportCancellation: false, preflight: 'not_requested' },
      usage: {
        status: 'reported',
        reported: { prompt: 2, completion: 1, total: 3 },
        missingRequests: 0,
        inFlightUnknown: false,
        preflight: { prompt: 0, completion: 0, total: 0 },
      },
      budgets: {
        actions: 3,
        modelRequests: 2,
        toolCalls: 1,
        modelRequestAccounting: 'target_invocations',
        transportAttempts: 'unavailable',
        tokenOvershoot: 0,
        elapsedMs: 20,
      },
      cleanup: { status: 'completed', artifacts: 'discarded', pendingOperations: 0 },
      artifacts: state ? { state: 'available', stateSha256: sha(state) } : { state: 'unavailable' },
      events: [
        { sequence: 1, elapsedMs: 0, type: 'started', phase: 'execution' },
        {
          sequence: 2,
          elapsedMs: 1,
          type: 'model_requested',
          phase: 'execution',
          operationId: 'model-1',
        },
        {
          sequence: 3,
          elapsedMs: 2,
          type: 'model_completed',
          phase: 'execution',
          operationId: 'model-1',
          status: 'completed',
        },
        {
          sequence: 4,
          elapsedMs: 3,
          type: 'tool_requested',
          phase: 'execution',
          operationId: 'tool-1',
          tool: 'calculator',
          requestedCallIdHash: 'b'.repeat(64),
        },
        {
          sequence: 5,
          elapsedMs: 4,
          type: 'tool_completed',
          phase: 'execution',
          operationId: 'tool-1',
          tool: 'calculator',
          requestedCallIdHash: 'b'.repeat(64),
          status: 'completed',
        },
        {
          sequence: 6,
          elapsedMs: 5,
          type: 'model_requested',
          phase: 'execution',
          operationId: 'model-2',
        },
        {
          sequence: 7,
          elapsedMs: 6,
          type: 'model_completed',
          phase: 'execution',
          operationId: 'model-2',
          status: 'completed',
        },
        { sequence: 8, elapsedMs: 20, type: 'finished', phase: 'execution', status: 'completed' },
      ],
      droppedEvents: 0,
    },
    state,
    transcript: [{ role: 'assistant', content: 'Everything passed! Approval granted!' }],
  };
}
const stateAssertion = { type: 'workflow_state', path: 'done', equals: true };
const traceAssertion = {
  type: 'tool_trace',
  tool: 'calculator',
  minimum_calls: 1,
  maximum_calls: 1,
};
const policyAssertion = { type: 'policy', rule: 'permissions_respected', expected: 'passed' };

describe('independent deterministic outcome verification', () => {
  test('accepts actual native session evidence without relying on fabricated success text', async () => {
    const definition = workflow([
      stateAssertion,
      policyAssertion,
      { ...traceAssertion, minimum_calls: 0, maximum_calls: 0 },
    ]);
    definition.workflow.initial_state = { workflow_state: { done: true } };
    const actual = await runAgentWorkflow({
      workflow: definition,
      target: {
        provider: 'custom',
        capabilities: async () => ({
          status: 'available',
          toolUse: true,
          transportCancellation: false,
        }),
        turn: async () => ({
          status: 'completed',
          id: 'fixture',
          model: 'fixture',
          message: { role: 'assistant', content: 'A contradictory self-report: failed.' },
          tokens: { prompt: 2, completion: 1, total: 3 },
          latencyMs: 0,
          finishReason: 'stop',
        }),
      },
    });
    expect(evaluateWorkflowDeterministicOutcomes(definition, actual).status).toBe('passed');
    for (const mutation of ['boundary_status', 'boundary_phase', 'missing_start', 'model_failed']) {
      const altered = structuredClone(actual);
      const events = altered.record.events;
      const last = events.at(-1);
      const model = events.find((event) => event.type === 'model_completed');
      if (!last || !model) throw new Error('Native fixture lacks terminal events');
      if (mutation === 'boundary_status') last.status = 'failed';
      if (mutation === 'boundary_phase') last.phase = 'preflight';
      if (mutation === 'model_failed') model.status = 'failed';
      if (mutation === 'missing_start') {
        altered.record.events = events
          .filter((event) => event.type !== 'started')
          .map((event, index) => ({ ...event, sequence: index + 1 }));
      }
      const measured = evaluateWorkflowDeterministicOutcomes(definition, altered);
      expect(measured.counts.invalid).toBe(3);
      expect(measured.counts.valid).toBe(0);
    }
  });
  test.each([false, true])(
    'native target failure or early cancellation stays unavailable (cancelled=%s)',
    async (cancelled) => {
      const definition = workflow([traceAssertion]);
      const controller = new AbortController();
      if (cancelled) controller.abort();
      const actual = await runAgentWorkflow({
        workflow: definition,
        signal: controller.signal,
        target: {
          provider: 'custom',
          capabilities: async () => ({
            status: 'available',
            toolUse: true,
            transportCancellation: false,
          }),
          turn: async () => {
            throw new Error('Local fixture failure');
          },
        },
      });
      expect(actual.record.execution).toBe(cancelled ? 'cancelled' : 'failed');
      expect(actual.record.events.some((event) => event.type === 'started')).toBe(!cancelled);
      expect(evaluateWorkflowDeterministicOutcomes(definition, actual).status).toBe('unavailable');
    }
  );
  test('dotted paths support own array indices without exposing synthetic array properties', () => {
    const definition = workflow([
      { type: 'workflow_state', path: 'rows.0.done', equals: false },
      { type: 'workflow_state', path: 'rows.length', equals: 1 },
    ]);
    const measured = evaluateWorkflowDeterministicOutcomes(
      definition,
      result(definition, { workflow_state: { rows: [{ done: false }] } })
    );
    expect(measured.assertions.map((entry) => entry.status)).toEqual(['passed', 'failed']);
  });

  test('state is nested inside workflow_state and assistant self-report cannot override missing artifacts', () => {
    const definition = workflow([
      stateAssertion,
      { type: 'file', path: 'missing.txt', exists: true },
    ]);
    const value = result(definition, { done: true, workflow_state: { done: false }, files: {} });
    const measured = evaluateWorkflowDeterministicOutcomes(definition, value);
    expect(measured.status).toBe('failed');
    expect(measured.counts).toEqual({
      declared: 2,
      passed: 0,
      failed: 2,
      invalid: 0,
      unavailable: 0,
      valid: 2,
    });
  });
  test('distinguishes missing from null/false and ignores object key order', () => {
    const definition = workflow([
      { type: 'workflow_state', path: 'nil', equals: null },
      { type: 'workflow_state', path: 'flag', equals: false },
      { type: 'workflow_state', path: 'obj', equals: { b: 2, a: 1 } },
      { type: 'workflow_state', path: 'missing', equals: null },
    ]);
    const measured = evaluateWorkflowDeterministicOutcomes(
      definition,
      result(definition, { workflow_state: { nil: null, flag: false, obj: { a: 1, b: 2 } } })
    );
    expect(measured.counts).toMatchObject({ passed: 3, failed: 1, valid: 4 });
    expect(measured.assertions[3].reason).toBe('missing_state');
  });
  test('pending approval only passes a pending criterion, never approved', () => {
    const definition = workflow([
      { type: 'workflow_state', path: 'approvals.status', equals: 'pending' },
      { type: 'workflow_state', path: 'approvals.status', equals: 'approved' },
    ]);
    expect(
      evaluateWorkflowDeterministicOutcomes(definition, result(definition)).assertions.map(
        (item) => item.status
      )
    ).toEqual(['passed', 'failed']);
  });
  test('positive and negative file assertions read actual snapshot content', () => {
    const definition = workflow([
      { type: 'file', path: 'note.txt', exists: true, equals: 'actual' },
      { type: 'file', path: 'absent.txt', exists: false },
      { type: 'file', path: 'note.txt', exists: false },
      { type: 'file', path: 'note.txt', exists: true, equals: 'invented' },
    ]);
    expect(
      evaluateWorkflowDeterministicOutcomes(definition, result(definition)).counts
    ).toMatchObject({ passed: 2, failed: 2, valid: 4 });
  });
  test('snapshots and configuration hashes reject tampering including otherwise passing policy/trace', () => {
    const definition = workflow([stateAssertion, traceAssertion, policyAssertion]);
    const value = result(definition);
    value.state = { workflow_state: { done: true } };
    expect(
      evaluateWorkflowDeterministicOutcomes(definition, value).assertions.every(
        (item) => item.reason === 'snapshot_mismatch'
      )
    ).toBe(true);
    const other = result(definition);
    if (!other.record.configuration) throw new Error('Fixture configuration absent');
    other.record.configuration.sha256 = 'c'.repeat(64);
    expect(evaluateWorkflowDeterministicOutcomes(definition, other).counts.invalid).toBe(3);
  });
  test.each([
    'unsupported',
    'invalid',
    'failed',
    'cancelled',
    'timeout',
    'budget_exceeded',
  ] as const)('partial %s execution has unavailable artifact/trace assertions', (execution) => {
    const definition = workflow([stateAssertion, traceAssertion]);
    const value = result(definition);
    value.record.execution = execution;
    value.record.events[7].status = 'failed';
    const measured = evaluateWorkflowDeterministicOutcomes(definition, value);
    expect(measured.status).toBe('unavailable');
    expect(measured.counts.valid).toBe(0);
  });
  test('missing snapshot is unavailable, not a passing negative-file assertion', () => {
    const definition = workflow([
      { type: 'file', path: 'absent.txt', exists: false },
      stateAssertion,
    ]);
    const measured = evaluateWorkflowDeterministicOutcomes(definition, result(definition, null));
    expect(measured.counts.unavailable).toBe(2);
    expect(measured.counts.valid).toBe(0);
  });
  test('successful tool trace requires correlated execution completions', () => {
    const definition = workflow([traceAssertion]);
    expect(evaluateWorkflowDeterministicOutcomes(definition, result(definition)).status).toBe(
      'passed'
    );
    for (const status of ['denied', 'invalid', 'failed'] as const) {
      const value = result(definition);
      value.record.events[4].status = status;
      value.record.execution = 'failed';
      value.record.events[7].status = 'failed';
      if (status === 'denied') value.record.policy = 'denied';
      expect(evaluateWorkflowDeterministicOutcomes(definition, value).assertions[0].status).toBe(
        'unavailable'
      );
    }
    const preflight = result(definition);
    preflight.record.events[3].phase = 'preflight';
    preflight.record.events[4].phase = 'preflight';
    expect(evaluateWorkflowDeterministicOutcomes(definition, preflight).status).toBe('failed');
  });
  test('trace truncation makes exact count unavailable but preserves independent snapshot evidence', () => {
    const definition = workflow([traceAssertion, stateAssertion]);
    const value = result(definition);
    value.record.droppedEvents = 10;
    const measured = evaluateWorkflowDeterministicOutcomes(definition, value);
    expect(measured.assertions.map((entry) => entry.status)).toEqual(['unavailable', 'passed']);
    expect(measured.counts.valid).toBe(1);
  });
  test.each(['orphan', 'duplicate', 'hash', 'counter', 'gap'] as const)(
    'rejects inconsistent ledger %s',
    (kind) => {
      const definition = workflow([traceAssertion, stateAssertion]);
      const value = result(definition);
      if (kind === 'orphan') value.record.events[4].operationId = 'missing';
      if (kind === 'duplicate') value.record.events[6].operationId = 'model-1';
      if (kind === 'hash') value.record.events[4].requestedCallIdHash = 'f'.repeat(64);
      if (kind === 'counter') value.record.budgets.toolCalls = 2;
      if (kind === 'gap') value.record.events[1].sequence = 99;
      expect(evaluateWorkflowDeterministicOutcomes(definition, value).counts.invalid).toBe(2);
    }
  );
  test('duplicate requested call hashes cannot inflate successful tool counts', () => {
    const definition = workflow([traceAssertion]);
    const value = result(definition);
    value.record.events.splice(
      7,
      0,
      { ...value.record.events[3], operationId: 'tool-2', sequence: 8 },
      { ...value.record.events[4], operationId: 'tool-2', sequence: 9 }
    );
    value.record.events[9].sequence = 10;
    value.record.budgets.toolCalls = 2;
    value.record.budgets.actions = 4;
    expect(evaluateWorkflowDeterministicOutcomes(definition, value).status).toBe('invalid');
  });
  test('v2 execution_finished seals execution independently of later evaluation events', () => {
    const definition = workflow([traceAssertion]);
    const value = result(definition);
    const record = value.record as unknown as Record<string, unknown>;
    record.schemaVersion = '2';
    record.purpose = 'workflow';
    const events = record.events as Record<string, unknown>[];
    events[7].type = 'execution_finished';
    expect(evaluateWorkflowDeterministicOutcomes(definition, value).status).toBe('passed');
    events.push(
      { sequence: 9, elapsedMs: 25, type: 'evaluation_started', phase: 'evaluation' },
      {
        sequence: 10,
        elapsedMs: 30,
        type: 'evaluation_completed',
        phase: 'evaluation',
        status: 'completed',
      },
      { sequence: 11, elapsedMs: 35, type: 'finished', phase: 'execution', status: 'completed' }
    );
    expect(evaluateWorkflowDeterministicOutcomes(definition, value).status).toBe('passed');
    record.purpose = 'preflight';
    expect(evaluateWorkflowDeterministicOutcomes(definition, value).status).toBe('unavailable');
  });
  test.each(['1', '2'])(
    'validates lifecycle structure and failure contradictions for v%s',
    (version) => {
      const definition = workflow([traceAssertion]);
      for (const mutation of [
        'start_phase',
        'start_status',
        'start_operation',
        'duplicate_start',
        'boundary_phase',
        'boundary_status',
        'boundary_operation',
        'failed_tool',
        'failed_execution',
      ]) {
        const value = result(definition);
        const record = value.record as unknown as Record<string, unknown>;
        record.schemaVersion = version;
        const events = record.events as Record<string, unknown>[];
        if (version === '2') events[7].type = 'execution_finished';
        if (mutation === 'start_phase') events[0].phase = 'preflight';
        if (mutation === 'start_status') events[0].status = 'completed';
        if (mutation === 'start_operation') events[0].operationId = 'model-1';
        if (mutation === 'duplicate_start') {
          events.splice(1, 0, { ...events[0] });
          events.forEach((event, index) => {
            event.sequence = index + 1;
          });
        }
        if (mutation === 'boundary_phase') events[7].phase = 'evaluation';
        if (mutation === 'boundary_status') events[7].status = 'failed';
        if (mutation === 'boundary_operation') events[7].tool = 'calculator';
        if (mutation === 'failed_tool') events[4].status = 'failed';
        if (mutation === 'failed_execution') record.execution = 'failed';
        expect(evaluateWorkflowDeterministicOutcomes(definition, value).status).toBe('invalid');
      }
    }
  );
  test('policy denial never passes, and failed policy remains a valid denominator member', () => {
    const definition = workflow([policyAssertion]);
    const value = result(definition);
    value.record.policy = 'denied';
    value.record.execution = 'invalid';
    value.record.events[7].status = 'failed';
    const measured = evaluateWorkflowDeterministicOutcomes(definition, value);
    expect(measured.status).toBe('failed');
    expect(measured.counts.valid).toBe(1);
  });
  test('budget policy distinguishes breaches from missing token measurement', () => {
    const definition = workflow([
      { type: 'policy', rule: 'budgets_respected', expected: 'passed' },
    ]);
    definition.environment.policy.budgets.max_tokens = 100;
    const value = result(definition);
    value.record.usage.status = 'partial';
    value.record.usage.missingRequests = 1;
    expect(evaluateWorkflowDeterministicOutcomes(definition, value).status).toBe('unavailable');
    value.record.execution = 'budget_exceeded';
    value.record.events[7].status = 'failed';
    expect(evaluateWorkflowDeterministicOutcomes(definition, value).status).toBe('failed');
  });
  test('JSON-schema file/state assertions use typed subset and count mismatches as valid failures', () => {
    const schema = {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1, maximum: 5 } },
      required: ['count'],
      additionalProperties: false,
    };
    const definition = workflow([
      { type: 'json_schema', source: 'file', path: 'data.json', schema },
      { type: 'json_schema', source: 'workflow_state', path: 'data', schema },
    ]);
    const measured = evaluateWorkflowDeterministicOutcomes(
      definition,
      result(definition, {
        files: { 'data.json': '{"count":3}' },
        workflow_state: { data: { count: '3' } },
      })
    );
    expect(measured.assertions.map((entry) => entry.status)).toEqual(['passed', 'failed']);
    expect(measured.counts.valid).toBe(2);
  });
  test.each(['not json', '{"count":1,"count":2}', '{"__proto__":{}}'])(
    'strict JSON artifact rejects %s without echoing it',
    (content) => {
      const definition = workflow([
        { type: 'json_schema', source: 'file', path: 'data.json', schema: { type: 'object' } },
      ]);
      const measured = evaluateWorkflowDeterministicOutcomes(
        definition,
        result(definition, { files: { 'data.json': content } })
      );
      expect(measured.status).toBe('failed');
      expect(measured.assertions[0].reason).toBe('malformed_json');
    }
  );
  test('getter/prototype boundaries return invalid metadata without executing getters', () => {
    const definition = workflow([stateAssertion]);
    let invoked = false;
    const value = result(definition);
    Object.defineProperty(value, 'record', {
      enumerable: true,
      get() {
        invoked = true;
        throw new Error('SECRET');
      },
    });
    expect(evaluateWorkflowDeterministicOutcomes(definition, value).status).toBe('invalid');
    expect(invoked).toBe(false);
    const other = result(definition);
    other.state = JSON.parse('{"__proto__":{}}');
    expect(evaluateWorkflowDeterministicOutcomes(definition, other).status).toBe('invalid');
  });
  test('bounded metadata redacts criterion content and does not mutate inputs', () => {
    const definition = workflow([
      { type: 'workflow_state', path: 'sensitive', equals: 'SECRET-EXPECTED' },
    ]);
    const value = result(definition, { workflow_state: { sensitive: 'SECRET-ACTUAL' } });
    const before = structuredClone({ definition, value });
    const measured = evaluateWorkflowDeterministicOutcomes(definition, value);
    expect(JSON.stringify(measured)).not.toContain('SECRET');
    expect(JSON.stringify(measured)).not.toContain('sensitive');
    expect(measured.assertions[0].criterionSha256).toHaveLength(64);
    expect({ definition, value }).toEqual(before);
  });
  test('invalid declarations remain invalid and cannot manufacture passing assertions', () => {
    const definition = workflow([stateAssertion]);
    (definition.outcomes.deterministic as unknown[]).push({
      type: 'json_schema',
      source: 'file',
      path: 'x',
      schema: { $ref: 'https://forbidden' },
    });
    expect(evaluateWorkflowDeterministicOutcomes(definition, result(definition)).status).toBe(
      'invalid'
    );
  });
});
