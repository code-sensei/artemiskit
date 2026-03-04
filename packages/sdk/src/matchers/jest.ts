/**
 * @artemiskit/sdk
 * Jest integration - custom matchers for ArtemisKit
 */

import type { RedTeamResult, RunResult, StressResult } from '../types';
import {
  toAchieveRPS,
  toHaveDefenseRate,
  toHaveMedianLatencyBelow,
  toHaveNoCriticalVulnerabilities,
  toHaveNoHighSeverityVulnerabilities,
  toHaveP95LatencyBelow,
  toHaveStressP95LatencyBelow,
  toHaveStressSuccessRate,
  toHaveSuccessRate,
  toPassAllCases,
  toPassCasesWithTag,
  toPassRedTeam,
  toPassStressTest,
} from './core';

/**
 * Jest matchers implementation
 */
export const jestMatchers = {
  toPassAllCases(received: RunResult) {
    return toPassAllCases(received);
  },

  toHaveSuccessRate(received: RunResult, expectedRate: number) {
    return toHaveSuccessRate(received, expectedRate);
  },

  toPassCasesWithTag(received: RunResult, tag: string) {
    return toPassCasesWithTag(received, tag);
  },

  toHaveMedianLatencyBelow(received: RunResult, maxLatencyMs: number) {
    return toHaveMedianLatencyBelow(received, maxLatencyMs);
  },

  toHaveP95LatencyBelow(received: RunResult, maxLatencyMs: number) {
    return toHaveP95LatencyBelow(received, maxLatencyMs);
  },

  toHaveDefenseRate(received: RedTeamResult, expectedRate: number) {
    return toHaveDefenseRate(received, expectedRate);
  },

  toHaveNoCriticalVulnerabilities(received: RedTeamResult) {
    return toHaveNoCriticalVulnerabilities(received);
  },

  toHaveNoHighSeverityVulnerabilities(received: RedTeamResult) {
    return toHaveNoHighSeverityVulnerabilities(received);
  },

  toPassRedTeam(received: RedTeamResult) {
    return toPassRedTeam(received);
  },

  toHaveStressSuccessRate(received: StressResult, expectedRate: number) {
    return toHaveStressSuccessRate(received, expectedRate);
  },

  toAchieveRPS(received: StressResult, targetRPS: number) {
    return toAchieveRPS(received, targetRPS);
  },

  toHaveStressP95LatencyBelow(received: StressResult, maxLatencyMs: number) {
    return toHaveStressP95LatencyBelow(received, maxLatencyMs);
  },

  toPassStressTest(received: StressResult) {
    return toPassStressTest(received);
  },
};

// Extend Jest's expect if available
declare const expect: { extend: (matchers: object) => void } | undefined;
if (typeof expect !== 'undefined' && typeof expect.extend === 'function') {
  expect.extend(jestMatchers);
}

/**
 * TypeScript declarations for Jest matchers
 */
declare global {
  namespace jest {
    interface Matchers<R> {
      // Run matchers
      toPassAllCases(): R;
      toHaveSuccessRate(expectedRate: number): R;
      toPassCasesWithTag(tag: string): R;
      toHaveMedianLatencyBelow(maxLatencyMs: number): R;
      toHaveP95LatencyBelow(maxLatencyMs: number): R;

      // Red team matchers
      toHaveDefenseRate(expectedRate: number): R;
      toHaveNoCriticalVulnerabilities(): R;
      toHaveNoHighSeverityVulnerabilities(): R;
      toPassRedTeam(): R;

      // Stress test matchers
      toHaveStressSuccessRate(expectedRate: number): R;
      toAchieveRPS(targetRPS: number): R;
      toHaveStressP95LatencyBelow(maxLatencyMs: number): R;
      toPassStressTest(): R;
    }
  }
}
