import { createHash } from 'node:crypto';
import { z } from 'zod';
import { decideWorkflowOutcome, validWorkflowAssertionCounts } from './outcome-status';
import { workflowRecordLedgerStatus } from './outcomes';
import { WorkflowRecoverySchema, validWorkflowRecovery } from './recovery';
import { WorkflowPolicySchema, isWorkflowJson } from './schema';

const count = z.number().int().nonnegative().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const status = z.enum(['passed', 'failed', 'invalid', 'unavailable']);
const identity = z.object({ sha256: digest, display: z.string().max(128).optional() }).strict();
const tokens = z.object({ prompt: count, completion: count, total: count }).strict();
const counts = z
  .object({
    declared: count,
    passed: count,
    failed: count,
    invalid: count,
    unavailable: count,
    valid: count,
  })
  .strict();
const deterministicReason = z.enum([
  'matched',
  'mismatch',
  'missing_state',
  'missing_file',
  'unexpected_file',
  'schema_mismatch',
  'malformed_json',
  'policy_violation',
  'budget_violation',
  'incomplete_execution',
  'snapshot_unavailable',
  'evidence_truncated',
  'invalid_workflow',
  'invalid_evidence',
  'configuration_mismatch',
  'snapshot_mismatch',
]);
const semanticReason = z.enum([
  'satisfied',
  'not_satisfied',
  'judge_not_configured',
  'invalid_configuration',
  'incomplete_execution',
  'policy_denied',
  'unresolved_cleanup',
  'state_unavailable',
  'invalid_evidence',
  'evidence_limit',
  'unsupported_capability',
  'identity_mismatch',
  'request_budget',
  'token_budget',
  'usage_unavailable',
  'deadline',
  'cancelled',
  'judge_error',
  'invalid_response',
  'prerequisite_failed',
]);
const deterministic = z
  .object({
    status,
    assertions: z
      .array(
        z
          .object({
            index: count,
            type: z.enum(['workflow_state', 'file', 'tool_trace', 'policy', 'json_schema']),
            status,
            reason: deterministicReason,
            criterionSha256: digest,
          })
          .strict()
      )
      .max(100),
    counts,
  })
  .strict();
const judgeLimits = z
  .object({
    maxRequests: z.number().int().min(1).max(20),
    maxTokens: z.number().int().min(1).max(1_000_000),
    maxOutputTokens: z.number().int().min(1).max(100_000),
    timeoutMs: z.number().int().min(1).max(60_000),
  })
  .strict();
const semantic = z
  .object({
    assertions: z
      .array(
        z.object({ index: count, status, reason: semanticReason, criterionSha256: digest }).strict()
      )
      .max(20),
    counts,
    judge: z
      .object({
        requested: z.object({ provider: identity, model: identity }).strict(),
        observed: z.object({ provider: identity, models: z.array(identity).max(20) }).strict(),
      })
      .strict()
      .optional(),
    capability: z
      .object({ jsonMode: z.boolean().nullable(), transportCancellation: z.boolean().nullable() })
      .strict(),
    usage: z
      .object({
        status: z.enum(['reported', 'partial', 'unavailable']),
        reported: tokens,
        missingRequests: count,
        inFlightUnknown: z.boolean(),
        pendingOperations: count,
      })
      .strict(),
    budgets: z
      .object({
        requests: count,
        requestAccounting: z.literal('client_invocations'),
        transportAttempts: z.literal('unavailable'),
        tokenOvershoot: count,
        elapsedMs: count,
        limits: judgeLimits.optional(),
      })
      .strict(),
    evidence: z
      .object({
        status: z.enum(['complete', 'unavailable']),
        bytes: count.optional(),
        limitBytes: z.literal(65_536),
      })
      .strict(),
  })
  .strict();
