/**
 * Built-in `agent_workflow` attempt executor for `runExperiment`.
 *
 * The executor loads a task's workflow from a host-supplied root, proves the bytes match the
 * declared artifact identity, runs it once through the native workflow engine against the
 * coordinate's target, and maps the saved workflow record onto the experiment attempt
 * contract. Workflows only run in their declared `simulated` or `sandbox` environment with
 * network denied, so no attempt has a live side effect. It never discovers providers or
 * credentials: the host supplies a `ModelClient` per target.
 */

import path from 'node:path';
import type { ModelClient } from '../../adapters/types';
import { resolveWorkflowInitialState } from '../../agent-workflow/environment';
import { parseAgentWorkflow, validateAgentWorkflow } from '../../agent-workflow/parser';
import type { AgentWorkflow } from '../../agent-workflow/schema';
import {
  type AgentWorkflowReason,
  type AgentWorkflowRecord,
  createAgentWorkflowSession,
} from '../../agent-workflow/session';
import { type AgentTarget, createModelClientTarget } from '../../agent-workflow/target';
import type { ContentIdentity } from '../../artifacts/types';
import { type GenerationSettings, readGenerationSettings } from '../../runner/generation';
import { targetCostApplies } from '../runner';
import type {
  ExecutedExperimentAttemptStatus,
  ExperimentAttemptDemand,
  ExperimentAttemptExecutor,
  ExperimentAttemptInput,
  ExperimentAttemptOutput,
  ExperimentDemandRequest,
  ExperimentTarget,
  ExperimentTask,
  ExperimentTaskEvidence,
} from '../types';
import {
  type ExperimentAttemptCost,
  attemptWithoutRequests,
  closeClient,
  isModelClient,
  attemptOutput as output,
  resolveAttemptCost,
  unavailableEvidence,
} from './attempt';
import { canonicalJsonIdentity } from './content-identity';
import { type ClientMeter, meterClient } from './metered-client';
import { decodeUtf8, loadTaskSource } from './task-source';

/** Evidence handed to the host before the attempt result is returned. */
export interface WorkflowExperimentEvidenceRecord {
  coordinate_id: string;
  attempt_number: number;
  /** Metadata-only workflow record; it never contains model text or fixture content. */
  record: AgentWorkflowRecord;
  /** SHA-256 identity of the canonical JSON of `record`; see `workflowRecordIdentity`. */
  artifact: ContentIdentity;
}

export type WorkflowExperimentCost = ExperimentAttemptCost;

export interface WorkflowExperimentExecutorOptions {
  /** Absolute directory that every `task.source.path` must resolve under. */
  root: string;
  /** Build the client for one attempt. The executor closes it when the attempt ends. */
  createClient: (target: ExperimentTarget) => ModelClient | Promise<ModelClient>;
  /** Persist the workflow record. A throw marks the attempt `infrastructure_failed`. */
  onEvidence?: (record: WorkflowExperimentEvidenceRecord) => void | Promise<void>;
  /** Environment cleanup wait (1..10000 ms); the engine default applies when omitted. */
  cleanupTimeoutMs?: number;
  /**
   * Attested spend for metered targets only. Never called for targets that declare
   * `cost_basis: not_applicable`. Returning `undefined` leaves cost unreported.
   */
  resolveCost?: (
    target: ExperimentTarget,
    record: AgentWorkflowRecord
  ) => WorkflowExperimentCost | undefined;
}

type Classification = { status: ExecutedExperimentAttemptStatus; error_code?: string };
type Prepared = { ok: true; workflow: AgentWorkflow } | { ok: false; code: string };

/** Generation settings the workflow engine sends with every target request. */
const TRANSPORTED_GENERATION_SETTINGS = new Set(['temperature', 'max_output_tokens']);

/** Engine stops caused by the transport, the provider or the environment, not the target. */
const INFRASTRUCTURE_REASONS: Partial<Record<AgentWorkflowReason, string>> = {
  target_error: 'target_error',
  target_unavailable: 'target_unavailable',
  deadline: 'workflow_deadline',
  environment_unavailable: 'environment_unavailable',
  cancelled: 'workflow_cancelled',
};

