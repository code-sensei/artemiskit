/**
 * Artifact types - run manifests and related structures
 */

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
 * Run configuration
 */
export interface RunConfig {
  scenario: string;
  provider: string;
  model: string;
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
  metrics: RunMetrics;
  git: GitInfo;
  provenance: ProvenanceInfo;
  cases: CaseResult[];
  environment: {
    node_version: string;
    platform: string;
    arch: string;
  };
}
