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
