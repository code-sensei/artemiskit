import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { z } from 'zod';
import { isWorkflowState } from './environment';
import { workflowExecutionRecordSchema } from './records';
import { WorkflowRecoverySchema, validWorkflowRecovery, workflowDigest } from './recovery';
import type { AgentWorkflow } from './schema';
import { agentTurnRequestSchema, validWorkflowTranscript } from './target';

const count = z.number().int().nonnegative().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const state = z.custom<import('./environment').WorkflowState>(isWorkflowState);
export const checkpointIdentitySchema = z
  .object({
    harness: z.string().max(128),
    workflowSha256: digest,
    toolsSha256: digest,
    configurationSha256: digest,
    preflight: z.boolean(),
    judgeSha256: digest,
  })
  .strict();
export const checkpointLedgerSchema = workflowExecutionRecordSchema
  .pick({
    capability: true,
    usage: true,
    budgets: true,
    events: true,
    droppedEvents: true,
  })
  .strict();
const schema = z
  .object({
    schemaVersion: z.literal('1'),
    identity: checkpointIdentitySchema,
    lifecycle: z.enum(['ready', 'pending', 'pausing', 'terminal']),
    pending: z
      .object({
        kind: z.enum(['setup', 'model', 'tool']),
        operationId: z.string().max(128).optional(),
      })
      .strict()
      .nullable(),
    environmentReleased: z.boolean(),
    initialState: state,
    initialStateSha256: digest,
    state: state.nullable(),
    stateSha256: digest.nullable(),
    startedAt: count,
    deadlineAt: count,
    lastObservedAt: count,
    attemptIds: z.array(z.string().uuid()).min(1).max(1000),
    recovery: WorkflowRecoverySchema,
    cursor: z
      .object({ turn: count, stage: z.enum(['turn', 'model', 'tools', 'done']), callIndex: count })
      .strict(),
    transcript: agentTurnRequestSchema.shape.messages,
    seenIds: z.array(z.string().min(1).max(256)).max(1000),
    preflightIds: z.array(z.string().min(1).max(256)).max(1),
    measuredRequests: count,
    eventSequence: count,
    ledger: checkpointLedgerSchema,
  })
  .strict();
export type WorkflowCheckpointPayload = z.infer<typeof schema>;
export type WorkflowCheckpointIdentity = z.infer<typeof checkpointIdentitySchema>;
export type WorkflowCheckpointCursor = WorkflowCheckpointPayload['cursor'];
export type WorkflowCheckpointRefusal =
  | 'checkpoint_invalid'
  | 'checkpoint_incompatible'
  | 'checkpoint_pending'
  | 'checkpoint_terminal'
  | 'checkpoint_expired'
  | 'checkpoint_clock_rollback'
  | 'checkpoint_cleanup_unresolved'
  | 'usage_unavailable'
  | 'max_actions'
  | 'max_model_requests'
  | 'max_tool_calls'
  | 'max_tokens';
export class WorkflowCheckpointError extends Error {
  constructor(readonly reason: WorkflowCheckpointRefusal) {
    super(reason);
  }
}
function reject(reason: WorkflowCheckpointRefusal): never {
  throw new WorkflowCheckpointError(reason);
}

/** Whole working payload limit; individual states retain the stricter workflow-state bounds. */
function boundedJson(value: unknown): boolean {
  let nodes = 0;
  let bytes = 0;
  const parents = new Set<object>();
  const visit = (item: unknown, depth: number): boolean => {
    if (++nodes > 100_000 || depth > 64) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item);
      return bytes <= 2_000_000;
    }
    if (typeof item !== 'object' || types.isProxy(item) || parents.has(item)) return false;
    const proto = Object.getPrototypeOf(item);
    if (
      Array.isArray(item) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null
    )
      return false;
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.getOwnPropertySymbols(item).length) return false;
    if (
      Array.isArray(item) &&
      (item.length > 100_000 || Object.keys(descriptors).length !== item.length + 1)
    )
      return false;
    parents.add(item);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(item) && key === 'length') continue;
      bytes += Buffer.byteLength(key);
      if (
        bytes > 2_000_000 ||
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        !('value' in descriptor) ||
        !descriptor.enumerable ||
        !visit(descriptor.value, depth + 1)
      )
        return false;
    }
    parents.delete(item);
    return true;
  };
  try {
    return visit(value, 0);
  } catch {
    return false;
  }
}

/** Structural parsing never executes user getters, proxies or custom serialization. */
export function parseWorkflowCheckpoint(input: unknown): WorkflowCheckpointPayload {
  try {
    if (!boundedJson(input)) reject('checkpoint_invalid');
    return schema.parse(input);
  } catch {
    return reject('checkpoint_invalid');
  }
}

