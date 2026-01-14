/**
 * Run manifest generation utilities
 */

import { nanoid } from 'nanoid';
import { getEnvironmentInfo } from '../provenance/environment';
import { getGitInfo } from '../provenance/git';
import type { CaseResult, ResolvedConfig, RunConfig, RunManifest, RunMetrics } from './types';

/**
 * Create a new run manifest
 */
export function createRunManifest(options: {
  project: string;
  config: RunConfig;
  resolvedConfig?: ResolvedConfig;
  cases: CaseResult[];
  startTime: Date;
  endTime: Date;
  runBy?: string;
  runReason?: string;
}): RunManifest {
  const { project, config, resolvedConfig, cases, startTime, endTime, runBy, runReason } = options;

  const metrics = calculateMetrics(cases);
  const git = getGitInfo();
  const environment = getEnvironmentInfo();

  return {
    version: '1.0',
    run_id: nanoid(12),
    project,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_ms: endTime.getTime() - startTime.getTime(),
    config,
    resolved_config: resolvedConfig,
    metrics,
    git,
    provenance: {
      run_by: runBy || process.env.USER || 'unknown',
      run_reason: runReason,
      ci: detectCIEnvironment(),
    },
    cases,
    environment,
  };
}

/**
 * Calculate metrics from case results
 */
function calculateMetrics(cases: CaseResult[]): RunMetrics {
  const passedCases = cases.filter((c) => c.ok);
  const latencies = cases.map((c) => c.latencyMs).sort((a, b) => a - b);

  const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;

  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies.length > 0 ? latencies[p95Index] : 0;

  const totalPromptTokens = cases.reduce((sum, c) => sum + c.tokens.prompt, 0);
  const totalCompletionTokens = cases.reduce((sum, c) => sum + c.tokens.completion, 0);

  return {
    success_rate: cases.length > 0 ? passedCases.length / cases.length : 0,
    total_cases: cases.length,
    passed_cases: passedCases.length,
    failed_cases: cases.length - passedCases.length,
    median_latency_ms: medianLatency,
    p95_latency_ms: p95Latency,
    total_tokens: totalPromptTokens + totalCompletionTokens,
    total_prompt_tokens: totalPromptTokens,
    total_completion_tokens: totalCompletionTokens,
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
