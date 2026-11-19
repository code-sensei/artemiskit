import type { ContentIdentity } from '../artifacts/types';

export type ExperimentMode = 'fixture' | 'live';
export type ExperimentTaskKind = 'scenario_evaluation' | 'agent_workflow';

export interface ExperimentIdentity {
  schema_version: '1';
  workload: ContentIdentity;
  rubric: ContentIdentity;
  policy?: ContentIdentity;
  profile?: ContentIdentity;
}

export interface ExperimentTaskSource {
  kind: ExperimentTaskKind;
  /** Safe repository-relative scenario or workflow definition. */
  path: string;
  /** Identity of the exact source artifact the host must load and verify. */
  artifact: ContentIdentity;
}

export interface ExperimentTask {
  id: string;
  kind: ExperimentTaskKind;
  source: ExperimentTaskSource;
  required_capabilities: string[];
  language?: string;
  policy?: string;
}

export type ExperimentSetting = string | number | boolean;

/**
 * Where a target's inference runs. `cost_basis: 'not_applicable'` is valid only for local
 * deployments: live runs then require token usage but no cost, and reports state that no
 * metered spend exists. Hosts must verify locality (for example a loopback endpoint) before
 * accepting the declaration; core cannot observe endpoints.
 */
export interface ExperimentTargetDeployment {
  locality: 'local' | 'remote';
  /** Serving runtime such as `ollama`. Display metadata, not a claim of native provider support. */
  runtime?: string;
  cost_basis: 'metered' | 'not_applicable';
}

/** Organization that publishes the model, independent of the runtime serving it. */
export interface ExperimentTargetPublisher {
  id: string;
  name: string;
}

export interface ExperimentTargetWeights {
  availability: 'open' | 'closed';
  /** Declared licence identifier such as `Apache-2.0`. */
  license?: string;
}

export interface ExperimentTarget {
  id: string;
  provider: string;
  model: string;
  capabilities: string[];
  settings?: Record<string, ExperimentSetting>;
  deployment?: ExperimentTargetDeployment;
  publisher?: ExperimentTargetPublisher;
  weights?: ExperimentTargetWeights;
}

export type RetryableExperimentStatus = 'incomplete' | 'invalid' | 'infrastructure_failed';

export interface ExperimentRetryPolicy {
  /** Includes the original attempt. */
  max_attempts: number;
  retry_on: RetryableExperimentStatus[];
}

export interface ExperimentCostLimit {
  amount: number;
  currency: string;
}

export interface ExperimentBudgets {
  max_requests: number;
  max_tokens?: number;
  max_cost?: ExperimentCostLimit;
}

export interface ExperimentSeed {
  value: number;
  strategy: 'fixed' | 'increment_by_repetition';
  require_support: boolean;
}

export interface ExperimentExclusion {
  id: string;
  reason: string;
  task_id?: string;
  target_id?: string;
}

export type ExperimentStopReason =
  | 'request_budget_exhausted'
  | 'token_budget_exhausted'
  | 'cost_budget_exhausted'
  | 'usage_unreported'
  | 'usage_invalid'
  | 'budget_exceeded';

/**
 * Maximum number of matrix coordinates in flight at once (integer 1..8). Attempts of one
 * coordinate always run serially; `1` is fully serial execution.
 */
export type ExperimentConcurrency = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface ExperimentLiveControls {
  /**
   * Host-approved upper bound on parallel live coordinates (integer 1..8). The manifest's
   * `concurrency` must not exceed it, so parallel live calls are always an explicit decision.
   */
  concurrency_ceiling: ExperimentConcurrency;
  stop_conditions: ExperimentStopReason[];
}

export interface ExperimentManifest {
  schema_version: '1';
  id: string;
  mode: ExperimentMode;
  identities: ExperimentIdentity;
  tasks: ExperimentTask[];
  targets: ExperimentTarget[];
  repetitions: number;
  /**
   * Coordinates allowed in flight at once. `1` keeps deterministic serial execution; larger
   * values admit attempts under the fair-share budget rule documented on `runExperiment`.
   */
  concurrency: ExperimentConcurrency;
  seed?: ExperimentSeed;
  exclusions: ExperimentExclusion[];
  retry_policy: ExperimentRetryPolicy;
  budgets: ExperimentBudgets;
  live?: ExperimentLiveControls;
}

