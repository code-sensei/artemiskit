/**
 * Compare command - Compare two test runs
 */

import { createStorageFromEnv } from '@artemiskit/core';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';

interface CompareOptions {
  threshold?: number;
}

export function compareCommand(): Command {
  const cmd = new Command('compare');

  cmd
    .description('Compare two test runs')
    .argument('<baseline>', 'Baseline run ID')
    .argument('<current>', 'Current run ID')
    .option('--threshold <number>', 'Regression threshold (0-1)', '0.05')
    .action(async (baselineId: string, currentId: string, options: CompareOptions) => {
      try {
        const storage = createStorageFromEnv();

        if (!storage.compare) {
          console.error(chalk.red('Storage adapter does not support comparison'));
          process.exit(1);
        }

        console.log(chalk.bold('Comparing runs...'));
        console.log();

        const comparison = await storage.compare(baselineId, currentId);
        const { baseline, current, delta } = comparison;

        // Summary table
        const summaryTable = new Table({
          head: [
            chalk.bold('Metric'),
            chalk.bold('Baseline'),
            chalk.bold('Current'),
            chalk.bold('Delta'),
          ],
          style: { head: [], border: [] },
        });

        const formatDelta = (value: number, inverse = false) => {
          const improved = inverse ? value < 0 : value > 0;
          const color = improved ? chalk.green : value === 0 ? chalk.dim : chalk.red;
          const sign = value > 0 ? '+' : '';
          return color(`${sign}${value.toFixed(2)}`);
        };

        summaryTable.push(
          [
            'Success Rate',
            `${(baseline.metrics.success_rate * 100).toFixed(1)}%`,
            `${(current.metrics.success_rate * 100).toFixed(1)}%`,
            `${formatDelta(delta.successRate * 100)}%`,
          ],
          [
            'Median Latency',
            `${baseline.metrics.median_latency_ms}ms`,
            `${current.metrics.median_latency_ms}ms`,
            `${formatDelta(delta.latency, true)}ms`,
          ],
          [
            'Total Tokens',
            baseline.metrics.total_tokens.toLocaleString(),
            current.metrics.total_tokens.toLocaleString(),
            formatDelta(delta.tokens, true),
          ]
        );

        console.log(summaryTable.toString());
        console.log();

        // Check for regression
        const threshold = Number.parseFloat(String(options.threshold)) || 0.05;
        const hasRegression = delta.successRate < -threshold;

        if (hasRegression) {
          console.log(
            chalk.red('⚠ Regression detected!'),
            `Success rate dropped by ${Math.abs(delta.successRate * 100).toFixed(1)}%`,
            `(threshold: ${threshold * 100}%)`
          );
          process.exit(1);
        } else {
          console.log(chalk.green('✓ No regression detected'));
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
