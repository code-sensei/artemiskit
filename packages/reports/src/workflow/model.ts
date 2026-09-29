import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { type SavedWorkflowRecord, isWorkflowJson, readWorkflowRecord } from '@artemiskit/core';
import type { WorkflowReport, WorkflowReportFinding, WorkflowReportSection } from './types';

const MAX_BYTES = 8 * 1024 * 1024;
const invalid = () => new Error('Invalid, unsupported or ambiguous workflow report evidence');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const digest = (value: unknown) => hash(canonical(value));
const lexical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const identity = (value: string | undefined) => (value ? `sha256:${value}` : 'unavailable');
const number = (value: number | undefined) => (value === undefined ? 'unavailable' : String(value));

interface Entry {
  record: SavedWorkflowRecord;
  id: string;
  copies: number;
  superseded: boolean;
  group: string;
}

function inputs(input: unknown): unknown[] {
  let value = input;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > MAX_BYTES) throw invalid();
    value = JSON.parse(value);
  }
  if (value && typeof value === 'object' && types.isProxy(value)) throw invalid();
  if (!Array.isArray(value)) return [value];
  // Inspect descriptors before invoking array methods: collections are also hostile input.
  if (
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length < 1 ||
    value.length > 50 ||
    Object.getOwnPropertySymbols(value).length
  )
    throw invalid();
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1) throw invalid();
  const result: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = Object.getOwnPropertyDescriptor(value, String(i));
    if (!entry || !('value' in entry) || !entry.enumerable) throw invalid();
    result.push(entry.value);
  }
  return result;
}

function recoveryIdentity(r: Extract<SavedWorkflowRecord, { schemaVersion: '3' }>) {
  return {
    environment: r.environment,
    configuration: r.configuration
      ? {
          ...r.configuration,
          provider: r.configuration.provider.sha256,
          model: r.configuration.model.sha256,
        }
      : null,
    checkpointConfiguration: r.recovery.configurationSha256 ?? null,
    initialState: r.recovery.initialStateSha256 ?? null,
    faultsDeclared: r.recovery.faults.declared,
    retryLimit: r.recovery.retries.maxAttempts,
    deterministic: r.outcomes.deterministic.assertions.map((a) => [
      a.index,
      a.type,
      a.criterionSha256,
    ]),
    semantic: r.outcomes.semantic.assertions.map((a) => [a.index, a.criterionSha256]),
  };
}
function prefix(a: unknown[], b: unknown[]) {
  return a.length <= b.length && a.every((value, i) => same(value, b[i]));
}
function counters(r: Extract<SavedWorkflowRecord, { schemaVersion: '3' }>): number[] {
  return [
    r.budgets.actions,
    r.budgets.modelRequests,
    r.budgets.toolCalls,
    r.budgets.elapsedMs,
    r.budgets.tokenOvershoot,
    r.usage.reported.prompt,
    r.usage.reported.completion,
    r.usage.reported.total,
    r.usage.missingRequests,
    r.usage.preflight.prompt,
    r.usage.preflight.completion,
    r.usage.preflight.total,
    r.droppedEvents,
    r.recovery.faults.injected,
    r.recovery.retries.attempted,
    r.recovery.retries.recovered,
    r.recovery.retries.exhausted,
    r.recovery.retries.omitted,
    r.recovery.stateChanges.total,
    r.recovery.stateChanges.omitted,
  ];
}
function group(entries: Entry[]) {
  const groups = new Map<string, Entry[]>();
  const attemptOwners = new Map<string, string>();
  for (const entry of entries) {
    const r = entry.record;
    entry.group = r.schemaVersion === '3' ? `run-${hash(r.recovery.runId)}` : entry.id;
    if (r.schemaVersion === '3') {
      const owner = attemptOwners.get(r.recovery.attemptId);
      if (owner && owner !== entry.id) throw invalid();
      attemptOwners.set(r.recovery.attemptId, entry.id);
    }
    const values = groups.get(entry.group) ?? [];
    values.push(entry);
    groups.set(entry.group, values);
  }
  for (const values of groups.values()) {
    values.sort((a, b) => {
      if (a.record.schemaVersion !== '3' || b.record.schemaVersion !== '3') return 0;
      return a.record.recovery.attempts - b.record.recovery.attempts;
    });
    for (let i = 1; i < values.length; i++) {
      const previous = values[i - 1];
      const a = previous.record;
      const b = values[i].record;
      if (a.schemaVersion !== '3' || b.schemaVersion !== '3') throw invalid();
      if (
        a.recovery.attempts >= b.recovery.attempts ||
        a.recovery.checkpoint !== 'paused' ||
        !same(recoveryIdentity(a), recoveryIdentity(b)) ||
        counters(a).some((v, index) => v > counters(b)[index]) ||
        !prefix(a.recovery.faults.entries, b.recovery.faults.entries) ||
        !prefix(a.recovery.retries.entries, b.recovery.retries.entries) ||
        !prefix(a.recovery.stateChanges.entries, b.recovery.stateChanges.entries)
      )
        throw invalid();
      // Pause seals are presentation events. The underlying execution prefix is cumulative.
      const retained = (r: SavedWorkflowRecord) =>
        r.events.filter((e) => e.type !== 'execution_finished' && e.type !== 'finished');
      if (!prefix(retained(a), retained(b))) throw invalid();
      previous.superseded = true;
    }
  }
  return groups;
}

