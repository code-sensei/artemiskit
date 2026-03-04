/**
 * @artemiskit/sdk
 * Core matcher implementations for Jest/Vitest integration
 */

import type { CaseResult, RunManifest } from '@artemiskit/core';
import type { RunResult, RedTeamResult, StressResult } from '../types';

/**
 * Matcher result interface compatible with Jest/Vitest
 */
export interface MatcherResult {
  pass: boolean;
  message: () => string;
}

/**
 * Format a manifest summary for error messages
 */
function formatManifestSummary(manifest: RunManifest): string {
  const { metrics } = manifest;
  return `
  Scenario: ${manifest.config.scenario}
  Total Cases: ${metrics.total_cases}
  Passed: ${metrics.passed_cases}
  Failed: ${metrics.failed_cases}
  Success Rate: ${(metrics.success_rate * 100).toFixed(1)}%
`;
}

/**
 * Format failed cases for error messages
 */
function formatFailedCases(cases: CaseResult[]): string {
  const failed = cases.filter((c) => !c.ok);
  if (failed.length === 0) return '';

  return `
  Failed Cases:
${failed
  .slice(0, 5) // Show first 5 failures
  .map((c) => `    - ${c.name ?? c.id}: ${c.reason ?? 'No reason provided'}`)
  .join('\n')}${failed.length > 5 ? `\n    ... and ${failed.length - 5} more` : ''}
`;
}

// ==========================================================================
// Run Result Matchers
// ==========================================================================

/**
 * Check if a run result passed all test cases
 */
export function toPassAllCases(result: RunResult): MatcherResult {
  const pass = result.success;

  return {
    pass,
    message: () =>
      pass
        ? `Expected test run to fail, but all ${result.manifest.metrics.total_cases} cases passed`
        : `Expected test run to pass, but ${result.manifest.metrics.failed_cases} out of ${result.manifest.metrics.total_cases} cases failed
${formatManifestSummary(result.manifest)}${formatFailedCases(result.cases)}`,
  };
}

/**
 * Check if success rate meets threshold
 */
export function toHaveSuccessRate(result: RunResult, expectedRate: number): MatcherResult {
  const actualRate = result.manifest.metrics.success_rate;
  const pass = actualRate >= expectedRate;

  return {
    pass,
    message: () =>
      pass
        ? `Expected success rate to be less than ${(expectedRate * 100).toFixed(1)}%, but got ${(actualRate * 100).toFixed(1)}%`
        : `Expected success rate to be at least ${(expectedRate * 100).toFixed(1)}%, but got ${(actualRate * 100).toFixed(1)}%
${formatManifestSummary(result.manifest)}${formatFailedCases(result.cases)}`,
  };
}

/**
 * Check if all cases with specific tags passed
 */
export function toPassCasesWithTag(result: RunResult, tag: string): MatcherResult {
  const taggedCases = result.cases.filter((c) => c.tags.includes(tag));
  const failedTaggedCases = taggedCases.filter((c) => !c.ok);
  const pass = failedTaggedCases.length === 0;

  return {
    pass,
    message: () =>
      pass
        ? `Expected cases with tag "${tag}" to fail, but all ${taggedCases.length} passed`
        : `Expected all cases with tag "${tag}" to pass, but ${failedTaggedCases.length} out of ${taggedCases.length} failed
${formatFailedCases(failedTaggedCases)}`,
  };
}

/**
 * Check if median latency is within threshold
 */
export function toHaveMedianLatencyBelow(result: RunResult, maxLatencyMs: number): MatcherResult {
  const actualLatency = result.manifest.metrics.median_latency_ms;
  const pass = actualLatency <= maxLatencyMs;

  return {
    pass,
    message: () =>
      pass
        ? `Expected median latency to be above ${maxLatencyMs}ms, but got ${actualLatency}ms`
        : `Expected median latency to be at most ${maxLatencyMs}ms, but got ${actualLatency}ms`,
  };
}

/**
 * Check if P95 latency is within threshold
 */
export function toHaveP95LatencyBelow(result: RunResult, maxLatencyMs: number): MatcherResult {
  const actualLatency = result.manifest.metrics.p95_latency_ms;
  const pass = actualLatency <= maxLatencyMs;

  return {
    pass,
    message: () =>
      pass
        ? `Expected P95 latency to be above ${maxLatencyMs}ms, but got ${actualLatency}ms`
        : `Expected P95 latency to be at most ${maxLatencyMs}ms, but got ${actualLatency}ms`,
  };
}

// ==========================================================================
// Red Team Result Matchers
// ==========================================================================

/**
 * Check if defense rate meets threshold
 */
export function toHaveDefenseRate(result: RedTeamResult, expectedRate: number): MatcherResult {
  const actualRate = result.defenseRate;
  const pass = actualRate >= expectedRate;

  return {
    pass,
    message: () =>
      pass
        ? `Expected defense rate to be less than ${(expectedRate * 100).toFixed(1)}%, but got ${(actualRate * 100).toFixed(1)}%`
        : `Expected defense rate to be at least ${(expectedRate * 100).toFixed(1)}%, but got ${(actualRate * 100).toFixed(1)}%

  Unsafe responses: ${result.unsafeCount}
  Total tests: ${result.manifest.metrics.total_tests}`,
  };
}

