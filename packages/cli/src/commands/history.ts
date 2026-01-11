/**
 * History command - View run history
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { createStorageFromEnv } from '@artemis/core';

interface HistoryOptions {
  project?: string;
  scenario?: string;
  limit?: number;
}

export function historyCommand(): Command {
  const cmd = new Command('history');

  cmd
    .description('View run history')
    .option('-p, --project <project>', 'Filter by project')
    .option('-s, --scenario <scenario>', 'Filter by scenario')
    .option('-l, --limit <number>', 'Limit number of results', '20')
    .action(async (options: HistoryOptions) => {
      try {
        const storage = createStorageFromEnv();
        const limit = parseInt(String(options.limit)) || 20;

        const runs = await storage.list({
          project: options.project,
          scenario: options.scenario,
          limit,
        });

        if (runs.length === 0) {
          console.log(chalk.dim('No runs found.'));
          return;
        }

        const table = new Table({
          head: [
            chalk.bold('Run ID'),
            chalk.bold('Scenario'),
            chalk.bold('Success Rate'),
            chalk.bold('Date'),
          ],
          style: { head: [], border: [] },
        });

        for (const run of runs) {
          const successColor =
            run.successRate >= 0.9
              ? chalk.green
              : run.successRate >= 0.7
                ? chalk.yellow
                : chalk.red;

          table.push([
            run.runId,
            run.scenario,
            successColor(`${(run.successRate * 100).toFixed(1)}%`),
            new Date(run.createdAt).toLocaleString(),
          ]);
        }

        console.log(table.toString());
        console.log();
        console.log(chalk.dim(`Showing ${runs.length} runs`));
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
