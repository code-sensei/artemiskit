import { createHash, randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import { z } from 'zod';
import type { TokenUsage } from '../adapters/types';
import { getWorkflowTool } from './catalog';
import {
  type WorkflowEnvironment,
  type WorkflowEnvironmentFactory,
  WorkflowEnvironmentInitializationError,
  type WorkflowState,
  createSimulatedWorkflowEnvironment,
  isWorkflowState,
  resolveWorkflowInitialState,
  workflowPathAllowed,
  workflowToolPermitted,
} from './environment';
import { createDockerWorkflowEnvironment } from './sandbox';
import { type AgentWorkflow, AgentWorkflowSchema, isWorkflowJson } from './schema';
import type { AgentTarget, AgentTurnRequest, AgentTurnResult } from './target';
import { agentTurnRequestSchema, validWorkflowTranscript } from './target';

export type AgentWorkflowExecution =
  | 'completed'
  | 'unsupported'
  | 'invalid'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'budget_exceeded';
export type AgentWorkflowReason =
  | 'finished'
  | 'invalid_workflow'
  | 'invalid_options'
  | 'invalid_fixture'
  | 'target_unavailable'
  | 'invalid_response'
  | 'target_error'
  | 'tool_use_unsupported'
  | 'preflight_failed'
  | 'environment_unavailable'
  | 'invalid_environment'
  | 'tool_failed'
  | 'policy_denied'
  | 'cancelled'
  | 'deadline'
  | 'max_actions'
  | 'max_model_requests'
  | 'max_tool_calls'
  | 'max_tokens'
  | 'usage_unavailable'
  | 'transcript_limit';
export interface AgentWorkflowEvent {
  sequence: number;
  elapsedMs: number;
  type:
    | 'started'
    | 'model_requested'
    | 'model_completed'
    | 'tool_requested'
    | 'tool_completed'
    | 'preflight_completed'
    | 'finished';
  phase: 'execution' | 'preflight';
  operationId?: string;
  requestedCallIdHash?: string;
  tool?: string;
  status?: 'completed' | 'denied' | 'invalid' | 'failed';
}
export interface AgentWorkflowRecord {
  schemaVersion: '1';
  engine: 'native';
  execution: AgentWorkflowExecution;
  reason: AgentWorkflowReason;
  policy: 'passed' | 'denied';
  configuration?: {
    sha256: string;
    provider: { sha256: string; display?: string };
    model: { sha256: string; display?: string };
    generation: { maxTokens: number; temperature: number };
    limits: AgentWorkflow['environment']['policy']['budgets'];
  };
  taskVerification: 'unavailable';
  environment: 'simulated' | 'sandbox' | 'unknown';
  capability: {
    advertised: boolean | null;
    transportCancellation: boolean;
    preflight: 'not_requested' | 'passed' | 'failed';
    observedModelHash?: string;
    observedModel?: { sha256: string; display?: string };
  };
  usage: {
    status: 'reported' | 'partial' | 'unavailable';
    reported: TokenUsage;
    missingRequests: number;
    inFlightUnknown: boolean;
    preflight: TokenUsage;
  };
  budgets: {
    actions: number;
    modelRequests: number;
    toolCalls: number;
    modelRequestAccounting: 'target_invocations';
    transportAttempts: 'unavailable';
    tokenOvershoot: number;
    elapsedMs: number;
  };
  cleanup: {
    status: 'completed' | 'unresolved';
    artifacts: 'discarded' | 'retained' | 'unknown';
    pendingOperations: number;
  };
  artifacts: {
    state: 'available' | 'unavailable';
    stateSha256?: string;
    files?: { pathSha256: string; contentSha256: string; bytes: number }[];
    omittedFiles?: number;
  };
  events: AgentWorkflowEvent[];
  droppedEvents: number;
}
export interface AgentWorkflowResult {
  /** Metadata only. Safe default persistence boundary, never contains model text or fixture content. */
  record: AgentWorkflowRecord;
  /** Sensitive working data; persist only with an explicit application policy. */
  state: WorkflowState | null;
  transcript: AgentTurnRequest['messages'];
}
export interface AgentWorkflowSessionOptions {
  workflow: AgentWorkflow;
  target: AgentTarget;
  fixtureRoot?: string;
  environmentFactory?: WorkflowEnvironmentFactory;
  preflight?: boolean;
  preflightOnly?: boolean;
  signal?: AbortSignal;
  /** Total bounded drain/snapshot/close period: 1000 ms simulated, 6000 ms sandbox by default. */
  cleanupTimeoutMs?: number;
  onEvent?: (event: AgentWorkflowEvent) => void;
}
export interface AgentWorkflowSession {
  readonly state: 'idle' | 'running' | 'cancelling' | 'completed';
  run(): Promise<AgentWorkflowResult>;
  cancel(): void;
  events(): AsyncIterable<AgentWorkflowEvent>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function identity(value: string) {
  return {
    sha256: hash(value),
    ...(/^[A-Za-z][A-Za-z0-9._:/-]{0,127}$/.test(value) &&
    !/(?:secret|token|password|credential|api.?key|^sk-|^npm_)/i.test(value)
      ? { display: value }
      : {}),
  };
}
const zeroUsage = (): TokenUsage => ({ prompt: 0, completion: 0, total: 0 });
const usageSchema = z
  .object({
    prompt: z.number().int().nonnegative().safe(),
    completion: z.number().int().nonnegative().safe(),
    total: z.number().int().nonnegative().safe(),
  })
  .strict();
const callSchema = z
  .object({
    id: z.string().min(1).max(256),
    type: z.literal('function'),
    function: z
      .object({
        name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/),
        arguments: z.string().max(1_000_000),
      })
      .strict(),
  })
  .strict();
const completedSchema = z
  .object({
    status: z.literal('completed'),
    id: z.string().min(1).max(256),
    model: z.string().min(1).max(256),
    message: z
      .object({
        role: z.literal('assistant'),
        content: z.string().max(1_000_000),
        tool_calls: z.array(callSchema).max(100).optional(),
      })
      .strict(),
    tokens: usageSchema,
    usageAvailable: z.boolean().optional(),
    latencyMs: z.number().finite().nonnegative(),
    finishReason: z.enum(['stop', 'length', 'tool_calls', 'content_filter']).optional(),
  })
  .strict();
const failureSchema = z
  .object({
    status: z.enum(['unsupported', 'invalid', 'error']),
    tokens: usageSchema.optional(),
    usageAvailable: z.boolean().optional(),
    rejectedCall: z
      .object({
        requestedCallIdHash: z.string().regex(/^[a-f0-9]{64}$/),
        tool: z.string(),
        reason: z.enum(['undeclared_tool', 'invalid_arguments', 'duplicate_id']),
      })
      .strict()
      .optional(),
    code: z.enum([
      'invalid_request',
      'tool_use_unsupported',
      'invalid_response',
      'target_error',
      'timeout',
      'aborted',
    ]),
  })
  .strict();
const capabilitySchema = z
  .object({
    status: z.literal('available'),
    toolUse: z.boolean(),
    transportCancellation: z.boolean(),
  })
  .strict();
const cleanupSchema = z
  .object({
    status: z.enum(['completed', 'unresolved']),
    artifacts: z.enum(['discarded', 'retained', 'unknown']),
  })
  .strict();
const failureCodes = new Set([
  'undeclared_tool',
  'permission_denied',
  'invalid_input',
  'invalid_state',
  'not_found',
  'output_limit',
  'invalid_policy',
  'tool_error',
]);

/** Reject executable getters and oversized custom-target records before reading schema fields. */
function safeBoundary(value: unknown): boolean {
  let nodes = 0;
  let bytes = 0;
  const parents = new Set<object>();
  function check(item: unknown, depth: number): boolean {
    if (++nodes > 10_000 || depth > 16) return false;
    if (item === undefined || item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') {
      bytes += Buffer.byteLength(item);
      return bytes <= 1_048_576;
    }
    if (
      typeof item !== 'object' ||
      parents.has(item) ||
      (!Array.isArray(item) &&
        Object.getPrototypeOf(item) !== Object.prototype &&
        Object.getPrototypeOf(item) !== null)
    )
      return false;
    if (Object.getOwnPropertySymbols(item).length || (Array.isArray(item) && item.length > 10_000))
      return false;
    parents.add(item);
    for (const key of Object.getOwnPropertyNames(item)) {
      if (Array.isArray(item) && key === 'length') continue;
      bytes += Buffer.byteLength(key);
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (
        bytes > 1_048_576 ||
        ['__proto__', 'constructor', 'prototype'].includes(key) ||
        !descriptor ||
        !('value' in descriptor) ||
        !descriptor.enumerable ||
        !check(descriptor.value, depth + 1)
      )
        return false;
    }
    parents.delete(item);
    return true;
  }
  try {
    return check(value, 0);
  } catch {
    return false;
  }
}
class Stop extends Error {
  constructor(
    readonly execution: AgentWorkflowExecution,
    readonly reason: AgentWorkflowReason
  ) {
    super(reason);
  }
}

/** Native host-owned loop. No adapter or model may change authority or replenish run budgets. */
export function createAgentWorkflowSession(
  options: AgentWorkflowSessionOptions
): AgentWorkflowSession {
  const controller = new AbortController();
  let sessionState: AgentWorkflowSession['state'] = 'idle';
  let promise: Promise<AgentWorkflowResult> | undefined;
  let workflow: AgentWorkflow | undefined;
  try {
    workflow = AgentWorkflowSchema.parse(options.workflow);
  } catch {
    /* Safe error returned by run. */
  }
  const target = options.target;
  const retained: AgentWorkflowEvent[] = [];
  const listeners = new Set<() => void>();
  let finished = false;
  let started = 0;
  let eventSequence = 0;
  const record: AgentWorkflowRecord = {
    schemaVersion: '1',
    engine: 'native',
    execution: 'invalid',
    reason: 'invalid_workflow',
    policy: 'passed',
    ...(workflow
      ? {
          configuration: {
            sha256: hash(JSON.stringify(workflow)),
            provider: identity(workflow.target.provider),
            model: identity(workflow.target.model),
            generation: {
              maxTokens: workflow.target.generation?.max_tokens ?? 1024,
              temperature: workflow.target.generation?.temperature ?? 0,
            },
            limits: structuredClone(workflow.environment.policy.budgets),
          },
        }
      : {}),
    taskVerification: 'unavailable',
    environment: workflow?.environment.type ?? 'unknown',
    capability: {
      advertised: null,
      transportCancellation: false,
      preflight: options.preflight || options.preflightOnly ? 'failed' : 'not_requested',
    },
    usage: {
      status: 'unavailable',
      reported: zeroUsage(),
      missingRequests: 0,
      inFlightUnknown: false,
      preflight: zeroUsage(),
    },
    budgets: {
      actions: 0,
      modelRequests: 0,
      toolCalls: 0,
      modelRequestAccounting: 'target_invocations',
      transportAttempts: 'unavailable',
      tokenOvershoot: 0,
      elapsedMs: 0,
    },
    cleanup: { status: 'completed', artifacts: 'discarded', pendingOperations: 0 },
    artifacts: { state: 'unavailable' },
    events: retained,
    droppedEvents: 0,
  };
  const pending = new Set<Promise<unknown>>();
  const modelPending = new Set<Promise<unknown>>();
  let transcript: AgentTurnRequest['messages'] = [];
  let state: WorkflowState | null = null;
  let environment: WorkflowEnvironment | undefined;
  let deadlineExpired = false;
  let phase: AgentWorkflowEvent['phase'] = 'execution';
  let measuredRequests = 0;
  const ids = new Set<string>();
  const emit = (event: Omit<AgentWorkflowEvent, 'sequence' | 'elapsedMs' | 'phase'>) => {
    const value = {
      ...event,
      sequence: ++eventSequence,
      elapsedMs: Math.max(0, Date.now() - started),
      phase,
    };
    if (retained.length < 255 || value.type === 'finished') retained.push(value);
    else record.droppedEvents++;
    try {
      options.onEvent?.(structuredClone(value));
    } catch {
      /* Observers cannot alter execution. */
    }
    for (const wake of listeners) wake();
  };
  const abort = () => {
    if (!finished) {
      controller.abort();
      if (sessionState === 'running') sessionState = 'cancelling';
    }
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  function active() {
    if (controller.signal.aborted)
      throw new Stop(
        deadlineExpired ? 'timeout' : 'cancelled',
        deadlineExpired ? 'deadline' : 'cancelled'
      );
    if (workflow && Date.now() - started >= workflow.environment.policy.budgets.timeout_ms) {
      deadlineExpired = true;
      controller.abort();
      throw new Stop('timeout', 'deadline');
    }
  }
  async function owned<T>(
    operation: () => Promise<T>,
    signal: AbortSignal,
    isModel = false
  ): Promise<T> {
    if (signal.aborted)
      throw new Stop(
        deadlineExpired ? 'timeout' : 'cancelled',
        deadlineExpired ? 'deadline' : 'cancelled'
      );
    const work = Promise.resolve().then(() => {
      if (signal.aborted) throw new Stop('cancelled', 'cancelled');
      return operation();
    });
    pending.add(work);
    if (isModel) modelPending.add(work);
    void work.then(
      () => {
        pending.delete(work);
        modelPending.delete(work);
      },
      () => {
        pending.delete(work);
        modelPending.delete(work);
      }
    );
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        reject(
          new Stop(
            deadlineExpired ? 'timeout' : 'cancelled',
            deadlineExpired ? 'deadline' : 'cancelled'
          )
        );
      };
      signal.addEventListener('abort', onAbort, { once: true });
      void work.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        }
      );
    });
  }
  function admit(kind: 'model' | 'tool') {
    active();
    if (!workflow) throw new Stop('invalid', 'invalid_workflow');
    const budget = workflow.environment.policy.budgets;
    if (record.budgets.actions >= budget.max_actions)
      throw new Stop('budget_exceeded', 'max_actions');
    if (
      kind === 'model' &&
      record.budgets.modelRequests >= (budget.max_model_requests ?? budget.max_actions)
    )
      throw new Stop('budget_exceeded', 'max_model_requests');
    if (
      kind === 'tool' &&
      record.budgets.toolCalls >= (budget.max_tool_calls ?? budget.max_actions)
    )
      throw new Stop('budget_exceeded', 'max_tool_calls');
    if (budget.max_tokens !== undefined) {
      if (record.usage.missingRequests) throw new Stop('budget_exceeded', 'usage_unavailable');
      if (record.usage.reported.total >= budget.max_tokens)
        throw new Stop('budget_exceeded', 'max_tokens');
    }
    record.budgets.actions++;
    if (kind === 'model') record.budgets.modelRequests++;
    else record.budgets.toolCalls++;
  }
  const ajv = new Ajv({
    strict: true,
    allErrors: false,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });
  async function model(
    messages: AgentTurnRequest['messages'],
    tools: AgentTurnRequest['tools']
  ): Promise<Extract<AgentTurnResult, { status: 'completed' }>> {
    if (!workflow) throw new Stop('invalid', 'invalid_workflow');
    const budget = workflow.environment.policy.budgets;
    const remainingTokens =
      budget.max_tokens === undefined
        ? 1_000_000
        : Math.max(1, budget.max_tokens - record.usage.reported.total);
    const request: AgentTurnRequest = {
      messages: structuredClone(messages),
      tools: structuredClone(tools),
      model: workflow.target.model,
      generation: {
        maxTokens: Math.min(workflow.target.generation?.max_tokens ?? 1024, remainingTokens),
        temperature: workflow.target.generation?.temperature ?? 0,
      },
      budgets: {
        timeoutMs: Math.max(1, budget.timeout_ms - (Date.now() - started)),
        maxToolCalls: 100,
      },
    };
    if (
      !safeBoundary(request) ||
      !agentTurnRequestSchema.safeParse(request).success ||
      !validWorkflowTranscript(messages)
    )
      throw new Stop('invalid', 'transcript_limit');
    admit('model');
    const operationId = `model-${record.budgets.modelRequests}`;
    emit({ type: 'model_requested', operationId });
    let response: unknown;
    let modelCompleted = false;
    try {
      try {
        response = await owned(
          () => target.turn(request, controller.signal),
          controller.signal,
          true
        );
      } catch (error) {
        if (error instanceof Stop) throw error;
        throw new Stop('failed', 'target_error');
      }
      if (!safeBoundary(response)) {
        record.usage.missingRequests++;
        throw new Stop('invalid', 'invalid_response');
      }
      const failure = failureSchema.safeParse(response);
      if (failure.success) {
        if (
          failure.data.tokens &&
          failure.data.tokens.total ===
            failure.data.tokens.prompt + failure.data.tokens.completion &&
          failure.data.usageAvailable !== false &&
          (failure.data.usageAvailable === true || failure.data.tokens.total > 0)
        ) {
          measuredRequests++;
          for (const key of ['prompt', 'completion', 'total'] as const) {
            record.usage.reported[key] += failure.data.tokens[key];
            if (phase === 'preflight') record.usage.preflight[key] += failure.data.tokens[key];
          }
        } else record.usage.missingRequests++;
        if (failure.data.rejectedCall) {
          const rejection = failure.data.rejectedCall;
          const denied = rejection.reason === 'undeclared_tool';
          if (denied) record.policy = 'denied';
          admit('tool');
          const rejectedOperationId = `tool-${record.budgets.toolCalls}`;
          const tool = getWorkflowTool(rejection.tool)?.id ?? 'unknown';
          emit({
            type: 'tool_requested',
            operationId: rejectedOperationId,
            requestedCallIdHash: rejection.requestedCallIdHash,
            tool,
          });
          emit({
            type: 'tool_completed',
            operationId: rejectedOperationId,
            requestedCallIdHash: rejection.requestedCallIdHash,
            tool,
            status: denied ? 'denied' : 'invalid',
          });
          if (denied) throw new Stop('invalid', 'policy_denied');
        }
        if (failure.data.code === 'timeout') throw new Stop('timeout', 'deadline');
        if (failure.data.code === 'aborted') throw new Stop('cancelled', 'cancelled');
        throw new Stop(
          failure.data.status === 'unsupported'
            ? 'unsupported'
            : failure.data.status === 'invalid'
              ? 'invalid'
              : 'failed',
          failure.data.code === 'tool_use_unsupported'
            ? 'tool_use_unsupported'
            : failure.data.status === 'invalid'
              ? 'invalid_response'
              : 'target_error'
        );
      }
      const parsed = completedSchema.safeParse(response);
      if (
        !parsed.success ||
        parsed.data.tokens.total !== parsed.data.tokens.prompt + parsed.data.tokens.completion
      ) {
        record.usage.missingRequests++;
        throw new Stop('invalid', 'invalid_response');
      }
      const value = parsed.data;
      const measured =
        value.usageAvailable !== false && (value.usageAvailable === true || value.tokens.total > 0);
      if (measured) {
        measuredRequests++;
        for (const key of ['prompt', 'completion', 'total'] as const) {
          record.usage.reported[key] += value.tokens[key];
          if (phase === 'preflight') record.usage.preflight[key] += value.tokens[key];
        }
      } else record.usage.missingRequests++;
      record.capability.observedModelHash = hash(value.model);
      record.capability.observedModel = identity(value.model);
      const calls = value.message.tool_calls ?? [];
      if (
        (value.finishReason === 'tool_calls' && !calls.length) ||
        (calls.length && value.finishReason && value.finishReason !== 'tool_calls')
      )
        throw new Stop('invalid', 'invalid_response');
      for (const call of calls) {
        if (ids.has(call.id)) throw new Stop('invalid', 'invalid_response');
        ids.add(call.id);
      }
      modelCompleted = true;
      emit({ type: 'model_completed', operationId, status: 'completed' });
      if (budget.max_tokens !== undefined && !measured)
        throw new Stop('budget_exceeded', 'usage_unavailable');
      if (budget.max_tokens !== undefined && record.usage.reported.total > budget.max_tokens) {
        record.budgets.tokenOvershoot = record.usage.reported.total - budget.max_tokens;
        throw new Stop('budget_exceeded', 'max_tokens');
      }
      active();
      return value;
    } finally {
      if (!modelCompleted) emit({ type: 'model_completed', operationId, status: 'failed' });
    }
  }
  function originalArguments(
    call: NonNullable<AgentTurnRequest['messages'][number]['tool_calls']>[number],
    tools: AgentTurnRequest['tools']
  ): WorkflowState {
    const definition = tools.find((entry) => entry.function.name === call.function.name);
    if (!definition) {
      record.policy = 'denied';
      throw new Stop('invalid', 'policy_denied');
    }
    let input: unknown;
    try {
      input = JSON.parse(call.function.arguments);
    } catch {
      throw new Stop('invalid', 'invalid_response');
    }
    if (!isWorkflowState(input) || !ajv.compile(definition.function.parameters)(input))
      throw new Stop('invalid', 'invalid_response');
    return input;
  }
  async function probe() {
    phase = 'preflight';
    const nonce = randomUUID();
    const tools: AgentTurnRequest['tools'] = [
      {
        type: 'function',
        function: {
          name: 'artemis_probe',
          description: 'Echo the exact supplied nonce to verify structured tool protocol.',
          parameters: {
            type: 'object',
            properties: { nonce: { const: nonce } },
            required: ['nonce'],
            additionalProperties: false,
          },
        },
      },
    ];
    const messages: AgentTurnRequest['messages'] = [
      {
        role: 'user',
        content: `Call artemis_probe once with nonce ${nonce}. After receiving its result, reply with only that nonce.`,
      },
    ];
    const first = await model(messages, tools);
    const calls = first.message.tool_calls ?? [];
    if (calls.length !== 1) throw new Stop('unsupported', 'preflight_failed');
    admit('tool');
    const call = calls[0];
    originalArguments(call, tools);
    const operationId = `tool-${record.budgets.toolCalls}`;
    const requestedCallIdHash = hash(call.id);
    emit({ type: 'tool_requested', operationId, requestedCallIdHash, tool: 'artemis_probe' });
    messages.push(first.message, {
      role: 'tool',
      toolCallId: call.id,
      content: JSON.stringify({ nonce }),
    });
    emit({
      type: 'tool_completed',
      operationId,
      requestedCallIdHash,
      tool: 'artemis_probe',
      status: 'completed',
    });
    const second = await model(messages, tools);
    if (second.message.tool_calls?.length || second.message.content !== nonce)
      throw new Stop('unsupported', 'preflight_failed');
    record.capability.preflight = 'passed';
    emit({ type: 'preflight_completed', status: 'completed' });
    phase = 'execution';
  }
  async function executeTool(
    call: NonNullable<AgentTurnRequest['messages'][number]['tool_calls']>[number],
    tools: AgentTurnRequest['tools']
  ) {
    if (!workflow || !environment) throw new Stop('failed', 'environment_unavailable');
    admit('tool');
    const operationId = `tool-${record.budgets.toolCalls}`;
    const requestedCallIdHash = hash(call.id);
    const known = getWorkflowTool(call.function.name);
    emit({
      type: 'tool_requested',
      operationId,
      requestedCallIdHash,
      tool: known?.id ?? 'unknown',
    });
    let toolCompleted = false;
    try {
      const input = originalArguments(call, tools);
      if (
        !workflowToolPermitted(workflow, call.function.name) ||
        !workflowPathAllowed(workflow, call.function.name, input)
      ) {
        record.policy = 'denied';
        toolCompleted = true;
        emit({
          type: 'tool_completed',
          operationId,
          requestedCallIdHash,
          tool: known?.id ?? 'unknown',
          status: 'denied',
        });
        throw new Stop('invalid', 'policy_denied');
      }
      let value: unknown;
      try {
        value = await owned(
          () =>
            environment
              ? environment.execute(
                  { tool: call.function.name, input: structuredClone(input) },
                  controller.signal
                )
              : Promise.reject(),
          controller.signal
        );
      } catch (error) {
        if (error instanceof Stop) throw error;
        throw new Stop('failed', 'tool_failed');
      }
      if (!isWorkflowState(value) || !known) throw new Stop('invalid', 'invalid_environment');
      const status = value.status;
      if (
        !isWorkflowState(value.evidence) ||
        value.evidence.tool !== known.id ||
        value.evidence.version !== '1' ||
        value.evidence.status !== status ||
        Object.keys(value).some(
          (key) =>
            !(
              status === 'succeeded'
                ? ['status', 'output', 'state', 'evidence']
                : ['status', 'code', 'evidence']
            ).includes(key)
        )
      )
        throw new Stop('invalid', 'invalid_environment');
      if (status === 'succeeded') {
        if (
          !isWorkflowState(value.state) ||
          !isWorkflowJson(value.output) ||
          !ajv.compile(known.outputSchema)(value.output)
        )
          throw new Stop('invalid', 'invalid_environment');
        state = structuredClone(value.state);
        transcript.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify(value.output),
        });
        toolCompleted = true;
        emit({
          type: 'tool_completed',
          operationId,
          requestedCallIdHash,
          tool: known.id,
          status: 'completed',
        });
      } else if (
        (status === 'denied' || status === 'invalid' || status === 'failed') &&
        typeof value.code === 'string' &&
        failureCodes.has(value.code)
      ) {
        if (status === 'denied') record.policy = 'denied';
        transcript.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify({ status, code: value.code }),
        });
        toolCompleted = true;
        emit({ type: 'tool_completed', operationId, requestedCallIdHash, tool: known.id, status });
        throw new Stop(
          status === 'denied' ? 'invalid' : 'failed',
          status === 'denied' ? 'policy_denied' : 'tool_failed'
        );
      } else throw new Stop('invalid', 'invalid_environment');
      active();
    } finally {
      if (!toolCompleted)
        emit({
          type: 'tool_completed',
          operationId,
          requestedCallIdHash,
          tool: known?.id ?? 'unknown',
          status: record.policy === 'denied' ? 'denied' : 'failed',
        });
    }
  }
  async function run(): Promise<AgentWorkflowResult> {
    sessionState = controller.signal.aborted ? 'cancelling' : 'running';
    started = Date.now();
    const timeout = workflow?.environment.policy.budgets.timeout_ms ?? 1;
    const timer = setTimeout(() => {
      deadlineExpired = true;
      abort();
    }, timeout);
    const cleanupMs =
      options.cleanupTimeoutMs ?? (workflow?.environment.type === 'sandbox' ? 6000 : 1000);
    try {
      if (!workflow) throw new Stop('invalid', 'invalid_workflow');
      if (
        !Number.isInteger(cleanupMs) ||
        cleanupMs < 1 ||
        cleanupMs > 10_000 ||
        !target ||
        typeof target.turn !== 'function' ||
        typeof target.capabilities !== 'function'
      )
        throw new Stop('invalid', 'invalid_options');
      active();
      emit({ type: 'started' });
      const initialState = options.preflightOnly
        ? {}
        : await owned(
            () => resolveWorkflowInitialState(workflow as AgentWorkflow, options.fixtureRoot),
            controller.signal
          ).catch((error) => {
            if (error instanceof Stop) throw error;
            throw new Stop('invalid', 'invalid_fixture');
          });
      active();
      const advertised = await owned(
        () =>
          target.capabilities(
            { timeoutMs: Math.max(1, timeout - (Date.now() - started)) },
            controller.signal
          ),
        controller.signal
      );
      if (!safeBoundary(advertised)) throw new Stop('invalid', 'invalid_response');
      const capability = capabilitySchema.safeParse(advertised);
      if (!capability.success) throw new Stop('unsupported', 'target_unavailable');
      record.capability.advertised = capability.data.toolUse;
      record.capability.transportCancellation = capability.data.transportCancellation;
      if (!capability.data.toolUse) throw new Stop('unsupported', 'tool_use_unsupported');
      if (options.preflight || options.preflightOnly) await probe();
      if (!options.preflightOnly) {
        active();
        const factory =
          options.environmentFactory ??
          (workflow.environment.type === 'simulated'
            ? createSimulatedWorkflowEnvironment
            : createDockerWorkflowEnvironment);
        environment = await owned(async () => {
          const created = await factory({
            workflow: structuredClone(workflow as AgentWorkflow),
            initialState: structuredClone(initialState),
            signal: controller.signal,
          });
          // Retain late creation so cleanup can close it after deadline/cancellation.
          environment = created;
          if (finished && created && typeof created.close === 'function') {
            const lateController = new AbortController();
            const lateTimer = setTimeout(() => lateController.abort(), Math.min(1000, cleanupMs));
            try {
              await owned(() => created.close(lateController.signal), lateController.signal);
            } catch {
              /* Returned record already marks unresolved resources. */
            } finally {
              clearTimeout(lateTimer);
            }
          }
          return created;
        }, controller.signal);
        if (
          !environment ||
          environment.type !== workflow.environment.type ||
          typeof environment.execute !== 'function' ||
          typeof environment.snapshot !== 'function' ||
          typeof environment.close !== 'function' ||
          environment.capabilities?.network !== 'denied' ||
          environment.capabilities.commands !== 'denied' ||
          environment.capabilities.externalSideEffects !== 'denied' ||
          environment.capabilities.isolation !==
            (workflow.environment.type === 'simulated' ? 'memory' : 'container')
        )
          throw new Stop('invalid', 'invalid_environment');
        state = structuredClone(initialState);
        transcript = [{ role: 'system', content: workflow.workflow.system_instructions }];
        const tools: AgentTurnRequest['tools'] = workflow.tools.map((id) => {
          const descriptor = getWorkflowTool(id);
          if (!descriptor) throw new Stop('invalid', 'invalid_workflow');
          return {
            type: 'function',
            function: {
              name: id,
              description: descriptor.description,
              parameters: descriptor.inputSchema,
            },
          };
        });
        for (const turn of workflow.workflow.turns) {
          transcript.push(structuredClone(turn));
          while (true) {
            const answer = await model(transcript, tools);
            transcript.push(answer.message);
            const calls = answer.message.tool_calls ?? [];
            if (!calls.length) break;
            for (const call of calls) await executeTool(call, tools);
          }
        }
      }
      record.execution = 'completed';
      record.reason = 'finished';
    } catch (error) {
      if (error instanceof WorkflowEnvironmentInitializationError) {
        const detail = error.cleanup;
        const checked = safeBoundary(detail)
          ? cleanupSchema
              .extend({ pendingOperations: z.number().int().nonnegative().safe() })
              .safeParse(detail)
          : null;
        record.cleanup = checked?.success
          ? checked.data
          : { status: 'unresolved', artifacts: 'unknown', pendingOperations: 1 };
      }
      const stop =
        error instanceof WorkflowEnvironmentInitializationError
          ? new Stop('failed', 'environment_unavailable')
          : error instanceof Stop
            ? error
            : new Stop('failed', 'target_error');
      record.execution = stop.execution;
      record.reason = stop.reason;
    } finally {
      clearTimeout(timer);
      controller.abort();
      const cleanup = new AbortController();
      const drainController = new AbortController();
      const drainBudget = Math.max(
        1,
        Math.floor(
          (Number.isInteger(cleanupMs) && cleanupMs >= 1 && cleanupMs <= 10_000
            ? cleanupMs
            : 1000) / 3
        )
      );
      const drainTimer = setTimeout(() => drainController.abort(), drainBudget);
      let adapterPending = 0;
      try {
        const drain = target?.drain;
        if (typeof drain === 'function') {
          const value = await owned(
            () => drain.call(target, { timeoutMs: drainBudget }),
            drainController.signal
          );
          if (
            value &&
            Number.isSafeInteger(value.pendingOperations) &&
            value.pendingOperations >= 0
          )
            adapterPending = value.pendingOperations;
          else adapterPending = 1;
        }
        const callbacks = [...pending];
        if (callbacks.length)
          await owned(() => Promise.allSettled(callbacks), drainController.signal);
      } catch {
        adapterPending =
          typeof target?.drain === 'function' ? Math.max(1, adapterPending) : adapterPending;
      }
      clearTimeout(drainTimer);
      record.usage.inFlightUnknown = modelPending.size > 0 || adapterPending > 0;
      const pendingBeforeClose = pending.size;
      if (environment && typeof environment.close === 'function') {
        const snapshotController = new AbortController();
        const snapshotTimer = setTimeout(() => snapshotController.abort(), drainBudget);
        if (
          !pendingBeforeClose &&
          typeof environment.snapshot === 'function' &&
          !cleanup.signal.aborted
        ) {
          try {
            const snapshot = await owned(
              () => (environment as WorkflowEnvironment).snapshot(snapshotController.signal),
              snapshotController.signal
            );
            if (isWorkflowState(snapshot)) state = structuredClone(snapshot);
            else state = null;
          } catch {
            state = null;
          }
        } else state = null;
        clearTimeout(snapshotTimer);
        const closeTimer = setTimeout(() => cleanup.abort(), drainBudget);
        try {
          const result = await owned(
            () => (environment as WorkflowEnvironment).close(cleanup.signal),
            cleanup.signal
          );
          const checked = safeBoundary(result) ? cleanupSchema.safeParse(result) : null;
          if (checked?.success) record.cleanup = { ...checked.data, pendingOperations: 0 };
          else
            record.cleanup = { status: 'unresolved', artifacts: 'unknown', pendingOperations: 0 };
        } catch {
          record.cleanup = { status: 'unresolved', artifacts: 'unknown', pendingOperations: 0 };
        } finally {
          clearTimeout(closeTimer);
        }
      }
      record.cleanup.pendingOperations = Math.max(
        record.cleanup.pendingOperations,
        pending.size,
        adapterPending
      );
      if (record.cleanup.pendingOperations || pendingBeforeClose || cleanup.signal.aborted) {
        record.cleanup.status = 'unresolved';
        record.cleanup.artifacts = 'unknown';
      }
      if (record.cleanup.status === 'unresolved') state = null;

      options.signal?.removeEventListener('abort', abort);
      record.usage.missingRequests = record.budgets.modelRequests - measuredRequests;
      const tokenLimit = workflow?.environment.policy.budgets.max_tokens;
      record.budgets.tokenOvershoot =
        tokenLimit === undefined ? 0 : Math.max(0, record.usage.reported.total - tokenLimit);
      record.usage.status = measuredRequests
        ? record.usage.missingRequests || record.usage.inFlightUnknown
          ? 'partial'
          : 'reported'
        : 'unavailable';
      if (state) {
        const files = isWorkflowState(state.files)
          ? Object.entries(state.files)
              .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              .sort(([a], [b]) => a.localeCompare(b))
          : [];
        record.artifacts = {
          state: 'available',
          stateSha256: hash(JSON.stringify(state)),
          files: files.slice(0, 100).map(([path, content]) => ({
            pathSha256: hash(path),
            contentSha256: hash(content),
            bytes: Buffer.byteLength(content),
          })),
          omittedFiles: Math.max(0, files.length - 100),
        };
      }
      record.budgets.elapsedMs = Math.max(0, Date.now() - started);
      emit({ type: 'finished', status: record.execution === 'completed' ? 'completed' : 'failed' });
      finished = true;
      sessionState = 'completed';
      for (const wake of listeners) wake();
    }
    return {
      record: structuredClone(record),
      state: state ? structuredClone(state) : null,
      transcript: structuredClone(transcript),
    };
  }
  return {
    get state() {
      return sessionState;
    },
    run() {
      if (!promise) {
        sessionState = controller.signal.aborted ? 'cancelling' : 'running';
        // Assign before emitting events so a reentrant observer cannot start a second run.
        promise = Promise.resolve().then(run);
      }
      return promise;
    },
    cancel: abort,
    async *events() {
      let index = 0;
      while (true) {
        while (index < retained.length) yield structuredClone(retained[index++]);
        if (finished) return;
        await new Promise<void>((resolve) => {
          const wake = () => {
            listeners.delete(wake);
            resolve();
          };
          listeners.add(wake);
        });
      }
    },
  };
}

export function runAgentWorkflow(
  options: AgentWorkflowSessionOptions
): Promise<AgentWorkflowResult> {
  return createAgentWorkflowSession(options).run();
}
