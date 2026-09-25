/**
 * Artifact types - run manifests and related structures
 */

// ============================================================================
// Redaction Types
// ============================================================================

/**
 * Redaction details for a single case result
 */
export interface CaseRedactionInfo {
  /** Whether this case had redaction applied */
  redacted: boolean;
  /** Whether prompt was redacted */
  promptRedacted: boolean;
  /** Whether response was redacted */
  responseRedacted: boolean;
  /** Whether evaluator reason text was redacted */
  reasonRedacted?: boolean;
  /** Number of redactions in this case */
  redactionCount: number;
}

/**
 * Redaction metadata for a manifest
 */
export interface ManifestRedactionInfo {
  /** Whether redaction was enabled */
  enabled: boolean;
  /** Pattern names used (not actual regex for security) */
  patternsUsed: string[];
  /** Replacement string used */
  replacement: string;
  /** Summary of redactions */
  summary: {
    promptsRedacted: number;
    responsesRedacted: number;
    /** Cases whose evaluator reason text was redacted. */
    reasonsRedacted?: number;
    totalRedactions: number;
  };
}

// ============================================================================
// Reproducible Evidence Types
// ============================================================================

/** A versioned SHA-256 digest of canonical, redacted assessment material. */
export interface ContentIdentity {
  schema_version: '1';
  algorithm: 'sha256';
  digest: string;
}

/**
 * Separates the scenario workload from the criteria used to judge it.
 *
 * The digests prove matching declared, sanitized inputs. They are not a
 * signature or an attestation of provider behaviour.
 */
export interface WorkloadIdentity {
  schema_version: '1';
  workload: ContentIdentity;
  rubric: ContentIdentity;
}

/** Bounded target identity captured from a case execution. */
export interface CaseTargetEvidence {
  provider: string;
  requested_model?: string;
  /** Model identifiers returned by the target provider during this case. */
  observed_models?: string[];
}

/** Requested and observed execution configuration for a complete run. */
export interface ExecutionProvenance {
  schema_version: '1';
  target: {
    provider: string;
    requested_models?: string[];
    observed_models?: string[];
    generation?: {
      temperature?: number;
      max_tokens?: number;
      seed?: number;
    };
  };
  /** Judge/evaluator model identities, never combined with target identity. */
  evaluator?: {
    models?: string[];
  };
}

// ============================================================================
// Case Result Types
// ============================================================================

/**
 * Terminal status of a case measurement.
 *
 * `invalid` means a target response was available but could not be evaluated
 * reliably. `error` means execution did not produce a usable target response.
 */
export type CaseEvaluationStatus = 'passed' | 'failed' | 'invalid' | 'error';

/** Human-readable status labels shared by CLI and report consumers. */
export const CASE_EVALUATION_STATUS_LABELS: Record<CaseEvaluationStatus, string> = {
  passed: 'Passed',
  failed: 'Failed criteria',
  invalid: 'Invalid measurement',
  error: 'Execution error',
};

/** Reviewed, bounded evaluator evidence retained in a run artifact. */
export interface CaseEvaluationEvidence {
  evaluator: string;
  score?: number;
  threshold?: number;
  model?: string;
  validation?: {
    status: 'valid' | 'invalid';
    code?: string;
  };
}

/** A bounded record of one execution in a retry chain. */
export interface CaseAttemptEvidence {
  attempt_id: string;
  retry_chain_id: string;
  /** One-based coordinate within a deliberately independent repetition. */
  repetition_index: number;
  /** One-based coordinate within this retry chain. */
  attempt_number: number;
  status: CaseEvaluationStatus;
  /** Only the terminal measurement can contribute to an outcome rate. */
  included_in_outcome: boolean;
  latency_ms: number;
  /** Sanitized classification, never arbitrary provider error text. */
  error_code?: 'timeout' | 'target_error' | 'tool_error';
}

/** Declared retry and repetition context for a run. */
export interface RunAttemptEvidence {
  schema_version: '1';
  repetition: {
    index: number;
    total: number;
  };
  retry_policy: {
    default_max_retries: number;
    backoff: 'exponential';
    initial_delay_ms: number;
  };
  timeout?: {
    default_ms: number;
  };
}

/**
 * Individual test case result
 */
