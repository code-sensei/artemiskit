/**
 * with-events.ts
 *
 * Demonstrates using ArtemisKit's event emitter system for real-time
 * progress tracking and detailed monitoring of test execution.
 *
 * Available events:
 *   - caseStart: Fired when a test case begins
 *   - caseComplete: Fired when a test case completes
 *   - progress: Fired for general progress updates
 *   - redteamMutationStart: Fired when a red team mutation begins
 *   - redteamMutationComplete: Fired when a red team mutation completes
 *   - stressRequestComplete: Fired after each stress test request
 *
 * Usage:
 *   bun run with-events.ts
 *   # or
 *   tsx with-events.ts
 */

import { resolve } from 'node:path';
import { ArtemisKit } from '@artemiskit/sdk';
import type { CaseCompleteEvent, CaseStartEvent, ProgressEvent } from '@artemiskit/sdk';

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function progressBar(percent: number, width = 30): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
}

async function main() {
  console.log(`${colors.cyan}🏹 ArtemisKit SDK - Event Emitter Example${colors.reset}\n`);

  // Initialize ArtemisKit
  const kit = new ArtemisKit({
    provider: 'openai',
    model: 'gpt-4o-mini',
    project: 'sdk-examples',
    concurrency: 2, // Run 2 cases in parallel
  });

  // Track timing
  const startTime = Date.now();

  // ========================================
  // Register Event Handlers
  // ========================================

  // Method 1: Using convenience methods (chainable)
  kit
    .onCaseStart((event: CaseStartEvent) => {
      console.log(
        `${colors.blue}▶ Starting${colors.reset} ` +
          `${colors.cyan}${event.caseName ?? event.caseId}${colors.reset} ` +
          `${colors.dim}(${event.index + 1}/${event.total})${colors.reset}`
      );
    })
    .onCaseComplete((event: CaseCompleteEvent) => {
      const { result, index, total } = event;
      const status = result.ok
        ? `${colors.green}✓ PASS${colors.reset}`
        : `${colors.red}✗ FAIL${colors.reset}`;
      const latency = result.latencyMs
        ? ` ${colors.dim}(${formatTime(result.latencyMs)})${colors.reset}`
        : '';

      console.log(`${status} ${result.name ?? result.id}${latency}`);

      if (!result.ok && result.reason) {
        console.log(`  ${colors.dim}└─ ${result.reason}${colors.reset}`);
      }
    })
    .onProgress((event: ProgressEvent) => {
      // Only show progress bar for running phase
      if (event.phase === 'running' && event.progress !== undefined) {
        process.stdout.write(`\r${colors.dim}${progressBar(event.progress)}${colors.reset}`);
        if (event.progress === 100 || event.progress >= 95) {
          process.stdout.write('\n');
        }
      } else {
        console.log(`${colors.yellow}[${event.phase}]${colors.reset} ${event.message}`);
      }
    });

  // Method 2: Using generic on() method for one-time events
  kit.once('progress', (event) => {
    console.log(`${colors.dim}First progress event received${colors.reset}`);
  });

  // Path to scenario
  const scenarioPath = resolve(__dirname, '../scenarios/example.yaml');

  console.log(`${colors.dim}Scenario: ${scenarioPath}${colors.reset}\n`);

  try {
    // Run the test scenario
    const results = await kit.run({
      scenario: scenarioPath,
      concurrency: 2,
    });

    // Calculate total duration
    const totalDuration = Date.now() - startTime;

    // Output final summary
    console.log(`\n${colors.cyan}📊 Final Summary${colors.reset}`);
    console.log('─'.repeat(50));
    console.log(
      `Status:     ${results.success ? `${colors.green}PASSED ✅${colors.reset}` : `${colors.red}FAILED ❌${colors.reset}`}`
    );
    console.log(`Total:      ${results.manifest.metrics.total_cases} cases`);
    console.log(
      `Passed:     ${colors.green}${results.manifest.metrics.passed_cases}${colors.reset}`
    );
    console.log(
      `Failed:     ${results.manifest.metrics.failed_cases > 0 ? colors.red : ''}${results.manifest.metrics.failed_cases}${colors.reset}`
    );
    console.log(`Pass Rate:  ${(results.manifest.metrics.pass_rate * 100).toFixed(1)}%`);
    console.log(`Duration:   ${formatTime(totalDuration)}`);
    console.log(
      `Avg/Case:   ${formatTime(Math.round(totalDuration / results.manifest.metrics.total_cases))}`
    );

    process.exit(results.success ? 0 : 1);
  } catch (error) {
    console.error(`\n${colors.red}❌ Error:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run the example
main();
