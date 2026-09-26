import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import {
  type AgentWorkflow,
  AgentWorkflowSchema,
  type WorkflowJson,
  isWorkflowJson,
} from './schema';
import type { AgentWorkflowResult } from './session';

export type WorkflowDeterministicStatus = 'passed' | 'failed' | 'invalid' | 'unavailable';
export type WorkflowDeterministicReason =
  | 'matched'
  | 'mismatch'
  | 'missing_state'
  | 'missing_file'
  | 'unexpected_file'
  | 'schema_mismatch'
  | 'malformed_json'
  | 'policy_violation'
  | 'budget_violation'
  | 'incomplete_execution'
  | 'snapshot_unavailable'
  | 'evidence_truncated'
  | 'invalid_workflow'
  | 'invalid_evidence'
  | 'configuration_mismatch'
  | 'snapshot_mismatch';
export interface WorkflowDeterministicAssertion {
  index: number;
  type: AgentWorkflow['outcomes']['deterministic'][number]['type'];
  status: WorkflowDeterministicStatus;
  reason: WorkflowDeterministicReason;
  criterionSha256: string;
}
export interface WorkflowDeterministicSummary {
  status: WorkflowDeterministicStatus;
  assertions: WorkflowDeterministicAssertion[];
  counts: {
    declared: number;
    passed: number;
    failed: number;
    invalid: number;
    unavailable: number;
    valid: number;
  };
}
type Finding = Pick<WorkflowDeterministicAssertion, 'status' | 'reason'>;
const finding = (
  status: WorkflowDeterministicStatus,
  reason: WorkflowDeterministicReason
): Finding => ({ status, reason });
const matched = finding('passed', 'matched');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().safe();
const eventSchema = z.object({
  sequence: count,
  elapsedMs: z.number().finite().nonnegative(),
  type: z.string().regex(/^[a-z_]{1,64}$/),
  phase: z.enum(['execution', 'preflight', 'evaluation']),
  operationId: z.string().min(1).max(128).optional(),
  requestedCallIdHash: hashSchema.optional(),
  tool: z.string().max(64).optional(),
  status: z.string().max(32).optional(),
});
const recordSchema = z.object({
  schemaVersion: z.enum(['1', '2']),
  engine: z.literal('native'),
  purpose: z.enum(['workflow', 'preflight']).optional(),
  execution: z.enum([
    'completed',
    'unsupported',
    'invalid',
    'failed',
    'cancelled',
    'timeout',
    'budget_exceeded',
  ]),
  policy: z.enum(['passed', 'denied']),
  environment: z.enum(['simulated', 'sandbox', 'unknown']),
  configuration: z.object({ sha256: hashSchema }).optional(),
  usage: z.object({
    status: z.enum(['reported', 'partial', 'unavailable']),
    reported: z.object({ prompt: count, completion: count, total: count }),
    missingRequests: count,
    inFlightUnknown: z.boolean(),
  }),
  budgets: z.object({
    actions: count,
    modelRequests: count,
    toolCalls: count,
    tokenOvershoot: count,
    elapsedMs: z.number().finite().nonnegative(),
  }),
  cleanup: z.object({ status: z.enum(['completed', 'unresolved']), pendingOperations: count }),
  artifacts: z.object({
    state: z.enum(['available', 'unavailable']),
    stateSha256: hashSchema.optional(),
  }),
  events: z.array(eventSchema).max(1024),
  droppedEvents: count,
});
type Evidence = z.infer<typeof recordSchema>;

