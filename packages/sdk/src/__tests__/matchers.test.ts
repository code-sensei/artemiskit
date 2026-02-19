/**
 * @artemiskit/sdk
 * Tests for custom matchers
 */

import { describe, expect, it } from 'vitest';
import {
  toPassAllCases,
  toHaveSuccessRate,
  toPassCasesWithTag,
  toHaveMedianLatencyBelow,
  toHaveP95LatencyBelow,
  toHaveDefenseRate,
  toHaveNoCriticalVulnerabilities,
  toHaveNoHighSeverityVulnerabilities,
  toPassRedTeam,
  toHaveStressSuccessRate,
  toAchieveRPS,
  toHaveStressP95LatencyBelow,
  toPassStressTest,
} from '../matchers/core';
import type { RunResult, RedTeamResult, StressResult } from '../types';

// Helper to create mock run results
function createMockRunResult(
  overrides: Partial<{
    success: boolean;
    passedCases: number;
    failedCases: number;
    successRate: number;
    medianLatency: number;
    p95Latency: number;
    cases: Array<{
      id: string;
      name: string;
      ok: boolean;
      tags: string[];
      reason?: string;
    }>;
  }> = {}
): RunResult {
  const {
    success = true,
    passedCases = 10,
    failedCases = 0,
    successRate = 1,
    medianLatency = 100,
    p95Latency = 150,
    cases = [],
  } = overrides;

  const totalCases = passedCases + failedCases;
  const defaultCases =
    cases.length > 0
      ? cases
      : Array.from({ length: totalCases }, (_, i) => ({
          id: `case-${i}`,
          name: `Case ${i}`,
          ok: i < passedCases,
          score: i < passedCases ? 1 : 0,
          matcherType: 'contains',
          reason: i < passedCases ? 'Passed' : 'Failed',
          latencyMs: 100,
          tokens: { prompt: 10, completion: 5, total: 15 },
          prompt: 'test prompt',
          response: 'test response',
          expected: { type: 'contains', values: ['test'] },
          tags: [],
        }));

  return {
    success,
    // biome-ignore lint/suspicious/noExplicitAny: Test helper
    cases: defaultCases as any,
    manifest: {
      version: '1.0',
      run_id: 'test-run',
      project: 'test',
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      duration_ms: 1000,
      config: {
        scenario: 'test',
        provider: 'mock',
        model: 'mock-model',
      },
      metrics: {
        success_rate: successRate,
        total_cases: totalCases,
        passed_cases: passedCases,
        failed_cases: failedCases,
        median_latency_ms: medianLatency,
        p95_latency_ms: p95Latency,
        total_tokens: 150,
        total_prompt_tokens: 100,
        total_completion_tokens: 50,
      },
      git: { commit: 'abc', branch: 'main', dirty: false },
      provenance: { run_by: 'test' },
      // biome-ignore lint/suspicious/noExplicitAny: Test helper
      cases: defaultCases as any,
      environment: { node_version: 'v18', platform: 'linux', arch: 'x64' },
    },
  };
}

// Helper to create mock red team results
function createMockRedTeamResult(
  overrides: Partial<{
    success: boolean;
    defenseRate: number;
    unsafeCount: number;
    criticalCount: number;
    highCount: number;
  }> = {}
): RedTeamResult {
  const {
    success = true,
    defenseRate = 0.98,
    unsafeCount = 1,
    criticalCount = 0,
    highCount = 0,
  } = overrides;

  return {
    success,
    defenseRate,
    unsafeCount,
    manifest: {
      version: '1.0',
      type: 'redteam',
      run_id: 'test-run',
      project: 'test',
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      duration_ms: 1000,
      config: {
        scenario: 'test',
        provider: 'mock',
        model: 'mock-model',
        mutations: ['jailbreak'],
        count_per_case: 1,
      },
      metrics: {
        total_tests: 50,
        safe_responses: 45,
        blocked_responses: 4,
        unsafe_responses: unsafeCount,
        error_responses: 0,
        defended: 49,
        defense_rate: defenseRate,
        by_severity: {
          low: 0,
          medium: 0,
          high: highCount,
          critical: criticalCount,
        },
      },
      git: { commit: 'abc', branch: 'main', dirty: false },
      provenance: { run_by: 'test' },
      results: [],
      environment: { node_version: 'v18', platform: 'linux', arch: 'x64' },
    },
  };
}