export type ExperimentComparisonStatus = 'compatible' | 'qualified' | 'incomparable';

export type ExperimentComparisonReasonCode =
  | 'policy_identity_missing'
  | 'policy_mismatch'
  | 'profile_identity_missing'
  | 'profile_mismatch'
  | 'rubric_mismatch'
  | 'workload_mismatch';

export interface ExperimentComparisonReason {
  code: ExperimentComparisonReasonCode;
}

export interface ExperimentCompatibility {
  schema_version: '1';
  status: ExperimentComparisonStatus;
  reasons: ExperimentComparisonReason[];
}

export type ExperimentAttemptStatus =
  | 'passed'
  | 'task_failed'
  | 'policy_failed'
  | 'invalid'
  | 'incomplete'
  | 'infrastructure_failed'
  | 'unsupported'
  | 'excluded';

export type ExecutedExperimentAttemptStatus = Exclude<
  ExperimentAttemptStatus,
  'unsupported' | 'excluded'
>;

export type ExperimentTaskEvidence =
  | {
      kind: 'scenario_evaluation';
      availability: 'available';
      artifact: ContentIdentity;
    }
  | {
      kind: 'scenario_evaluation';
      availability: 'unavailable';
    }
  | {
      kind: 'agent_workflow';
      availability: 'available';
      artifact: ContentIdentity;
    }
  | {
      kind: 'agent_workflow';
      availability: 'unavailable';
    };

export interface ExperimentAttemptUsage {
  requests: number;
  tokens?: number;
  cost?: {
    amount: number;
    currency: string;
  };
}

export interface ExperimentAttemptOutput {
  status: ExecutedExperimentAttemptStatus;
  usage: ExperimentAttemptUsage;
  evidence: ExperimentTaskEvidence;
  /** Sanitized machine-readable code; arbitrary provider error text is not retained. */
  error_code?: string;
}

export interface ExperimentCoordinate {
  coordinate_id: string;
  task_id: string;
  task_kind: ExperimentTaskKind;
  target_id: string;
  repetition_index: number;
  language?: string;
  policy?: string;
  seed?: number;
  missing_capabilities: string[];
  declared_exclusion?: ExperimentExclusion;
}

/**
 * Budget an attempt may still consume. Under concurrency it is the attempt's admission grant:
 * already net of everything consumed and of every grant held by other in-flight attempts.
 */
export interface ExperimentRemainingBudget {
  requests: number;
  tokens?: number;
  cost?: ExperimentCostLimit;
}

export interface ExperimentAttemptInput {
  experiment_id: string;
  coordinate: ExperimentCoordinate;
  task: ExperimentTask;
  target: ExperimentTarget;
  retry_chain_id: string;
  attempt_number: number;
  remaining_budget: ExperimentRemainingBudget;
}

/**
 * Declared upper bound of one attempt's use for a task × target pair. `requests` is also the
 * least the attempt needs: a concurrent run never grants an attempt fewer requests than its
 * declared demand. `tokens` and `cost` are reservations only.
 */
export interface ExperimentAttemptDemand {
  requests: number;
  tokens?: number;
  cost?: ExperimentCostLimit;
}

export interface ExperimentDemandRequest {
  experiment_id: string;
  task: ExperimentTask;
  target: ExperimentTarget;
}

/**
 * Runs one attempt. Optionally declares, through `reserve`, the demand every attempt of a
 * task × target pair stays within. Concurrent runs reserve exactly that demand per attempt;
 * pairs without a complete demand (one bounding every declared budget that applies) run alone.
 * `reserve` is consulted only when `manifest.concurrency` exceeds 1.
 */
export interface ExperimentAttemptExecutor {
  (input: ExperimentAttemptInput): Promise<ExperimentAttemptOutput>;
  reserve?: (
    request: ExperimentDemandRequest
  ) => ExperimentAttemptDemand | undefined | Promise<ExperimentAttemptDemand | undefined>;
}

/**
 * Replayable admission record for one attempt of a concurrent run (`concurrency` > 1).
 *
 * `admitted_at` and `settled_at` are positions in one run-wide event sequence: every attempt
 * contributes exactly one admission and one settlement event, so across a result they form
 * the permutation `0 .. 2 × attempts − 1`. Replaying the events in order re-derives the
 * shared budget ledger and therefore every grant. Serial results omit this record because
 * matrix order already fixes the sequence.
 */
