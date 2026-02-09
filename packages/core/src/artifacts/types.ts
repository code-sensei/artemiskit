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
    totalRedactions: number;
  };
}

// ============================================================================
// Case Result Types
// ============================================================================

/**
 * Individual test case result
 */
export interface CaseResult {
  id: string;
  name?: string;
  ok: boolean;
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
  /** Redaction information for this case */
  redaction?: CaseRedactionInfo;
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

/**
 * Run metrics
 */
export interface RunMetrics {
  success_rate: number;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  median_latency_ms: number;
  p95_latency_ms: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  /** Estimated cost information */
  cost?: CostEstimateInfo;
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