/** The workflow's own declared action, request, tool-call and token limits. */
const WORKFLOW_BUDGET_REASONS = new Set<AgentWorkflowReason>([
  'max_actions',
  'max_model_requests',
  'max_tool_calls',
  'max_tokens',
]);

/**
 * Create an attempt executor that runs `agent_workflow` tasks through the native workflow
 * engine.
 *
 * The coordinate's target replaces the workflow's declared `target.provider` and
 * `target.model`; its `temperature` and `max_output_tokens` settings replace the workflow's
 * generation values. A file `initial_state` fixture is resolved under the workflow's
 * directory and inlined before the run, so the record's configuration digest covers it.
 *
 * Refused before any request (`invalid`, zero usage): a source outside the root, a digest
 * mismatch, an invalid workflow or fixture, a target setting the engine cannot send
 * (`top_p`, `top_k`, `min_p`, `presence_penalty`), a coordinate seed (the engine sends none),
 * and semantic outcomes (no independent judge is configured). Fewer remaining requests than
 * the workflow has turns is `incomplete`.
 *
 * Status precedence: request budget stop → `incomplete`; transport, provider, deadline,
 * environment or cleanup failure → `infrastructure_failed`; any response cut off at its token
 * limit → `invalid` (`response_truncated`); a tool call outside the declared authority →
 * `policy_failed` (`policy_denied`); exhausting the workflow's own declared budgets →
 * `policy_failed` (`workflow_budget_exceeded`); any other stopped execution → `invalid`
 * (`workflow_<reason>`); then the engine's task verification: `passed` → `passed`, `failed` →
 * `task_failed`, otherwise `invalid` (`outcome_<reason>`).
 */
export function createWorkflowExperimentExecutor(
  options: WorkflowExperimentExecutorOptions
): ExperimentAttemptExecutor {
  assertOptions(options);
  const root = path.resolve(options.root);
  const execute: ExperimentAttemptExecutor = (input) => executeAttempt(root, options, input);
  execute.reserve = (request) => reserveAttempt(root, request);
  return execute;
}

/** SHA-256 identity of a workflow record's canonical JSON (recursively sorted object keys). */
export function workflowRecordIdentity(record: AgentWorkflowRecord): ContentIdentity {
  return canonicalJsonIdentity(record);
}

/**
 * Declared demand for concurrent admission (see `ExperimentAttemptExecutor.reserve`).
 *
 * Only requests are declared: the engine refuses every model request beyond the workflow's
 * `max_model_requests` (else `max_actions`), so that limit bounds an attempt's requests
 * exactly. Token use depends on what the model does, so tokens are never declared and a
 * pair under a token or cost budget runs alone.
 */
async function reserveAttempt(
  root: string,
  { task, target }: ExperimentDemandRequest
): Promise<ExperimentAttemptDemand | undefined> {
  const prepared = await prepareWorkflow(root, task, target);
  if (!prepared.ok) return;
  const budgets = prepared.workflow.environment.policy.budgets;
  return { requests: budgets.max_model_requests ?? budgets.max_actions };
}

async function executeAttempt(
  root: string,
  options: WorkflowExperimentExecutorOptions,
  input: ExperimentAttemptInput
): Promise<ExperimentAttemptOutput> {
  const { task, target, coordinate } = input;
  const prepared = await prepareWorkflow(root, task, target);
  if (!prepared.ok) return attemptWithoutRequests(task.kind, prepared.code);
  if (coordinate.seed !== undefined) {
    return attemptWithoutRequests(task.kind, 'workflow_seed_unsupported');
  }
  // Every user turn needs at least one model request.
  if (prepared.workflow.workflow.turns.length > input.remaining_budget.requests) {
    return attemptWithoutRequests(task.kind, 'request_budget_insufficient', 'incomplete');
  }

  let client: ModelClient;
  try {
    client = await options.createClient(structuredClone(target));
    if (!isModelClient(client)) throw new TypeError('createClient returned no ModelClient');
  } catch {
    return attemptWithoutRequests(task.kind, 'client_unavailable', 'infrastructure_failed');
  }

  try {
    const meter = meterClient(client, input.remaining_budget.requests);
    let agentTarget: AgentTarget;
    try {
      agentTarget = createModelClientTarget(meter.client);
    } catch {
      return attemptWithoutRequests(task.kind, 'client_unavailable', 'infrastructure_failed');
    }
    return await runAndReport(options, input, prepared.workflow, agentTarget, meter);
  } finally {
    await closeClient(client);
  }
}

