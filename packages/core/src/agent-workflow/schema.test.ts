import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { loadAgentWorkflow, parseAgentWorkflow, validateAgentWorkflow } from './parser';
import { AgentWorkflowSchema, isWorkflowJson } from './schema';

function fixture() {
  return {
    version: '1',
    kind: 'agent_workflow',
    name: 'document-review',
    target: { provider: 'openai', model: 'configured-by-runner' },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'approval_required',
        permissions: { documents: 'read', records: 'read', workflow_state: 'write' },
        budgets: { max_actions: 10, max_tool_calls: 12, timeout_ms: 60_000, max_tokens: 4000 },
      },
    },
    tools: ['search', 'read_document', 'query_records', 'request_approval', 'record_decision'],
    workflow: {
      system_instructions: 'Request review when uncertain.',
      initial_state: 'fixtures/review-state.yaml',
      turns: [
        { role: 'user', content: 'Review material.' },
        { role: 'user', content: 'Explain the handoff.' },
      ],
    },
    outcomes: {
      deterministic: [
        { type: 'workflow_state', path: 'approvals.requested', equals: true },
        { type: 'tool_trace', tool: 'request_approval', minimum_calls: 1 },
        { type: 'policy', rule: 'no_undeclared_tool', expected: 'passed' },
      ],
      semantic: [{ type: 'llm_judge', rubric: 'Explains uncertainty.', mode: 'strict_assurance' }],
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  };
}

