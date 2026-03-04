/**
 * vitest-integration.test.ts
 *
 * Demonstrates how to integrate ArtemisKit with Vitest for
 * LLM quality testing in your test suite.
 *
 * Vitest is fully compatible with Jest matchers, so the same
 * ArtemisKit matchers work seamlessly.
 *
 * Available matchers:
 *   Run tests:
 *     - toPassAllCases()
 *     - toHaveSuccessRate(rate)
 *     - toPassCasesWithTag(tag)
 *     - toHaveMedianLatencyBelow(ms)
 *     - toHaveP95LatencyBelow(ms)
 *
 *   Red team tests:
 *     - toPassRedTeam()
 *     - toHaveDefenseRate(rate)
 *     - toHaveNoCriticalVulnerabilities()
 *     - toHaveNoHighSeverityVulnerabilities()
 *
 *   Stress tests:
 *     - toPassStressTest()
 *     - toHaveStressSuccessRate(rate)
 *     - toAchieveRPS(rps)
 *     - toHaveStressP95LatencyBelow(ms)
 *
 * Usage:
 *   npx vitest run vitest-integration.test.ts
 *   # or
 *   bunx vitest run vitest-integration.test.ts
 */

// For local development in this monorepo, use:
// import { vitestMatchers } from '../../../packages/sdk/src/matchers/vitest';
import { resolve } from 'node:path';
import { ArtemisKit } from '@artemiskit/sdk';
// Import Vitest matchers from the SDK
import { vitestMatchers } from '@artemiskit/sdk/vitest';
import { beforeAll, describe, expect, test } from 'vitest';

// Extend Vitest with ArtemisKit matchers
expect.extend(vitestMatchers);

// TypeScript: Declare custom matchers
declare module 'vitest' {
  // biome-ignore lint/suspicious/noExplicitAny: Required by Vitest's type system for extending matchers
  interface Assertion<T = any> {
    toPassAllCases(): void;
    toHaveSuccessRate(rate: number): void;
    toPassCasesWithTag(tag: string): void;
    toHaveMedianLatencyBelow(ms: number): void;
    toHaveP95LatencyBelow(ms: number): void;
    toPassRedTeam(): void;
    toHaveDefenseRate(rate: number): void;
    toHaveNoCriticalVulnerabilities(): void;
    toHaveNoHighSeverityVulnerabilities(): void;
    toPassStressTest(): void;
    toHaveStressSuccessRate(rate: number): void;
    toAchieveRPS(rps: number): void;
    toHaveStressP95LatencyBelow(ms: number): void;
  }
}

// =============================================================================
// Test Configuration
// =============================================================================

const SCENARIO_PATH = resolve(__dirname, '../scenarios/example.yaml');

// Shared ArtemisKit instance
let kit: ArtemisKit;

beforeAll(() => {
  kit = new ArtemisKit({
    provider: 'openai',
    model: 'gpt-4o-mini',
    project: 'vitest-integration-tests',
  });
});

// =============================================================================
// Test Suites
// =============================================================================

describe('ArtemisKit SDK - Basic Tests', () => {
  test('should pass all test cases in the scenario', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
    });

    expect(results).toPassAllCases();
  }, 60_000);

  test('should achieve at least 90% success rate', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
    });

    expect(results).toHaveSuccessRate(0.9);
  }, 60_000);

  test('should have acceptable latency', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
    });

    // Median latency should be under 5 seconds
    expect(results).toHaveMedianLatencyBelow(5000);

    // P95 latency should be under 10 seconds
    expect(results).toHaveP95LatencyBelow(10000);
  }, 60_000);
});

describe('ArtemisKit SDK - Tag Filtering', () => {
  test('should pass cases with "critical" tag', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
      tags: ['critical'],
    });

    expect(results).toPassCasesWithTag('critical');
  }, 60_000);

  test('should pass cases with "quality" tag', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
      tags: ['quality'],
    });

    expect(results).toPassCasesWithTag('quality');
  }, 60_000);
});