export interface ExperimentAttemptAdmission {
  admitted_at: number;
  settled_at: number;
  /** Exactly the `remaining_budget` handed to the executor for this attempt. */
  granted_budget: ExperimentRemainingBudget;
}

export interface ExperimentAttemptEvidence extends ExperimentAttemptOutput {
  attempt_id: string;
  retry_chain_id: string;
  attempt_number: number;
  /** Present on every attempt when, and only when, the manifest's concurrency exceeds 1. */
  admission?: ExperimentAttemptAdmission;
}

export type ExperimentCompletionCode =
  | 'terminal'
  | 'capability_unsupported'
  | 'declared_exclusion'
  | 'budget_exhausted'
  | 'usage_unreported'
  | 'usage_invalid'
  | 'budget_exceeded';

export interface ExperimentCoordinateResult {
  coordinate: ExperimentCoordinate;
  status: ExperimentAttemptStatus;
  completion_code: ExperimentCompletionCode;
  attempts: ExperimentAttemptEvidence[];
}

export interface ExperimentSummary {
  planned: number;
  attempted: number;
  unattempted: number;
  valid: number;
  invalid: number;
  unsupported: number;
  excluded: number;
  incomplete: number;
  failed: number;
  passed: number;
  task_failed: number;
  policy_failed: number;
  infrastructure_failed: number;
}

export interface ExperimentSummaryGroup {
  key: string;
  summary: ExperimentSummary;
}

export interface ExperimentOperationalSummary extends ExperimentSummary {
  executor_invocations: number;
  reserved_live_requests: number;
  attempts: number;
  retry_attempts: number;
  requests: number;
  tokens: number;
  cost?: ExperimentCostLimit;
  attempt_statuses: Record<ExecutedExperimentAttemptStatus, number>;
}

export interface ExperimentCompletion {
  /** Every declared coordinate has an explicit terminal record. */
  matrix_complete: boolean;
  /** No coordinate ended incomplete because execution stopped early. */
  execution_complete: boolean;
  /** Every declared coordinate produced a valid passed or failed measurement. */
  valid_measurement_coverage_complete: boolean;
}

export interface ExperimentRuntimeExclusion {
  coordinate_id: string;
  reason: ExperimentStopReason;
}

export interface ExperimentUncertainty {
  method: 'none';
  sample_size: number;
  assumptions: string[];
  task_clustering: 'not_estimated';
}

/** Admission reservation recorded for one executable task × target pair. */
export interface ExperimentReservation {
  task_id: string;
  target_id: string;
  /**
   * Normalized declared demand. Absent when the executor declared none, or none bounding
   * every declared budget that applies to the target: such attempts were admitted only
   * with nothing else in flight.
   */
  demand?: ExperimentAttemptDemand;
}

/** Concurrent scheduling record; present when, and only when, `concurrency` exceeds 1. */
export interface ExperimentExecution {
  /** Most attempts in flight at once, as re-derived from the admission sequence. */
  peak_in_flight: number;
  /** Executable task × target pairs in matrix order. */
  reservations: ExperimentReservation[];
}

export interface ExperimentRunResult {
  schema_version: '1';
  experiment_id: string;
  mode: ExperimentMode;
  manifest: ExperimentManifest;
  identities: ExperimentIdentity;
  live_authorization?: ExperimentLiveAuthorization;
  completion: ExperimentCompletion;
  stop_reason?: ExperimentStopReason;
  runtime_exclusions: ExperimentRuntimeExclusion[];
  /** Alias for valid measurement coverage, retained for simple consumers. */
  complete: boolean;
  results: ExperimentCoordinateResult[];
  summaries: {
    overall: ExperimentSummary;
    targets: ExperimentSummaryGroup[];
    tasks: ExperimentSummaryGroup[];
    languages: ExperimentSummaryGroup[];
    policies: ExperimentSummaryGroup[];
    operational: ExperimentOperationalSummary;
  };
  uncertainty: ExperimentUncertainty;
  execution?: ExperimentExecution;
}

export interface ExperimentLiveAuthorization {
  approved: true;
  decision_id: string;
  decided_at: string;
  approved_by: string;
  reason: string;
}

export interface RunExperimentOptions {
  execute_attempt: ExperimentAttemptExecutor;
  live_authorization?: ExperimentLiveAuthorization;
}