function object(value: unknown): value is Record<string, WorkflowJson> {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && isWorkflowJson(value)
  );
}
function own(value: unknown, key: string): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable && 'value' in descriptor ? descriptor.value : undefined;
}
function canonical(value: WorkflowJson): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}
function stateValue(
  state: Record<string, WorkflowJson>,
  path: string
): { found: boolean; value?: WorkflowJson } {
  let value: WorkflowJson | undefined = state.workflow_state;
  for (const part of path.split('.')) {
    if (Array.isArray(value)) {
      if (!/^(0|[1-9][0-9]*)$/.test(part) || !Object.hasOwn(value, part)) return { found: false };
      value = value[Number(part)];
    } else {
      if (!object(value) || !Object.hasOwn(value, part)) return { found: false };
      value = value[part];
    }
  }
  return value === undefined ? { found: false } : { found: true, value };
}
function summarize(
  assertions: WorkflowDeterministicAssertion[],
  invalidWorkflow = false
): WorkflowDeterministicSummary {
  const counts = {
    declared: assertions.length,
    passed: 0,
    failed: 0,
    invalid: 0,
    unavailable: 0,
    valid: 0,
  };
  for (const entry of assertions) counts[entry.status]++;
  counts.valid = counts.passed + counts.failed;
  return {
    status: invalidWorkflow
      ? 'invalid'
      : counts.failed
        ? 'failed'
        : counts.invalid
          ? 'invalid'
          : counts.unavailable
            ? 'unavailable'
            : 'passed',
    assertions,
    counts,
  };
}

/** Verifies the sealed host execution ledger; model prose and evaluation events never count. */
function ledger(
  workflow: AgentWorkflow,
  record: Evidence
): { finding?: Finding; calls: Map<string, number> } {
  const calls = new Map<string, number>();
  const invalid = () => ({ finding: finding('invalid', 'invalid_evidence'), calls });
  if (
    record.events.some(
      (event, index) =>
        event.sequence < 1 || (index > 0 && event.sequence <= record.events[index - 1].sequence)
    )
  )
    return invalid();
  if (record.droppedEvents > 0)
    return { finding: finding('unavailable', 'evidence_truncated'), calls };
  if (record.events.some((event, index) => event.sequence !== index + 1)) return invalid();
  const boundary = record.schemaVersion === '2' ? 'execution_finished' : 'finished';
  const boundaries = record.events.filter((event) => event.type === boundary);
  if (boundaries.length !== 1) return invalid();
  const last = boundaries[0];
  if (
    record.events.some(
      (event) =>
        event.sequence > last.sequence &&
        ['tool_requested', 'tool_completed', 'model_requested', 'model_completed'].includes(
          event.type
        )
    )
  )
    return invalid();
  const pending = new Map<string, z.infer<typeof eventSchema>>();
  const seen = new Set<string>();
  const callIds = new Set<string>();
  let tools = 0;
  let models = 0;
  for (const event of record.events) {
    if (event.sequence > last.sequence) continue;
    if (
      !['tool_requested', 'tool_completed', 'model_requested', 'model_completed'].includes(
        event.type
      )
    )
      continue;
    if (event.phase === 'evaluation' || !event.operationId) return invalid();
    if (event.type.endsWith('_requested')) {
      if (seen.has(event.operationId)) return invalid();
      seen.add(event.operationId);
      pending.set(event.operationId, event);
      if (event.type === 'tool_requested') {
        if (!event.tool || !event.requestedCallIdHash || callIds.has(event.requestedCallIdHash))
          return invalid();
        callIds.add(event.requestedCallIdHash);
        tools++;
      } else models++;
    } else {
      const requested = pending.get(event.operationId);
      if (
        !requested ||
        requested.type !== event.type.replace('_completed', '_requested') ||
        requested.phase !== event.phase ||
        requested.tool !== event.tool ||
        requested.requestedCallIdHash !== event.requestedCallIdHash ||
        !['completed', 'denied', 'invalid', 'failed'].includes(event.status ?? '')
      )
        return invalid();
      pending.delete(event.operationId);
      if (
        event.type === 'tool_completed' &&
        event.phase === 'execution' &&
        event.status === 'completed'
      ) {
        if (!workflow.tools.some((tool) => tool === event.tool)) return invalid();
        calls.set(event.tool ?? '', (calls.get(event.tool ?? '') ?? 0) + 1);
      }
      if (
        event.type === 'tool_completed' &&
        event.status === 'denied' &&
        record.policy !== 'denied'
      )
        return invalid();
    }
  }
  if (
    pending.size ||
    tools !== record.budgets.toolCalls ||
    models !== record.budgets.modelRequests ||
    tools + models !== record.budgets.actions
  )
    return invalid();
  return { calls };
}

