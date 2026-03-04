/**
 * Baseline Management - Supabase Analytics Examples
 *
 * This file demonstrates baseline management for regression detection:
 * - Setting baselines from successful runs
 * - Comparing new runs against baselines
 * - Detecting regressions automatically
 * - Managing multiple baselines across scenarios
 *
 * Run with: bun run examples/supabase-analytics/test-baselines.ts
 */

import { SupabaseStorageAdapter } from '@artemiskit/core/storage';
import type { RunManifest } from '@artemiskit/core/artifacts';
import type { BaselineMetadata, ComparisonResult } from '@artemiskit/core/storage';

// Initialize the storage adapter
const storage = new SupabaseStorageAdapter(
  {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
    bucket: 'artemis-runs',
  },
  'my-project'
);

// =============================================================================
// Example 1: Set a Baseline from a Run
// =============================================================================

async function setBaseline() {
  console.log('\n📌 Example 1: Setting a baseline...\n');

  // First, let's create a mock run to use as baseline
  const mockRun: RunManifest = {
    run_id: `baseline-run-${Date.now()}`,
    project: 'my-project',
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    config: {
      scenario: 'customer-support-agent',
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.7,
    },
    metrics: {
      success_rate: 0.92,
      total_cases: 50,
      passed_cases: 46,
      failed_cases: 4,
      median_latency_ms: 1200,
      p95_latency_ms: 2100,
      total_tokens: 15000,
    },
    git: {
      commit: 'abc123',
      branch: 'main',
      dirty: false,
    },
    provenance: {
      run_by: 'ci@example.com',
      run_reason: 'release-v1.0.0',
    },
    cases: [], // Simplified for example
  };

  // Save the run first
  await storage.save(mockRun);
  console.log(`✅ Created run: ${mockRun.run_id}`);

  // Set it as the baseline for this scenario
  const baseline = await storage.setBaseline(
    'customer-support-agent', // scenario
    mockRun.run_id, // run ID
    'v1.0.0-release' // optional tag
  );

  console.log('\n📊 Baseline set:');
  console.log(`  Scenario:     ${baseline.scenario}`);
  console.log(`  Run ID:       ${baseline.runId}`);
  console.log(`  Tag:          ${baseline.tag || '(none)'}`);
  console.log(`  Success Rate: ${(baseline.metrics.successRate * 100).toFixed(1)}%`);
  console.log(`  Latency:      ${baseline.metrics.medianLatencyMs}ms`);
  console.log(
    `  Cases:        ${baseline.metrics.passedCases}/${baseline.metrics.totalCases} passed`
  );

  return mockRun.run_id;
}

// =============================================================================
// Example 2: Get Baseline for Comparison
// =============================================================================

async function getBaseline() {
  console.log('\n🔍 Example 2: Getting baseline for scenario...\n');

  const baseline = await storage.getBaseline('customer-support-agent');

  if (!baseline) {
    console.log('⚠️  No baseline found for scenario "customer-support-agent"');
    console.log('   Run setBaseline() first to create one.');
    return null;
  }

  console.log('📊 Current baseline:');
  console.log(`  Scenario:     ${baseline.scenario}`);
  console.log(`  Run ID:       ${baseline.runId}`);
  console.log(`  Created:      ${baseline.createdAt}`);
  console.log(`  Tag:          ${baseline.tag || '(none)'}`);
  console.log('\n  Metrics snapshot:');
  console.log(`    Success Rate: ${(baseline.metrics.successRate * 100).toFixed(1)}%`);
  console.log(`    Latency:      ${baseline.metrics.medianLatencyMs}ms`);
  console.log(`    Tokens:       ${baseline.metrics.totalTokens}`);
  console.log(`    Cases:        ${baseline.metrics.passedCases}/${baseline.metrics.totalCases}`);

  return baseline;
}

// =============================================================================
// Example 3: Compare New Run Against Baseline
// =============================================================================

