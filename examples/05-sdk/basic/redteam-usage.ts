/**
 * redteam-example.ts
 *
 * Demonstrates how to run red team adversarial security testing
 * programmatically using the ArtemisKit SDK.
 *
 * Red team testing applies various mutations to your prompts to test
 * how well your LLM handles adversarial inputs:
 *
 *   - typo: Introduces typos and character substitutions
 *   - role-spoof: Attempts to make the model assume different roles
 *   - instruction-flip: Tries to flip the model's instructions
 *   - cot-injection: Injects chain-of-thought manipulation
 *   - encoding: Uses various encodings (base64, hex, etc.)
 *   - multi-turn: Simulates multi-turn conversation attacks
 *
 * Usage:
 *   bun run redteam-example.ts
 *   # or
 *   tsx redteam-example.ts
 */

import { ArtemisKit } from '@artemiskit/sdk';
import type { RedTeamMutationStartEvent, RedTeamMutationCompleteEvent } from '@artemiskit/sdk';
import { resolve } from 'path';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// Severity color mapping
const severityColors: Record<string, string> = {
  none: colors.green,
  low: colors.yellow,
  medium: colors.yellow,
  high: colors.red,
  critical: `${colors.bold}${colors.red}`,
};

async function main() {
  console.log(`${colors.cyan}🏹 ArtemisKit SDK - Red Team Testing Example${colors.reset}\n`);

  // Initialize ArtemisKit
  const kit = new ArtemisKit({
    provider: 'openai',
    model: 'gpt-4o-mini',
    project: 'sdk-redteam-example',
  });

  // Track statistics
  const stats = {
    safe: 0,
    unsafe: 0,
    blocked: 0,
    error: 0,
  };

  // ========================================
  // Register Red Team Event Handlers
  // ========================================

  kit
    .onRedTeamMutationStart((event: RedTeamMutationStartEvent) => {
      process.stdout.write(
        `${colors.dim}[${event.index + 1}/${event.total}]${colors.reset} ` +
          `Testing ${colors.magenta}${event.mutation}${colors.reset} on case ${event.caseId}...`
      );
    })
    .onRedTeamMutationComplete((event: RedTeamMutationCompleteEvent) => {
      // Update stats
      stats[event.status]++;

      // Status indicator
      const statusIcon = {
        safe: `${colors.green}✓ SAFE${colors.reset}`,
        blocked: `${colors.green}⊘ BLOCKED${colors.reset}`,
        unsafe: `${colors.red}⚠ UNSAFE${colors.reset}`,
        error: `${colors.yellow}⚡ ERROR${colors.reset}`,
      }[event.status];

      // Severity badge
      const severityBadge =
        event.severity !== 'none'
          ? ` ${severityColors[event.severity]}[${event.severity.toUpperCase()}]${colors.reset}`
          : '';

      console.log(` ${statusIcon}${severityBadge}`);
    })
    .onProgress((event) => {
      if (event.phase === 'setup' || event.phase === 'teardown') {
        console.log(`${colors.yellow}[${event.phase}]${colors.reset} ${event.message}`);
      }
    });

  // Path to scenario
  const scenarioPath = resolve(__dirname, '../scenarios/example.yaml');

  console.log(`${colors.dim}Scenario: ${scenarioPath}${colors.reset}`);
  console.log(
    `${colors.dim}Available mutations: ${kit.getAvailableMutations().join(', ')}${colors.reset}\n`
  );

  try {
    // Run red team testing
    const result = await kit.redteam({
      scenario: scenarioPath,
      // Specify which mutations to use (optional - defaults to all)
      mutations: ['typo', 'role-spoof', 'instruction-flip', 'cot-injection'],
      // Number of mutations to generate per test case
      countPerCase: 5,
    });

    // Output results
    console.log(`\n${colors.cyan}🛡️ Red Team Results${colors.reset}`);
    console.log('─'.repeat(50));

    // Defense metrics
    const metrics = result.manifest.metrics;
    const defenseRateColor =
      result.defenseRate >= 0.95
        ? colors.green
        : result.defenseRate >= 0.8
          ? colors.yellow
          : colors.red;

    console.log(
      `Status:          ${result.success ? `${colors.green}PASSED ✅${colors.reset}` : `${colors.red}NEEDS ATTENTION ⚠${colors.reset}`}`
    );
    console.log(
      `Defense Rate:    ${defenseRateColor}${(result.defenseRate * 100).toFixed(1)}%${colors.reset}`
    );
    console.log(`Total Tests:     ${metrics.total_tests}`);
    console.log(`Safe Responses:  ${colors.green}${metrics.safe_responses}${colors.reset}`);
    console.log(`Blocked:         ${colors.green}${metrics.blocked_responses}${colors.reset}`);
    console.log(
      `Unsafe:          ${metrics.unsafe_responses > 0 ? colors.red : ''}${metrics.unsafe_responses}${colors.reset}`
    );
    console.log(`Errors:          ${metrics.error_responses}`);

    // Severity breakdown
    if (metrics.by_severity) {
      console.log(`\n${colors.cyan}Severity Breakdown${colors.reset}`);
      console.log('─'.repeat(30));
      console.log(`Low:      ${metrics.by_severity.low}`);
      console.log(`Medium:   ${metrics.by_severity.medium}`);
      console.log(
        `High:     ${metrics.by_severity.high > 0 ? colors.red : ''}${metrics.by_severity.high}${colors.reset}`
      );
      console.log(
        `Critical: ${metrics.by_severity.critical > 0 ? `${colors.bold}${colors.red}` : ''}${metrics.by_severity.critical}${colors.reset}`
      );
    }

    // Show unsafe responses details
    const unsafeResults = result.manifest.results.filter((r) => r.status === 'unsafe');
    if (unsafeResults.length > 0) {
      console.log(`\n${colors.red}⚠ Unsafe Responses Details${colors.reset}`);
      console.log('─'.repeat(50));
      for (const unsafe of unsafeResults.slice(0, 5)) {
        // Show first 5
        console.log(`${colors.magenta}Mutation:${colors.reset} ${unsafe.mutation}`);
        console.log(`${colors.dim}Prompt:${colors.reset} ${unsafe.prompt.slice(0, 100)}...`);
        console.log(`${colors.dim}Reasons:${colors.reset} ${unsafe.reasons.join(', ')}`);
        console.log('');
      }
      if (unsafeResults.length > 5) {
        console.log(`${colors.dim}... and ${unsafeResults.length - 5} more${colors.reset}`);
      }
    }

    // Recommendations
    console.log(`\n${colors.cyan}📋 Recommendations${colors.reset}`);
    console.log('─'.repeat(50));
    if (result.success) {
      console.log(
        `${colors.green}✓${colors.reset} Your system shows good resilience against adversarial attacks.`
      );
      console.log(
        `${colors.dim}  Continue monitoring with regular red team testing.${colors.reset}`
      );
    } else {
      console.log(`${colors.yellow}!${colors.reset} Consider implementing additional guardrails.`);
      console.log(
        `${colors.dim}  Review the unsafe responses and strengthen your prompts.${colors.reset}`
      );
      if (metrics.by_severity?.critical > 0 || metrics.by_severity?.high > 0) {
        console.log(
          `${colors.red}!${colors.reset} High/Critical vulnerabilities detected - immediate attention recommended.`
        );
      }
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error(`\n${colors.red}❌ Error:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run the example
main();
