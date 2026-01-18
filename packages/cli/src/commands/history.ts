/**
 * History command - View run history
 */

import chalk from 'chalk';
import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import { createSpinner, isTTY, padText, renderError } from '../ui/index.js';
import { createStorage } from '../utils/storage.js';

interface HistoryOptions {
  project?: string;
  scenario?: string;
  limit?: number;
  config?: string;
}

function renderHistoryTable(
  runs: Array<{
    runId: string;
    scenario: string;
    successRate: number;
    createdAt: string;
  }>
): string {
  // Column widths
  const runIdWidth = 16;
  const scenarioWidth = 30;
  const rateWidth = 12;
  const dateWidth = 20;

  // Total width = borders(4) + columns + spacing(3 spaces between 4 columns)
  const width = 2 + runIdWidth + 1 + scenarioWidth + 1 + rateWidth + 1 + dateWidth + 2;
  const border = '═'.repeat(width - 2);

  const formatHeaderRow = () => {
    const runIdPad = padText('Run ID', runIdWidth);
    const scenarioPad = padText('Scenario', scenarioWidth);
    const ratePad = padText('Success Rate', rateWidth, 'right');
    const datePad = padText('Date', dateWidth, 'right');
    return `║ ${runIdPad} ${scenarioPad} ${ratePad} ${datePad} ║`;
  };

  const lines = [
    `╔${border}╗`,
    `║${padText('RUN HISTORY', width - 2, 'center')}║`,
    `╠${border}╣`,
    formatHeaderRow(),
    `╟${'─'.repeat(width - 2)}╢`,
  ];

  for (const run of runs) {
    const rateColor =
      run.successRate >= 0.9 ? chalk.green : run.successRate >= 0.7 ? chalk.yellow : chalk.red;

    // Pad values first, then apply color to rate
    const runIdPad = padText(run.runId, runIdWidth);
    const truncScenario =
      run.scenario.length > scenarioWidth - 2
        ? `${run.scenario.slice(0, scenarioWidth - 3)}…`
        : run.scenario;
    const scenarioPad = padText(truncScenario, scenarioWidth);

    // Pad rate before coloring so ANSI codes don't affect width
    const rateValue = `${(run.successRate * 100).toFixed(1)}%`;
    const ratePad = padText(rateValue, rateWidth, 'right');
    const rateColored = rateColor(ratePad);

    const dateObj = new Date(run.createdAt);
    const dateStr = `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const datePad = padText(dateStr, dateWidth, 'right');

    lines.push(`║ ${runIdPad} ${scenarioPad} ${rateColored} ${datePad} ║`);
  }

  lines.push(`╚${border}╝`);

  return lines.join('\n');
}

function renderPlainHistory(
  runs: Array<{
    runId: string;
    scenario: string;
    successRate: number;
    createdAt: string;
  }>
): string {
  const lines = ['=== RUN HISTORY ===', ''];

  for (const run of runs) {
    const rate = `${(run.successRate * 100).toFixed(1)}%`;
    const date = new Date(run.createdAt).toLocaleString();
    lines.push(`${run.runId}  ${run.scenario}  ${rate}  ${date}`);
  }

  return lines.join('\n');
}

export function historyCommand(): Command {
  const cmd = new Command('history');

  cmd
    .description('View run history')
    .option('-p, --project <project>', 'Filter by project')
    .option('-s, --scenario <scenario>', 'Filter by scenario')
    .option('-l, --limit <number>', 'Limit number of results', '20')
    .option('--config <path>', 'Path to config file')
    .action(async (options: HistoryOptions) => {
      const spinner = createSpinner('Loading history...');
      spinner.start();

      try {
        const config = await loadConfig(options.config);
        const storage = createStorage({ fileConfig: config });
        const limit = Number.parseInt(String(options.limit)) || 20;

        const runs = await storage.list({
          project: options.project,
          scenario: options.scenario,
          limit,
        });

        spinner.succeed('Loaded history');
        console.log();

        if (runs.length === 0) {
          console.log(chalk.dim('No runs found.'));

          if (options.project || options.scenario) {
            console.log();
            console.log(chalk.dim('Filters applied:'));
            if (options.project) console.log(chalk.dim(`  Project: ${options.project}`));
            if (options.scenario) console.log(chalk.dim(`  Scenario: ${options.scenario}`));
            console.log();
            console.log(chalk.dim('Try removing filters or run some tests first.'));
          }
          return;
        }

        // Show history table
        if (isTTY) {
          console.log(renderHistoryTable(runs));
        } else {
          console.log(renderPlainHistory(runs));
        }

        console.log();
        console.log(
          chalk.dim(
            `Showing ${runs.length} run${runs.length === 1 ? '' : 's'}${options.limit ? ` (limit: ${limit})` : ''}`
          )
        );

        if (options.project || options.scenario) {
          console.log(
            chalk.dim('Filters:') +
              (options.project ? chalk.dim(` project=${options.project}`) : '') +
              (options.scenario ? chalk.dim(` scenario=${options.scenario}`) : '')
          );
        }
      } catch (error) {
        spinner.fail('Error');
        console.log();
        console.log(
          renderError({
            title: 'Failed to Load History',
            reason: (error as Error).message,
            suggestions: [
              'Check storage configuration in artemis.config.yaml',
              'Verify the storage directory exists',
              'Run some tests first with "artemiskit run"',
            ],
          })
        );
        process.exit(1);
      }
    });

  return cmd;
}
