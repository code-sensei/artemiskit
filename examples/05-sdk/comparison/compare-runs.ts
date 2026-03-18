/**
 * compare-runs.ts
 *
 * Demonstrates using kit.compare() to compare two evaluation runs
 * for regression detection. This is essential for:
 *
 * - Detecting quality regressions after prompt changes
 * - Comparing different model versions
 * - CI/CD quality gates
 * - A/B testing prompts or system configurations
 *
 * @since v0.3.2
 *
 * Usage:
 *   bun run examples/05-sdk/comparison/compare-runs.ts
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ArtemisKit,
  type CompareOptions,
  type CompareResult,
  type RunManifest,
} from '@artemiskit/sdk';

// Test storage path
const TEST_STORAGE = '/tmp/artemiskit-compare-demo';

async function main() {
  console.log('🏹 ArtemisKit SDK - Run Comparison Example\n');

  // Clean up and set up test storage
  await setupTestStorage();

  // Initialize ArtemisKit with local storage
  const kit = new ArtemisKit({
    project: 'comparison-example',
    provider: 'openai',
    model: 'gpt-4',
    storage: {
      type: 'local',
      basePath: TEST_STORAGE,
    },
  });

  // ========================================
  // Example 1: Basic comparison - detect regression
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 1: Basic Comparison (Regression Detection)');
  console.log('─'.repeat(60));

  const result1 = await kit.compare({
    baseline: 'baseline-run-001',
    current: 'current-run-001',
    threshold: 0.05, // 5% regression threshold
  });

  printComparisonResult(result1);

  // ========================================
  // Example 2: Larger threshold - no regression flagged
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 2: Larger Threshold (No Regression Flagged)');
  console.log('─'.repeat(60));

  const result2 = await kit.compare({
    baseline: 'baseline-run-001',
    current: 'current-run-001',
    threshold: 0.15, // 15% threshold - larger than the 10% drop
  });

  console.log(`Threshold: ${(result2.threshold * 100).toFixed(0)}%`);
  console.log(`Success Rate Delta: ${(result2.comparison.successRateDelta * 100).toFixed(1)}%`);
  console.log(`Has Regression: ${result2.hasRegression ? '❌ Yes' : '✅ No'}`);

  // ========================================
  // Example 3: Improvement scenario
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 3: Improvement Scenario');
  console.log('─'.repeat(60));

  const result3 = await kit.compare({
    baseline: 'baseline-run-001',
    current: 'improved-run-001',
    threshold: 0.05,
  });

  console.log(`Baseline Success Rate: ${(result3.baseline.successRate * 100).toFixed(0)}%`);
  console.log(`Current Success Rate: ${(result3.current.successRate * 100).toFixed(0)}%`);
  console.log(`Delta: ${(result3.comparison.successRateDelta * 100).toFixed(1)}% (improvement!)`);
  console.log(`Has Regression: ${result3.hasRegression ? '❌ Yes' : '✅ No'}`);
  console.log(`New Passes: ${result3.comparison.newPasses.length}`);

  // ========================================
  // Example 4: Detailed case-level analysis
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 4: Case-Level Analysis');
  console.log('─'.repeat(60));

  const result4 = await kit.compare({
    baseline: 'baseline-run-001',
    current: 'current-run-001',
    threshold: 0.05,
  });

  console.log('Case-Level Changes:');
  console.log(`  New Failures: ${result4.comparison.newFailures.length}`);
  for (const failure of result4.comparison.newFailures) {
    console.log(`    ❌ ${failure.caseId}: ${failure.baselineStatus} → ${failure.currentStatus}`);
  }

  console.log(`  New Passes: ${result4.comparison.newPasses.length}`);
  for (const pass of result4.comparison.newPasses) {
    console.log(`    ✅ ${pass.caseId}: ${pass.baselineStatus} → ${pass.currentStatus}`);
  }

  console.log(`  Unchanged: ${result4.comparison.unchanged.length}`);

  // ========================================
  // Example 5: CI/CD Integration Pattern
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 5: CI/CD Quality Gate Pattern');
  console.log('─'.repeat(60));

  const ciResult = await kit.compare({
    baseline: 'baseline-run-001',
    current: 'current-run-001',
    threshold: 0.05,
  });

  // CI/CD decision logic
  if (ciResult.hasRegression) {
    console.log('❌ QUALITY GATE FAILED');
    console.log(
      `   Regression detected: ${(ciResult.comparison.successRateDelta * 100).toFixed(1)}%`
    );
    console.log(`   Threshold: ${(ciResult.threshold * 100).toFixed(1)}%`);
    console.log(`   New failures: ${ciResult.comparison.newFailures.length}`);
    console.log('');
    console.log('   Failing cases:');
    for (const failure of ciResult.comparison.newFailures) {
      console.log(`     - ${failure.caseId}`);
    }
    // In CI/CD, you would: process.exit(1);
  } else {
    console.log('✅ QUALITY GATE PASSED');
    console.log(`   Success rate: ${(ciResult.current.successRate * 100).toFixed(1)}%`);
    console.log('   No regressions detected');
    // In CI/CD, you would: process.exit(0);
  }

  // Clean up
  await rm(TEST_STORAGE, { recursive: true, force: true });

  console.log(`\n${'─'.repeat(60)}`);
  console.log('✅ All comparison examples completed');
  console.log('─'.repeat(60));
}

/**
 * Print a formatted comparison result
 */
