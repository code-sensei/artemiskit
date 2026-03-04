/**
 * basic-run.ts
 *
 * Demonstrates the simplest way to run ArtemisKit tests programmatically.
 * This example shows basic scenario evaluation with minimal configuration.
 *
 * Usage:
 *   bun run basic-run.ts
 *   # or
 *   tsx basic-run.ts
 */

import { resolve } from 'node:path';
import { ArtemisKit } from '@artemiskit/sdk';

async function main() {
  console.log('🏹 ArtemisKit SDK - Basic Run Example\n');

  // Initialize ArtemisKit with configuration
  const kit = new ArtemisKit({
    provider: 'openai',
    model: 'gpt-4o-mini',
    project: 'sdk-examples',
  });

  // Path to scenario file (relative to examples/05-sdk/)
  const scenarioPath = resolve(__dirname, '../scenarios/example.yaml');

  console.log(`📋 Running scenario: ${scenarioPath}\n`);

  try {
    // Run the test scenario
    const results = await kit.run({
      scenario: scenarioPath,
    });

    // Output results
    console.log('\n📊 Results Summary');
    console.log('─'.repeat(40));
    console.log(`Status: ${results.success ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Total Cases: ${results.manifest.metrics.total_cases}`);
    console.log(`Passed: ${results.manifest.metrics.passed_cases}`);
    console.log(`Failed: ${results.manifest.metrics.failed_cases}`);
    console.log(`Pass Rate: ${(results.manifest.metrics.pass_rate * 100).toFixed(1)}%`);
    console.log(`Duration: ${results.manifest.duration_ms}ms`);

    // Show individual case results
    if (results.cases.length > 0) {
      console.log('\n📝 Case Results');
      console.log('─'.repeat(40));
      for (const caseResult of results.cases) {
        const status = caseResult.ok ? '✅' : '❌';
        console.log(`${status} ${caseResult.name ?? caseResult.id}`);
        if (!caseResult.ok && caseResult.reason) {
          console.log(`   └─ ${caseResult.reason}`);
        }
      }
    }

    // Exit with appropriate code
    process.exit(results.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Error running tests:', error);
    process.exit(1);
  }
}

// Run the example
main();