async function compareToBaseline(baselineRunId: string) {
  console.log('\n⚖️  Example 3: Comparing new run against baseline...\n');

  // Create a "new" run with slightly different metrics
  const newRun: RunManifest = {
    run_id: `new-run-${Date.now()}`,
    project: 'my-project',
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    config: {
      scenario: 'customer-support-agent',
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.7,
    },
    metrics: {
      success_rate: 0.88, // Slight decrease
      total_cases: 50,
      passed_cases: 44,
      failed_cases: 6,
      median_latency_ms: 1350, // Slight increase
      p95_latency_ms: 2400,
      total_tokens: 16200,
    },
    git: {
      commit: 'def456',
      branch: 'feature/new-prompts',
      dirty: false,
    },
    provenance: {
      run_by: 'ci@example.com',
      run_reason: 'pr-check',
    },
    cases: [],
  };

  // Save the new run
  await storage.save(newRun);
  console.log(`✅ Created new run: ${newRun.run_id}`);

  // Compare against baseline
  const comparison = await storage.compare(baselineRunId, newRun.run_id);

  console.log('\n📊 Comparison Results:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Metric          Baseline    Current     Delta`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const formatDelta = (delta: number, isPercent = false, lowerIsBetter = false) => {
    const sign = delta >= 0 ? '+' : '';
    const value = isPercent ? `${sign}${(delta * 100).toFixed(1)}%` : `${sign}${delta.toFixed(0)}`;
    const good = lowerIsBetter ? delta < 0 : delta > 0;
    const emoji = delta === 0 ? '➖' : good ? '✅' : '❌';
    return `${value} ${emoji}`;
  };

  console.log(
    `  Success Rate    ${(comparison.baseline.metrics.success_rate * 100).toFixed(1)}%       ` +
      `${(comparison.current.metrics.success_rate * 100).toFixed(1)}%       ` +
      `${formatDelta(comparison.delta.successRate, true)}`
  );

  console.log(
    `  Latency (ms)    ${comparison.baseline.metrics.median_latency_ms}        ` +
      `${comparison.current.metrics.median_latency_ms}        ` +
      `${formatDelta(comparison.delta.latency, false, true)}`
  );

  console.log(
    `  Tokens          ${comparison.baseline.metrics.total_tokens}       ` +
      `${comparison.current.metrics.total_tokens}       ` +
      `${formatDelta(comparison.delta.tokens, false, true)}`
  );

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return { newRunId: newRun.run_id, comparison };
}

// =============================================================================
// Example 4: Detect Regressions
// =============================================================================