function printComparisonResult(result: CompareResult) {
  console.log('\nComparison Result:');
  console.log(`  Baseline Run ID: ${result.baseline.runId}`);
  console.log(`  Baseline Success Rate: ${(result.baseline.successRate * 100).toFixed(0)}%`);
  console.log(`  Baseline Total Cases: ${result.baseline.totalCases}`);
  console.log('');
  console.log(`  Current Run ID: ${result.current.runId}`);
  console.log(`  Current Success Rate: ${(result.current.successRate * 100).toFixed(0)}%`);
  console.log(`  Current Total Cases: ${result.current.totalCases}`);
  console.log('');
  console.log(`  Success Rate Delta: ${(result.comparison.successRateDelta * 100).toFixed(1)}%`);
  console.log(`  Threshold: ${(result.threshold * 100).toFixed(0)}%`);
  console.log(`  Has Regression: ${result.hasRegression ? '❌ Yes' : '✅ No'}`);
}

/**
 * Set up test storage with sample run manifests
 */
async function setupTestStorage() {
  await rm(TEST_STORAGE, { recursive: true, force: true });
  const projectDir = join(TEST_STORAGE, 'comparison-example');
  await mkdir(projectDir, { recursive: true });

  // Helper to create case results
  const createCase = (id: string, ok: boolean) => ({
    id,
    name: `Test ${id}`,
    ok,
    score: ok ? 1 : 0,
    matcherType: 'contains',
    reason: ok ? 'Passed' : 'Failed',
    latencyMs: 100,
    tokens: { prompt: 10, completion: 5, total: 15 },
    prompt: 'Test prompt',
    response: ok ? 'Expected response' : 'Wrong response',
    expected: { type: 'contains', values: ['expected'], mode: 'any' },
    tags: [],
  });

  // Baseline: 90% success rate (9/10 pass)
  const baselineManifest: RunManifest = {
    version: '1.0',
    type: 'run',
    run_id: 'baseline-run-001',
    project: 'comparison-example',
    start_time: '2026-03-17T10:00:00Z',
    end_time: '2026-03-17T10:01:00Z',
    duration_ms: 60000,
    config: {
      scenario: 'test-scenario',
      provider: 'openai',
      model: 'gpt-4',
    },
    metrics: {
      success_rate: 0.9,
      total_cases: 10,
      passed_cases: 9,
      failed_cases: 1,
      median_latency_ms: 100,
      p95_latency_ms: 150,
      total_tokens: 150,
      total_prompt_tokens: 100,
      total_completion_tokens: 50,
    },
    cases: [
      createCase('case-1', true),
      createCase('case-2', true),
      createCase('case-3', true),
      createCase('case-4', true),
      createCase('case-5', true),
      createCase('case-6', true),
      createCase('case-7', true),
      createCase('case-8', true),
      createCase('case-9', true),
      createCase('case-10', false), // One failure in baseline
    ],
    git: { commit: 'abc123', branch: 'main', dirty: false },
    provenance: { run_by: 'test' },
    environment: { node_version: 'v20.0.0', platform: 'darwin', arch: 'arm64' },
  };

  // Current: 80% success rate (regression - case-2 now fails)
  const currentManifest: RunManifest = {
    ...baselineManifest,
    run_id: 'current-run-001',
    start_time: '2026-03-18T10:00:00Z',
    end_time: '2026-03-18T10:01:00Z',
    metrics: {
      ...baselineManifest.metrics,
      success_rate: 0.8,
      passed_cases: 8,
      failed_cases: 2,
    },
    cases: [
      createCase('case-1', true),
      createCase('case-2', false), // NEW FAILURE
      createCase('case-3', true),
      createCase('case-4', true),
      createCase('case-5', true),
      createCase('case-6', true),
      createCase('case-7', true),
      createCase('case-8', true),
      createCase('case-9', true),
      createCase('case-10', false),
    ],
  };

  // Improved: 100% success rate (improvement scenario)
  const improvedManifest: RunManifest = {
    ...baselineManifest,
    run_id: 'improved-run-001',
    start_time: '2026-03-19T10:00:00Z',
    end_time: '2026-03-19T10:01:00Z',
    metrics: {
      ...baselineManifest.metrics,
      success_rate: 1.0,
      passed_cases: 10,
      failed_cases: 0,
    },
    cases: [
      createCase('case-1', true),
      createCase('case-2', true),
      createCase('case-3', true),
      createCase('case-4', true),
      createCase('case-5', true),
      createCase('case-6', true),
      createCase('case-7', true),
      createCase('case-8', true),
      createCase('case-9', true),
      createCase('case-10', true), // Previously failed, now passes
    ],
  };

  // Write manifests
  await writeFile(
    join(projectDir, 'baseline-run-001.json'),
    JSON.stringify(baselineManifest, null, 2)
  );
  await writeFile(
    join(projectDir, 'current-run-001.json'),
    JSON.stringify(currentManifest, null, 2)
  );
  await writeFile(
    join(projectDir, 'improved-run-001.json'),
    JSON.stringify(improvedManifest, null, 2)
  );

  console.log('✅ Test storage set up with sample run manifests\n');
}

main().catch(console.error);
