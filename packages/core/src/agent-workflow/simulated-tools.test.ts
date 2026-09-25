import { describe, expect, test } from 'bun:test';
import { getWorkflowTool, listWorkflowTools } from './catalog';
import type { WorkflowPolicy } from './schema';
import { executeSimulatedTool } from './simulated-tools';

const policy: WorkflowPolicy = {
  network: 'denied',
  side_effects: 'denied',
  permissions: {
    documents: 'read',
    records: 'read',
    files: 'write',
    workflow_state: 'write',
    communication: 'write',
    coordination: 'write',
  },
  budgets: { max_actions: 10, timeout_ms: 60_000 },
};
const declaredTools = listWorkflowTools().map((tool) => tool.id);
function call(tool: string, input: unknown, state: unknown = {}) {
  return executeSimulatedTool({ tool, input, state, policy, declaredTools });
}

describe('deterministic simulated tool catalog', () => {
  test('descriptors cover all families and are defensive copies', () => {
    const tools = listWorkflowTools();
    expect(new Set(tools.map((tool) => tool.family)).size).toBe(9);
    for (const tool of tools) {
      expect(tool.version).toBe('1');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      expect(tool.authority.network).toBe('denied');
      expect(tool.failureModes.length).toBeGreaterThan(0);
    }
    tools[0].authority.network = 'allowed' as 'denied';
    expect(getWorkflowTool('search')?.authority.network).toBe('denied');
    expect(getWorkflowTool('send_message')).toBeUndefined();
  });
  test('search/document reads and structured records use only declared state', () => {
    const state = {
      documents: { a: 'Policy REVIEW', b: 'unrelated' },
      records: { orders: [{ id: 1, approved: false }] },
    };
    const search = call('search', { query: 'review' }, state);
    expect(search.status === 'succeeded' && search.output).toEqual({ matches: [{ id: 'a' }] });
    const read = call('read_document', { id: 'a' }, state);
    expect(read.status === 'succeeded' && read.output).toEqual({
      id: 'a',
      content: 'Policy REVIEW',
    });
    const records = call('query_records', { collection: 'orders' }, state);
    expect(records.status === 'succeeded' && records.output).toEqual({
      records: [{ id: 1, approved: false }],
    });
  });
  test('file writes are isolated from fixtures and independent calls', () => {
    const state = { files: { 'notes/a.txt': 'before' } };
    const first = call('write_file', { path: 'notes/a.txt', content: 'after' }, state);
    expect(state.files['notes/a.txt']).toBe('before');
    expect(first.status === 'succeeded' && first.state.files).toEqual({ 'notes/a.txt': 'after' });
    const read = call('read_file', { path: 'notes/a.txt' }, state);
    expect(read.status === 'succeeded' && read.output).toEqual({ content: 'before' });
  });
  test.each(['../x', '/etc/passwd', 'a/../../x', 'a//b', 'a/constructor/b', 'C:\\private'])(
    'denies unsafe file input %s',
    (path) => {
      expect(call('write_file', { path, content: 'unsafe' }).status).toBe('invalid');
    }
  );
  test('calculator uses explicit finite operations and rejects executable expressions', () => {
    const result = call('calculator', { operation: 'multiply', a: 6, b: 7 });
    expect(result.status === 'succeeded' && result.output).toEqual({ value: 42 });
    expect(call('calculator', { operation: 'divide', a: 1, b: 0 }).status).toBe('failed');
    expect(call('calculator', { operation: 'eval', a: 1, b: 2 }).status).toBe('invalid');
    expect(call('calculator', { operation: 'add', a: '1', b: 2 }).status).toBe('invalid');
    expect(call('calculator', { operation: 'add', a: Number.NaN, b: 2 }).status).toBe('invalid');
  });
  test('approval requests remain pending and decisions cannot change policy', () => {
    const state = { workflow_state: {} };
    const result = call('request_approval', { reason: 'Needs human review' }, state);
    expect(result.status === 'succeeded' && result.output).toEqual({
      requested: true,
      status: 'pending',
    });
    expect(state.workflow_state).toEqual({});
    const decision = call('record_decision', { decision: 'Propose review' });
    expect(decision.status === 'succeeded' && decision.state.workflow_state).toEqual({
      decision: 'Propose review',
    });
    expect(call('request_approval', { reason: 'review', approved: true }).status).toBe('invalid');
  });
  test('communication and delegation create only pending local records', () => {
    const draft = call('draft_message', { recipient: 'reviewer', body: 'Review please' });
    expect(draft.status === 'succeeded' && draft.output).toEqual({
      id: 'draft-1',
      status: 'draft',
    });
    const task = call('delegate_task', { task: 'Inspect policy' });
    expect(task.status === 'succeeded' && task.output).toEqual({ id: 'task-1', status: 'pending' });
    if (task.status !== 'succeeded') throw new Error('Expected task');
    const status = call('get_task_status', { id: 'task-1' }, task.state);
    expect(status.status === 'succeeded' && status.output).toEqual({
      id: 'task-1',
      status: 'pending',
    });
    expect(call('send_message', { recipient: 'reviewer' }).status).toBe('denied');
  });
  test('enforces declared tools and permissions at execution, regardless of prior schema validation', () => {
    expect(
      executeSimulatedTool({
        tool: 'search',
        input: { query: 'a' },
        state: {},
        policy,
        declaredTools: [],
      }).status
    ).toBe('denied');
    expect(
      executeSimulatedTool({
        tool: 'write_file',
        input: { path: 'x', content: 'x' },
        state: {},
        policy: { ...policy, permissions: { files: 'read' } },
        declaredTools,
      }).status
    ).toBe('denied');
    expect(
      executeSimulatedTool({
        tool: 'search',
        input: { query: 'a' },
        state: {},
        policy: { ...policy, network: 'allowed' } as unknown as WorkflowPolicy,
        declaredTools,
      }).status
    ).toBe('denied');
  });
  test('handles unavailable and malformed fixture data without exposing raw input in evidence', () => {
    expect(call('read_document', { id: 'missing' }).status).toBe('failed');
    expect(
      call('query_records', { collection: 'orders' }, { records: { orders: ['invalid'] } }).status
    ).toBe('failed');
    expect(call('read_document', { id: 'constructor' }).status).toBe('invalid');
    expect(
      call('read_document', { id: 'a' }, JSON.parse('{"__proto__":{"secret":"x"}}')).status
    ).toBe('invalid');
    const result = call('draft_message', { recipient: 'SECRET_RECIPIENT', body: 'SECRET_BODY' });
    expect(JSON.stringify(result.evidence)).not.toContain('SECRET');
    const unknown = call('SECRET_TOOL', {});
    expect(JSON.stringify(unknown.evidence)).not.toContain('SECRET');
  });
  test('output and state have no mutable aliases and empty reads do not mutate state', () => {
    const result = call('get_workflow_state', {}, { workflow_state: { approved: false } });
    if (result.status !== 'succeeded') throw new Error('Expected state');
    (result.output as { state: { approved: boolean } }).state.approved = true;
    expect(result.state.workflow_state).toEqual({ approved: false });
    const empty = call('get_workflow_state', {});
    expect(empty.status === 'succeeded' && empty.state).toEqual({});
  });
  test('bounds oversized output and fixture state', () => {
    expect(
      call('read_document', { id: 'a' }, { documents: { a: 'x'.repeat(20_000) } }).status
    ).toBe('failed');
    expect(call('search', { query: 'x' }, { documents: { a: 'x'.repeat(1_048_577) } }).status).toBe(
      'invalid'
    );
  });
});