async function runAndReport(
  options: WorkflowExperimentExecutorOptions,
  input: ExperimentAttemptInput,
  workflow: AgentWorkflow,
  agentTarget: AgentTarget,
  meter: ClientMeter
): Promise<ExperimentAttemptOutput> {
  const { target, coordinate } = input;
  let record: AgentWorkflowRecord;
  try {
    const session = createAgentWorkflowSession({
      workflow,
      target: agentTarget,
      ...(options.cleanupTimeoutMs !== undefined
        ? { cleanupTimeoutMs: options.cleanupTimeoutMs }
        : {}),
    });
    record = (await session.run()).record;
  } catch {
    return output(
      'infrastructure_failed',
      meter.usage(),
      unavailableEvidence('agent_workflow'),
      'workflow_run_failed'
    );
  }

  const classification = classifyAttempt(meter, record);
  const artifact = workflowRecordIdentity(record);

  if (options.onEvidence) {
    try {
      await options.onEvidence({
        coordinate_id: coordinate.coordinate_id,
        attempt_number: input.attempt_number,
        record,
        artifact,
      });
    } catch {
      return output(
        'infrastructure_failed',
        meter.usage(),
        unavailableEvidence('agent_workflow'),
        'evidence_store_failed'
      );
    }
  }

  const evidence: ExperimentTaskEvidence = {
    kind: 'agent_workflow',
    availability: 'available',
    artifact,
  };
  const usage = meter.usage();
  if (targetCostApplies(target) && options.resolveCost) {
    const resolve = options.resolveCost;
    const cost = resolveAttemptCost(() => resolve(structuredClone(target), record));
    if (cost === null) {
      return output('infrastructure_failed', usage, evidence, 'cost_resolution_failed');
    }
    if (cost) usage.cost = cost;
  }
  return output(classification.status, usage, evidence, classification.error_code);
}

/**
 * Load, verify and parse the task's workflow, then bind it to the coordinate's target. Shared
 * by execution and demand declaration so both refuse the same tasks.
 */
async function prepareWorkflow(
  root: string,
  task: ExperimentTask,
  target: ExperimentTarget
): Promise<Prepared> {
  if (task.kind !== 'agent_workflow' || task.source.kind !== 'agent_workflow') {
    return { ok: false, code: 'task_kind_unsupported' };
  }
  const source = await loadTaskSource(root, task.source);
  if (!source.ok) return { ok: false, code: source.code };

  const declared = parseWorkflowBytes(source.bytes);
  if (!declared) return { ok: false, code: 'workflow_invalid' };
  if (declared.outcomes.semantic?.length) {
    return { ok: false, code: 'semantic_judge_unavailable' };
  }
  const generation = targetGenerationSettings(target);
  if (!generation.ok) return generation;

  let initialState: Awaited<ReturnType<typeof resolveWorkflowInitialState>>;
  try {
    initialState = await resolveWorkflowInitialState(declared, path.dirname(source.file));
  } catch {
    return { ok: false, code: 'workflow_fixture_invalid' };
  }
  try {
    return {
      ok: true,
      workflow: validateAgentWorkflow(
        bindWorkflow(declared, target, generation.settings, initialState)
      ),
    };
  } catch {
    // The target's provider or model, or the inlined state, cannot be expressed in a workflow.
    return { ok: false, code: 'workflow_target_unrepresentable' };
  }
}

/**
 * Parse without `${VAR}` expansion or fixture dereferencing: the measured workflow must equal
 * the digested bytes, and host environment values must never reach a model prompt.
 */
