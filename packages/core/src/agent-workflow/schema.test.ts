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
  test('preserves readable Unicode and punctuation in names without accepting blank names', () => {
    for (const name of ['review: [draft]', 'Àyẹ̀wò ìwé', 'مراجعة المستند']) {
      expect(parseAgentWorkflow(stringify({ ...fixture(), name })).name).toBe(name);
    }
    expect(AgentWorkflowSchema.safeParse({ ...fixture(), name: '   ' }).success).toBe(false);
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

describe('bounded typed JSON Schema outcome declarations', () => {
  function withSchema(schema: unknown, source = 'workflow_state', path = 'result') {
    return {
      ...fixture(),
      outcomes: { deterministic: [{ type: 'json_schema', source, path, schema }] },
    };
  }
  test('supports typed object/array/scalar trees with finite constraints and no mutation keywords', () => {
    const schema = {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', minLength: 1, maxLength: 20 },
              value: { type: 'number', minimum: 0, maximum: 10 },
              approved: { type: 'boolean', const: false },
            },
            required: ['label'],
            additionalProperties: false,
          },
        },
      },
      required: ['rows'],
      additionalProperties: false,
    };
    expect(AgentWorkflowSchema.safeParse(withSchema(schema)).success).toBe(true);
    expect(
      AgentWorkflowSchema.safeParse(
        withSchema({ type: 'string', enum: ['pending', 'complete'] }, 'file', 'result.json')
      ).success
    ).toBe(true);
  });
  test.each([
    { $ref: '#' },
    { type: 'string', pattern: '(a+)+$' },
    { type: 'string', format: 'email' },
    { type: 'object', additionalProperties: { type: 'string' } },
    { type: ['string', 'null'] },
    { type: 'object', properties: { field: { type: 'string', default: 'x' } } },
    { type: 'object', required: ['missing'] },
    { type: 'array', items: [{ type: 'string' }] },
    { type: 'integer', minimum: 5, maximum: 2 },
    { type: 'string', maxLength: 16385 },
    { type: 'array', maxItems: 1001 },
    { type: 'string', minLength: 1, maximum: 4 },
    { type: 'string', enum: [] },
    { type: 'object', allOf: [] },
    { type: 'object', $schema: 'https://json-schema.org/draft-07/schema' },
    {},
  ])(
    'rejects unsupported, remote, regex, applicator and inconsistent schemas offline',
    (schema) => {
      expect(AgentWorkflowSchema.safeParse(withSchema(schema)).success).toBe(false);
    }
  );
  test('schema source chooses the matching safe state or file path grammar', () => {
    expect(
      AgentWorkflowSchema.safeParse(withSchema({ type: 'string' }, 'workflow_state', 'a/b')).success
    ).toBe(false);
    expect(
      AgentWorkflowSchema.safeParse(withSchema({ type: 'string' }, 'file', '../x.json')).success
    ).toBe(false);
    expect(
      AgentWorkflowSchema.safeParse(
        withSchema({ type: 'string' }, 'workflow_state', 'constructor.x')
      ).success
    ).toBe(false);
  });
  test('rejects schema trees above the bounded depth and serialized-size limits', () => {
    let schema: Record<string, unknown> = { type: 'string' };
    for (let index = 0; index < 10; index++) schema = { type: 'array', items: schema };
    expect(AgentWorkflowSchema.safeParse(withSchema(schema)).success).toBe(false);
    expect(
      AgentWorkflowSchema.safeParse(withSchema({ type: 'string', const: 'x'.repeat(16385) }))
        .success
    ).toBe(false);
  });
});

describe('declared workflow faults', () => {
  test('accepts declared bounded faults without granting undeclared tools', () => {
    const fault = {
      id: 'read-unavailable',
      tool: 'read_document',
      occurrence: 1,
      kind: 'unavailable_tool',
    };
    const scenario = { ...fixture(), faults: [fault], retry: { max_attempts: 2 } };
    expect(AgentWorkflowSchema.parse(scenario).faults).toEqual([fault]);
    expect(
      AgentWorkflowSchema.safeParse({ ...scenario, faults: [{ ...fault, tool: 'read_file' }] })
        .success
    ).toBe(false);
    expect(AgentWorkflowSchema.safeParse({ ...scenario, retry: { max_attempts: 6 } }).success).toBe(
      false
    );
  });
  test('rejects executable roots before Zod classification across sync/async APIs', async () => {
    let traps = 0;
    const proxy = new Proxy(
      {},
      {
        get() {
          traps++;
          throw new Error('private');
        },
        getPrototypeOf() {
          traps++;
          throw new Error('private');
        },
      }
    );
    for (const input of [proxy, { ...fixture(), faults: [proxy] }]) {
      expect(AgentWorkflowSchema.safeParse(input).success).toBe(false);
      expect((await AgentWorkflowSchema.safeParseAsync(input)).success).toBe(false);
      expect((await AgentWorkflowSchema.spa(input)).success).toBe(false);
      expect(() => validateAgentWorkflow(input)).toThrow('Invalid agent workflow');
    }
    expect(traps).toBe(0);
  });
  test('rejects array subclasses with inherited executable classification', () => {
    let reads = 0;
    class HostileArray extends Array {}
    Object.defineProperty(HostileArray.prototype, 'then', {
      get() {
        reads++;
        throw new Error('private');
      },
    });
    expect(isWorkflowJson(new HostileArray())).toBe(false);
    expect(reads).toBe(0);
  });
});