describe('agent workflow v1 contract', () => {
  test('loads only the selected scenario without reading referenced fixtures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'artemiskit-workflow-'));
    try {
      const path = join(directory, 'scenario.yaml');
      await writeFile(path, stringify(fixture()));
      expect((await loadAgentWorkflow(path)).workflow.initial_state).toBe(
        'fixtures/review-state.yaml'
      );
      await expect(loadAgentWorkflow(join(directory, 'missing.yaml'))).rejects.toThrow(
        'Failed to read'
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  test('parses reviewable multi-turn YAML and keeps fixture references unresolved', () => {
    expect(parseAgentWorkflow(stringify(fixture()))).toEqual(fixture());
  });
  test('accepts inline controlled JSON state', () => {
    const value = {
      ...fixture(),
      workflow: {
        ...fixture().workflow,
        initial_state: { documents: { policy: 'Human review required' }, workflow_state: {} },
      },
    };
    expect(validateAgentWorkflow(value).workflow.initial_state).toEqual(
      value.workflow.initial_state
    );
  });
  test('does not expand secrets from environment variables', () => {
    const value = fixture();
    value.workflow.system_instructions = '${SECRET_TOKEN}';
    expect(parseAgentWorkflow(stringify(value)).workflow.system_instructions).toBe(
      '${SECRET_TOKEN}'
    );
  });
  test.each([
    '../private.yaml',
    '/tmp/private.yaml',
    'https://example.com/file',
    'C:\\file',
    'a/../../x',
    'a//b',
    'a/constructor/b',
    'a/./b',
  ])('rejects unsafe fixture path %s', (path) => {
    const value = fixture();
    value.workflow.initial_state = path;
    expect(() => validateAgentWorkflow(value)).toThrow();
  });
  test.each(['constructor.x', '__proto__.x', 'x.prototype', 'a..b', '/absolute', 'x[0]'])(
    'rejects unsafe outcome path %s',
    (path) => {
      const value = fixture();
      value.outcomes.deterministic[0].path = path;
      expect(() => validateAgentWorkflow(value)).toThrow();
    }
  );
  test('rejects unknown fields, versions, tools, duplicate tools and ungranted authority', () => {
    expect(AgentWorkflowSchema.safeParse({ ...fixture(), hidden: true }).success).toBe(false);
    expect(AgentWorkflowSchema.safeParse({ ...fixture(), version: '2' }).success).toBe(false);
    expect(AgentWorkflowSchema.safeParse({ ...fixture(), tools: ['send_message'] }).success).toBe(
      false
    );
    expect(
      AgentWorkflowSchema.safeParse({ ...fixture(), tools: ['search', 'search'] }).success
    ).toBe(false);
    expect(AgentWorkflowSchema.safeParse({ ...fixture(), tools: ['write_file'] }).success).toBe(
      false
    );
    const value = fixture();
    value.target = { ...value.target, secret: 'not-allowed' } as typeof value.target;
    expect(AgentWorkflowSchema.safeParse(value).success).toBe(false);
  });
  test('requires independent deterministic evidence and strict-only semantic judging', () => {
    const value = fixture();
    value.outcomes.deterministic = [];
    expect(AgentWorkflowSchema.safeParse(value).success).toBe(false);
    const other = fixture();
    other.outcomes.semantic[0].mode = 'legacy';
    expect(AgentWorkflowSchema.safeParse(other).success).toBe(false);
  });
  test('rejects inconsistent outcome references and call bounds', () => {
    const value = fixture();
    value.tools = ['search'];
    expect(AgentWorkflowSchema.safeParse(value).success).toBe(false);
    const other = fixture();
    other.outcomes.deterministic = [
      {
        type: 'tool_trace',
        tool: 'search',
        minimum_calls: 2,
        maximum_calls: 1,
      } as (typeof other.outcomes.deterministic)[number],
    ];
    expect(AgentWorkflowSchema.safeParse(other).success).toBe(false);
    expect(
      AgentWorkflowSchema.safeParse({
        ...fixture(),
        outcomes: {
          deterministic: [{ type: 'file', path: 'note.txt', exists: false, equals: 'impossible' }],
        },
      }).success
    ).toBe(false);
  });
  test.each([0, -1, 1001, Number.POSITIVE_INFINITY])(
    'rejects invalid action budget %s',
    (count) => {
      const value = fixture();
      value.environment.policy.budgets.max_actions = count;
      expect(AgentWorkflowSchema.safeParse(value).success).toBe(false);
    }
  );
  test('rejects unsupported environments, side effects, network grants and unredacted evidence', () => {
    for (const change of [
      { network: 'allowed' },
      { side_effects: 'allowed' },
      { commands: ['sh'] },
    ]) {
      const value = fixture();
      Object.assign(value.environment.policy, change);
      expect(AgentWorkflowSchema.safeParse(value).success).toBe(false);
    }
    const value = fixture();
    value.environment.type = 'external';
    expect(AgentWorkflowSchema.safeParse(value).success).toBe(false);
    const other = fixture();
    other.evidence.redact = false;
    expect(AgentWorkflowSchema.safeParse(other).success).toBe(false);
  });
  test('rejects prototype keys, accessors, cycles, sparse arrays and non-JSON values', () => {
    expect(isWorkflowJson(JSON.parse('{"__proto__":{"polluted":true}}'))).toBe(false);
    expect(isWorkflowJson({ nested: { constructor: 'unsafe' } })).toBe(false);
    expect(
      isWorkflowJson({
        get secret() {
          throw new Error('must not run');
        },
      })
    ).toBe(false);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isWorkflowJson(cyclic)).toBe(false);
    expect(isWorkflowJson(new Array(1_000_000))).toBe(false);
    expect(isWorkflowJson({ date: new Date() })).toBe(false);
    expect(isWorkflowJson({ missing: undefined })).toBe(false);
    expect(isWorkflowJson({ enormous: 'x'.repeat(1_048_577) })).toBe(false);
  });
  test('rejects malformed/duplicate YAML, custom tags, aliases and oversized input', () => {
    for (const yaml of [
      'name: [',
      'name: a\nname: b',
      'value: !secret abc',
      'value: &x [1]\nother: *x',
      'x'.repeat(1_048_577),
    ])
      expect(() => parseAgentWorkflow(yaml)).toThrow();
  });
  test('diagnostics do not echo malicious YAML or raw secret values', () => {
    try {
      parseAgentWorkflow('secret: [DO-NOT-LEAK');
    } catch (error) {
      expect(String(error)).not.toContain('DO-NOT-LEAK');
    }
  });
});
