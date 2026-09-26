import type { AgentWorkflowRecord } from './session';

export type WorkflowOutcomeStatus = 'passed' | 'failed' | 'invalid' | 'unavailable';
export interface WorkflowAssertionCounts {
  declared: number;
  passed: number;
  failed: number;
  invalid: number;
  unavailable: number;
  valid: number;
}
export interface WorkflowOutcomeDecision {
  status: WorkflowOutcomeStatus;
  reason:
    | 'verified'
    | 'required_outcome_failed'
    | 'invalid_evaluation'
    | 'evaluation_unavailable'
    | 'execution_incomplete'
    | 'policy_denied'
    | 'target_usage_unavailable'
    | 'cleanup_unresolved'
    | 'preflight_only'
    | 'cancelled';
  /** Valid task failures are eligible. Missing/invalid measurements are not. */
  task: { eligible: 0 | 1; passed: 0 | 1; failed: 0 | 1 };
}

export function validWorkflowAssertionCounts(counts: WorkflowAssertionCounts): boolean {
  return (
    Object.values(counts).every((value) => Number.isSafeInteger(value) && value >= 0) &&
    counts.declared <= 120 &&
    counts.declared === counts.passed + counts.failed + counts.invalid + counts.unavailable &&
    counts.valid === counts.passed + counts.failed
  );
}

/** Shared conjunction/eligibility rules for the engine and saved-record validation. */
export function decideWorkflowOutcome(options: {
  purpose: 'workflow' | 'preflight';
  record: Pick<
    AgentWorkflowRecord,
    'execution' | 'policy' | 'usage' | 'cleanup' | 'artifacts' | 'configuration'
  >;
  deterministic: WorkflowAssertionCounts;
  semantic: WorkflowAssertionCounts;
  cancelled: boolean;
}): WorkflowOutcomeDecision {
  const decision = (
    status: WorkflowOutcomeStatus,
    reason: WorkflowOutcomeDecision['reason']
  ): WorkflowOutcomeDecision => ({
    status,
    reason,
    task: {
      eligible: status === 'passed' || status === 'failed' ? 1 : 0,
      passed: status === 'passed' ? 1 : 0,
      failed: status === 'failed' ? 1 : 0,
    },
  });
  if (options.purpose === 'preflight') return decision('unavailable', 'preflight_only');
  if (options.cancelled) return decision('unavailable', 'cancelled');
  if (options.record.policy === 'denied') return decision('unavailable', 'policy_denied');
  if (options.record.execution !== 'completed')
    return decision('unavailable', 'execution_incomplete');
  if (
    options.record.cleanup.status !== 'completed' ||
    options.record.cleanup.pendingOperations !== 0
  )
    return decision('unavailable', 'cleanup_unresolved');
  if (
    options.record.usage.status !== 'reported' ||
    options.record.usage.missingRequests !== 0 ||
    options.record.usage.inFlightUnknown
  )
    return decision('unavailable', 'target_usage_unavailable');
  if (
    !options.record.configuration ||
    options.record.artifacts.state !== 'available' ||
    !options.record.artifacts.stateSha256
  )
    return decision('unavailable', 'evaluation_unavailable');
  if (
    !validWorkflowAssertionCounts(options.deterministic) ||
    !validWorkflowAssertionCounts(options.semantic) ||
    options.deterministic.declared === 0
  )
    return decision('invalid', 'invalid_evaluation');

  // One independently established required failure proves conjunction failure. Remaining
  // semantic work is skipped, retains unavailable coverage, and never becomes a pass.
  if (options.deterministic.failed) return decision('failed', 'required_outcome_failed');
  if (options.deterministic.invalid) return decision('invalid', 'invalid_evaluation');
  if (options.deterministic.unavailable) return decision('unavailable', 'evaluation_unavailable');
  if (options.semantic.failed) return decision('failed', 'required_outcome_failed');
  if (options.semantic.invalid) return decision('invalid', 'invalid_evaluation');
  if (options.semantic.unavailable) return decision('unavailable', 'evaluation_unavailable');
  return decision('passed', 'verified');
}
