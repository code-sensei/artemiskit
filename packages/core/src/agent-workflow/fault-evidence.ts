import { isDeepStrictEqual } from 'node:util';
import { type WorkflowToolId, getWorkflowTool } from './catalog';
import { planWorkflowFault } from './faults';
import { type WorkflowRecoveryEvidence, validWorkflowRecovery } from './recovery';
import type { AgentWorkflow } from './schema';
import type { AgentTurnRequest } from './target';

type Event = {
  type: string;
  phase: string;
  operationId?: string;
  requestedCallIdHash?: string;
  tool?: string;
  status?: string;
};
const number = (id: string) => Number(id.slice(5));
const preEffect = (kind?: string) => kind === 'unavailable_tool' || kind === 'timeout';

/** A failed attempt is admissible only when linked to an explicit pre-effect fault. */
export function validWorkflowFaultEvidence(
  recovery: WorkflowRecoveryEvidence,
  events: readonly Event[],
  toolCalls: number,
  droppedEvents: number,
  completed: boolean
): boolean {
  if (!validWorkflowRecovery(recovery)) return false;
  const faults = new Map(recovery.faults.entries.map((entry) => [entry.operationId, entry]));
  const retries = new Map(recovery.retries.entries.map((entry) => [entry.operationId, entry]));
  if (
    faults.size !== recovery.faults.injected ||
    retries.size !== recovery.retries.attempted ||
    recovery.retries.omitted !== 0 ||
    recovery.retries.attempted > recovery.faults.injected ||
    recovery.retries.exhausted > recovery.faults.injected ||
    recovery.faults.entries.some((entry) => number(entry.operationId) > toolCalls) ||
    recovery.faults.entries.some((entry) => {
      const fixture = ['stale_data', 'incomplete_data', 'malformed_result'].includes(entry.kind);
      const instruction = entry.kind === 'conflicting_instructions';
      return (
        fixture !== (entry.fixture_sha256 !== undefined && entry.fixture_bytes !== undefined) ||
        (!fixture && (entry.fixture_sha256 !== undefined || entry.fixture_bytes !== undefined)) ||
        instruction !==
          (entry.instruction_sha256 !== undefined && entry.instruction_bytes !== undefined) ||
        (!instruction &&
          (entry.instruction_sha256 !== undefined || entry.instruction_bytes !== undefined))
      );
    }) ||
    recovery.retries.entries.some(
      (entry, index) =>
        number(entry.operationId) > toolCalls ||
        number(entry.operationId) !== number(entry.previousOperationId) + 1 ||
        (index > 0 &&
          number(entry.operationId) <= number(recovery.retries.entries[index - 1].operationId)) ||
        !preEffect(faults.get(entry.previousOperationId)?.kind) ||
        entry.attempt !== (retries.get(entry.previousOperationId)?.attempt ?? 1) + 1
    )
  )
    return false;
  // Fault declarations and retry links are bounded in full even when event traces truncate.
  if (completed) {
    const successors = new Set(recovery.retries.entries.map((entry) => entry.previousOperationId));
    if (
      recovery.retries.exhausted !== 0 ||
      recovery.retries.recovered !==
        recovery.retries.entries.filter((entry) => !successors.has(entry.operationId)).length ||
      recovery.faults.entries.some(
        (entry) =>
          entry.kind === 'malformed_result' ||
          (preEffect(entry.kind) && !successors.has(entry.operationId))
      )
    )
      return false;
  }
  const requests = new Map(
    events
      .filter((event) => event.type === 'tool_requested')
      .map((event) => [event.operationId, event])
  );
  const results = new Map(
    events
      .filter((event) => event.type === 'tool_completed')
      .map((event) => [event.operationId, event])
  );
  for (const fault of faults.values()) {
    const request = requests.get(fault.operationId);
    const result = results.get(fault.operationId);
    if (
      (!droppedEvents && (!request || !result)) ||
      (request && (request.phase !== 'execution' || request.tool !== fault.tool)) ||
      (result && result.tool !== fault.tool) ||
      (result?.status === 'completed' &&
        (preEffect(fault.kind) || fault.kind === 'malformed_result'))
    )
      return false;
  }
  for (const retry of retries.values()) {
    const previous = results.get(retry.previousOperationId);
    const request = requests.get(retry.operationId);
    if (
      (!droppedEvents && (!previous || !request)) ||
      (previous && previous.status !== 'failed') ||
      (request && request.phase !== 'execution') ||
      (previous &&
        request &&
        (previous.requestedCallIdHash !== request.requestedCallIdHash ||
          previous.tool !== request.tool))
    )
      return false;
  }
  if (!droppedEvents) {
    const recovered = recovery.retries.entries.filter(
      (entry) => results.get(entry.operationId)?.status === 'completed'
    ).length;
    if (recovered !== recovery.retries.recovered) return false;
    const successors = new Set(recovery.retries.entries.map((entry) => entry.previousOperationId));
    const exhausted = recovery.faults.entries.filter(
      (entry) =>
        preEffect(entry.kind) &&
        results.get(entry.operationId)?.status === 'failed' &&
        !successors.has(entry.operationId) &&
        (retries.get(entry.operationId)?.attempt ?? 1) === recovery.retries.maxAttempts
    ).length;
    if (recovery.retries.exhausted > exhausted || (completed && recovery.retries.exhausted !== 0))
      return false;
  }
  return true;
}

