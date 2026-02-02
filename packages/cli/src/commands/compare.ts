/**
 * Compare command - Compare two test runs
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildComparisonData, generateCompareHTMLReport } from '@artemiskit/reports';
import chalk from 'chalk';
import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import { createSpinner, icons, isTTY, padText, renderError } from '../ui/index.js';
import { createStorage } from '../utils/storage.js';

interface CompareOptions {
  threshold?: number;
  config?: string;
  html?: string;
  json?: string;
}

function renderComparisonPanel(
  baseline: { metrics: { success_rate: number; median_latency_ms: number; total_tokens: number } },
  current: { metrics: { success_rate: number; median_latency_ms: number; total_tokens: number } },
  delta: { successRate: number; latency: number; tokens: number }
): string {
  // Column widths
  const labelWidth = 18;
  const baseWidth = 12;
  const currWidth = 12;
  const deltaWidth = 14;

  // Calculate total width: ║ + space + columns + space + ║
  // innerContent = labelWidth + baseWidth + currWidth + deltaWidth = 56
  // total = 2 (borders) + 2 (padding) + 56 = 60
  const innerWidth = labelWidth + baseWidth + currWidth + deltaWidth;
  const width = innerWidth + 4; // +4 for "║ " and " ║"
  const border = '═'.repeat(width - 2);

  const formatDeltaValue = (value: number, suffix = '') => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}${suffix}`;
  };

  const colorDelta = (value: number, inverse: boolean, formatted: string) => {
    const improved = inverse ? value < 0 : value > 0;
    if (improved) return chalk.green(formatted);
    if (value === 0) return chalk.dim(formatted);
    return chalk.red(formatted);
  };

  const formatRow = (label: string, baseVal: string, currVal: string, deltaContent: string) => {
    const labelPad = padText(label, labelWidth);
    const basePad = padText(baseVal, baseWidth, 'right');
    const currPad = padText(currVal, currWidth, 'right');
    const deltaPad = padText(deltaContent, deltaWidth, 'right');
    return `║ ${labelPad}${basePad}${currPad}${deltaPad} ║`;
  };

  const formatDataRow = (
    label: string,
    baseVal: string,
    currVal: string,
    deltaVal: number,
    inverse: boolean,
    suffix: string
  ) => {
    const labelPad = padText(label, labelWidth);
    const basePad = padText(baseVal, baseWidth, 'right');
    const currPad = padText(currVal, currWidth, 'right');
    // Pad first, then apply color (color codes don't affect visual width)
    const deltaStr = formatDeltaValue(deltaVal, suffix);
    const deltaPad = padText(deltaStr, deltaWidth, 'right');
    const deltaColored = colorDelta(deltaVal, inverse, deltaPad);
    return `║ ${labelPad}${basePad}${currPad}${deltaColored} ║`;
  };

  const lines = [
    `╔${border}╗`,
    `║${padText('COMPARISON RESULTS', width - 2, 'center')}║`,
    `╠${border}╣`,
    formatRow('Metric', 'Baseline', 'Current', 'Delta'),
    `╟${'─'.repeat(width - 2)}╢`,
    formatDataRow(
      'Success Rate',
      `${(baseline.metrics.success_rate * 100).toFixed(1)}%`,
      `${(current.metrics.success_rate * 100).toFixed(1)}%`,
      delta.successRate * 100,
      false,
      '%'
    ),
    formatDataRow(
      'Median Latency',
      `${baseline.metrics.median_latency_ms}ms`,
      `${current.metrics.median_latency_ms}ms`,
      delta.latency,
      true,
      'ms'
    ),
    formatDataRow(
      'Total Tokens',
      baseline.metrics.total_tokens.toLocaleString(),
      current.metrics.total_tokens.toLocaleString(),
      delta.tokens,
      true,
      ''
    ),
    `╚${border}╝`,
  ];

  return lines.join('\n');
}

function renderPlainComparison(
  baseline: { metrics: { success_rate: number; median_latency_ms: number; total_tokens: number } },
  current: { metrics: { success_rate: number; median_latency_ms: number; total_tokens: number } },
  delta: { successRate: number; latency: number; tokens: number }
): string {
  const formatDelta = (value: number, _inverse = false, suffix = '') => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}${suffix}`;
  };

  const lines = [
    '=== COMPARISON RESULTS ===',
    '',
    `Success Rate:   ${(baseline.metrics.success_rate * 100).toFixed(1)}% -> ${(current.metrics.success_rate * 100).toFixed(1)}%  (${formatDelta(delta.successRate * 100, false, '%')})`,
    `Median Latency: ${baseline.metrics.median_latency_ms}ms -> ${current.metrics.median_latency_ms}ms  (${formatDelta(delta.latency, true, 'ms')})`,
    `Total Tokens:   ${baseline.metrics.total_tokens} -> ${current.metrics.total_tokens}  (${formatDelta(delta.tokens, true)})`,
  ];

  return lines.join('\n');
}

export function compareCommand(): Command {
  const cmd = new Command('compare');

  cmd
    .description('Compare two test runs')
    .argument('<baseline>', 'Baseline run ID')
    .argument('<current>', 'Current run ID')
    .option('--threshold <number>', 'Regression threshold (0-1)', '0.05')
    .option('--config <path>', 'Path to config file')
    .option('--html <path>', 'Generate HTML comparison report')
    .option('--json <path>', 'Generate JSON comparison report')
    .action(async (baselineId: string, currentId: string, options: CompareOptions) => {
      const spinner = createSpinner('Loading runs...');
      spinner.start();

      try {
        const config = await loadConfig(options.config);
        const storage = createStorage({ fileConfig: config });

        if (!storage.compare) {
          spinner.fail('Error');
          console.log();
          console.log(
            renderError({
              title: 'Comparison Not Supported',
              reason: 'Storage adapter does not support comparison',
              suggestions: [
                'Use local storage which supports comparison',
                'Check your storage configuration',
              ],
            })
          );
          process.exit(1);
        }

        spinner.succeed('Loaded runs');
        console.log();

        const comparison = await storage.compare(baselineId, currentId);
        const { baseline, current, delta } = comparison;

        // Generate HTML report if requested
        if (options.html) {
          const htmlPath = resolve(options.html);
          const html = generateCompareHTMLReport(baseline, current);
          writeFileSync(htmlPath, html, 'utf-8');
          console.log(`${icons.passed} HTML comparison report saved to: ${chalk.cyan(htmlPath)}`);
          console.log();
        }

        // Generate JSON report if requested
        if (options.json) {
          const jsonPath = resolve(options.json);
          const comparisonData = buildComparisonData(baseline, current);
          writeFileSync(jsonPath, JSON.stringify(comparisonData, null, 2), 'utf-8');
          console.log(`${icons.passed} JSON comparison report saved to: ${chalk.cyan(jsonPath)}`);
          console.log();
        }

        // Show comparison panel
        if (isTTY) {
          console.log(renderComparisonPanel(baseline, current, delta));
        } else {
          console.log(renderPlainComparison(baseline, current, delta));
        }

        console.log();
        console.log(chalk.dim(`Baseline: ${baselineId}`));
        console.log(chalk.dim(`Current:  ${currentId}`));
        console.log();

        // Check for regression
        const threshold = Number.parseFloat(String(options.threshold)) || 0.05;
        const hasRegression = delta.successRate < -threshold;

        if (hasRegression) {
          console.log(
            `${icons.failed} ${chalk.red('Regression detected!')} Success rate dropped by ${chalk.bold(`${Math.abs(delta.successRate * 100).toFixed(1)}%`)} ${chalk.dim(`(threshold: ${threshold * 100}%)`)}`
          );
          process.exit(1);
        } else {
          console.log(`${icons.passed} ${chalk.green('No regression detected')}`);
        }
      } catch (error) {
        spinner.fail('Error');
        console.log();
        console.log(
          renderError({
            title: 'Failed to Compare Runs',
            reason: (error as Error).message,
            suggestions: [
              'Check that both run IDs exist',
              'Run "artemiskit history" to see available runs',
              'Verify storage configuration in artemis.config.yaml',
            ],
          })
        );
        process.exit(1);
      }
    });

  return cmd;
}
