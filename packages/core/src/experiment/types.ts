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

export interface ExperimentTask {
  id: string;
  kind: ExperimentTaskKind;
  required_capabilities: string[];
  language?: string;
  policy?: string;
}

export type ExperimentSetting = string | number | boolean;

export interface ExperimentTarget {
  id: string;
  provider: string;
  model: string;
  capabilities: string[];
  settings?: Record<string, ExperimentSetting>;
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

export interface ExperimentManifest {
  schema_version: '1';
  id: string;
  mode: ExperimentMode;
  identities: ExperimentIdentity;
  tasks: ExperimentTask[];
  targets: ExperimentTarget[];
  repetitions: number;
  retry_policy: ExperimentRetryPolicy;
  budgets: ExperimentBudgets;
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
  | 'unsupported';

export type ExecutedExperimentAttemptStatus = Exclude<ExperimentAttemptStatus, 'unsupported'>;

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
  missing_capabilities: string[];
}

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

export type ExperimentAttemptExecutor = (
  input: ExperimentAttemptInput
) => Promise<ExperimentAttemptOutput>;

export interface ExperimentAttemptEvidence extends ExperimentAttemptOutput {
  attempt_id: string;
  retry_chain_id: string;
  attempt_number: number;
}

export type ExperimentCompletionCode =
  | 'terminal'
  | 'capability_unsupported'
  | 'budget_exhausted'
  | 'usage_unreported'
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
  attempts: number;
  retry_attempts: number;
  requests: number;
  tokens: number;
  cost?: ExperimentCostLimit;
  attempt_statuses: Record<ExecutedExperimentAttemptStatus, number>;
}

export interface ExperimentUncertainty {
  method: 'none';
  sample_size: number;
  assumptions: string[];
  task_clustering: 'not_estimated';
}

export interface ExperimentRunResult {
  schema_version: '1';
  experiment_id: string;
  mode: ExperimentMode;
  manifest: ExperimentManifest;
  identities: ExperimentIdentity;
  live_authorization?: ExperimentLiveAuthorization;
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
}

export interface ExperimentLiveAuthorization {
  approved: true;
  decision_id: string;
  decided_at: string;
}

export interface RunExperimentOptions {
  execute_attempt: ExperimentAttemptExecutor;
  live_authorization?: ExperimentLiveAuthorization;
}
