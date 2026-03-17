/**
 * ci-cd-quality-gate.ts
 *
 * Demonstrates a complete CI/CD workflow using the ArtemisKit SDK.
 *
 * This example shows how to:
 * 1. Validate scenarios before running
 * 2. Run tests with storage
 * 3. Compare against baselines
 * 4. Make pass/fail decisions for CI/CD gates
 *
 * @since v0.3.2
 *
 * Usage:
 *   bun run examples/05-sdk/workflows/ci-cd-quality-gate.ts
 *
 * Environment:
 *   OPENAI_API_KEY - Required for running tests
 *   ARTEMIS_STORAGE_PATH - Optional, defaults to ./artemis-runs
 */

import { resolve } from 'node:path';
import {
  ArtemisKit,
  type CompareResult,
  type RunResult,
  type ValidationResult,
} from '@artemiskit/sdk';

// Configuration
const CONFIG = {
  project: process.env.CI_PROJECT_NAME ?? 'ci-quality-gate',
  storagePath: process.env.ARTEMIS_STORAGE_PATH ?? './artemis-runs',
  scenarioPath: process.env.ARTEMIS_SCENARIO_PATH ?? './scenarios',
  regressionThreshold: Number(process.env.ARTEMIS_REGRESSION_THRESHOLD ?? '0.05'),
  minSuccessRate: Number(process.env.ARTEMIS_MIN_SUCCESS_RATE ?? '0.95'),
};

interface QualityGateResult {
  passed: boolean;
  phase: string;
  message: string;
  details?: Record<string, unknown>;
}