/** Reconstruct the complete deterministic schedule from private logical replies, even if public events truncated. */
export function validCheckpointFaultSchedule(
  workflow: AgentWorkflow,
  transcript: AgentTurnRequest['messages'],
  recovery: WorkflowRecoveryEvidence,
  preflight: boolean
): boolean {
  const faults = workflow.faults ?? [];
  if (
    recovery.faults.declared !== faults.length ||
    recovery.retries.maxAttempts !== (workflow.retry?.max_attempts ?? 1) ||
    recovery.retries.omitted ||
    recovery.retries.exhausted
  )
    return false;
  const calls = new Map(
    transcript.flatMap((message) => message.tool_calls ?? []).map((call) => [call.id, call])
  );
  const occurrences = new Map<string, number>();
  const injected: WorkflowRecoveryEvidence['faults']['entries'] = [];
  const links: WorkflowRecoveryEvidence['retries']['entries'] = [];
  const retries = new Map(recovery.retries.entries.map((entry) => [entry.operationId, entry]));
  let operation = preflight ? 1 : 0;
  let recovered = 0;
  for (const reply of transcript.filter((message) => message.role === 'tool')) {
    const call = calls.get(reply.toolCallId ?? '');
    const tool = call && getWorkflowTool(call.function.name);
    if (!call || !tool) return false;
    const occurrence = (occurrences.get(tool.id) ?? 0) + 1;
    occurrences.set(tool.id, occurrence);
    let attempt = 1;
    while (true) {
      const operationId = `tool-${++operation}`;
      const plan = planWorkflowFault(faults, {
        tool: tool.id as WorkflowToolId,
        occurrence,
        attempt,
        consumedFaultIndices: injected.map((entry) => entry.index),
      });
      if (plan.fault) injected.push({ ...plan.fault, operationId });
      const retry = retries.get(`tool-${operation + 1}`);
      if (retry?.previousOperationId === operationId) {
        if (
          plan.kind !== 'fail' ||
          attempt >= recovery.retries.maxAttempts ||
          retry.attempt !== attempt + 1
        )
          return false;
        links.push({
          operationId: `tool-${operation + 1}`,
          previousOperationId: operationId,
          attempt: ++attempt,
        });
      } else {
        if (plan.kind === 'fail' || (plan.kind === 'substitute' && plan.validity === 'malformed'))
          return false;
        if (attempt > 1) recovered++;
        break;
      }
    }
  }

  return (
    isDeepStrictEqual(injected, recovery.faults.entries) &&
    isDeepStrictEqual(links, recovery.retries.entries) &&
    recovered === recovery.retries.recovered
  );
}
