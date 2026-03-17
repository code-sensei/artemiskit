/**
 * Tests for SDK utility types and functions
 */

import { describe, expect, it } from 'bun:test';
import type { CaseResult, RedTeamManifest, RunManifest, StressManifest } from '@artemiskit/core';
import type { RedTeamResult, RunResult, StressResult } from '../types';
import {
  assert,
  assertDefined,
  calculateSuccessRate,
  getCasesByTag,
  getFailedCases,
  getPassedCases,
  isRedTeamManifestType,
  isRedTeamResult,
  isRunManifestType,
  isRunResult,
  isStressManifestType,
  isStressResult,
} from '../utils';

// Test fixtures
const createCaseResult = (ok: boolean, tags: string[] = []): CaseResult => ({
  id: `case-${Math.random().toString(36).slice(2)}`,
  ok,
  score: ok ? 1 : 0,
  matcherType: 'contains',
  latencyMs: 100,
  tokens: { prompt: 10, completion: 20, total: 30 },
  prompt: 'test prompt',
  response: 'test response',
  expected: { type: 'contains', values: ['test'] },
  tags,
});

const createRunResult = (cases: CaseResult[]): RunResult => ({
  success: cases.every((c) => c.ok),
  cases,
  manifest: {
    version: '1.0',
    run_id: 'test-run',
    project: 'test',
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    duration_ms: 1000,
    config: { scenario: 'test', provider: 'openai' },
    metrics: {
      success_rate: cases.filter((c) => c.ok).length / cases.length || 0,
      total_cases: cases.length,
      passed_cases: cases.filter((c) => c.ok).length,
      failed_cases: cases.filter((c) => !c.ok).length,
      median_latency_ms: 100,
      p95_latency_ms: 150,
      total_tokens: cases.length * 30,
      total_prompt_tokens: cases.length * 10,
      total_completion_tokens: cases.length * 20,
    },
    git: { commit: 'abc123', branch: 'main', dirty: false },
    provenance: { run_by: 'test' },
    cases,
    environment: { node_version: '20.0.0', platform: 'darwin', arch: 'arm64' },
  },
});

const createRedTeamResult = (): RedTeamResult => ({
  success: true,
  defenseRate: 0.95,
  unsafeCount: 1,
  manifest: {
    version: '1.0',
    type: 'redteam',
    run_id: 'test-redteam',
    project: 'test',
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    duration_ms: 1000,
    config: { scenario: 'test', provider: 'openai', mutations: [], count_per_case: 1 },
    metrics: {
      total_tests: 20,
      safe_responses: 18,
      blocked_responses: 1,
      unsafe_responses: 1,
      error_responses: 0,
      defended: 19,
      defense_rate: 0.95,
      by_severity: { low: 0, medium: 1, high: 0, critical: 0 },
    },
    git: { commit: 'abc123', branch: 'main', dirty: false },
    provenance: { run_by: 'test' },
    results: [],
    environment: { node_version: '20.0.0', platform: 'darwin', arch: 'arm64' },
  },
});

const createStressResult = (): StressResult => ({
  success: true,
  successRate: 0.98,
  rps: 50,
  p95LatencyMs: 250,
  manifest: {
    version: '1.0',
    type: 'stress',
    run_id: 'test-stress',
    project: 'test',
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    duration_ms: 10000,
    config: {
      scenario: 'test',
      provider: 'openai',
      concurrency: 10,
      duration_seconds: 10,
      ramp_up_seconds: 2,
    },
    metrics: {
      total_requests: 500,
      successful_requests: 490,
      failed_requests: 10,
      success_rate: 0.98,
      requests_per_second: 50,
      min_latency_ms: 50,
      max_latency_ms: 500,
      avg_latency_ms: 150,
      p50_latency_ms: 140,
      p90_latency_ms: 200,
      p95_latency_ms: 250,
      p99_latency_ms: 400,
    },
    git: { commit: 'abc123', branch: 'main', dirty: false },
    provenance: { run_by: 'test' },
    sample_results: [],
    environment: { node_version: '20.0.0', platform: 'darwin', arch: 'arm64' },
  },
});