/** Pure independent verification. Only bounded metadata is returned; working content never escapes. */
export function evaluateWorkflowDeterministicOutcomes(
  workflow: AgentWorkflow,
  result: AgentWorkflowResult
): WorkflowDeterministicSummary {
  let parsed: ReturnType<typeof AgentWorkflowSchema.safeParse>;
  try {
    parsed = AgentWorkflowSchema.safeParse(workflow);
  } catch {
    return summarize([], true);
  }
  if (!parsed.success) return summarize([], true);
  const definition = parsed.data;
  const assertions = definition.outcomes.deterministic;
  let evidence: Evidence | undefined;
  let evidenceFailure: Finding | undefined;
  let state: Record<string, WorkflowJson> | undefined;
  let snapshotFailure: Finding | undefined;
  try {
    const rawRecord = own(result, 'record');
    const checked = isWorkflowJson(rawRecord) ? recordSchema.safeParse(rawRecord) : null;
    if (!checked?.success) evidenceFailure = finding('invalid', 'invalid_evidence');
    else {
      evidence = checked.data;
      if (!evidence.configuration) evidenceFailure = finding('unavailable', 'invalid_evidence');
      else if (
        evidence.configuration.sha256 !== hash(JSON.stringify(definition)) ||
        evidence.environment !== definition.environment.type
      )
        evidenceFailure = finding('invalid', 'configuration_mismatch');
      else if (
        evidence.budgets.actions !== evidence.budgets.modelRequests + evidence.budgets.toolCalls ||
        evidence.usage.reported.total !==
          evidence.usage.reported.prompt + evidence.usage.reported.completion ||
        evidence.usage.missingRequests > evidence.budgets.modelRequests
      )
        evidenceFailure = finding('invalid', 'invalid_evidence');
      const rawState = own(result, 'state');
      if (evidence.artifacts.state !== 'available' || rawState === null || rawState === undefined)
        snapshotFailure = finding('unavailable', 'snapshot_unavailable');
      else if (!object(rawState)) snapshotFailure = finding('invalid', 'invalid_evidence');
      else if (
        !evidence.artifacts.stateSha256 ||
        evidence.artifacts.stateSha256 !== hash(JSON.stringify(rawState))
      )
        snapshotFailure = finding('invalid', 'snapshot_mismatch');
      else state = rawState;
    }
  } catch {
    evidenceFailure = finding('invalid', 'invalid_evidence');
  }
  const trace = evidence && !evidenceFailure ? ledger(definition, evidence) : undefined;
  const ajv = new Ajv({
    strict: true,
    allErrors: false,
    validateFormats: false,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });
  const entries = assertions.map((criterion, index): WorkflowDeterministicAssertion => {
    let outcome: Finding;
    function evaluate(): Finding {
      if (evidenceFailure) return evidenceFailure;
      if (snapshotFailure?.status === 'invalid') return snapshotFailure;
      if (trace?.finding?.status === 'invalid') return trace.finding;
      if (!evidence) return finding('invalid', 'invalid_evidence');
      if (criterion.type === 'policy' && evidence.policy === 'denied')
        return finding('failed', 'policy_violation');
      if (
        criterion.type === 'policy' &&
        criterion.rule === 'budgets_respected' &&
        (evidence.execution === 'budget_exceeded' || evidence.budgets.tokenOvershoot > 0)
      )
        return finding('failed', 'budget_violation');
      if (
        evidence.execution !== 'completed' ||
        evidence.purpose === 'preflight' ||
        evidence.cleanup.status !== 'completed' ||
        evidence.cleanup.pendingOperations > 0
      )
        return finding('unavailable', 'incomplete_execution');
      if (criterion.type === 'tool_trace') {
        if (trace?.finding) return trace.finding;
        if (evidence.schemaVersion === '1' && snapshotFailure) return snapshotFailure;
        const calls = trace?.calls.get(criterion.tool) ?? 0;
        return calls >= criterion.minimum_calls &&
          (criterion.maximum_calls === undefined || calls <= criterion.maximum_calls)
          ? matched
          : finding('failed', 'mismatch');
      }
      if (criterion.type === 'policy') {
        if (trace?.finding) return trace.finding;
        const limits = definition.environment.policy.budgets;
        if (criterion.rule === 'budgets_respected') {
          if (
            evidence.budgets.actions > limits.max_actions ||
            evidence.budgets.modelRequests > (limits.max_model_requests ?? limits.max_actions) ||
            evidence.budgets.toolCalls > (limits.max_tool_calls ?? limits.max_actions) ||
            (limits.max_tokens !== undefined && evidence.usage.reported.total > limits.max_tokens)
          )
            return finding('failed', 'budget_violation');
          if (
            limits.max_tokens !== undefined &&
            (evidence.usage.status !== 'reported' ||
              evidence.usage.missingRequests ||
              evidence.usage.inFlightUnknown)
          )
            return finding('unavailable', 'invalid_evidence');
          // elapsedMs includes cleanup: use the last execution operation, not post-run cleanup duration.
          const elapsed = Math.max(
            0,
            ...evidence.events
              .filter((event) => ['tool_completed', 'model_completed'].includes(event.type))
              .map((event) => event.elapsedMs)
          );
          if (elapsed > limits.timeout_ms) return finding('failed', 'budget_violation');
        }
        return matched;
      }
      if (snapshotFailure) return snapshotFailure;
      if (!state) return finding('unavailable', 'snapshot_unavailable');
      if (criterion.type === 'workflow_state') {
        const actual = stateValue(state, criterion.path);
        return !actual.found
          ? finding('failed', 'missing_state')
          : canonical(actual.value as WorkflowJson) === canonical(criterion.equals)
            ? matched
            : finding('failed', 'mismatch');
      }
      if (criterion.type === 'file' || criterion.source === 'file') {
        const files = state.files;
        if (files !== undefined && !object(files)) return finding('invalid', 'invalid_evidence');
        const exists = files !== undefined && Object.hasOwn(files, criterion.path);
        if (criterion.type === 'file') {
          if (criterion.exists && !exists) return finding('failed', 'missing_file');
          if (!criterion.exists && exists) return finding('failed', 'unexpected_file');
          if (!exists) return matched;
          const value = (files as Record<string, WorkflowJson>)[criterion.path];
          if (typeof value !== 'string') return finding('invalid', 'invalid_evidence');
          return criterion.equals === undefined || criterion.equals === value
            ? matched
            : finding('failed', 'mismatch');
        }
        if (!exists) return finding('failed', 'missing_file');
        const content = (files as Record<string, WorkflowJson>)[criterion.path];
        if (typeof content !== 'string') return finding('invalid', 'invalid_evidence');
        let value: unknown;
        try {
          value = JSON.parse(content);
          const document = parseDocument(content, { uniqueKeys: true, customTags: [] });
          if (document.errors.length || document.warnings.length)
            return finding('failed', 'malformed_json');
        } catch {
          return finding('failed', 'malformed_json');
        }
        if (!isWorkflowJson(value)) return finding('failed', 'malformed_json');
        return ajv.compile(criterion.schema)(value)
          ? matched
          : finding('failed', 'schema_mismatch');
      }
      const actual = stateValue(state, criterion.path);
      if (!actual.found) return finding('failed', 'missing_state');
      return ajv.compile(criterion.schema)(actual.value)
        ? matched
        : finding('failed', 'schema_mismatch');
    }
    try {
      outcome = evaluate();
    } catch {
      outcome = finding('invalid', 'invalid_evidence');
    }
    return {
      index,
      type: criterion.type,
      ...outcome,
      criterionSha256: hash(canonical(criterion as WorkflowJson)),
    };
  });
  return summarize(entries);
}