/** Deterministic, redacted assessment from validated saved evidence. Never executes a workflow. */
export function createWorkflowReport(input: unknown): WorkflowReport {
  try {
    const collection = inputs(input);
    if (collection.length < 1 || collection.length > 50) throw invalid();
    let bytes = 2 + collection.length - 1;
    const unique = new Map<string, Entry>();
    for (const source of collection) {
      // Core checks proxies/accessors/depth before any schema traversal or serialization.
      if (typeof source !== 'string' && !isWorkflowJson(source)) throw invalid();
      bytes +=
        typeof source === 'string'
          ? Buffer.byteLength(source)
          : Buffer.byteLength(canonical(source));
      if (bytes > MAX_BYTES) throw invalid();
      const record = readWorkflowRecord(source);
      const id = `r-${digest(record)}`;
      const existing = unique.get(id);
      if (existing) existing.copies++;
      else unique.set(id, { record, id, copies: 1, superseded: false, group: '' });
    }
    const entries = [...unique.values()].sort((a, b) => lexical(a.id, b.id));
    const groups = group(entries);
    const report: WorkflowReport = {
      schemaVersion: '1',
      reportId: '',
      title: 'Workflow assurance assessment',
      scope: [
        `${collection.length} selected records; ${entries.length} distinct records; ${groups.size} logical runs.`,
        'Scope is the supplied saved workflow evidence. Scenario names and full policy declarations are unavailable in these records.',
        'All selected evidence remains visible. Duplicate content is not a new repetition; superseded resumed attempts are retained but excluded from latest-run task totals.',
      ],
      methodology: [
        'Strict V1/V2/V3 saved-record validation, canonical key ordering, SHA256 content identities and deterministic finding rules. No provider calls or generated narrative.',
        'Task success rate is passed / (passed + failed) for eligible latest-run task measurements only. Invalid, unavailable, historical and preflight evidence is shown separately.',
        'V3 attempts sharing a run identity are checked for consistent identities and monotonic cumulative evidence. Usage and budgets are shown per record and never summed across attempts.',
        'Non-V3 records have no logical run identity. Distinct records are displayed separately without claiming independent statistical samples.',
        'Finding references point to JSON pointers in the selected saved record and include SHA256 digests. Display labels, raw operation identifiers and working data are omitted.',
      ],
      summary: {
        records: collection.length,
        logicalRuns: groups.size,
        eligible: 0,
        passed: 0,
        failed: 0,
        invalid: 0,
        unavailable: 0,
        preflight: 0,
        historical: 0,
        duplicateRecords: collection.length - entries.length,
        supersededAttempts: entries.filter((e) => e.superseded).length,
        taskSuccessRate: null,
      },
      findings: [],
      sections: [],
      evidence: [],
      limitations: [
        'Saved records are host attestations, not cryptographic proof of correct execution or independently authenticated observations. SHA256 provides content identity, not authenticity.',
        'No model ranking, statistical independence, certification, deployment approval or general capability claim follows from this selected evidence.',
        'Scenario names, source paths, instructions, fixture contents, full policy declarations and native harness version are unavailable or deliberately omitted. Current installed versions are never substituted.',
        'Transport attempts and monetary cost are unavailable. Reported tokens exclude missing or in-flight unknown usage; preflight tokens are a subset of target usage, never additive.',
        'Private checkpoint/transcript files are not report inputs. Recovery does not establish exactly-once external side effects, distributed coordination or safe replay of ambiguous pending operations.',
      ],
    };
    const section = (id: string, title: string, description: string, columns: string[]) => {
      const result: WorkflowReportSection = { id, title, description, columns, rows: [] };
      report.sections.push(result);
      return result;
    };
    const runs = section(
      'runs',
      'Run outcomes and coverage',
      'Every distinct selected record remains visible. Only latest logical attempts contribute to summary task counts.',
      [
        'Record',
        'Logical run',
        'Schema',
        'Measurement',
        'Runtime',
        'Task outcome',
        'Policy',
        'Selection',
        'Copies',
      ]
    );
    const config = section(
      'configuration',
      'Target, environment and harness',
      'Identities are digests. Full policy declarations and the native harness version were not saved.',
      ['Record', 'Measurement', 'Value']
    );
    const assertions = section(
      'assertions',
      'Assertion coverage',
      'Saved deterministic and semantic criteria are identified by digest. Unavailable and invalid measurements are not passes.',
      ['Record', 'Family', 'Index', 'Type', 'Criterion', 'Status', 'Reason']
    );
    const usage = section(
      'usage',
      'Usage, budgets and measurement limits',
      'Per-record cumulative counters: do not sum resumed attempts. Preflight is a subset of target usage. Cost and transport attempts are unavailable.',
      ['Record', 'Measurement', 'Value']
    );
    const cleanup = section(
      'cleanup',
      'Cleanup, artifacts and evidence omissions',
      'Only checksums and bounded summaries are retained; raw state and artifact content are excluded.',
      ['Record', 'Measurement', 'Value']
    );
    const recovery = section(
      'recovery',
      'Faults, retries and recovery limits',
      'Retries apply only to declared pre-effect faults and remain budgeted. Checkpoint evidence is not an exactly-once guarantee.',
      ['Record', 'Measurement', 'Value']
    );
    const evidenceMap = new Map<string, WorkflowReport['evidence'][number]>();
    const evidence = (entry: Entry, path: string, value: unknown, description: string) => {
      const id = `e-${hash(`${entry.id}:${path}`)}`;
      evidenceMap.set(id, { id, recordId: entry.id, path, sha256: digest(value), description });
      return id;
    };
    const row = (
      s: WorkflowReportSection,
      entry: Entry,
      path: string,
      value: unknown,
      cells: string[],
      description: string
    ) => {
      const ref = evidence(entry, path, value, description);
      s.rows.push({ id: `row-${hash(`${s.id}:${ref}`)}`, cells, evidenceIds: [ref] });
      return ref;
    };
    const metric = (
      s: WorkflowReportSection,
      entry: Entry,
      path: string,
      value: unknown,
      label: string,
      display: string
    ) => row(s, entry, path, value, [entry.id, label, display], label);
    const finding = (
      entry: Entry,
      level: WorkflowReportFinding['level'],
      title: string,
      detail: string,
      recommendation: string,
      refs: string[]
    ) => {
      report.findings.push({
        id: `f-${digest([entry.id, level, title, refs])}`,
        level,
        title,
        detail,
        recommendation,
        evidenceIds: refs,
      });
    };
    for (const entry of entries) {
      const r = entry.record;
      const historical = r.schemaVersion === '1';
      const preflight = !historical && r.purpose === 'preflight';
      const selection = entry.superseded ? 'superseded attempt' : 'latest selected attempt';
      const measurement = historical
        ? 'historical execution only'
        : preflight
          ? 'preflight only'
          : 'workflow';
      const rootRef = row(
        runs,
        entry,
        '',
        r,
        [
          entry.id,
          entry.group,
          r.schemaVersion,
          measurement,
          `${r.execution}: ${r.reason}`,
          r.taskVerification,
          r.policy,
          selection,
          String(entry.copies),
        ],
        'Validated saved workflow record'
      );
      if (!entry.superseded) {
        if (historical) report.summary.historical++;
        else if (preflight) report.summary.preflight++;
        else {
          report.summary.eligible += r.outcomes.task.eligible;
          report.summary.passed += r.outcomes.task.passed;
          report.summary.failed += r.outcomes.task.failed;
          if (r.taskVerification === 'invalid') report.summary.invalid++;
          if (r.taskVerification === 'unavailable') report.summary.unavailable++;
        }
      }
      if (historical || preflight || entry.superseded)
        finding(
          entry,
          'limitation',
          'Excluded from latest task rate',
          `${measurement}; ${selection}. This record remains in the evidence appendix.`,
          historical
            ? 'Collect an independently evaluated workflow record before assessing task success.'
            : preflight
              ? 'Run the actual workflow and independent outcome assertions after capability checks.'
              : 'Use the latest compatible attempt for cumulative totals; retain this attempt for audit.',
          [rootRef]
        );
      if (r.execution !== 'completed' && !entry.superseded)
        finding(
          entry,
          'risk',
          'Execution did not complete',
          `Runtime status: ${r.execution}; reason: ${r.reason}. Task success is not established by runtime termination.`,
          r.reason === 'checkpoint_paused'
            ? 'Resume only a compatible ready checkpoint within the original deadline; do not replay pending effects.'
            : 'Inspect the referenced execution reason and resolve the bounded runtime or configuration failure before rerunning.',
          [rootRef]
        );
      if (r.policy === 'denied')
        finding(
          entry,
          'risk',
          'Policy boundary denied an action',
          'The saved host policy outcome is denied; a model claim cannot override that outcome.',
          'Inspect the denied action against the intended least-privilege policy; do not loosen permissions solely to improve a pass rate.',
          [evidence(entry, '/policy', r.policy, 'Policy outcome')]
        );
      const cm = (path: string, value: unknown, label: string, display: string) =>
        metric(config, entry, path, value, label, display);
      cm('/engine', r.engine, 'Harness / saved version', `${r.engine} / unavailable`);
      cm('/environment', r.environment, 'Environment', r.environment);
      cm(
        r.configuration ? '/configuration' : '',
        r.configuration ?? r,
        'Configuration identity',
        identity(r.configuration?.sha256)
      );
      if (r.configuration) {
        cm(
          '/configuration/provider',
          r.configuration.provider,
          'Requested provider',
          identity(r.configuration.provider.sha256)
        );
        cm(
          '/configuration/model',
          r.configuration.model,
          'Requested model',
          identity(r.configuration.model.sha256)
        );
        cm(
          '/configuration/generation',
          r.configuration.generation,
          'Generation controls',
          `max tokens ${r.configuration.generation.maxTokens}; temperature ${r.configuration.generation.temperature}`
        );
        cm(
          '/configuration/limits',
          r.configuration.limits,
          'Execution limits',
          canonical(r.configuration.limits)
        );
      }
      cm(
        '/capability',
        r.capability,
        'Capabilities',
        `advertised tool use ${r.capability.advertised ?? 'unavailable'}; cancellation ${r.capability.transportCancellation}; preflight ${r.capability.preflight}`
      );
      if (r.capability.observedModelHash)
        cm(
          '/capability/observedModelHash',
          r.capability.observedModelHash,
          'Observed model',
          identity(r.capability.observedModelHash)
        );
      const um = (path: string, value: unknown, label: string, display: string) =>
        metric(usage, entry, path, value, label, display);
      const targetRef = um(
        '/usage',
        r.usage,
        'Target usage',
        `${r.usage.status}; prompt ${r.usage.reported.prompt}; completion ${r.usage.reported.completion}; total ${r.usage.reported.total}; missing requests ${r.usage.missingRequests}; in-flight unknown ${r.usage.inFlightUnknown}`
      );
      um(
        '/usage/preflight',
        r.usage.preflight,
        'Preflight subset of target',
        `prompt ${r.usage.preflight.prompt}; completion ${r.usage.preflight.completion}; total ${r.usage.preflight.total}`
      );
      um(
        '/budgets',
        r.budgets,
        'Cumulative execution budget use',
        `actions ${r.budgets.actions}; target invocations ${r.budgets.modelRequests}; tool calls ${r.budgets.toolCalls}; elapsed ms ${r.budgets.elapsedMs}; token overshoot ${r.budgets.tokenOvershoot}`
      );
      um(
        '/budgets/transportAttempts',
        r.budgets.transportAttempts,
        'Transport attempts / cost',
        'unavailable / unavailable'
      );
      if (r.usage.status !== 'reported' || r.usage.inFlightUnknown)
        finding(
          entry,
          'limitation',
          'Target usage is incomplete',
          `Usage status ${r.usage.status}; missing requests ${r.usage.missingRequests}; in-flight unknown ${r.usage.inFlightUnknown}. Reported totals are partial observations.`,
          'Restore complete usage reporting before using tokens for budget or efficiency conclusions; do not impute missing usage.',
          [targetRef]
        );
      const cleanupRef = metric(
        cleanup,
        entry,
        '/cleanup',
        r.cleanup,
        'Cleanup',
        `${r.cleanup.status}; artifacts ${r.cleanup.artifacts}; pending operations ${r.cleanup.pendingOperations}`
      );
      metric(
        cleanup,
        entry,
        '/artifacts',
        r.artifacts,
        'Artifacts',
        `state ${r.artifacts.state}; state digest ${identity(r.artifacts.stateSha256)}; files retained ${number(r.artifacts.files?.length)}; files omitted ${number(r.artifacts.omittedFiles)}`
      );
      const omittedRef = metric(
        cleanup,
        entry,
        '/droppedEvents',
        r.droppedEvents,
        'Event omissions',
        String(r.droppedEvents)
      );
      for (const [i, file] of (r.artifacts.files ?? []).entries())
        metric(
          cleanup,
          entry,
          `/artifacts/files/${i}`,
          file,
          `Artifact ${i}`,
          `path ${identity(file.pathSha256)}; content ${identity(file.contentSha256)}; bytes ${file.bytes}`
        );
      if (r.cleanup.status !== 'completed')
        finding(
          entry,
          'risk',
          'Cleanup remains unresolved',
          `Pending operations ${r.cleanup.pendingOperations}; artifact disposition ${r.cleanup.artifacts}.`,
          'Resolve pending host operations and verify cleanup before rerunning or treating execution as isolated.',
          [cleanupRef]
        );
      if (r.droppedEvents || r.artifacts.omittedFiles)
        finding(
          entry,
          'limitation',
          'Evidence was omitted',
          `Dropped events ${r.droppedEvents}; omitted files ${number(r.artifacts.omittedFiles)}. Absence from a bounded appendix does not prove absence of activity.`,
          'Review saved omission counts and collect a bounded scenario with sufficient evidence before making trace-wide claims.',
          [omittedRef, evidence(entry, '/artifacts', r.artifacts, 'Artifact summary')]
        );
      if (!historical) {
        for (const family of ['deterministic', 'semantic'] as const) {
          const assessment = r.outcomes[family];
          const countsRef = evidence(
            entry,
            `/outcomes/${family}/counts`,
            assessment.counts,
            `${family} assertion counts`
          );
          row(
            assertions,
            entry,
            `/outcomes/${family}/counts`,
            assessment.counts,
            [
              entry.id,
              family,
              'all',
              'coverage counts',
              `declared ${assessment.counts.declared}`,
              `valid ${assessment.counts.valid}; passed ${assessment.counts.passed}; failed ${assessment.counts.failed}`,
              `invalid ${assessment.counts.invalid}; unavailable ${assessment.counts.unavailable}`,
            ],
            `${family} assertion counts`
          );
          if (!assessment.counts.declared)
            finding(
              entry,
              'limitation',
              `No ${family} assertion coverage`,
              `No ${family} criteria were declared in this record. This is a coverage exclusion, not a pass.`,
              `Declare relevant ${family} criteria when this dimension matters to the task; avoid inferring unmeasured properties.`,
              [countsRef]
            );
          for (const a of assessment.assertions) {
            const ref = row(
              assertions,
              entry,
              `/outcomes/${family}/assertions/${a.index}`,
              a,
              [
                entry.id,
                family,
                String(a.index),
                'type' in a ? a.type : 'semantic',
                identity(a.criterionSha256),
                a.status,
                a.reason,
              ],
              `${family} assertion ${a.index}`
            );
            finding(
              entry,
              a.status === 'passed' ? 'strength' : a.status === 'failed' ? 'risk' : 'limitation',
              `${family} assertion ${a.index}: ${a.status}`,
              `Criterion ${identity(a.criterionSha256)}; saved reason ${a.reason}. ${entry.superseded ? 'This is superseded-attempt evidence.' : 'This conclusion is limited to the declared criterion.'}`,
              a.status === 'passed'
                ? 'Retain this criterion as a regression check; do not generalize beyond the saved task evidence.'
                : a.status === 'failed'
                  ? 'Inspect the failing criterion and bounded evidence, correct the observed behavior, then rerun the same criterion.'
                  : 'Resolve the stated measurement prerequisite and collect a valid result before concluding success or failure.',
              [ref]
            );
          }
        }
        const s = r.outcomes.semantic;
        const judgeRef = um(
          '/outcomes/semantic/usage',
          s.usage,
          'Independent judge usage',
          `${s.usage.status}; prompt ${s.usage.reported.prompt}; completion ${s.usage.reported.completion}; total ${s.usage.reported.total}; missing requests ${s.usage.missingRequests}; in-flight unknown ${s.usage.inFlightUnknown}; pending operations ${s.usage.pendingOperations}`
        );
        um(
          '/outcomes/semantic/budgets',
          s.budgets,
          'Judge budgets / transport / cost',
          `${canonical(s.budgets)}; cost unavailable`
        );
        um(
          '/outcomes/semantic/evidence',
          s.evidence,
          'Judge evidence availability',
          canonical(s.evidence)
        );
        if (s.judge) {
          cm(
            '/outcomes/semantic/judge',
            s.judge,
            'Judge identities',
            `requested provider ${identity(s.judge.requested.provider.sha256)}; requested model ${identity(s.judge.requested.model.sha256)}; observed provider ${identity(s.judge.observed.provider.sha256)}; observed models ${s.judge.observed.models
              .map((m) => identity(m.sha256))
              .sort()
              .join(', ')}`
          );
        }
        if (s.counts.declared && (s.usage.status !== 'reported' || s.usage.inFlightUnknown))
          finding(
            entry,
            'limitation',
            'Judge usage or measurement is incomplete',
            `Usage status ${s.usage.status}; missing requests ${s.usage.missingRequests}; pending operations ${s.usage.pendingOperations}.`,
            'Resolve judge configuration, response validity or usage availability before treating semantic criteria as measured.',
            [judgeRef]
          );
      }
      if (r.schemaVersion === '3') {
        const v = r.recovery;
        const rm = (path: string, value: unknown, label: string, display: string) =>
          metric(recovery, entry, path, value, label, display);
        const selectedAttempts =
          groups
            .get(entry.group)
            ?.filter(
              (candidate) =>
                candidate.record.schemaVersion === '3' &&
                candidate.record.recovery.attempts <= v.attempts
            ).length ?? 1;
        if (selectedAttempts < v.attempts)
          finding(
            entry,
            'limitation',
            'Prior attempt records are missing',
            `Saved attempt number ${v.attempts}; selected attempt records through this point ${selectedAttempts}. Earlier activity cannot be independently reconstructed from missing records.`,
            'Include prior saved attempts when available; retain the latest cumulative counters without inventing missing evidence.',
            [evidence(entry, '/recovery/attempts', v.attempts, 'Declared attempt number')]
          );
        const checkpointRef = rm(
          '/recovery',
          v,
          'Checkpoint and attempt',
          `run ${identity(hash(v.runId))}; attempt ${identity(hash(v.attemptId))}; attempt number ${v.attempts}; checkpoint ${v.checkpoint}; reason ${v.reason}; pending operations ${v.pendingOperations}`
        );
        rm(
          '/recovery/retries',
          v.retries,
          'Repair policy and retry outcome',
          `maximum attempts per logical tool ${v.retries.maxAttempts} including first; retried ${v.retries.attempted}; recovered ${v.retries.recovered}; exhausted ${v.retries.exhausted}; links omitted ${v.retries.omitted}`
        );
        rm(
          '/recovery/faults',
          v.faults,
          'Declared and injected faults',
          `declared ${v.faults.declared}; injected ${v.faults.injected}`
        );
        rm(
          '/recovery/stateChanges',
          v.stateChanges,
          'State transition evidence',
          `total ${v.stateChanges.total}; retained ${v.stateChanges.entries.length}; omitted ${v.stateChanges.omitted}`
        );
        for (const [i, fault] of v.faults.entries.entries())
          rm(
            `/recovery/faults/entries/${i}`,
            fault,
            `Fault ${i}`,
            `kind ${fault.kind}; tool ${fault.tool}; operation ${identity(hash(fault.operationId))}; declaration ${identity(fault.id_sha256)}; fixture ${identity(fault.fixture_sha256)} (${number(fault.fixture_bytes)} bytes); instruction ${identity(fault.instruction_sha256)} (${number(fault.instruction_bytes)} bytes)`
          );
        for (const [i, retry] of v.retries.entries.entries())
          rm(
            `/recovery/retries/entries/${i}`,
            retry,
            `Retry ${i}`,
            `operation ${identity(hash(retry.operationId))}; previous ${identity(hash(retry.previousOperationId))}; attempt ${retry.attempt}`
          );
        for (const [i, change] of v.stateChanges.entries.entries())
          rm(
            `/recovery/stateChanges/entries/${i}`,
            change,
            `State change ${i}`,
            `operation ${identity(hash(change.operationId))}; before ${identity(change.beforeSha256)}; after ${identity(change.afterSha256)}`
          );
        if (v.retries.recovered)
          finding(
            entry,
            'information',
            'Declared faults recovered within retry policy',
            `${v.retries.recovered} logical tool calls recovered; ${v.retries.attempted} charged retries. Recovery alone does not establish task success.`,
            'Retain fault coverage and verify independent outcomes; keep retries bounded and restricted to known pre-effect faults.',
            [evidence(entry, '/recovery/retries', v.retries, 'Retry outcome')]
          );
        if (v.retries.exhausted)
          finding(
            entry,
            'risk',
            'Retry policy exhausted',
            `${v.retries.exhausted} logical tool calls exhausted their allowed attempts.`,
            'Investigate the declared fault and tool availability before a new run; do not expand retry budgets to conceal failure.',
            [evidence(entry, '/recovery/retries', v.retries, 'Retry outcome')]
          );
        if (v.attempts > 1 || v.checkpoint !== 'disabled')
          finding(
            entry,
            'limitation',
            'Checkpoint recovery has bounded guarantees',
            'Cumulative attempts are not independent repetitions. Safe local resume requires compatible configuration, released environment and no ambiguous pending effect.',
            'Retain private working data under an explicit retention policy; refuse incompatible, expired, terminal or pending checkpoints instead of replaying them.',
            [checkpointRef]
          );
        if (v.stateChanges.omitted || v.retries.omitted)
          finding(
            entry,
            'limitation',
            'Recovery evidence is truncated',
            `Omitted state transitions ${v.stateChanges.omitted}; omitted retry links ${v.retries.omitted}.`,
            'Limit the scenario or retain appropriate private audit evidence before making complete transition-chain claims.',
            [
              evidence(entry, '/recovery/stateChanges', v.stateChanges, 'State transitions'),
              evidence(entry, '/recovery/retries', v.retries, 'Retry outcome'),
            ]
          );
      } else
        metric(
          recovery,
          entry,
          '/schemaVersion',
          r.schemaVersion,
          'Fault / repair / checkpoint evidence',
          'unavailable in this record version; do not infer retry or resume behavior'
        );
    }
    report.summary.taskSuccessRate = report.summary.eligible
      ? report.summary.passed / report.summary.eligible
      : null;
    report.evidence = [...evidenceMap.values()].sort((a, b) => lexical(a.id, b.id));
    report.findings.sort((a, b) => lexical(a.id, b.id));
    report.reportId = `report-${digest(report)}`;
    return report;
  } catch {
    throw invalid();
  }
}