/** Checks authorization and a coherent unfinished logical run before any provider/environment work. */
export function restoreWorkflowCheckpoint(
  input: unknown,
  workflow: AgentWorkflow,
  expectedIdentity: WorkflowCheckpointIdentity,
  now: number
): WorkflowCheckpointPayload {
  const p = parseWorkflowCheckpoint(input);
  if (JSON.stringify(p.identity) !== JSON.stringify(expectedIdentity))
    reject('checkpoint_incompatible');
  if (p.lifecycle === 'terminal') reject('checkpoint_terminal');
  if (p.lifecycle !== 'ready' || p.pending !== null) reject('checkpoint_pending');
  if (p.lastObservedAt > now || p.startedAt > p.lastObservedAt) reject('checkpoint_clock_rollback');
  if (p.deadlineAt !== p.startedAt + workflow.environment.policy.budgets.timeout_ms)
    reject('checkpoint_invalid');
  if (now >= p.deadlineAt) reject('checkpoint_expired');
  if (workflow.environment.type === 'sandbox' && !p.environmentReleased)
    reject('checkpoint_cleanup_unresolved');
  const { budgets: b, usage: u, capability: c, events } = p.ledger;
  const limit = workflow.environment.policy.budgets;
  if (u.missingRequests || u.inFlightUnknown || p.measuredRequests !== b.modelRequests)
    reject('usage_unavailable');
  if (
    !p.state ||
    p.stateSha256 !== workflowDigest(p.state) ||
    p.initialStateSha256 !== workflowDigest(p.initialState) ||
    (typeof workflow.workflow.initial_state !== 'string' &&
      p.initialStateSha256 !== workflowDigest(workflow.workflow.initial_state)) ||
    !validWorkflowRecovery(p.recovery) ||
    p.recovery.runId !== p.attemptIds[0] ||
    p.recovery.attemptId !== p.attemptIds.at(-1) ||
    p.recovery.attempts !== p.attemptIds.length ||
    new Set(p.attemptIds).size !== p.attemptIds.length ||
    p.attemptIds.length >= 1000 ||
    p.recovery.configurationSha256 !== expectedIdentity.configurationSha256 ||
    p.recovery.initialStateSha256 !== p.initialStateSha256 ||
    p.recovery.pendingOperations !== 0 ||
    b.actions !== b.modelRequests + b.toolCalls ||
    b.actions > limit.max_actions ||
    b.modelRequests > (limit.max_model_requests ?? limit.max_actions) ||
    b.toolCalls > (limit.max_tool_calls ?? limit.max_actions) ||
    b.elapsedMs !== p.lastObservedAt - p.startedAt ||
    b.tokenOvershoot !== 0 ||
    u.reported.total !== u.reported.prompt + u.reported.completion ||
    u.preflight.total !== u.preflight.prompt + u.preflight.completion ||
    u.preflight.prompt > u.reported.prompt ||
    u.preflight.completion > u.reported.completion ||
    u.status !== (b.modelRequests ? 'reported' : 'unavailable') ||
    (limit.max_tokens !== undefined && u.reported.total > limit.max_tokens) ||
    c.advertised !== true ||
    c.preflight !== (expectedIdentity.preflight ? 'passed' : 'not_requested') ||
    p.preflightIds.length !== (expectedIdentity.preflight ? 1 : 0)
  )
    reject('checkpoint_invalid');
  if (p.recovery.checkpoint !== 'active' && p.recovery.checkpoint !== 'paused')
    reject('checkpoint_invalid');
  if (
    p.cursor.turn > workflow.workflow.turns.length ||
    (p.cursor.stage === 'done') !== (p.cursor.turn === workflow.workflow.turns.length) ||
    (p.cursor.stage !== 'tools' && p.cursor.callIndex !== 0)
  )
    reject('checkpoint_invalid');
  if (p.cursor.stage !== 'done') {
    if (b.actions >= limit.max_actions) reject('max_actions');
    if (p.cursor.stage === 'tools' && b.toolCalls >= (limit.max_tool_calls ?? limit.max_actions))
      reject('max_tool_calls');
    if (
      p.cursor.stage !== 'tools' &&
      b.modelRequests >= (limit.max_model_requests ?? limit.max_actions)
    )
      reject('max_model_requests');
    if (limit.max_tokens !== undefined && u.reported.total >= limit.max_tokens)
      reject('max_tokens');
  }
  const transcript = p.transcript;
  if (
    transcript[0].role !== 'system' ||
    transcript[0].content !== workflow.workflow.system_instructions ||
    transcript.slice(1).some((message) => message.role === 'system')
  )
    reject('checkpoint_invalid');
  const users = transcript.filter((message) => message.role === 'user');
  const expectedUsers = p.cursor.turn + (['model', 'tools'].includes(p.cursor.stage) ? 1 : 0);
  if (
    users.length !== expectedUsers ||
    users.some(
      (message, index) => JSON.stringify(message) !== JSON.stringify(workflow.workflow.turns[index])
    )
  )
    reject('checkpoint_invalid');
  for (let index = 1; index < transcript.length; index++) {
    const message = transcript[index];
    const previous = transcript[index - 1];
    if (
      message.role === 'user' &&
      !(index === 1 || (previous.role === 'assistant' && !previous.tool_calls?.length))
    )
      reject('checkpoint_invalid');
    if (message.role === 'assistant' && previous.role !== 'user' && previous.role !== 'tool')
      reject('checkpoint_invalid');
  }
  if (p.cursor.stage === 'model' && !['user', 'tool'].includes(transcript.at(-1)?.role ?? ''))
    reject('checkpoint_invalid');
  if (
    p.environmentReleased !== (p.recovery.checkpoint === 'paused') ||
    (p.environmentReleased && p.recovery.reason !== 'paused')
  )
    reject('checkpoint_invalid');
  const assistants = transcript.filter((message) => message.role === 'assistant');
  const allCalls = assistants.flatMap((message) => message.tool_calls ?? []);
  const completedTools = transcript.filter((message) => message.role === 'tool');
  const expectedIds = [...p.preflightIds, ...allCalls.map((call) => call.id)];
  if (
    new Set(expectedIds).size !== expectedIds.length ||
    JSON.stringify(p.seenIds) !== JSON.stringify(expectedIds) ||
    b.modelRequests !== assistants.length + (expectedIdentity.preflight ? 2 : 0) ||
    b.toolCalls !== completedTools.length + (expectedIdentity.preflight ? 1 : 0) ||
    p.recovery.stateChanges.total > completedTools.length
  )
    reject('checkpoint_invalid');
  if (p.cursor.stage === 'tools') {
    const assistant = assistants.at(-1);
    const calls = assistant?.tool_calls ?? [];
    if (!assistant || !calls.length || p.cursor.callIndex >= calls.length)
      reject('checkpoint_invalid');
    const tail = transcript.slice(transcript.lastIndexOf(assistant) + 1);
    if (
      tail.length !== p.cursor.callIndex ||
      tail.some(
        (message, index) => message.role !== 'tool' || message.toolCallId !== calls[index].id
      )
    )
      reject('checkpoint_invalid');
    const completed = [
      ...transcript,
      ...calls
        .slice(p.cursor.callIndex)
        .map((call) => ({ role: 'tool' as const, toolCallId: call.id, content: '{}' })),
    ];
    if (!validWorkflowTranscript(completed)) reject('checkpoint_invalid');
  } else if (!validWorkflowTranscript(transcript)) reject('checkpoint_invalid');
  if (
    (p.cursor.stage === 'turn' || p.cursor.stage === 'done') &&
    assistants.length &&
    (transcript.at(-1)?.role !== 'assistant' || transcript.at(-1)?.tool_calls?.length)
  )
    reject('checkpoint_invalid');
  const countEvents = 1 + 2 * b.actions + (expectedIdentity.preflight ? 1 : 0);
  if (
    p.eventSequence !== countEvents ||
    p.ledger.droppedEvents !== countEvents - events.length ||
    events.length !== Math.min(countEvents, 254) ||
    events.some(
      (event, index) =>
        event.sequence !== index + 1 ||
        event.elapsedMs > b.elapsedMs ||
        (index > 0 && event.elapsedMs < events[index - 1].elapsedMs) ||
        ['finished', 'execution_finished'].includes(event.type)
    ) ||
    events[0]?.type !== 'started' ||
    events[0].phase !== 'execution'
  )
    reject('checkpoint_invalid');
  const operations = new Map<string, (typeof events)[number]>();
  let models = 0;
  let tools = 0;
  const callHashes = new Set(
    expectedIds.map((id) => createHash('sha256').update(id).digest('hex'))
  );
  for (const event of events.slice(1)) {
    if (event.type === 'preflight_completed') {
      if (
        !expectedIdentity.preflight ||
        event.status !== 'completed' ||
        event.phase !== 'preflight'
      )
        reject('checkpoint_invalid');
      continue;
    }
    if (!event.operationId || event.phase === 'evaluation') reject('checkpoint_invalid');
    if (event.type === 'model_requested' || event.type === 'tool_requested') {
      const kind = event.type === 'model_requested' ? 'model' : 'tool';
      const number = kind === 'model' ? ++models : ++tools;
      if (event.operationId !== `${kind}-${number}` || operations.has(event.operationId))
        reject('checkpoint_invalid');
      if (
        kind === 'tool' &&
        (!event.requestedCallIdHash || !callHashes.has(event.requestedCallIdHash))
      )
        reject('checkpoint_invalid');
      operations.set(event.operationId, event);
    } else {
      const request = operations.get(event.operationId);
      if (
        !request ||
        event.type !== request.type.replace('_requested', '_completed') ||
        event.status !== 'completed' ||
        event.phase !== request.phase ||
        event.tool !== request.tool ||
        event.requestedCallIdHash !== request.requestedCallIdHash
      )
        reject('checkpoint_invalid');
      operations.delete(event.operationId);
    }
  }
  if (
    !p.ledger.droppedEvents &&
    (operations.size || models !== b.modelRequests || tools !== b.toolCalls)
  )
    reject('checkpoint_invalid');
  return p;
}