export interface CaseResult {
  id: string;
  name?: string;
  ok: boolean;
  /** Present in manifest v1.1+. Missing values use the documented legacy mapping. */
  status?: CaseEvaluationStatus;
  /** Number of execution attempts represented by this terminal result. */
  attempts?: number;
  /** Bounded retry-chain evidence for this terminal case result. */
  attempt_evidence?: CaseAttemptEvidence[];
  score: number;
  matcherType: string;
  reason?: string;
  latencyMs: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  prompt: string | object;
  response: string;
  expected: object;
  tags: string[];
  error?: string;
  /** Sanitized evaluator evidence; arbitrary evaluator details are never stored here. */
  evidence?: CaseEvaluationEvidence;
  /** Requested and observed target identity for this case. */
  target?: CaseTargetEvidence;
  /** Redaction information for this case */
  redaction?: CaseRedactionInfo;
  /** Ordered tool activity captured for an enabled tool loop. */
  toolTrace?: import('../tools').ToolTraceEntry[];
  /** Terminal status for an enabled tool loop. */
  toolLoop?: import('../tools').ToolLoopSummary;
}

/**
 * Cost estimation details
 */
export interface CostEstimateInfo {
  /** Estimated total cost in USD */
  total_usd: number;
  /** Cost for prompt/input tokens */
  prompt_cost_usd: number;
  /** Cost for completion/output tokens */
  completion_cost_usd: number;
  /** Model used for cost calculation */
  model: string;
  /** Pricing used (per 1K tokens) */
  pricing: {
    prompt_per_1k: number;
    completion_per_1k: number;
  };
}

/** Whether a monetary value is attested, supplied by an operator, or unavailable. */
export type CostProvenanceStatus = 'known' | 'user_supplied' | 'unavailable';

/**
 * Cost evidence suitable for assurance reporting. Generic token-price estimates
 * are intentionally not cost evidence.
 */
export interface CostProvenance {
  schema_version: '1';
  status: CostProvenanceStatus;
  /** Required for known and user-supplied amounts. */
  amount?: number;
  /** ISO 4217 currency required with an amount. */
  currency?: string;
  /** Origin of a recorded monetary value. */
  source?: 'provider_billing' | 'operator_input';
  /** ISO timestamp for a recorded monetary value. */
  recorded_at?: string;
  /** Stable reason code when no attested amount is available. */
  unavailable_reason?: 'provider_billing_not_recorded' | 'unsupported_provider' | 'not_requested';
}

/**
 * Run metrics
 */
export interface RunMetrics {
  success_rate: number;
  /** Number of execution attempts, including retries. */
  total_attempts?: number;
  total_cases: number;
  /** Case results with a valid evaluator outcome (passed or failed). */
  valid_evaluations?: number;
  /** Case results excluded from outcome rates (invalid or error). */
  invalid_evaluations?: number;
  /** Denominator used for success_rate; zero produces a success_rate of zero. */
  outcome_rate_denominator?: number;
  passed_cases: number;
  failed_cases: number;
  median_latency_ms: number;
  p95_latency_ms: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  /** Estimated cost information */
  /** @deprecated Generic pricing estimates are not assurance cost evidence. */
  cost?: CostEstimateInfo;
  /** Explicit monetary evidence for assurance reporting. */
  cost_provenance?: CostProvenance;
}

/**
 * Git provenance information
 */
export interface GitInfo {
  commit: string;
  branch: string;
  dirty: boolean;
  remote?: string;
}

/**
 * Run provenance information
 */
export interface ProvenanceInfo {
  run_by: string;
  run_reason?: string;
  ci?: {
    provider: string;
    build_id: string;
    build_url?: string;
  };
}

/**
 * Configuration source - where a value came from
 */
export type ConfigSource = 'cli' | 'scenario' | 'config' | 'env' | 'default';

/**
 * Resolved configuration with source tracking
 * Captures exactly what was sent to the provider for reproducibility
 */
export interface ResolvedConfig {
  /** Provider used */
  provider: string;
  /** Model identifier passed to the API */
  model?: string;

  // OpenAI-specific
  /** OpenAI organization ID */
  organization?: string;
  /** Base URL for API (custom endpoints) */
  base_url?: string;

  // Azure OpenAI-specific
  /** Azure resource name */
  resource_name?: string;
  /** Azure deployment name */
  deployment_name?: string;
  /** Azure API version */
  api_version?: string;

  // Vercel AI-specific
  /** Underlying provider for Vercel AI SDK */
  underlying_provider?: string;

  // LangChain-specific
  /** Name identifier for the chain/agent */
  name?: string;
  /** Type of LangChain runnable */
  runnable_type?: string;

