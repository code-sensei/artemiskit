/**
 * validate-scenario.ts
 *
 * Demonstrates using kit.validate() to validate scenario files
 * without executing them. This is useful for:
 *
 * - Pre-flight checks in CI/CD pipelines
 * - Validating scenarios before committing
 * - Checking scenario syntax and structure
 * - Identifying potential issues early
 *
 * @since v0.3.2
 *
 * Usage:
 *   bun run examples/05-sdk/validation/validate-scenario.ts
 */

import { resolve } from 'node:path';
import { ArtemisKit, type ValidationResult, type ValidationError } from '@artemiskit/sdk';

async function main() {
  console.log('🏹 ArtemisKit SDK - Scenario Validation Example\n');

  // Initialize ArtemisKit (no API key needed for validation)
  const kit = new ArtemisKit({
    project: 'validation-example',
  });

  // ========================================
  // Example 1: Validate a single scenario file
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 1: Validate a single scenario file');
  console.log('─'.repeat(60));

  const scenarioPath = resolve(__dirname, '../scenarios/example.yaml');
  console.log(`Validating: ${scenarioPath}\n`);

  const result = await kit.validate({
    scenario: scenarioPath,
  });

  printValidationResult(result);

  // ========================================
  // Example 2: Validate with strict mode
  // ========================================
  console.log('\n' + '─'.repeat(60));
  console.log('Example 2: Validate with strict mode (warnings become errors)');
  console.log('─'.repeat(60));

  const strictResult = await kit.validate({
    scenario: scenarioPath,
    strict: true,
  });

  console.log(`Valid (strict): ${strictResult.valid}`);
  console.log(`Total errors: ${strictResult.errors.length}`);
  console.log(`Total warnings: ${strictResult.warnings.length}`);

  // ========================================
  // Example 3: Validate multiple scenarios with glob pattern
  // ========================================
  console.log('\n' + '─'.repeat(60));
  console.log('Example 3: Validate directory with glob pattern');
  console.log('─'.repeat(60));

  const globPattern = resolve(__dirname, '../scenarios/*.yaml');
  console.log(`Pattern: ${globPattern}\n`);

  const multiResult = await kit.validate({
    scenario: globPattern,
  });

  console.log(`Found ${multiResult.scenarios.length} scenario(s)`);
  if (multiResult.scenarios.length > 0) {
    for (const scenario of multiResult.scenarios) {
      const status = scenario.valid ? '✅' : '❌';
      console.log(`  ${status} ${scenario.name} (${scenario.caseCount} cases)`);
      if (!scenario.valid && scenario.errors) {
        for (const error of scenario.errors) {
          console.log(`     └─ ${error}`);
        }
      }
    }
  } else {
    console.log('  No scenarios matched the pattern');
    // Show validation errors if any
    if (multiResult.errors.length > 0) {
      console.log('  Errors:');
      for (const error of multiResult.errors) {
        console.log(`    ❌ ${error.message}`);
      }
    }
  }

  // ========================================
  // Example 4: Programmatic error handling
  // ========================================
  console.log('\n' + '─'.repeat(60));
  console.log('Example 4: Programmatic error handling');
  console.log('─'.repeat(60));

  // Try to validate a non-existent file
  const badResult = await kit.validate({
    scenario: '/path/to/nonexistent.yaml',
  });

  if (!badResult.valid) {
    console.log('Validation failed (expected):');
    for (const error of badResult.errors) {
      console.log(`  ❌ [${error.code}] ${error.message}`);
      if (error.file) {
        console.log(`     File: ${error.file}`);
      }
      if (error.line) {
        console.log(`     Line: ${error.line}`);
      }
    }
  }

  // ========================================
  // CI/CD Usage Pattern
  // ========================================
  console.log('\n' + '─'.repeat(60));
  console.log('CI/CD Integration Pattern');
  console.log('─'.repeat(60));

  const ciResult = await kit.validate({
    scenario: resolve(__dirname, '../scenarios/*.yaml'),
    strict: true,
  });

  if (ciResult.valid) {
    console.log('✅ All scenarios validated successfully');
    console.log(`   ${ciResult.scenarios.length} scenario(s) checked`);
    const totalCases = ciResult.scenarios.reduce((sum, s) => sum + s.caseCount, 0);
    console.log(`   ${totalCases} test case(s) total`);
    process.exit(0);
  } else {
    console.log('❌ Validation failed');
    console.log(`   ${ciResult.errors.length} error(s)`);
    console.log(`   ${ciResult.warnings.length} warning(s)`);
    process.exit(1);
  }
}

function printValidationResult(result: ValidationResult) {
  console.log(`Valid: ${result.valid ? '✅ Yes' : '❌ No'}`);
  console.log(`Scenarios: ${result.scenarios.length}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);

  if (result.scenarios.length > 0) {
    console.log('\nScenario Details:');
    for (const scenario of result.scenarios) {
      console.log(`  📋 ${scenario.name}`);
      console.log(`     File: ${scenario.file}`);
      console.log(`     Cases: ${scenario.caseCount}`);
      console.log(`     Valid: ${scenario.valid}`);
    }
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of result.errors) {
      console.log(`  ❌ ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of result.warnings) {
      console.log(`  ⚠️  ${warning.message}`);
    }
  }
}

main().catch(console.error);