async function main() {
  console.log('🏹 ArtemisKit CI/CD Quality Gate\n');
  console.log('Configuration:');
  console.log(`  Project: ${CONFIG.project}`);
  console.log(`  Scenarios: ${CONFIG.scenarioPath}`);
  console.log(`  Storage: ${CONFIG.storagePath}`);
  console.log(`  Regression Threshold: ${(CONFIG.regressionThreshold * 100).toFixed(0)}%`);
  console.log(`  Min Success Rate: ${(CONFIG.minSuccessRate * 100).toFixed(0)}%`);
  console.log('');

  // Initialize ArtemisKit
  const kit = new ArtemisKit({
    project: CONFIG.project,
    provider: 'openai',
    model: process.env.OPENAI_MODEL ?? 'gpt-4',
    storage: {
      type: 'local',
      basePath: CONFIG.storagePath,
    },
  });

  const results: QualityGateResult[] = [];

  try {
    // ========================================
    // Phase 1: Scenario Validation
    // ========================================
    console.log('─'.repeat(60));
    console.log('Phase 1: Scenario Validation');
    console.log('─'.repeat(60));

    const validationResult = await validateScenarios(kit, CONFIG.scenarioPath);
    results.push(validationResult);

    if (!validationResult.passed) {
      printResults(results);
      process.exit(1);
    }
    console.log('✅ Scenarios validated successfully\n');

    // ========================================
    // Phase 2: Run Tests (Demo mode - skip actual execution)
    // ========================================
    console.log('─'.repeat(60));
    console.log('Phase 2: Run Tests');
    console.log('─'.repeat(60));

    // In a real CI/CD pipeline, you would run:
    // const runResult = await runTests(kit, CONFIG.scenarioPath);
    // results.push(runResult);

    console.log('ℹ️  Demo mode: Skipping actual test execution');
    console.log('   In CI/CD, this would run:');
    console.log('   const result = await kit.run({ scenario, save: true });\n');

    results.push({
      passed: true,
      phase: 'Test Execution',
      message: 'Demo mode - skipped',
      details: { demo: true },
    });

    // ========================================
    // Phase 3: Success Rate Check
    // ========================================
    console.log('─'.repeat(60));
    console.log('Phase 3: Success Rate Check');
    console.log('─'.repeat(60));

    // In a real pipeline:
    // const successRateResult = checkSuccessRate(runResult, CONFIG.minSuccessRate);
    // results.push(successRateResult);

    console.log(`ℹ️  Would check: success rate >= ${(CONFIG.minSuccessRate * 100).toFixed(0)}%\n`);
    results.push({
      passed: true,
      phase: 'Success Rate',
      message: 'Demo mode - skipped',
    });

    // ========================================
    // Phase 4: Regression Check
    // ========================================
    console.log('─'.repeat(60));
    console.log('Phase 4: Regression Check');
    console.log('─'.repeat(60));

    // In a real pipeline with existing baseline:
    // const regressionResult = await checkRegression(kit, runResult.manifest.run_id);
    // results.push(regressionResult);

    console.log(
      `ℹ️  Would compare against baseline with ${(CONFIG.regressionThreshold * 100).toFixed(0)}% threshold\n`
    );
    results.push({
      passed: true,
      phase: 'Regression Check',
      message: 'Demo mode - skipped',
    });

    // ========================================
    // Final Results
    // ========================================
    printResults(results);

    const allPassed = results.every((r) => r.passed);
    if (allPassed) {
      console.log('\n✅ QUALITY GATE PASSED');
      process.exit(0);
    } else {
      console.log('\n❌ QUALITY GATE FAILED');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Phase 1: Validate all scenarios
 */
async function validateScenarios(
  kit: ArtemisKit,
  scenarioPath: string
): Promise<QualityGateResult> {
  try {
    const result = await kit.validate({
      scenario: resolve(scenarioPath, '*.yaml'),
      strict: true,
    });

    if (!result.valid) {
      return {
        passed: false,
        phase: 'Scenario Validation',
        message: `${result.errors.length} validation error(s) found`,
        details: {
          errors: result.errors.map((e) => e.message),
          warnings: result.warnings.map((w) => w.message),
        },
      };
    }

    return {
      passed: true,
      phase: 'Scenario Validation',
      message: `${result.scenarios.length} scenario(s) validated`,
      details: {
        scenarios: result.scenarios.map((s) => ({
          name: s.name,
          cases: s.caseCount,
        })),
      },
    };
  } catch (error) {
    return {
      passed: false,
      phase: 'Scenario Validation',
      message: `Validation failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Phase 2: Run tests (not used in demo)
 */
async function runTests(kit: ArtemisKit, scenarioPath: string): Promise<QualityGateResult> {
  try {
    const result = await kit.run({
      scenario: resolve(scenarioPath),
      save: true, // Save to storage for regression tracking
    });

    return {
      passed: result.success,
      phase: 'Test Execution',
      message: result.success
        ? `All ${result.manifest.metrics.total_cases} tests passed`
        : `${result.manifest.metrics.failed_cases} of ${result.manifest.metrics.total_cases} tests failed`,
      details: {
        runId: result.manifest.run_id,
        totalCases: result.manifest.metrics.total_cases,
        passedCases: result.manifest.metrics.passed_cases,
        failedCases: result.manifest.metrics.failed_cases,
        successRate: result.manifest.metrics.pass_rate,
        durationMs: result.manifest.duration_ms,
      },
    };
  } catch (error) {
    return {
      passed: false,
      phase: 'Test Execution',
      message: `Test execution failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Phase 3: Check success rate meets minimum threshold
 */
function checkSuccessRate(runResult: RunResult, minRate: number): QualityGateResult {
  const actualRate = runResult.manifest.metrics.pass_rate;
  const passed = actualRate >= minRate;

  return {
    passed,
    phase: 'Success Rate',
    message: passed
      ? `Success rate ${(actualRate * 100).toFixed(1)}% meets minimum ${(minRate * 100).toFixed(0)}%`
      : `Success rate ${(actualRate * 100).toFixed(1)}% below minimum ${(minRate * 100).toFixed(0)}%`,
    details: {
      actualRate,
      minimumRate: minRate,
    },
  };
}

/**
 * Phase 4: Check for regressions against baseline
 */
async function checkRegression(kit: ArtemisKit, currentRunId: string): Promise<QualityGateResult> {
  try {
    // Try to compare against 'latest' baseline
    const comparison = await kit.compare({
      baseline: 'latest',
      current: currentRunId,
      threshold: CONFIG.regressionThreshold,
    });

    if (comparison.hasRegression) {
      return {
        passed: false,
        phase: 'Regression Check',
        message: `Regression detected: ${(comparison.comparison.successRateDelta * 100).toFixed(1)}% drop`,
        details: {
          baselineRate: comparison.baseline.successRate,
          currentRate: comparison.current.successRate,
          delta: comparison.comparison.successRateDelta,
          newFailures: comparison.comparison.newFailures.map((f) => f.caseId),
        },
      };
    }

    return {
      passed: true,
      phase: 'Regression Check',
      message: 'No regressions detected',
      details: {
        baselineRate: comparison.baseline.successRate,
        currentRate: comparison.current.successRate,
        delta: comparison.comparison.successRateDelta,
        newPasses: comparison.comparison.newPasses.length,
      },
    };
  } catch (error) {
    // No baseline exists yet - this is OK for first run
    if (
      (error as Error).message.includes('not found') ||
      (error as Error).message.includes('No baseline')
    ) {
      return {
        passed: true,
        phase: 'Regression Check',
        message: 'No baseline found - skipping regression check (first run)',
      };
    }

    return {
      passed: false,
      phase: 'Regression Check',
      message: `Regression check failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Print all results in a formatted table
 */
function printResults(results: QualityGateResult[]) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('Quality Gate Results');
  console.log('═'.repeat(60));

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`\n${icon} ${result.phase}`);
    console.log(`   ${result.message}`);

    if (result.details && !result.passed) {
      console.log('   Details:');
      for (const [key, value] of Object.entries(result.details)) {
        const formattedValue = Array.isArray(value) ? value.join(', ') : String(value);
        console.log(`     ${key}: ${formattedValue}`);
      }
    }
  }
}

main().catch(console.error);