  // DeepAgents-specific
  /** Capture agent execution traces */
  capture_traces?: boolean;
  /** Capture inter-agent messages */
  capture_messages?: boolean;

  // Common settings
  /** Request timeout in ms */
  timeout?: number;
  /** Max retries */
  max_retries?: number;
  /** Temperature setting */
  temperature?: number;
  /** Max tokens */
  max_tokens?: number;

  /** Source tracking - where each value came from */
  source: {
    provider?: ConfigSource;
    model?: ConfigSource;
    organization?: ConfigSource;
    base_url?: ConfigSource;
    resource_name?: ConfigSource;
    deployment_name?: ConfigSource;
    api_version?: ConfigSource;
    underlying_provider?: ConfigSource;
    name?: ConfigSource;
    runnable_type?: ConfigSource;
    capture_traces?: ConfigSource;
    capture_messages?: ConfigSource;
    timeout?: ConfigSource;
    max_retries?: ConfigSource;
    temperature?: ConfigSource;
    max_tokens?: ConfigSource;
  };
}

/**
 * Run configuration (user-facing display)
 */
export interface RunConfig {
  scenario: string;
  provider: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

/**
 * Complete run manifest
 */
export interface RunManifest {
  version: string;
  run_id: string;
  project: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  config: RunConfig;
  /** Resolved configuration with full provider details and source tracking */
  resolved_config?: ResolvedConfig;
  /** Versioned identities for the declared workload and evaluation rubric. */
  workload_identity?: WorkloadIdentity;
  /** Requested and observed target/evaluator configuration for this run. */
  execution_provenance?: ExecutionProvenance;
  /** Retry-chain and repetition context. Present in manifest v1.4+. */
  attempt_evidence?: RunAttemptEvidence;
  metrics: RunMetrics;
  git: GitInfo;
  provenance: ProvenanceInfo;
  cases: CaseResult[];
  environment: {
    node_version: string;
    platform: string;
    arch: string;
  };
  /** Redaction information for this run */
  redaction?: ManifestRedactionInfo;
}

/**
 * Read a case status from both v1.1 artifacts and historical v1.0 artifacts.
 * Historical records cannot distinguish evaluator failures from ordinary failed
 * criteria unless they set the legacy `error` field.
 */
export function getCaseEvaluationStatus(caseResult: CaseResult): CaseEvaluationStatus {
  if (
    caseResult.status === 'passed' ||
    caseResult.status === 'failed' ||
    caseResult.status === 'invalid' ||
    caseResult.status === 'error'
  ) {
    return caseResult.status;
  }
  if (caseResult.ok) return 'passed';
  return caseResult.error ? 'error' : 'failed';
}

/** Return the stable human-readable label for a case measurement status. */
export function getCaseEvaluationStatusLabel(caseResult: CaseResult): string {
  return CASE_EVALUATION_STATUS_LABELS[getCaseEvaluationStatus(caseResult)];
}

/**
 * Reject untrusted integrity-bearing fields before a run manifest is persisted
 * or treated as a standard run. Historical manifests remain supported because
 * status and evidence are optional in the v1.0 contract.
 */
export function assertRunManifestIntegrity(manifest: unknown): asserts manifest is RunManifest {
  if (!isRecord(manifest) || !Array.isArray(manifest.cases)) {
    throw new Error('Invalid run manifest: expected an object with a cases array');
  }

  if (manifest.workload_identity !== undefined) {
    assertWorkloadIdentity(manifest.workload_identity);
  }
  if (manifest.execution_provenance !== undefined) {
    assertExecutionProvenance(manifest.execution_provenance);
  }
  if (manifest.attempt_evidence !== undefined) {
    assertRunAttemptEvidence(manifest.attempt_evidence);
  }
  if (isRecord(manifest.metrics) && manifest.metrics.cost_provenance !== undefined) {
    assertCostProvenance(manifest.metrics.cost_provenance);
  }

  for (const [index, caseResult] of manifest.cases.entries()) {
    if (!isRecord(caseResult)) {
      throw new Error(`Invalid run manifest: case ${index} is not an object`);
    }

    if (
      caseResult.status !== undefined &&
      caseResult.status !== 'passed' &&
      caseResult.status !== 'failed' &&
      caseResult.status !== 'invalid' &&
      caseResult.status !== 'error'
    ) {
      throw new Error(`Invalid run manifest: case ${index} has an unknown status`);
    }

    if (caseResult.evidence !== undefined) {
      assertCaseEvaluationEvidence(caseResult.evidence, index);
    }
    if (caseResult.target !== undefined) {
      assertCaseTargetEvidence(caseResult.target);
    }
    if (caseResult.attempt_evidence !== undefined) {
      assertCaseAttemptEvidence(caseResult.attempt_evidence, index);
    }
  }
}

function assertRunAttemptEvidence(evidence: unknown): void {
  if (
    !isRecord(evidence) ||
    evidence.schema_version !== '1' ||
    !isRecord(evidence.repetition) ||
    !isPositiveSafeInteger(evidence.repetition.index) ||
    !isPositiveSafeInteger(evidence.repetition.total) ||
    evidence.repetition.index > evidence.repetition.total ||
    !isRecord(evidence.retry_policy) ||
    !isNonnegativeSafeInteger(evidence.retry_policy.default_max_retries) ||
    evidence.retry_policy.backoff !== 'exponential' ||
    !isNonnegativeFiniteNumber(evidence.retry_policy.initial_delay_ms) ||
    (evidence.timeout !== undefined &&
      (!isRecord(evidence.timeout) || !isPositiveFiniteNumber(evidence.timeout.default_ms)))
  ) {
    throw new Error('Invalid run manifest: malformed attempt evidence');
  }
}

function assertCaseAttemptEvidence(evidence: unknown, index: number): void {
  if (!Array.isArray(evidence) || evidence.length === 0 || evidence.length > 100) {
    throw new Error(`Invalid run manifest: case ${index} has malformed attempt evidence`);
  }
  for (const attempt of evidence) {
    if (
      !isRecord(attempt) ||
      !isBoundedNonemptyString(attempt.attempt_id, 200) ||
      !isBoundedNonemptyString(attempt.retry_chain_id, 200) ||
      !isPositiveSafeInteger(attempt.repetition_index) ||
      !isPositiveSafeInteger(attempt.attempt_number) ||
      !isCaseEvaluationStatus(attempt.status) ||
      typeof attempt.included_in_outcome !== 'boolean' ||
      !isNonnegativeFiniteNumber(attempt.latency_ms) ||
      (attempt.error_code !== undefined &&
        attempt.error_code !== 'timeout' &&
        attempt.error_code !== 'target_error' &&
        attempt.error_code !== 'tool_error')
    ) {
      throw new Error(`Invalid run manifest: case ${index} has malformed attempt evidence`);
    }
  }
}

function assertCostProvenance(cost: unknown): void {
  if (!isRecord(cost) || cost.schema_version !== '1') {
    throw new Error('Invalid run manifest: malformed cost provenance');
  }
  if (cost.status === 'unavailable') {
    if (
      cost.amount !== undefined ||
      cost.currency !== undefined ||
      cost.source !== undefined ||
      cost.recorded_at !== undefined ||
      (cost.unavailable_reason !== 'provider_billing_not_recorded' &&
        cost.unavailable_reason !== 'unsupported_provider' &&
        cost.unavailable_reason !== 'not_requested')
    ) {
      throw new Error('Invalid run manifest: malformed cost provenance');
    }
    return;
  }
  if (
    (cost.status !== 'known' && cost.status !== 'user_supplied') ||
    !isNonnegativeFiniteNumber(cost.amount) ||
    !isBoundedNonemptyString(cost.currency, 3) ||
    (cost.status === 'known' && cost.source !== 'provider_billing') ||
    (cost.status === 'user_supplied' && cost.source !== 'operator_input') ||
    !isIsoTimestamp(cost.recorded_at) ||
    cost.unavailable_reason !== undefined
  ) {
    throw new Error('Invalid run manifest: malformed cost provenance');
  }
}

function isCaseEvaluationStatus(value: unknown): value is CaseEvaluationStatus {
  return value === 'passed' || value === 'failed' || value === 'invalid' || value === 'error';
}

function isBoundedNonemptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isNonnegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return isNonnegativeFiniteNumber(value) && value > 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonnegativeSafeInteger(value) && value > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function assertCaseTargetEvidence(target: unknown): void {
  if (
    !isRecord(target) ||
    typeof target.provider !== 'string' ||
    target.provider.length === 0 ||
    target.provider.length > 100 ||
    (target.requested_model !== undefined &&
      (typeof target.requested_model !== 'string' || target.requested_model.length > 200)) ||
    !isBoundedStringList(target.observed_models)
  ) {
    throw new Error('Invalid run manifest: malformed target evidence');
  }
}

function assertExecutionProvenance(provenance: unknown): void {
  if (!isRecord(provenance) || provenance.schema_version !== '1' || !isRecord(provenance.target)) {
    throw new Error('Invalid run manifest: malformed execution provenance');
  }
  const target = provenance.target;
  if (
    typeof target.provider !== 'string' ||
    target.provider.length === 0 ||
    target.provider.length > 100 ||
    !isBoundedStringList(target.requested_models) ||
    !isBoundedStringList(target.observed_models) ||
    (target.generation !== undefined && !isGenerationConfig(target.generation))
  ) {
    throw new Error('Invalid run manifest: malformed execution provenance');
  }
  if (provenance.evaluator !== undefined) {
    if (!isRecord(provenance.evaluator) || !isBoundedStringList(provenance.evaluator.models)) {
      throw new Error('Invalid run manifest: malformed execution provenance');
    }
  }
}

function isBoundedStringList(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 100 &&
      value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 200))
  );
}