/**
 * Check that no critical vulnerabilities were found
 */
export function toHaveNoCriticalVulnerabilities(result: RedTeamResult): MatcherResult {
  const criticalCount = result.manifest.metrics.by_severity.critical;
  const pass = criticalCount === 0;

  return {
    pass,
    message: () =>
      pass
        ? 'Expected critical vulnerabilities, but none were found'
        : `Expected no critical vulnerabilities, but found ${criticalCount}`,
  };
}

/**
 * Check that no high or critical vulnerabilities were found
 */
export function toHaveNoHighSeverityVulnerabilities(result: RedTeamResult): MatcherResult {
  const highCount = result.manifest.metrics.by_severity.high;
  const criticalCount = result.manifest.metrics.by_severity.critical;
  const totalHighSeverity = highCount + criticalCount;
  const pass = totalHighSeverity === 0;

  return {
    pass,
    message: () =>
      pass
        ? 'Expected high/critical vulnerabilities, but none were found'
        : `Expected no high/critical vulnerabilities, but found ${totalHighSeverity} (${highCount} high, ${criticalCount} critical)`,
  };
}

/**
 * Check if red team test passed (default 95% defense rate)
 */
export function toPassRedTeam(result: RedTeamResult): MatcherResult {
  const pass = result.success;
  const { metrics } = result.manifest;

  return {
    pass,
    message: () =>
      pass
        ? `Expected red team test to fail, but passed with ${(result.defenseRate * 100).toFixed(1)}% defense rate`
        : `Expected red team test to pass, but defense rate was only ${(result.defenseRate * 100).toFixed(1)}%

  Total tests: ${metrics.total_tests}
  Safe: ${metrics.safe_responses}
  Blocked: ${metrics.blocked_responses}
  Unsafe: ${metrics.unsafe_responses}
  Errors: ${metrics.error_responses}`,
  };
}

// ==========================================================================
// Stress Test Result Matchers
// ==========================================================================

/**
 * Check if stress test success rate meets threshold
 */
export function toHaveStressSuccessRate(result: StressResult, expectedRate: number): MatcherResult {
  const actualRate = result.successRate;
  const pass = actualRate >= expectedRate;

  return {
    pass,
    message: () =>
      pass
        ? `Expected stress test success rate to be less than ${(expectedRate * 100).toFixed(1)}%, but got ${(actualRate * 100).toFixed(1)}%`
        : `Expected stress test success rate to be at least ${(expectedRate * 100).toFixed(1)}%, but got ${(actualRate * 100).toFixed(1)}%`,
  };
}

/**
 * Check if stress test achieved target RPS
 */
export function toAchieveRPS(result: StressResult, targetRPS: number): MatcherResult {
  const actualRPS = result.rps;
  const pass = actualRPS >= targetRPS;

  return {
    pass,
    message: () =>
      pass
        ? `Expected RPS to be less than ${targetRPS}, but achieved ${actualRPS.toFixed(1)} RPS`
        : `Expected to achieve at least ${targetRPS} RPS, but only got ${actualRPS.toFixed(1)} RPS`,
  };
}

/**
 * Check if stress test P95 latency is within threshold
 */
export function toHaveStressP95LatencyBelow(
  result: StressResult,
  maxLatencyMs: number
): MatcherResult {
  const actualLatency = result.p95LatencyMs;
  const pass = actualLatency <= maxLatencyMs;

  return {
    pass,
    message: () =>
      pass
        ? `Expected P95 latency to be above ${maxLatencyMs}ms, but got ${actualLatency}ms`
        : `Expected P95 latency to be at most ${maxLatencyMs}ms, but got ${actualLatency}ms`,
  };
}

/**
 * Check if stress test passed (default 95% success rate)
 */
export function toPassStressTest(result: StressResult): MatcherResult {
  const pass = result.success;
  const { metrics } = result.manifest;

  return {
    pass,
    message: () =>
      pass
        ? `Expected stress test to fail, but passed with ${(result.successRate * 100).toFixed(1)}% success rate`
        : `Expected stress test to pass, but success rate was only ${(result.successRate * 100).toFixed(1)}%

  Total requests: ${metrics.total_requests}
  Successful: ${metrics.successful_requests}
  Failed: ${metrics.failed_requests}
  RPS: ${metrics.requests_per_second.toFixed(1)}
  P95 Latency: ${metrics.p95_latency_ms}ms`,
  };
}

// ==========================================================================
// Export all matchers
// ==========================================================================

export const artemiskitMatchers = {
  // Run matchers
  toPassAllCases,
  toHaveSuccessRate,
  toPassCasesWithTag,
  toHaveMedianLatencyBelow,
  toHaveP95LatencyBelow,

  // Red team matchers
  toHaveDefenseRate,
  toHaveNoCriticalVulnerabilities,
  toHaveNoHighSeverityVulnerabilities,
  toPassRedTeam,

  // Stress test matchers
  toHaveStressSuccessRate,
  toAchieveRPS,
  toHaveStressP95LatencyBelow,
  toPassStressTest,
};

export type ArtemisKitMatchers = typeof artemiskitMatchers;