const outcomes = z
  .object({
    schemaVersion: z.literal('1'),
    status,
    reason: z.enum([
      'verified',
      'required_outcome_failed',
      'invalid_evaluation',
      'evaluation_unavailable',
      'execution_incomplete',
      'policy_denied',
      'target_usage_unavailable',
      'cleanup_unresolved',
      'preflight_only',
      'cancelled',
    ]),
    task: z
      .object({
        eligible: z.union([z.literal(0), z.literal(1)]),
        passed: z.union([z.literal(0), z.literal(1)]),
        failed: z.union([z.literal(0), z.literal(1)]),
      })
      .strict(),
    configurationSha256: digest.optional(),
    stateSha256: digest.optional(),
    cancelled: z.boolean(),
    deterministic,
    semantic,
  })
  .strict();
const event = z
  .object({
    sequence: count,
    elapsedMs: count,
    type: z.enum([
      'started',
      'model_requested',
      'model_completed',
      'tool_requested',
      'tool_completed',
      'preflight_completed',
      'execution_finished',
      'finished',
    ]),
    phase: z.enum(['execution', 'preflight', 'evaluation']),
    operationId: z.string().max(128).optional(),
    requestedCallIdHash: digest.optional(),
    tool: z
      .string()
      .regex(/^[a-z_]{1,64}$/)
      .optional(),
    status: z.enum(['completed', 'denied', 'invalid', 'failed']).optional(),
  })
  .strict();
export const workflowExecutionRecordSchema = z.object({
  engine: z.literal('native'),
  execution: z.enum([
    'completed',
    'unsupported',
    'invalid',
    'failed',
    'cancelled',
    'timeout',
    'budget_exceeded',
  ]),
  reason: z.enum([
    'finished',
    'invalid_workflow',
    'invalid_options',
    'invalid_fixture',
    'target_unavailable',
    'invalid_response',
    'target_error',
    'tool_use_unsupported',
    'preflight_failed',
    'environment_unavailable',
    'invalid_environment',
    'tool_failed',
    'policy_denied',
    'cancelled',
    'deadline',
    'max_actions',
    'max_model_requests',
    'max_tool_calls',
    'max_tokens',
    'usage_unavailable',
    'transcript_limit',
    'checkpoint_paused',
    'checkpoint_unavailable',
    'checkpoint_incompatible',
    'checkpoint_pending',
    'checkpoint_terminal',
    'checkpoint_expired',
    'checkpoint_clock_rollback',
    'checkpoint_invalid',
    'checkpoint_cleanup_unresolved',
  ]),
  policy: z.enum(['passed', 'denied']),
  configuration: z
    .object({
      sha256: digest,
      provider: identity,
      model: identity,
      generation: z.object({ maxTokens: count, temperature: z.number().min(0).max(2) }).strict(),
      limits: WorkflowPolicySchema.shape.budgets,
    })
    .strict()
    .optional(),
  environment: z.enum(['simulated', 'sandbox', 'unknown']),
  capability: z
    .object({
      advertised: z.boolean().nullable(),
      transportCancellation: z.boolean(),
      preflight: z.enum(['not_requested', 'passed', 'failed']),
      observedModelHash: digest.optional(),
      observedModel: identity.optional(),
    })
    .strict(),
  usage: z
    .object({
      status: z.enum(['reported', 'partial', 'unavailable']),
      reported: tokens,
      missingRequests: count,
      inFlightUnknown: z.boolean(),
      preflight: tokens,
    })
    .strict(),
  budgets: z
    .object({
      actions: count,
      modelRequests: count,
      toolCalls: count,
      modelRequestAccounting: z.literal('target_invocations'),
      transportAttempts: z.literal('unavailable'),
      tokenOvershoot: count,
      elapsedMs: count,
    })
    .strict(),
  cleanup: z
    .object({
      status: z.enum(['completed', 'unresolved']),
      artifacts: z.enum(['discarded', 'retained', 'unknown']),
      pendingOperations: count,
    })
    .strict(),
  artifacts: z
    .object({
      state: z.enum(['available', 'unavailable']),
      stateSha256: digest.optional(),
      files: z
        .array(z.object({ pathSha256: digest, contentSha256: digest, bytes: count }).strict())
        .max(100)
        .optional(),
      omittedFiles: count.optional(),
    })
    .strict(),
  events: z.array(event).max(256),
  droppedEvents: count,
});
const schema = z.discriminatedUnion('schemaVersion', [
  workflowExecutionRecordSchema
    .extend({ schemaVersion: z.literal('1'), taskVerification: z.literal('unavailable') })
    .strict(),
  workflowExecutionRecordSchema
    .extend({
      schemaVersion: z.literal('2'),
      purpose: z.enum(['workflow', 'preflight']),
      taskVerification: status,
      outcomes,
    })
    .strict(),
  workflowExecutionRecordSchema
    .extend({
      schemaVersion: z.literal('3'),
      purpose: z.literal('workflow'),
      taskVerification: status,
      outcomes,
      recovery: WorkflowRecoverySchema,
    })
    .strict(),
]);

