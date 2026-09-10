/**
 * Run manifest generation utilities
 */

import { nanoid } from 'nanoid';
import { getEnvironmentInfo } from '../provenance/environment';
import { getGitInfo } from '../provenance/git';
import type {
  CaseResult,
  CostProvenance,
  ExecutionProvenance,
  ManifestRedactionInfo,
  ResolvedConfig,
  RunAttemptEvidence,
  RunConfig,
  RunManifest,
  RunMetrics,
  WorkloadIdentity,
} from './types';
import { getCaseEvaluationStatus } from './types';

/**
 * Create a new run manifest
 */
export function createRunManifest(options: {
  project: string;
  config: RunConfig;
  resolvedConfig?: ResolvedConfig;
  workloadIdentity?: WorkloadIdentity;
  executionProvenance?: ExecutionProvenance;
  attemptEvidence?: RunAttemptEvidence;
  costProvenance?: CostProvenance;
  runId?: string;
  cases: CaseResult[];
  startTime: Date;
  endTime: Date;
  runBy?: string;
  runReason?: string;
  redaction?: ManifestRedactionInfo;
}): RunManifest {
  const {
    project,
    config,
    resolvedConfig,
    workloadIdentity,
    executionProvenance,
    attemptEvidence,
    costProvenance,
    runId,
    cases,
    startTime,
    endTime,
    runBy,
    runReason,
    redaction,
  } = options;

  const metrics = calculateMetrics(cases, costProvenance);
  const git = getGitInfo();
  const environment = getEnvironmentInfo();

  return {
    version: '1.4',
    run_id: runId ?? nanoid(12),
    project,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_ms: endTime.getTime() - startTime.getTime(),
    config,
    resolved_config: resolvedConfig,
    workload_identity: workloadIdentity,
    execution_provenance: executionProvenance,
    attempt_evidence: attemptEvidence,
    metrics,
    git,
    provenance: {
      run_by: runBy || process.env.USER || 'unknown',
      run_reason: runReason,
      ci: detectCIEnvironment(),
    },
    cases,
    environment,
    redaction,
  };
}

/**
 * Calculate metrics from case results
 */
function calculateMetrics(cases: CaseResult[], costProvenance?: CostProvenance): RunMetrics {
  const passedCases = cases.filter((c) => getCaseEvaluationStatus(c) === 'passed');
  const validCases = cases.filter((c) => {
    const status = getCaseEvaluationStatus(c);
    return status === 'passed' || status === 'failed';
  });
  const latencies = cases.map((c) => c.latencyMs).sort((a, b) => a - b);

  const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;

  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies.length > 0 ? latencies[p95Index] : 0;

  const totalPromptTokens = cases.reduce((sum, c) => sum + c.tokens.prompt, 0);
  const totalCompletionTokens = cases.reduce((sum, c) => sum + c.tokens.completion, 0);

  // Token counts are not provider billing records. Never turn a generic price
  // table into assurance cost evidence.
  const cost_provenance: CostProvenance = costProvenance ?? {
    schema_version: '1',
    status: 'unavailable',
    unavailable_reason: 'provider_billing_not_recorded',
  };

  return {
    success_rate: validCases.length > 0 ? passedCases.length / validCases.length : 0,
    total_attempts: cases.reduce((sum, c) => sum + (c.attempts ?? 1), 0),
    total_cases: cases.length,
    valid_evaluations: validCases.length,
    invalid_evaluations: cases.length - validCases.length,
    outcome_rate_denominator: validCases.length,
    passed_cases: passedCases.length,
    failed_cases: validCases.length - passedCases.length,
    median_latency_ms: medianLatency,
    p95_latency_ms: p95Latency,
    total_tokens: totalPromptTokens + totalCompletionTokens,
    total_prompt_tokens: totalPromptTokens,
    total_completion_tokens: totalCompletionTokens,
    cost_provenance,
  };
}

/**
 * Detect CI environment
 */
function detectCIEnvironment():
  | { provider: string; build_id: string; build_url?: string }
  | undefined {
  if (process.env.GITHUB_ACTIONS) {
    return {
      provider: 'github-actions',
      build_id: process.env.GITHUB_RUN_ID || '',
      build_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    };
  }

  if (process.env.GITLAB_CI) {
    return {
      provider: 'gitlab-ci',
      build_id: process.env.CI_JOB_ID || '',
      build_url: process.env.CI_JOB_URL,
    };
  }

  if (process.env.CIRCLECI) {
    return {
      provider: 'circleci',
      build_id: process.env.CIRCLE_BUILD_NUM || '',
      build_url: process.env.CIRCLE_BUILD_URL,
    };
  }

  if (process.env.JENKINS_URL) {
    return {
      provider: 'jenkins',
      build_id: process.env.BUILD_ID || '',
      build_url: process.env.BUILD_URL,
    };
  }

  return undefined;
}