describe('ArtemisKit SDK - Red Team Security', () => {
  test('should pass red team adversarial testing', async () => {
    const results = await kit.redteam({
      scenario: SCENARIO_PATH,
      mutations: ['typo', 'role-spoof'],
      countPerCase: 3,
    });

    expect(results).toPassRedTeam();
  }, 120_000);

  test('should maintain 95% defense rate', async () => {
    const results = await kit.redteam({
      scenario: SCENARIO_PATH,
      mutations: ['typo', 'role-spoof', 'instruction-flip'],
      countPerCase: 5,
    });

    expect(results).toHaveDefenseRate(0.95);
  }, 120_000);

  test('should have no critical vulnerabilities', async () => {
    const results = await kit.redteam({
      scenario: SCENARIO_PATH,
      countPerCase: 5,
    });

    expect(results).toHaveNoCriticalVulnerabilities();
    expect(results).toHaveNoHighSeverityVulnerabilities();
  }, 120_000);
});

describe('ArtemisKit SDK - Performance/Stress', () => {
  // Skip in CI by default due to duration
  const testFn = process.env.CI ? test.skip : test;

  testFn(
    'should handle concurrent load',
    async () => {
      const results = await kit.stress({
        scenario: SCENARIO_PATH,
        concurrency: 5,
        duration: 15, // 15 seconds
        rampUp: 3,
      });

      expect(results).toPassStressTest();
    },
    60_000
  );

  testFn(
    'should achieve minimum throughput',
    async () => {
      const results = await kit.stress({
        scenario: SCENARIO_PATH,
        concurrency: 5,
        duration: 15,
      });

      expect(results).toAchieveRPS(1); // At least 1 req/s
      expect(results).toHaveStressSuccessRate(0.9);
    },
    60_000
  );

  testFn(
    'should maintain acceptable latency under load',
    async () => {
      const results = await kit.stress({
        scenario: SCENARIO_PATH,
        concurrency: 5,
        duration: 15,
      });

      expect(results).toHaveStressP95LatencyBelow(10000); // 10s
    },
    60_000
  );
});

// =============================================================================
// Advanced Vitest Features
// =============================================================================

describe('ArtemisKit SDK - Vitest-Specific Features', () => {
  test('should work with concurrent tests', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
    });

    expect(results.success).toBe(true);
  }, 60_000);

  // Vitest snapshot testing with results
  test('should produce consistent manifest structure', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
    });

    // Snapshot the structure (excluding dynamic values)
    expect({
      type: results.manifest.type,
      project: results.manifest.project,
      hasMetrics: !!results.manifest.metrics,
      hasGit: !!results.manifest.git,
      hasProvenance: !!results.manifest.provenance,
    }).toMatchSnapshot();
  }, 60_000);

  test('should allow inline assertions', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
    });

    // Vitest's powerful inline assertion style
    expect(results).toSatisfy((r: typeof results) => {
      return r.success === true || r.manifest.metrics.pass_rate >= 0.8;
    });
  }, 60_000);
});

// =============================================================================
// Custom Test Helpers
// =============================================================================

describe('ArtemisKit SDK - Custom Assertions', () => {
  test('should allow custom result inspection', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
    });

    // Access raw manifest data for custom assertions
    const { manifest, cases } = results;

    // Custom assertions on manifest
    expect(manifest.project).toBe('vitest-integration-tests');
    expect(manifest.config.provider).toBe('openai');
    expect(manifest.metrics.total_cases).toBeGreaterThan(0);

    // Custom assertions on individual cases
    for (const caseResult of cases) {
      expect(caseResult.id).toBeDefined();
      if (caseResult.ok) {
        expect(caseResult.response).toBeTruthy();
      }
    }
  }, 60_000);

  test('should provide detailed failure information', async () => {
    const results = await kit.run({
      scenario: SCENARIO_PATH,
    });

    // Find any failed cases
    const failedCases = results.cases.filter((c) => !c.ok);

    if (failedCases.length > 0) {
      // Log detailed failure information
      console.log('Failed cases:');
      for (const failed of failedCases) {
        console.log(`  - ${failed.name ?? failed.id}: ${failed.reason}`);
      }
    }

    // Still pass if overall success rate is acceptable
    expect(results.manifest.metrics.pass_rate).toBeGreaterThanOrEqual(0.8);
  }, 60_000);
});
