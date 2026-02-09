/**
 * Baseline command - Manage baseline runs for regression detection
 */

import type { BaselineMetadata, BaselineStorageAdapter } from '@artemiskit/core';
import chalk from 'chalk';
import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import { createSpinner, icons, isTTY, padText, renderError } from '../ui/index.js';
import { createStorage } from '../utils/storage.js';

interface BaselineSetOptions {
  scenario?: string;
  tag?: string;
  config?: string;
}

interface BaselineListOptions {
  config?: string;
  json?: boolean;
}

interface BaselineRemoveOptions {
  config?: string;
  force?: boolean;
}

/**
 * Check if storage adapter supports baselines
 */
function isBaselineStorage(storage: unknown): storage is BaselineStorageAdapter {
  return (
    typeof storage === 'object' &&
    storage !== null &&
    'setBaseline' in storage &&
    'getBaseline' in storage &&
    'listBaselines' in storage &&
    'removeBaseline' in storage
  );
}

/**
 * Render baselines table for TTY
 */
function renderBaselinesTable(baselines: BaselineMetadata[]): string {
  const scenarioWidth = 30;
  const runIdWidth = 16;
  const rateWidth = 12;
  const dateWidth = 20;
  const tagWidth = 12;

  const width =
    2 + scenarioWidth + 1 + runIdWidth + 1 + rateWidth + 1 + dateWidth + 1 + tagWidth + 2;
  const border = '═'.repeat(width - 2);

  const formatHeaderRow = () => {
    const scenarioPad = padText('Scenario', scenarioWidth);
    const runIdPad = padText('Run ID', runIdWidth);
    const ratePad = padText('Success Rate', rateWidth, 'right');
    const datePad = padText('Created', dateWidth, 'right');
    const tagPad = padText('Tag', tagWidth, 'right');
    return `║ ${scenarioPad} ${runIdPad} ${ratePad} ${datePad} ${tagPad} ║`;
  };

  const lines = [
    `╔${border}╗`,
    `║${padText('BASELINES', width - 2, 'center')}║`,
    `╠${border}╣`,
    formatHeaderRow(),
    `╟${'─'.repeat(width - 2)}╢`,
  ];

  for (const baseline of baselines) {
    const rateColor =
      baseline.metrics.successRate >= 0.9
        ? chalk.green
        : baseline.metrics.successRate >= 0.7
          ? chalk.yellow
          : chalk.red;

    const truncScenario =
      baseline.scenario.length > scenarioWidth - 2
        ? `${baseline.scenario.slice(0, scenarioWidth - 3)}…`
        : baseline.scenario;
    const scenarioPad = padText(truncScenario, scenarioWidth);
    const runIdPad = padText(baseline.runId, runIdWidth);

    const rateValue = `${(baseline.metrics.successRate * 100).toFixed(1)}%`;
    const ratePad = padText(rateValue, rateWidth, 'right');
    const rateColored = rateColor(ratePad);

    const dateObj = new Date(baseline.createdAt);
    const dateStr = `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const datePad = padText(dateStr, dateWidth, 'right');

    const tagPad = padText(baseline.tag || '-', tagWidth, 'right');

    lines.push(`║ ${scenarioPad} ${runIdPad} ${rateColored} ${datePad} ${tagPad} ║`);
  }

  lines.push(`╚${border}╝`);

  return lines.join('\n');
}

/**
 * Render baselines as plain text for CI/non-TTY
 */
function renderBaselinesPlain(baselines: BaselineMetadata[]): string {
  const lines = ['=== BASELINES ===', ''];

  for (const baseline of baselines) {
    const rate = `${(baseline.metrics.successRate * 100).toFixed(1)}%`;
    const date = new Date(baseline.createdAt).toLocaleString();
    const tag = baseline.tag ? ` [${baseline.tag}]` : '';
    lines.push(`${baseline.scenario}  ${baseline.runId}  ${rate}  ${date}${tag}`);
  }

  return lines.join('\n');
}

/**
 * Create the baseline set subcommand
 */
function baselineSetCommand(): Command {
  const cmd = new Command('set');

  cmd
    .description('Set a run as the baseline for regression comparison')
    .argument('<run-id>', 'Run ID to set as baseline')
    .option('-s, --scenario <name>', 'Override scenario name (defaults to scenario from run)')
    .option('-t, --tag <tag>', 'Optional tag/description for the baseline')
    .option('--config <path>', 'Path to config file')
    .action(async (runId: string, options: BaselineSetOptions) => {
      const spinner = createSpinner('Setting baseline...');
      spinner.start();

      try {
        const config = await loadConfig(options.config);
        const storage = createStorage({ fileConfig: config });

        if (!isBaselineStorage(storage)) {
          spinner.fail('Error');
          console.log();
          console.log(
            renderError({
              title: 'Baselines Not Supported',
              reason: 'Current storage adapter does not support baseline management',
              suggestions: [
                'Use local storage which supports baselines',
                'Check your storage configuration in artemis.config.yaml',
              ],
            })
          );
          process.exit(1);
        }

        const baseline = await storage.setBaseline(options.scenario || '', runId, options.tag);

        spinner.succeed('Baseline set successfully');
        console.log();
        console.log(`${icons.passed} ${chalk.bold('Baseline created')}`);
        console.log();
        console.log(`  Scenario:     ${chalk.cyan(baseline.scenario)}`);
        console.log(`  Run ID:       ${chalk.dim(baseline.runId)}`);
        console.log(
          `  Success Rate: ${chalk.green(`${(baseline.metrics.successRate * 100).toFixed(1)}%`)}`
        );
        console.log(
          `  Test Cases:   ${baseline.metrics.passedCases}/${baseline.metrics.totalCases} passed`
        );
        if (baseline.tag) {
          console.log(`  Tag:          ${chalk.dim(baseline.tag)}`);
        }
        console.log();
        console.log(
          chalk.dim('Future runs of this scenario will be compared against this baseline.')
        );
      } catch (error) {
        spinner.fail('Error');
        console.log();
        console.log(
          renderError({
            title: 'Failed to Set Baseline',
            reason: (error as Error).message,
            suggestions: [
              'Check that the run ID exists',
              'Run "artemiskit history" to see available runs',
              'Verify storage configuration',
            ],
          })
        );
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Create the baseline list subcommand
 */
function baselineListCommand(): Command {
  const cmd = new Command('list');

  cmd
    .description('List all baselines')
    .option('--config <path>', 'Path to config file')
    .option('--json', 'Output as JSON')
    .action(async (options: BaselineListOptions) => {
      const spinner = createSpinner('Loading baselines...');
      spinner.start();

      try {
        const config = await loadConfig(options.config);
        const storage = createStorage({ fileConfig: config });

        if (!isBaselineStorage(storage)) {
          spinner.fail('Error');
          console.log();
          console.log(
            renderError({
              title: 'Baselines Not Supported',
              reason: 'Current storage adapter does not support baseline management',
              suggestions: ['Use local storage which supports baselines'],
            })
          );
          process.exit(1);
        }

        const baselines = await storage.listBaselines();
        spinner.succeed('Loaded baselines');
        console.log();

        if (baselines.length === 0) {
          console.log(chalk.dim('No baselines set.'));
          console.log();
          console.log(chalk.dim('Set a baseline with:'));
          console.log(chalk.dim('  artemiskit baseline set <run-id>'));
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(baselines, null, 2));
          return;
        }

        if (isTTY) {
          console.log(renderBaselinesTable(baselines));
        } else {
          console.log(renderBaselinesPlain(baselines));
        }

        console.log();
        console.log(
          chalk.dim(`${baselines.length} baseline${baselines.length === 1 ? '' : 's'} configured`)
        );
      } catch (error) {
        spinner.fail('Error');
        console.log();
        console.log(
          renderError({
            title: 'Failed to List Baselines',
            reason: (error as Error).message,
            suggestions: ['Verify storage configuration'],
          })
        );
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Create the baseline remove subcommand
 */
function baselineRemoveCommand(): Command {
  const cmd = new Command('remove');

  cmd
    .description('Remove a baseline')
    .argument('<identifier>', 'Run ID of the baseline to remove (or scenario name with --scenario)')
    .option('--config <path>', 'Path to config file')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('-s, --scenario', 'Treat identifier as scenario name instead of run ID')
    .action(async (identifier: string, options: BaselineRemoveOptions & { scenario?: boolean }) => {
      const spinner = createSpinner('Removing baseline...');

      try {
        const config = await loadConfig(options.config);
        const storage = createStorage({ fileConfig: config });

        if (!isBaselineStorage(storage)) {
          console.log(
            renderError({
              title: 'Baselines Not Supported',
              reason: 'Current storage adapter does not support baseline management',
              suggestions: ['Use local storage which supports baselines'],
            })
          );
          process.exit(1);
        }

        // Check if baseline exists first - by run ID or scenario name
        const existing = options.scenario
          ? await storage.getBaseline(identifier)
          : await storage.getBaselineByRunId(identifier);

        if (!existing) {
          console.log();
          console.log(
            chalk.yellow(
              options.scenario
                ? `No baseline found for scenario: ${identifier}`
                : `No baseline found with run ID: ${identifier}`
            )
          );
          console.log();
          console.log(chalk.dim('List baselines with:'));
          console.log(chalk.dim('  artemiskit baseline list'));
          process.exit(1);
        }

        // Confirm if not forced
        if (!options.force && isTTY) {
          const { promptConfirm } = await import('../ui/index.js');
          const confirmed = await promptConfirm(
            `Remove baseline for "${existing.scenario}"? (Run ID: ${existing.runId})`,
            false
          );
          if (!confirmed) {
            console.log(chalk.dim('Cancelled.'));
            return;
          }
        }

        spinner.start();
        const removed = options.scenario
          ? await storage.removeBaseline(identifier)
          : await storage.removeBaselineByRunId(identifier);

        if (removed) {
          spinner.succeed('Baseline removed');
          console.log();
          console.log(`${icons.passed} Removed baseline for: ${chalk.cyan(existing.scenario)}`);
        } else {
          spinner.fail('Baseline not found');
        }
      } catch (error) {
        spinner.fail('Error');
        console.log();
        console.log(
          renderError({
            title: 'Failed to Remove Baseline',
            reason: (error as Error).message,
            suggestions: [
              'Check the run ID or scenario name',
              'Run "artemiskit baseline list" to see baselines',
            ],
          })
        );
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Create the baseline get subcommand
 */
function baselineGetCommand(): Command {
  const cmd = new Command('get');

  cmd
    .description('Get baseline details')
    .argument('<identifier>', 'Run ID of the baseline (or scenario name with --scenario)')
    .option('--config <path>', 'Path to config file')
    .option('--json', 'Output as JSON')
    .option('-s, --scenario', 'Treat identifier as scenario name instead of run ID')
    .action(
      async (
        identifier: string,
        options: { config?: string; json?: boolean; scenario?: boolean }
      ) => {
        try {
          const config = await loadConfig(options.config);
          const storage = createStorage({ fileConfig: config });

          if (!isBaselineStorage(storage)) {
            console.log(
              renderError({
                title: 'Baselines Not Supported',
                reason: 'Current storage adapter does not support baseline management',
                suggestions: ['Use local storage which supports baselines'],
              })
            );
            process.exit(1);
          }

          // Look up by run ID or scenario name
          const baseline = options.scenario
            ? await storage.getBaseline(identifier)
            : await storage.getBaselineByRunId(identifier);

          if (!baseline) {
            console.log(
              chalk.yellow(
                options.scenario
                  ? `No baseline found for scenario: ${identifier}`
                  : `No baseline found with run ID: ${identifier}`
              )
            );
            process.exit(1);
          }

          if (options.json) {
            console.log(JSON.stringify(baseline, null, 2));
            return;
          }

          console.log();
          console.log(chalk.bold(`Baseline: ${baseline.scenario}`));
          console.log();
          console.log(`  Run ID:       ${baseline.runId}`);
          console.log(`  Created:      ${new Date(baseline.createdAt).toLocaleString()}`);
          console.log(
            `  Success Rate: ${chalk.green(`${(baseline.metrics.successRate * 100).toFixed(1)}%`)}`
          );
          console.log(
            `  Test Cases:   ${baseline.metrics.passedCases}/${baseline.metrics.totalCases}`
          );
          console.log(`  Latency:      ${baseline.metrics.medianLatencyMs}ms (median)`);
          console.log(`  Tokens:       ${baseline.metrics.totalTokens.toLocaleString()}`);
          if (baseline.tag) {
            console.log(`  Tag:          ${baseline.tag}`);
          }
          console.log();
        } catch (error) {
          console.log(
            renderError({
              title: 'Failed to Get Baseline',
              reason: (error as Error).message,
              suggestions: [
                'Check the run ID or scenario name',
                'Run "artemiskit baseline list" to see baselines',
              ],
            })
          );
          process.exit(1);
        }
      }
    );

  return cmd;
}

/**
 * Create the main baseline command with subcommands
 */
export function baselineCommand(): Command {
  const cmd = new Command('baseline');

  cmd.description('Manage baseline runs for regression detection');

  cmd.addCommand(baselineSetCommand());
  cmd.addCommand(baselineListCommand());
  cmd.addCommand(baselineRemoveCommand());
  cmd.addCommand(baselineGetCommand());

  return cmd;
}