describe('Utils - Type Guards', () => {
  describe('isRunResult', () => {
    it('should return true for RunResult', () => {
      const result = createRunResult([createCaseResult(true)]);
      expect(isRunResult(result)).toBe(true);
    });

    it('should return false for RedTeamResult', () => {
      const result = createRedTeamResult();
      expect(isRunResult(result)).toBe(false);
    });

    it('should return false for StressResult', () => {
      const result = createStressResult();
      expect(isRunResult(result)).toBe(false);
    });
  });

  describe('isRedTeamResult', () => {
    it('should return true for RedTeamResult', () => {
      const result = createRedTeamResult();
      expect(isRedTeamResult(result)).toBe(true);
    });

    it('should return false for RunResult', () => {
      const result = createRunResult([createCaseResult(true)]);
      expect(isRedTeamResult(result)).toBe(false);
    });

    it('should return false for StressResult', () => {
      const result = createStressResult();
      expect(isRedTeamResult(result)).toBe(false);
    });
  });

  describe('isStressResult', () => {
    it('should return true for StressResult', () => {
      const result = createStressResult();
      expect(isStressResult(result)).toBe(true);
    });

    it('should return false for RunResult', () => {
      const result = createRunResult([createCaseResult(true)]);
      expect(isStressResult(result)).toBe(false);
    });

    it('should return false for RedTeamResult', () => {
      const result = createRedTeamResult();
      expect(isStressResult(result)).toBe(false);
    });
  });

  describe('Manifest type guards', () => {
    it('isRunManifestType should identify run manifests', () => {
      const runManifest: RunManifest = createRunResult([]).manifest;
      expect(isRunManifestType(runManifest)).toBe(true);
    });

    it('isRedTeamManifestType should identify redteam manifests', () => {
      const redteamManifest: RedTeamManifest = createRedTeamResult().manifest;
      expect(isRedTeamManifestType(redteamManifest)).toBe(true);
    });

    it('isStressManifestType should identify stress manifests', () => {
      const stressManifest: StressManifest = createStressResult().manifest;
      expect(isStressManifestType(stressManifest)).toBe(true);
    });
  });
});

describe('Utils - Assertion Helpers', () => {
  describe('assertDefined', () => {
    it('should not throw for defined values', () => {
      expect(() => assertDefined('value')).not.toThrow();
      expect(() => assertDefined(0)).not.toThrow();
      expect(() => assertDefined(false)).not.toThrow();
      expect(() => assertDefined({})).not.toThrow();
    });

    it('should throw for null', () => {
      expect(() => assertDefined(null)).toThrow();
    });

    it('should throw for undefined', () => {
      expect(() => assertDefined(undefined)).toThrow();
    });

    it('should use custom message', () => {
      expect(() => assertDefined(null, 'Custom error')).toThrow('Custom error');
    });
  });

  describe('assert', () => {
    it('should not throw for true condition', () => {
      expect(() => assert(true)).not.toThrow();
      expect(() => assert(1 === 1)).not.toThrow();
    });

    it('should throw for false condition', () => {
      expect(() => assert(false)).toThrow();
    });

    it('should use custom message', () => {
      expect(() => assert(false, 'Custom assertion')).toThrow('Custom assertion');
    });
  });
});

describe('Utils - Result Analysis Helpers', () => {
  describe('getFailedCases', () => {
    it('should return empty array when all cases pass', () => {
      const result = createRunResult([createCaseResult(true), createCaseResult(true)]);
      expect(getFailedCases(result)).toHaveLength(0);
    });

    it('should return failed cases only', () => {
      const passedCase = createCaseResult(true);
      const failedCase = createCaseResult(false);
      const result = createRunResult([passedCase, failedCase]);

      const failed = getFailedCases(result);
      expect(failed).toHaveLength(1);
      expect(failed[0].ok).toBe(false);
    });
  });

  describe('getPassedCases', () => {
    it('should return empty array when all cases fail', () => {
      const result = createRunResult([createCaseResult(false), createCaseResult(false)]);
      expect(getPassedCases(result)).toHaveLength(0);
    });

    it('should return passed cases only', () => {
      const passedCase = createCaseResult(true);
      const failedCase = createCaseResult(false);
      const result = createRunResult([passedCase, failedCase]);

      const passed = getPassedCases(result);
      expect(passed).toHaveLength(1);
      expect(passed[0].ok).toBe(true);
    });
  });

  describe('getCasesByTag', () => {
    it('should return cases with matching tag', () => {
      const taggedCase = createCaseResult(true, ['important', 'smoke']);
      const untaggedCase = createCaseResult(true, ['other']);
      const result = createRunResult([taggedCase, untaggedCase]);

      const tagged = getCasesByTag(result, 'important');
      expect(tagged).toHaveLength(1);
      expect(tagged[0].tags).toContain('important');
    });

    it('should return empty array when no cases match', () => {
      const result = createRunResult([createCaseResult(true, ['other'])]);
      expect(getCasesByTag(result, 'nonexistent')).toHaveLength(0);
    });
  });

  describe('calculateSuccessRate', () => {
    it('should return 1 when all cases pass', () => {
      const result = createRunResult([createCaseResult(true), createCaseResult(true)]);
      expect(calculateSuccessRate(result)).toBe(1);
    });

    it('should return 0 when all cases fail', () => {
      const result = createRunResult([createCaseResult(false), createCaseResult(false)]);
      expect(calculateSuccessRate(result)).toBe(0);
    });

    it('should return correct ratio', () => {
      const result = createRunResult([
        createCaseResult(true),
        createCaseResult(true),
        createCaseResult(false),
        createCaseResult(false),
      ]);
      expect(calculateSuccessRate(result)).toBe(0.5);
    });

    it('should return 0 for empty cases', () => {
      const result = createRunResult([]);
      expect(calculateSuccessRate(result)).toBe(0);
    });
  });
});