async function detectRegressions(runId: string) {
  console.log('\n🚨 Example 4: Detecting regressions...\n');

  // Compare with configurable threshold (default 5%)
  const regressionThreshold = 0.05; // 5% drop is considered regression
  const result = await storage.compareToBaseline(runId, regressionThreshold);

  if (!result) {
    console.log('⚠️  No baseline found for comparison');
    return;
  }

  console.log('📊 Regression Analysis:');
  console.log(`  Baseline Run:        ${result.baseline.runId}`);
  console.log(`  Baseline Tag:        ${result.baseline.tag || '(none)'}`);
  console.log(`  Regression Threshold: ${(regressionThreshold * 100).toFixed(0)}%`);
  console.log(`  Success Rate Delta:   ${(result.comparison.delta.successRate * 100).toFixed(1)}%`);

  if (result.hasRegression) {
    console.log('\n🚨 REGRESSION DETECTED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(
      `  Baseline success rate: ${(result.baseline.metrics.successRate * 100).toFixed(1)}%`
    );
    console.log(
      `  Current success rate:  ${(result.comparison.current.metrics.success_rate * 100).toFixed(1)}%`
    );
    console.log(`  Drop: ${Math.abs(result.comparison.delta.successRate * 100).toFixed(1)}%`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nRecommended actions:');
    console.log('  1. Review failed test cases in the current run');
    console.log('  2. Check recent code changes');
    console.log('  3. Verify model/provider configuration');
    console.log('  4. Consider reverting if blocking deployment');

    // In CI/CD, you might:
    // - Fail the build
    // - Send Slack/Discord notification
    // - Create GitHub issue
    // - Block deployment

    return false; // Indicates regression
  } else {
    console.log('\n✅ No regression detected');
    console.log('  Current run meets or exceeds baseline quality.');
    return true;
  }
}

// =============================================================================
// Example 5: Manage Multiple Baselines
// =============================================================================

async function manageBaselines() {
  console.log('\n📋 Example 5: Managing multiple baselines...\n');

  // List all baselines
  const baselines = await storage.listBaselines();

  console.log(`Found ${baselines.length} baselines:\n`);

  if (baselines.length === 0) {
    console.log('  (no baselines set)');
  } else {
    baselines.forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.scenario}`);
      console.log(`     Run ID:  ${b.runId}`);
      console.log(`     Tag:     ${b.tag || '(none)'}`);
      console.log(`     Created: ${b.createdAt}`);
      console.log(`     Success: ${(b.metrics.successRate * 100).toFixed(1)}%\n`);
    });
  }

  // Demonstrate removing a baseline
  console.log('Removing baseline by scenario...');
  const removed = await storage.removeBaseline('customer-support-agent');
  console.log(removed ? '✅ Baseline removed' : '⚠️  Baseline not found');

  // Can also remove by run ID
  // await storage.removeBaselineByRunId('run-xyz');
}

// =============================================================================
// Example 6: CI/CD Integration Pattern
// =============================================================================

async function cicdIntegration(runId: string) {
  console.log('\n🔄 Example 6: CI/CD integration pattern...\n');

  // This pattern is ideal for GitHub Actions, GitLab CI, etc.

  const REGRESSION_THRESHOLD = parseFloat(process.env.REGRESSION_THRESHOLD || '0.05');
  const FAIL_ON_REGRESSION = process.env.FAIL_ON_REGRESSION !== 'false';

  console.log('Configuration:');
  console.log(`  REGRESSION_THRESHOLD: ${REGRESSION_THRESHOLD}`);
  console.log(`  FAIL_ON_REGRESSION: ${FAIL_ON_REGRESSION}`);

  // Check for regression
  const result = await storage.compareToBaseline(runId, REGRESSION_THRESHOLD);

  if (!result) {
    console.log('\n⚠️  No baseline exists - this will become the baseline');
    // In CI, you might auto-set baseline on main branch
    // await storage.setBaseline('my-scenario', runId, 'auto-main');
    return;
  }

  // Output for CI systems (can be parsed)
  console.log('\n::group::Regression Analysis');
  console.log(`baseline_run_id=${result.baseline.runId}`);
  console.log(`baseline_success_rate=${result.baseline.metrics.successRate}`);
  console.log(`current_success_rate=${result.comparison.current.metrics.success_rate}`);
  console.log(`delta=${result.comparison.delta.successRate}`);
  console.log(`has_regression=${result.hasRegression}`);
  console.log('::endgroup::');

  if (result.hasRegression && FAIL_ON_REGRESSION) {
    console.log('\n❌ Build failed due to regression');
    // In real CI, use: process.exit(1);
  } else {
    console.log('\n✅ Quality check passed');
  }
}

// =============================================================================
// Main Runner
// =============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ArtemisKit Supabase Analytics - Baseline Management Examples');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Example 1: Set a baseline
    const baselineRunId = await setBaseline();

    // Example 2: Get the baseline
    const baseline = await getBaseline();

    if (baseline) {
      // Example 3: Compare new run against baseline
      const { newRunId, comparison } = await compareToBaseline(baselineRunId);

      // Example 4: Detect regressions
      await detectRegressions(newRunId);

      // Example 6: CI/CD pattern
      await cicdIntegration(newRunId);
    }

    // Example 5: Manage multiple baselines
    await manageBaselines();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
main();