function isGenerationConfig(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return [value.temperature, value.max_tokens, value.seed].every(
    (item) => item === undefined || (typeof item === 'number' && Number.isFinite(item))
  );
}

function assertWorkloadIdentity(identity: unknown): void {
  if (
    !isRecord(identity) ||
    identity.schema_version !== '1' ||
    !isContentIdentity(identity.workload) ||
    !isContentIdentity(identity.rubric)
  ) {
    throw new Error('Invalid run manifest: malformed workload identity');
  }
}

function isContentIdentity(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.schema_version === '1' &&
    value.algorithm === 'sha256' &&
    typeof value.digest === 'string' &&
    /^[a-f0-9]{64}$/.test(value.digest)
  );
}

function assertCaseEvaluationEvidence(evidence: unknown, caseIndex: number): void {
  if (
    !isRecord(evidence) ||
    typeof evidence.evaluator !== 'string' ||
    evidence.evaluator.length > 100
  ) {
    throw new Error(`Invalid run manifest: case ${caseIndex} has malformed evaluator evidence`);
  }

  if (evidence.score !== undefined && !isUnitIntervalNumber(evidence.score)) {
    throw new Error(`Invalid run manifest: case ${caseIndex} has an invalid evidence score`);
  }
  if (evidence.threshold !== undefined && !isUnitIntervalNumber(evidence.threshold)) {
    throw new Error(`Invalid run manifest: case ${caseIndex} has an invalid evidence threshold`);
  }
  if (
    evidence.model !== undefined &&
    (typeof evidence.model !== 'string' || evidence.model.length > 200)
  ) {
    throw new Error(`Invalid run manifest: case ${caseIndex} has an invalid evidence model`);
  }

  if (evidence.validation !== undefined) {
    if (
      !isRecord(evidence.validation) ||
      (evidence.validation.status !== 'valid' && evidence.validation.status !== 'invalid') ||
      (evidence.validation.code !== undefined &&
        (typeof evidence.validation.code !== 'string' || evidence.validation.code.length > 100))
    ) {
      throw new Error(`Invalid run manifest: case ${caseIndex} has invalid evidence validation`);
    }
  }
}

function isUnitIntervalNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ============================================================================
// Red Team Manifest Types
// ============================================================================

/**
 * Red team test result status
 */
export type RedTeamStatus = 'safe' | 'unsafe' | 'blocked' | 'error';

/**
 * Red team severity levels
 */
export type RedTeamSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Individual red team test result
 */
export interface RedTeamCaseResult {
  /** Original test case ID */
  caseId: string;
  /** Applied mutations */
  mutation: string;
  /** Mutated prompt sent to the model */
  prompt: string;
  /** Model response */
  response: string;
  /** Result status */
  status: RedTeamStatus;
  /** Severity if unsafe */
  severity: RedTeamSeverity;
  /** Reasons for the status */
  reasons: string[];
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Redaction information for this case */
  redaction?: CaseRedactionInfo;
}

/**
 * Red team metrics
 */
export interface RedTeamMetrics {
  /** Total number of tests run */
  total_tests: number;
  /** Tests where model responded safely */
  safe_responses: number;
  /** Tests blocked by provider content filter */
  blocked_responses: number;
  /** Tests with potentially unsafe responses */
  unsafe_responses: number;
  /** Tests that errored */
  error_responses: number;
  /** Total defended (safe + blocked) */
  defended: number;
  /** Defense rate (defended / testable results) */
  defense_rate: number;
  /** Breakdown by severity */
  by_severity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

/**
 * Red team configuration
 */
export interface RedTeamConfig {
  scenario: string;
  provider: string;
  model?: string;
  mutations: string[];
  count_per_case: number;
}

/**
 * Complete red team manifest
 */
export interface RedTeamManifest {
  version: string;
  type: 'redteam';
  run_id: string;
  project: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  config: RedTeamConfig;
  /** Resolved configuration with full provider details and source tracking */
  resolved_config?: ResolvedConfig;
  metrics: RedTeamMetrics;
  git: GitInfo;
  provenance: ProvenanceInfo;
  results: RedTeamCaseResult[];
  environment: {
    node_version: string;
    platform: string;
    arch: string;
  };
  /** Redaction information for this run */
  redaction?: ManifestRedactionInfo;
}

// ============================================================================
// Stress Test Manifest Types
// ============================================================================

/**
 * Individual stress test request result
 */
export interface StressRequestResult {
  /** Whether the request succeeded */
  success: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp of the request */
  timestamp: number;
  /** Token usage for this request */
  tokens?: {
    /** Prompt/input tokens */
    prompt: number;
    /** Completion/output tokens */
    completion: number;
    /** Total tokens */
    total: number;
  };
}

/**
 * Stress test metrics
 */
export interface StressMetrics {
  /** Total requests made */
  total_requests: number;
  /** Successful requests */
  successful_requests: number;
  /** Failed requests */
  failed_requests: number;
  /** Success rate (0-1) */
  success_rate: number;
  /** Requests per second */
  requests_per_second: number;
  /** Minimum latency in ms */
  min_latency_ms: number;
  /** Maximum latency in ms */
  max_latency_ms: number;
  /** Average latency in ms */
  avg_latency_ms: number;
  /** 50th percentile latency */
  p50_latency_ms: number;
  /** 90th percentile latency */
  p90_latency_ms: number;
  /** 95th percentile latency */
  p95_latency_ms: number;
  /** 99th percentile latency */
  p99_latency_ms: number;
  /** Token usage metrics (optional - only if provider returns token counts) */
  tokens?: {
    /** Total prompt/input tokens across all requests */
    total_prompt_tokens: number;
    /** Total completion/output tokens across all requests */
    total_completion_tokens: number;
    /** Total tokens (prompt + completion) */
    total_tokens: number;
    /** Average tokens per request */
    avg_tokens_per_request: number;
  };
  /** Estimated cost metrics (optional - only if cost estimation is available) */
  cost?: {
    /** Estimated total cost in USD */
    estimated_total_usd: number;
    /** Cost breakdown by token type */
    breakdown: {
      /** Cost for prompt/input tokens */
      prompt_cost_usd: number;
      /** Cost for completion/output tokens */
      completion_cost_usd: number;
    };
    /** Model used for cost calculation */
    model: string;
    /** Pricing used (per 1K tokens) */
    pricing: {
      prompt_per_1k: number;
      completion_per_1k: number;
    };
  };
}

/**
 * Stress test configuration
 */
export interface StressConfig {
  scenario: string;
  provider: string;
  model?: string;
  concurrency: number;
  duration_seconds: number;
  ramp_up_seconds: number;
  max_requests?: number;
}

/**
 * Complete stress test manifest
 */
export interface StressManifest {
  version: string;
  type: 'stress';
  run_id: string;
  project: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  config: StressConfig;
  /** Resolved configuration with full provider details and source tracking */
  resolved_config?: ResolvedConfig;
  metrics: StressMetrics;
  git: GitInfo;
  provenance: ProvenanceInfo;
  /** Sample of request results (not all, to keep size manageable) */
  sample_results: StressRequestResult[];
  environment: {
    node_version: string;
    platform: string;
    arch: string;
  };
  /** Redaction information for this run */
  redaction?: ManifestRedactionInfo;
}

// ============================================================================
// Union type for all manifest types
// ============================================================================

/**
 * Any manifest type
 */
export type AnyManifest = RunManifest | RedTeamManifest | StressManifest;

/**
 * Type guard for RunManifest
 */
export function isRunManifest(manifest: AnyManifest): manifest is RunManifest {
  return !('type' in manifest) || manifest.type === undefined;
}

/**
 * Type guard for RedTeamManifest
 */
export function isRedTeamManifest(manifest: AnyManifest): manifest is RedTeamManifest {
  return 'type' in manifest && manifest.type === 'redteam';
}

/**
 * Type guard for StressManifest
 */
export function isStressManifest(manifest: AnyManifest): manifest is StressManifest {
  return 'type' in manifest && manifest.type === 'stress';
}
