import { beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SavedWorkflowRecord, readWorkflowRecord, runAgentWorkflow } from '@artemiskit/core';
import { createWorkflowReport } from './model';
import { reportJudge, reportTarget, reportWorkflow } from './model-fixtures';

let passed: SavedWorkflowRecord;
let failed: SavedWorkflowRecord;
let paused: SavedWorkflowRecord;
let resumed: SavedWorkflowRecord;
let preflight: SavedWorkflowRecord;
let invalid: SavedWorkflowRecord;
let partial: SavedWorkflowRecord;
let semantic: SavedWorkflowRecord;
const historical = JSON.parse(
  readFileSync(
    new URL('../../../../docs/releases/0.6.1-local-models.json', import.meta.url),
    'utf8'
  )
).runs[0].record;
beforeAll(async () => {
  const run = async (options: Parameters<typeof runAgentWorkflow>[0]) =>
    readWorkflowRecord((await runAgentWorkflow(options)).record);
  passed = await run({ workflow: reportWorkflow(), target: reportTarget() });
  failed = await run({ workflow: reportWorkflow(), target: reportTarget({ write: false }) });
  preflight = await run({
    workflow: reportWorkflow(),
    target: reportTarget(),
    preflightOnly: true,
  });
  partial = await run({ workflow: reportWorkflow(), target: reportTarget({ missingUsage: true }) });
  const qualitative = reportWorkflow();
  qualitative.outcomes.semantic = [
    { type: 'llm_judge', mode: 'strict_assurance', rubric: 'PRIVATE-RUBRIC' },
  ];
  invalid = await run({
    workflow: qualitative,
    target: reportTarget(),
    semanticJudge: reportJudge('PRIVATE-INVALID-JUDGMENT'),
  });
  semantic = await run({
    workflow: qualitative,
    target: reportTarget(),
    semanticJudge: reportJudge(),
  });
  const directory = join(await mkdtemp(join(tmpdir(), 'artemis-report-fixture-')), 'checkpoint');
  const workflow = reportWorkflow();
  workflow.faults = [
    { id: 'PRIVATE-FAULT', tool: 'write_file', occurrence: 1, kind: 'unavailable_tool' },
  ];
  workflow.retry = { max_attempts: 2 };
  paused = await run({
    workflow,
    target: reportTarget(),
    checkpoint: { directory, mode: 'create', configurationId: 'PRIVATE-CONFIG' },
    pauseAfterActions: 3,
  });
  resumed = await run({
    workflow,
    target: reportTarget(),
    checkpoint: { directory, mode: 'resume', configurationId: 'PRIVATE-CONFIG' },
  });
});
function reverseKeys(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reverseKeys);
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseKeys(item)])
  );
}
function dereference(record: unknown, path: string): unknown {
  return path === ''
    ? record
    : path
        .slice(1)
        .split('/')
        .reduce((value, key) => (value as Record<string, unknown>)[key], record);
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

describe('canonical workflow assessment', () => {
  test('deterministic over collection order, object key order, strings and detached inputs', () => {
    const inputs = [passed, failed, historical, paused, resumed, invalid, preflight, partial];
    const before = JSON.stringify(inputs);
    const a = createWorkflowReport(inputs);
    expect(createWorkflowReport(reverseKeys([...inputs].reverse()))).toEqual(a);
    expect(createWorkflowReport(JSON.stringify(inputs))).toEqual(a);
    expect(createWorkflowReport(inputs.map((v) => JSON.stringify(v)))).toEqual(a);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(a.summary).toMatchObject({
      records: 8,
      logicalRuns: 7,
      eligible: 3,
      passed: 2,
      failed: 1,
      invalid: 1,
      unavailable: 1,
      preflight: 1,
      historical: 1,
      supersededAttempts: 1,
      taskSuccessRate: 2 / 3,
    });
    expect(a.sections.map((s) => s.id)).toEqual([
      'runs',
      'configuration',
      'assertions',
      'usage',
      'cleanup',
      'recovery',
    ]);
  });
  test('duplicates do not improve task rate and resumed counters are never added', () => {
    const a = createWorkflowReport([paused, resumed, resumed, passed, failed]);
    expect(a.summary).toMatchObject({
      records: 5,
      duplicateRecords: 1,
      logicalRuns: 3,
      eligible: 3,
      passed: 2,
      failed: 1,
      supersededAttempts: 1,
    });
    expect(a.sections[0].rows).toHaveLength(4);
    expect(
      a.sections
        .find((s) => s.id === 'usage')
        ?.rows.filter((r) => r.cells[1] === 'Cumulative execution budget use')
        .map((r) => r.cells[2])
    ).toContain(
      `actions 5; target invocations 2; tool calls 3; elapsed ms ${resumed.budgets.elapsedMs}; token overshoot 0`
    );
    expect(
      a.findings.some((f) => f.title === 'Declared faults recovered within retry policy')
    ).toBe(true);
  });
  test('all references resolve to real evidence with stable digests and safe ids', () => {
    const source = [
      passed,
      failed,
      historical,
      paused,
      resumed,
      invalid,
      preflight,
      partial,
      semantic,
    ];
    const report = createWorkflowReport(source);
    const records = new Map(
      source.map((record) => [
        `r-${createHash('sha256').update(canonical(record)).digest('hex')}`,
        record,
      ])
    );
    const refs = new Set(report.evidence.map((e) => e.id));
    for (const item of [...report.findings, ...report.sections.flatMap((s) => s.rows)]) {
      expect(item.id).toMatch(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/);
      expect(item.evidenceIds.length).toBeGreaterThan(0);
      expect(item.evidenceIds.every((id) => refs.has(id))).toBe(true);
    }
    for (const e of report.evidence) {
      const actual = dereference(records.get(e.recordId), e.path);
      expect(actual).not.toBeUndefined();
      expect(createHash('sha256').update(canonical(actual)).digest('hex')).toBe(e.sha256);
    }
    expect(report.findings.some((f) => f.level === 'strength')).toBe(true);
    expect(report.findings.some((f) => f.level === 'risk')).toBe(true);
    expect(report.findings.some((f) => f.level === 'limitation')).toBe(true);
  });
  test('redacts arbitrary labels, operation identifiers and private working content', () => {
    const text = JSON.stringify(createWorkflowReport([passed, paused, resumed, semantic]));
    for (const secret of ['PRIVATE-', 'one.txt', 'two.txt', 'tool-1', 'model-1', 'call-one'])
      expect(text).not.toContain(secret);
    if (resumed.schemaVersion === '3') {
      expect(text).not.toContain(resumed.recovery.runId);
      expect(text).not.toContain(resumed.recovery.attemptId);
    }
    expect(text).toContain('native / unavailable');
    expect(text).toContain('Transport attempts / cost');
    expect(text).toContain('Preflight subset of target');
    expect(text).toContain('Independent judge usage');
    expect(text).toContain('not cryptographic proof');
  });
  test('historical/preflight/invalid/unavailable evidence remains visible without an eligible rate', () => {
    const report = createWorkflowReport([historical, preflight, invalid, partial]);
    expect(report.summary).toMatchObject({
      records: 4,
      eligible: 0,
      taskSuccessRate: null,
      historical: 1,
      preflight: 1,
      invalid: 1,
      unavailable: 1,
    });
    expect(report.sections[0].rows).toHaveLength(4);
    expect(report.findings.some((f) => f.title === 'Target usage is incomplete')).toBe(true);
  });
  test('refuses conflicting attempts, same ordinal, changed identities and cumulative regressions', () => {
    if (paused.schemaVersion !== '3' || resumed.schemaVersion !== '3')
      throw new Error('Expected V3 fixtures');
    const conflict = structuredClone(resumed);
    conflict.budgets.elapsedMs++;
    expect(() => createWorkflowReport([resumed, conflict])).toThrow(
      'ambiguous workflow report evidence'
    );
    const ordinal = structuredClone(resumed);
    ordinal.recovery.attempts = 1;
    expect(() => createWorkflowReport([paused, ordinal])).toThrow(
      'ambiguous workflow report evidence'
    );
    const changed = structuredClone(resumed);
    changed.recovery.configurationSha256 = 'a'.repeat(64);
    expect(() => createWorkflowReport([paused, changed])).toThrow(
      'ambiguous workflow report evidence'
    );
    const earlier = structuredClone(paused);
    earlier.budgets.elapsedMs = resumed.budgets.elapsedMs + 10;
    expect(() => createWorkflowReport([earlier, resumed])).toThrow(
      'ambiguous workflow report evidence'
    );
    const changedCriterion = structuredClone(resumed);
    changedCriterion.outcomes.deterministic.assertions[0].criterionSha256 = 'a'.repeat(64);
    expect(() => createWorkflowReport([paused, changedCriterion])).toThrow(
      'ambiguous workflow report evidence'
    );
  });
  test('policy denial, absent configuration and omitted evidence remain explicit', async () => {
    const workflow = reportWorkflow();
    workflow.environment.policy.paths = { read: [], write: ['allowed.txt'] };
    const denied = readWorkflowRecord(
      (await runAgentWorkflow({ workflow, target: reportTarget() })).record
    );
    const unknown = readWorkflowRecord(
      (await runAgentWorkflow({ workflow: {}, target: reportTarget() })).record
    );
    const omitted = structuredClone(passed);
    omitted.droppedEvents = 1;
    omitted.artifacts.omittedFiles = 2;
    readWorkflowRecord(omitted);
    const report = createWorkflowReport([denied, unknown, omitted]);
    expect(report.findings.some((f) => f.title === 'Policy boundary denied an action')).toBe(true);
    expect(report.findings.some((f) => f.title === 'Evidence was omitted')).toBe(true);
    expect(report.sections[0].rows).toHaveLength(3);
    const source = [denied, unknown, omitted];
    const records = new Map(
      source.map((record) => [
        `r-${createHash('sha256').update(canonical(record)).digest('hex')}`,
        record,
      ])
    );
    for (const e of report.evidence)
      expect(dereference(records.get(e.recordId), e.path)).not.toBeUndefined();
    expect(
      report.sections
        .find((section) => section.id === 'assertions')
        ?.rows.some((r) => r.cells[3] === 'coverage counts')
    ).toBe(true);
  });
  test('latest attempt alone is accepted without inventing prior attempt evidence', () => {
    const report = createWorkflowReport(resumed);
    expect(report.findings.some((f) => f.title === 'Prior attempt records are missing')).toBe(true);
    expect(report.summary).toMatchObject({
      records: 1,
      logicalRuns: 1,
      eligible: 1,
      supersededAttempts: 0,
    });
    expect(
      report.findings.some((f) => f.title === 'Checkpoint recovery has bounded guarantees')
    ).toBe(true);
  });
});

describe('hostile and bounded report inputs', () => {
  test('rejects unsupported inputs with generic secret-free diagnostics', () => {
    for (const input of [
      null,
      {},
      [],
      Array(51).fill(passed),
      '{"PRIVATE-CREDENTIAL":',
      { schemaVersion: '4' },
      { payload: 'PRIVATE-CHECKPOINT' },
      { runs: [passed] },
      { ...passed, transcript: ['PRIVATE-PROMPT'] },
    ])
      expect(() => createWorkflowReport(input)).toThrow(
        'Invalid, unsupported or ambiguous workflow report evidence'
      );
    expect(() => createWorkflowReport(' '.repeat(8 * 1024 * 1024 + 1))).toThrow(
      'Invalid, unsupported or ambiguous workflow report evidence'
    );
  });
  test('does not invoke getters, proxy traps, toJSON or custom iterators', () => {
    let called = 0;
    const hostile = () => {
      called++;
      throw new Error('PRIVATE-SECRET');
    };
    const getter = Object.defineProperty({}, 'schemaVersion', { enumerable: true, get: hostile });
    const arrayGetter = Object.defineProperty([passed], '0', { enumerable: true, get: hostile });
    const proxy = new Proxy(passed, { get: hostile, ownKeys: hostile, getPrototypeOf: hostile });
    const arrayProxy = new Proxy([passed], {
      get: hostile,
      ownKeys: hostile,
      getPrototypeOf: hostile,
    });
    const object = { ...passed, toJSON: hostile };
    const array = [passed];
    Object.defineProperty(array, Symbol.iterator, { value: hostile });
    for (const input of [getter, arrayGetter, proxy, arrayProxy, object, array, [proxy]])
      expect(() => createWorkflowReport(input)).toThrow(
        'Invalid, unsupported or ambiguous workflow report evidence'
      );
    expect(called).toBe(0);
  });
  test('bounds aggregate serialized bytes before accepting repeated record strings', () => {
    const padded = `${JSON.stringify(passed)}${' '.repeat(900000)}`;
    expect(() => createWorkflowReport(Array(10).fill(padded))).toThrow(
      'Invalid, unsupported or ambiguous workflow report evidence'
    );
  });
});