// Helper to create mock stress results
function createMockStressResult(
  overrides: Partial<{
    success: boolean;
    successRate: number;
    rps: number;
    p95LatencyMs: number;
  }> = {}
): StressResult {
  const { success = true, successRate = 0.99, rps = 50, p95LatencyMs = 200 } = overrides;

  return {
    success,
    successRate,
    rps,
    p95LatencyMs,
    manifest: {
      version: '1.0',
      type: 'stress',
      run_id: 'test-run',
      project: 'test',
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      duration_ms: 30000,
      config: {
        scenario: 'test',
        provider: 'mock',
        model: 'mock-model',
        concurrency: 10,
        duration_seconds: 30,
        ramp_up_seconds: 5,
      },
      metrics: {
        total_requests: 1500,
        successful_requests: Math.floor(1500 * successRate),
        failed_requests: Math.floor(1500 * (1 - successRate)),
        success_rate: successRate,
        requests_per_second: rps,
        min_latency_ms: 50,
        max_latency_ms: 500,
        avg_latency_ms: 150,
        p50_latency_ms: 140,
        p90_latency_ms: 180,
        p95_latency_ms: p95LatencyMs,
        p99_latency_ms: 300,
      },
      git: { commit: 'abc', branch: 'main', dirty: false },
      provenance: { run_by: 'test' },
      sample_results: [],
      environment: { node_version: 'v18', platform: 'linux', arch: 'x64' },
    },
  };
}

describe('Run Result Matchers', () => {
  describe('toPassAllCases', () => {
    it('should pass when all cases pass', () => {
      const result = createMockRunResult({
        success: true,
        passedCases: 10,
        failedCases: 0,
      });
      const matcherResult = toPassAllCases(result);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when some cases fail', () => {
      const result = createMockRunResult({
        success: false,
        passedCases: 8,
        failedCases: 2,
      });
      const matcherResult = toPassAllCases(result);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('2 out of 10 cases failed');
    });
  });

  describe('toHaveSuccessRate', () => {
    it('should pass when success rate meets threshold', () => {
      const result = createMockRunResult({ successRate: 0.95 });
      const matcherResult = toHaveSuccessRate(result, 0.9);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when success rate is below threshold', () => {
      const result = createMockRunResult({ successRate: 0.85 });
      const matcherResult = toHaveSuccessRate(result, 0.9);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('85.0%');
      expect(matcherResult.message()).toContain('90.0%');
    });
  });

  describe('toPassCasesWithTag', () => {
    it('should pass when all tagged cases pass', () => {
      const result = createMockRunResult({
        cases: [
          { id: '1', name: 'Case 1', ok: true, tags: ['important'] },
          { id: '2', name: 'Case 2', ok: true, tags: ['important'] },
          { id: '3', name: 'Case 3', ok: false, tags: ['other'] },
        ],
      });
      const matcherResult = toPassCasesWithTag(result, 'important');
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when some tagged cases fail', () => {
      const result = createMockRunResult({
        cases: [
          { id: '1', name: 'Case 1', ok: true, tags: ['important'] },
          {
            id: '2',
            name: 'Case 2',
            ok: false,
            tags: ['important'],
            reason: 'Failed assertion',
          },
        ],
      });
      const matcherResult = toPassCasesWithTag(result, 'important');
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('1 out of 2 failed');
    });
  });

  describe('toHaveMedianLatencyBelow', () => {
    it('should pass when median latency is within threshold', () => {
      const result = createMockRunResult({ medianLatency: 100 });
      const matcherResult = toHaveMedianLatencyBelow(result, 200);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when median latency exceeds threshold', () => {
      const result = createMockRunResult({ medianLatency: 300 });
      const matcherResult = toHaveMedianLatencyBelow(result, 200);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('300ms');
    });
  });

  describe('toHaveP95LatencyBelow', () => {
    it('should pass when P95 latency is within threshold', () => {
      const result = createMockRunResult({ p95Latency: 150 });
      const matcherResult = toHaveP95LatencyBelow(result, 200);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when P95 latency exceeds threshold', () => {
      const result = createMockRunResult({ p95Latency: 250 });
      const matcherResult = toHaveP95LatencyBelow(result, 200);
      expect(matcherResult.pass).toBe(false);
    });
  });
});

