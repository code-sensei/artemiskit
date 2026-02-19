/**
 * @artemiskit/sdk
 * Test matchers - core implementations without framework bindings
 */

export {
  artemiskitMatchers,
  type ArtemisKitMatchers,
  type MatcherResult,
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
} from './core';