export type SavedWorkflowRecord = z.infer<typeof schema>;
export type HistoricalWorkflowRecord = Extract<SavedWorkflowRecord, { schemaVersion: '1' }>;

function consistentCounts(summary: {
  assertions: { index: number; status: z.infer<typeof status> }[];
  counts: z.infer<typeof counts>;
}): boolean {
  if (
    !validWorkflowAssertionCounts(summary.counts) ||
    summary.counts.declared !== summary.assertions.length
  )
    return false;
  const computed = { passed: 0, failed: 0, invalid: 0, unavailable: 0 };
  for (const [index, assertion] of summary.assertions.entries()) {
    if (assertion.index !== index) return false;
    computed[assertion.status]++;
  }
  return (Object.keys(computed) as (keyof typeof computed)[]).every(
    (key) => summary.counts[key] === computed[key]
  );
}
function validTokens(value: z.infer<typeof tokens>): boolean {
  return value.prompt + value.completion === value.total;
}
function validIdentity(value: z.infer<typeof identity>): boolean {
  return (
    value.display === undefined ||
    createHash('sha256').update(value.display).digest('hex') === value.sha256
  );
}

/** Read bounded saved evidence without recreating environments or making model calls. */
export function readWorkflowRecord(input: unknown): SavedWorkflowRecord {
  try {
    let value = input;
    if (typeof input === 'string') {
      if (Buffer.byteLength(input) > 1_048_576) throw new Error();
      value = JSON.parse(input);
    }
    if (!isWorkflowJson(value)) throw new Error();
    const record = schema.parse(value);
    if (
      !validTokens(record.usage.reported) ||
      !validTokens(record.usage.preflight) ||
      record.usage.preflight.total > record.usage.reported.total ||
      record.usage.missingRequests > record.budgets.modelRequests ||
      record.budgets.actions !== record.budgets.modelRequests + record.budgets.toolCalls ||
      (record.usage.status === 'reported' &&
        (record.usage.missingRequests > 0 ||
          record.usage.inFlightUnknown ||
          record.budgets.modelRequests === 0)) ||
      (record.artifacts.state === 'available' && !record.artifacts.stateSha256) ||
      (record.artifacts.state === 'unavailable' && record.artifacts.stateSha256 !== undefined) ||
      (record.cleanup.status === 'completed' && record.cleanup.pendingOperations > 0)
    )
      throw new Error();
    const identities = [
      record.configuration?.provider,
      record.configuration?.model,
      record.capability.observedModel,
    ].filter((value): value is z.infer<typeof identity> => value !== undefined);
    if (identities.some((value) => !validIdentity(value))) throw new Error();
    if (
      record.capability.observedModel &&
      record.capability.observedModelHash !== record.capability.observedModel.sha256
    )
      throw new Error();
    let previous = 0;
    for (const entry of record.events) {
      if (entry.sequence <= previous || (!record.droppedEvents && entry.sequence !== previous + 1))
        throw new Error();
      previous = entry.sequence;
    }
    if (record.schemaVersion !== '3' && record.reason.startsWith('checkpoint_')) throw new Error();
    if (record.schemaVersion === '1') {
      if (
        record.events.some(
          (entry) => entry.phase === 'evaluation' || entry.type === 'execution_finished'
        )
      )
        throw new Error();
      return record;
    }
    if (record.schemaVersion === '3') {
      const recovery = record.recovery;
      if (
        !validWorkflowRecovery(recovery) ||
        recovery.stateChanges.total > record.budgets.toolCalls ||
        recovery.retries.attempted > record.budgets.toolCalls ||
        recovery.pendingOperations > record.budgets.actions + 1 ||
        (recovery.checkpoint === 'paused' &&
          (recovery.reason !== 'paused' ||
            !recovery.configurationSha256 ||
            !recovery.initialStateSha256 ||
            record.reason !== 'checkpoint_paused' ||
            record.execution !== 'cancelled' ||
            record.cleanup.status !== 'completed' ||
            recovery.pendingOperations !== 0)) ||
        (record.execution === 'completed' && recovery.checkpoint !== 'terminal') ||
        recovery.stateChanges.entries.some(
          (entry) => Number(entry.operationId.slice(5)) > record.budgets.toolCalls
        )
      )
        throw new Error();
      const changes = recovery.stateChanges.entries;
      if (
        new Set(changes.map((entry) => entry.operationId)).size !== changes.length ||
        changes.some(
          (entry, index) =>
            entry.beforeSha256 === entry.afterSha256 ||
            (index > 0 &&
              Number(entry.operationId.slice(5)) <=
                Number(changes[index - 1].operationId.slice(5))) ||
            (!record.droppedEvents &&
              !record.events.some(
                (event) =>
                  event.type === 'tool_completed' &&
                  event.operationId === entry.operationId &&
                  event.status === 'completed'
              ))
        ) ||
        (changes.length &&
          !recovery.stateChanges.omitted &&
          record.artifacts.state === 'available' &&
          changes.at(-1)?.afterSha256 !== record.artifacts.stateSha256)
      )
        throw new Error();
    }
    const assessment = record.outcomes;
    if (
      assessment.configurationSha256 !== record.configuration?.sha256 ||
      assessment.stateSha256 !== record.artifacts.stateSha256 ||
      !consistentCounts(assessment.deterministic) ||
      !consistentCounts(assessment.semantic) ||
      !validTokens(assessment.semantic.usage.reported) ||
      assessment.semantic.usage.missingRequests > assessment.semantic.budgets.requests ||
      (record.purpose === 'preflight' &&
        (assessment.deterministic.counts.declared !== 0 ||
          assessment.semantic.counts.declared !== 0 ||
          assessment.semantic.budgets.requests !== 0))
    )
      throw new Error();
    const det = assessment.deterministic;
    const expectedDet = det.counts.failed
      ? 'failed'
      : det.counts.invalid
        ? 'invalid'
        : det.counts.unavailable || !det.counts.declared
          ? 'unavailable'
          : 'passed';
    // Invalid workflow inputs carry an empty invalid evaluator result only when evaluated.
    if (
      det.status !== expectedDet &&
      !(det.counts.declared === 0 && det.status === 'invalid' && record.execution !== 'completed')
    )
      throw new Error();
    const ledgerStatus = workflowRecordLedgerStatus(record);
    if (
      (record.execution === 'completed' && ledgerStatus === 'invalid') ||
      (ledgerStatus !== 'passed' &&
        det.assertions.some(
          (a) => a.status === 'passed' && (a.type === 'tool_trace' || a.type === 'policy')
        ))
    )
      throw new Error();
    const sem = assessment.semantic;
    const measured = sem.budgets.requests - sem.usage.missingRequests;
    const expectedUsage = measured
      ? sem.usage.missingRequests
        ? 'partial'
        : 'reported'
      : 'unavailable';
    if (
      sem.usage.status !== expectedUsage ||
      (sem.usage.inFlightUnknown && sem.usage.pendingOperations === 0) ||
      (!measured && sem.usage.reported.total !== 0) ||
      sem.counts.valid > measured ||
      (sem.budgets.requests > 0 &&
        (!sem.judge || !sem.budgets.limits || sem.evidence.status !== 'complete')) ||
      (sem.evidence.status === 'complete' &&
        (sem.evidence.bytes === undefined || sem.evidence.bytes > sem.evidence.limitBytes)) ||
      (sem.budgets.limits &&
        (sem.budgets.requests > sem.budgets.limits.maxRequests ||
          sem.budgets.tokenOvershoot !==
            Math.max(0, sem.usage.reported.total - sem.budgets.limits.maxTokens))) ||
      (!sem.budgets.limits && sem.budgets.tokenOvershoot !== 0) ||
      sem.assertions.some(
        (a) =>
          (a.status === 'passed') !== (a.reason === 'satisfied') ||
          (a.status === 'failed') !== (a.reason === 'not_satisfied')
      ) ||
      det.assertions.some((a) => (a.status === 'passed') !== (a.reason === 'matched'))
    )
      throw new Error();
    if (
      sem.counts.valid > 0 &&
      (!sem.judge ||
        !sem.budgets.limits ||
        sem.evidence.status !== 'complete' ||
        sem.judge.requested.provider.sha256 !== sem.judge.observed.provider.sha256 ||
        sem.judge.observed.models.length === 0)
    )
      throw new Error();
    if (
      sem.counts.declared > 0 &&
      sem.counts.valid === sem.counts.declared &&
      (sem.usage.status !== 'reported' ||
        sem.usage.inFlightUnknown ||
        sem.usage.pendingOperations > 0 ||
        sem.budgets.tokenOvershoot > 0)
    )
      throw new Error();
    if (sem.judge) {
      const ids = [
        sem.judge.requested.provider,
        sem.judge.requested.model,
        sem.judge.observed.provider,
        ...sem.judge.observed.models,
      ];
      if (
        ids.some((value) => !validIdentity(value)) ||
        new Set(sem.judge.observed.models.map((value) => value.sha256)).size !==
          sem.judge.observed.models.length
      )
        throw new Error();
    }
    const expected = decideWorkflowOutcome({
      purpose: record.purpose,
      record,
      deterministic: assessment.deterministic.counts,
      semantic: assessment.semantic.counts,
      cancelled: assessment.cancelled,
    });
    if (
      expected.status !== record.taskVerification ||
      expected.status !== assessment.status ||
      expected.reason !== assessment.reason ||
      JSON.stringify(expected.task) !== JSON.stringify(assessment.task)
    )
      throw new Error();
    const boundaries = record.events.filter((entry) => entry.type === 'execution_finished');
    const terminal = record.events.filter((entry) => entry.type === 'finished');
    if (
      boundaries.length !== 1 ||
      terminal.length !== 1 ||
      record.events.at(-1) !== terminal[0] ||
      boundaries[0].sequence >= terminal[0].sequence ||
      boundaries[0].phase !== 'execution' ||
      terminal[0].phase !== 'evaluation' ||
      boundaries[0].status !== (record.execution === 'completed' ? 'completed' : 'failed') ||
      terminal[0].status !== boundaries[0].status ||
      record.events.some(
        (entry) => entry.sequence > boundaries[0].sequence && entry.type !== 'finished'
      )
    )
      throw new Error();
    return record;
  } catch {
    // Never include raw evidence, parser diagnostics, or hostile getter exceptions in errors.
    throw new Error('Invalid or unsupported workflow record');
  }
}