describe('Red Team Result Matchers', () => {
  describe('toHaveDefenseRate', () => {
    it('should pass when defense rate meets threshold', () => {
      const result = createMockRedTeamResult({ defenseRate: 0.98 });
      const matcherResult = toHaveDefenseRate(result, 0.95);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when defense rate is below threshold', () => {
      const result = createMockRedTeamResult({ defenseRate: 0.85 });
      const matcherResult = toHaveDefenseRate(result, 0.95);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('85.0%');
    });
  });

  describe('toHaveNoCriticalVulnerabilities', () => {
    it('should pass when no critical vulnerabilities', () => {
      const result = createMockRedTeamResult({ criticalCount: 0 });
      const matcherResult = toHaveNoCriticalVulnerabilities(result);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when critical vulnerabilities exist', () => {
      const result = createMockRedTeamResult({ criticalCount: 2 });
      const matcherResult = toHaveNoCriticalVulnerabilities(result);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('2');
    });
  });

  describe('toHaveNoHighSeverityVulnerabilities', () => {
    it('should pass when no high/critical vulnerabilities', () => {
      const result = createMockRedTeamResult({
        highCount: 0,
        criticalCount: 0,
      });
      const matcherResult = toHaveNoHighSeverityVulnerabilities(result);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when high vulnerabilities exist', () => {
      const result = createMockRedTeamResult({ highCount: 3, criticalCount: 1 });
      const matcherResult = toHaveNoHighSeverityVulnerabilities(result);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('4');
      expect(matcherResult.message()).toContain('3 high');
    });
  });

  describe('toPassRedTeam', () => {
    it('should pass when red team test passes', () => {
      const result = createMockRedTeamResult({ success: true });
      const matcherResult = toPassRedTeam(result);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when red team test fails', () => {
      const result = createMockRedTeamResult({
        success: false,
        defenseRate: 0.7,
      });
      const matcherResult = toPassRedTeam(result);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('70.0%');
    });
  });
});

describe('Stress Test Result Matchers', () => {
  describe('toHaveStressSuccessRate', () => {
    it('should pass when success rate meets threshold', () => {
      const result = createMockStressResult({ successRate: 0.99 });
      const matcherResult = toHaveStressSuccessRate(result, 0.95);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when success rate is below threshold', () => {
      const result = createMockStressResult({ successRate: 0.85 });
      const matcherResult = toHaveStressSuccessRate(result, 0.95);
      expect(matcherResult.pass).toBe(false);
    });
  });

  describe('toAchieveRPS', () => {
    it('should pass when RPS meets target', () => {
      const result = createMockStressResult({ rps: 100 });
      const matcherResult = toAchieveRPS(result, 50);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when RPS is below target', () => {
      const result = createMockStressResult({ rps: 30 });
      const matcherResult = toAchieveRPS(result, 50);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('30.0 RPS');
    });
  });

  describe('toHaveStressP95LatencyBelow', () => {
    it('should pass when P95 latency is within threshold', () => {
      const result = createMockStressResult({ p95LatencyMs: 150 });
      const matcherResult = toHaveStressP95LatencyBelow(result, 200);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when P95 latency exceeds threshold', () => {
      const result = createMockStressResult({ p95LatencyMs: 300 });
      const matcherResult = toHaveStressP95LatencyBelow(result, 200);
      expect(matcherResult.pass).toBe(false);
    });
  });

  describe('toPassStressTest', () => {
    it('should pass when stress test passes', () => {
      const result = createMockStressResult({ success: true });
      const matcherResult = toPassStressTest(result);
      expect(matcherResult.pass).toBe(true);
    });

    it('should fail when stress test fails', () => {
      const result = createMockStressResult({ success: false, successRate: 0.8 });
      const matcherResult = toPassStressTest(result);
      expect(matcherResult.pass).toBe(false);
      expect(matcherResult.message()).toContain('80.0%');
    });
  });
});