function parseWorkflowBytes(bytes: Uint8Array): AgentWorkflow | undefined {
  const text = decodeUtf8(bytes);
  if (text === undefined) return undefined;
  try {
    return parseAgentWorkflow(text);
  } catch {
    return undefined;
  }
}

type TargetGeneration = { ok: true; settings: GenerationSettings } | { ok: false; code: string };

/** Read the target's generation settings, refusing values the workflow engine would not send. */
function targetGenerationSettings(target: ExperimentTarget): TargetGeneration {
  const { settings, issues } = readGenerationSettings(target.settings);
  if (issues.length > 0) return { ok: false, code: 'generation_settings_invalid' };
  const untransported = Object.keys(settings).some(
    (key) => !TRANSPORTED_GENERATION_SETTINGS.has(key)
  );
  return untransported
    ? { ok: false, code: 'generation_setting_unsupported' }
    : { ok: true, settings };
}

/** The measured workflow: the coordinate's target and settings, with its fixture inlined. */
function bindWorkflow(
  workflow: AgentWorkflow,
  target: ExperimentTarget,
  generation: GenerationSettings,
  initialState: Awaited<ReturnType<typeof resolveWorkflowInitialState>>
): unknown {
  const declaredGeneration = workflow.target.generation ?? {};
  const maxTokens = generation.max_output_tokens ?? declaredGeneration.max_tokens;
  const temperature = generation.temperature ?? declaredGeneration.temperature;
  return {
    ...workflow,
    target: {
      provider: target.provider,
      model: target.model,
      ...(maxTokens !== undefined || temperature !== undefined
        ? {
            generation: {
              ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
              ...(temperature !== undefined ? { temperature } : {}),
            },
          }
        : {}),
    },
    workflow: { ...workflow.workflow, initial_state: initialState },
  };
}

/**
 * Map the engine's record onto an attempt status. A response cut off at its token limit is
 * not a valid decision to score: it measures the output cap, so it ranks above the target's
 * own policy and task results.
 */
function classifyAttempt(meter: ClientMeter, record: AgentWorkflowRecord): Classification {
  if (meter.budgetStopped()) {
    return { status: 'incomplete', error_code: 'request_budget_exhausted' };
  }
  const infrastructure =
    record.execution === 'completed' ? undefined : INFRASTRUCTURE_REASONS[record.reason];
  if (infrastructure) return { status: 'infrastructure_failed', error_code: infrastructure };
  if (record.cleanup.status !== 'completed' || record.cleanup.pendingOperations !== 0) {
    return { status: 'infrastructure_failed', error_code: 'cleanup_unresolved' };
  }
  if (meter.truncated()) return { status: 'invalid', error_code: 'response_truncated' };
  if (record.policy === 'denied') return { status: 'policy_failed', error_code: 'policy_denied' };
  if (record.execution === 'budget_exceeded' && WORKFLOW_BUDGET_REASONS.has(record.reason)) {
    return { status: 'policy_failed', error_code: 'workflow_budget_exceeded' };
  }
  if (record.execution !== 'completed') {
    return { status: 'invalid', error_code: `workflow_${record.reason}` };
  }
  switch (record.taskVerification) {
    case 'passed':
      return { status: 'passed' };
    case 'failed':
      return { status: 'task_failed' };
    default:
      return { status: 'invalid', error_code: `outcome_${record.outcomes.reason}` };
  }
}

function assertOptions(options: WorkflowExperimentExecutorOptions): void {
  if (typeof options?.root !== 'string' || !path.isAbsolute(options.root)) {
    throw new TypeError('Workflow executor root must be an absolute path');
  }
  if (typeof options.createClient !== 'function') {
    throw new TypeError('Workflow executor requires a createClient function');
  }
  if (
    options.cleanupTimeoutMs !== undefined &&
    (!Number.isSafeInteger(options.cleanupTimeoutMs) ||
      options.cleanupTimeoutMs < 1 ||
      options.cleanupTimeoutMs > 10_000)
  ) {
    throw new TypeError('Workflow executor cleanupTimeoutMs must be an integer from 1 to 10000');
  }
}
