/**
 * @artemiskit/sdk
 * Vitest integration - custom matchers for ArtemisKit
 */

import type { RunResult, RedTeamResult, StressResult } from '../types';
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
} from './core';

/**
 * Vitest matchers implementation
 */
export const vitestMatchers = {
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

// Extend Vitest's expect if available
declare const expect: { extend: (matchers: object) => void } | undefined;
if (typeof expect !== 'undefined' && typeof expect.extend === 'function') {
  expect.extend(vitestMatchers);
}
