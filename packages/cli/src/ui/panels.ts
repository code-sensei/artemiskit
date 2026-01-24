/**
 * Panel rendering for summary displays
 */

import chalk from 'chalk';
import { formatPercentage, icons } from './colors.js';
import { centerText, formatDuration, isTTY, padText } from './utils.js';

export interface SummaryData {
  passed: number;
  failed: number;
  skipped: number;
  successRate: number;
  duration: number;
  title?: string;
}

export interface StressSummaryData {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  duration: number;
  avgLatency: number;
  p50Latency: number;
  p90Latency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  /** Token usage (optional) */
  tokens?: {
    total: number;
    prompt: number;
    completion: number;
    avgPerRequest: number;
  };
  /** Cost estimation (optional) */
  cost?: {
    totalUsd: number;
    model: string;
  };
}

export interface RedteamSummaryData {
  totalCases: number;
  safeResponses: number;
  unsafeResponses: number;
  blockedResponses: number;
  errorResponses: number;
  defenseRate: number;
  severityBreakdown?: Record<string, number>;
}

/**
 * Render a test results summary panel
 */
export function renderSummaryPanel(data: SummaryData): string {
  const title = data.title ?? 'TEST RESULTS';
  const width = 55;

  if (!isTTY) {
    // Plain text format for CI/CD
    return [
      `=== ${title} ===`,
      `Passed: ${data.passed}  Failed: ${data.failed}  Skipped: ${data.skipped}`,
      `Success Rate: ${data.successRate.toFixed(1)}%`,
      `Duration: ${formatDuration(data.duration)}`,
    ].join('\n');
  }

  const border = '═'.repeat(width - 2);

  const statsLine = `  ${icons.passed} Passed: ${data.passed}    ${icons.failed} Failed: ${data.failed}    ${icons.skipped} Skipped: ${data.skipped}`;

  const lines = [
    chalk.cyan(`╔${border}╗`),
    chalk.cyan('║') + centerText(chalk.bold(title), width - 2) + chalk.cyan('║'),
    chalk.cyan(`╠${border}╣`),
    chalk.cyan('║') + padText(statsLine, width - 2) + chalk.cyan('║'),
    chalk.cyan('║') +
      padText(`  Success Rate: ${formatPercentage(data.successRate)}`, width - 2) +
      chalk.cyan('║'),
    chalk.cyan('║') +
      padText(`  Duration: ${formatDuration(data.duration)}`, width - 2) +
      chalk.cyan('║'),
    chalk.cyan(`╚${border}╝`),
  ];

  return lines.join('\n');
}

/**
 * Format cost for display
 */
function formatCostDisplay(costUsd: number): string {
  if (costUsd < 0.01) {
    return `${(costUsd * 100).toFixed(4)}¢`;
  }
  if (costUsd < 1) {
    return `$${costUsd.toFixed(4)}`;
  }
  return `$${costUsd.toFixed(2)}`;
}

/**
 * Format token count with K/M suffix
 */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Render a stress test summary panel
 */
export function renderStressSummaryPanel(data: StressSummaryData): string {
  const width = 55;

  if (!isTTY) {
    const lines = [
      '=== STRESS TEST RESULTS ===',
      `Total Requests: ${data.totalRequests}`,
      `Successful: ${data.successfulRequests} (${data.successRate.toFixed(1)}%)`,
      `Failed: ${data.failedRequests}`,
      `Duration: ${formatDuration(data.duration)}`,
      `Throughput: ${data.throughput.toFixed(1)} req/s`,
      `Latency: avg=${data.avgLatency.toFixed(0)}ms p50=${data.p50Latency.toFixed(0)}ms p90=${data.p90Latency.toFixed(0)}ms p95=${data.p95Latency.toFixed(0)}ms p99=${data.p99Latency.toFixed(0)}ms`,
    ];
    if (data.tokens) {
      lines.push(
        `Tokens: ${formatTokenCount(data.tokens.total)} total (${formatTokenCount(data.tokens.avgPerRequest)}/req)`
      );
    }
    if (data.cost) {
      lines.push(`Estimated Cost: ${formatCostDisplay(data.cost.totalUsd)} (${data.cost.model})`);
    }
    return lines.join('\n');
  }

  const border = '═'.repeat(width - 2);

  const lines = [
    chalk.cyan(`╔${border}╗`),
    chalk.cyan('║') + centerText(chalk.bold('STRESS TEST RESULTS'), width - 2) + chalk.cyan('║'),
    chalk.cyan(`╠${border}╣`),
    chalk.cyan('║') +
      padText(`  Total Requests: ${data.totalRequests}`, width - 2) +
      chalk.cyan('║'),
    chalk.cyan('║') +
      padText(
        `  ${icons.passed} Successful: ${data.successfulRequests}  ${icons.failed} Failed: ${data.failedRequests}`,
        width - 2
      ) +
      chalk.cyan('║'),
    chalk.cyan('║') +
      padText(`  Success Rate: ${formatPercentage(data.successRate)}`, width - 2) +
      chalk.cyan('║'),
    chalk.cyan(`╠${border}╣`),
    chalk.cyan('║') + centerText(chalk.dim('Performance Metrics'), width - 2) + chalk.cyan('║'),
    chalk.cyan(`╠${border}╣`),
    chalk.cyan('║') +
      padText(`  Throughput: ${chalk.bold(data.throughput.toFixed(1))} req/s`, width - 2) +
      chalk.cyan('║'),
    chalk.cyan('║') +
      padText(`  Duration: ${formatDuration(data.duration)}`, width - 2) +
      chalk.cyan('║'),
    chalk.cyan(`╠${border}╣`),
    chalk.cyan('║') + centerText(chalk.dim('Latency'), width - 2) + chalk.cyan('║'),
    chalk.cyan(`╠${border}╣`),
    chalk.cyan('║') +
      padText(`  Average: ${data.avgLatency.toFixed(0)}ms`, width - 2) +
      chalk.cyan('║'),
    chalk.cyan('║') +
      padText(
        `  p50: ${data.p50Latency.toFixed(0)}ms  p90: ${data.p90Latency.toFixed(0)}ms  p95: ${data.p95Latency.toFixed(0)}ms  p99: ${data.p99Latency.toFixed(0)}ms`,
        width - 2
      ) +
      chalk.cyan('║'),
  ];

  // Add token usage section if available
  if (data.tokens) {
    lines.push(chalk.cyan(`╠${border}╣`));
    lines.push(chalk.cyan('║') + centerText(chalk.dim('Token Usage'), width - 2) + chalk.cyan('║'));
    lines.push(chalk.cyan(`╠${border}╣`));
    lines.push(
      chalk.cyan('║') +
        padText(`  Total: ${chalk.bold(formatTokenCount(data.tokens.total))} tokens`, width - 2) +
        chalk.cyan('║')
    );
    lines.push(
      chalk.cyan('║') +
        padText(
          `  Prompt: ${formatTokenCount(data.tokens.prompt)}  Completion: ${formatTokenCount(data.tokens.completion)}`,
          width - 2
        ) +
        chalk.cyan('║')
    );
    lines.push(
      chalk.cyan('║') +
        padText(`  Avg/Request: ${data.tokens.avgPerRequest.toFixed(0)} tokens`, width - 2) +
        chalk.cyan('║')
    );
  }

  // Add cost estimation section if available
  if (data.cost) {
    lines.push(chalk.cyan(`╠${border}╣`));
    lines.push(
      chalk.cyan('║') + centerText(chalk.dim('Cost Estimation'), width - 2) + chalk.cyan('║')
    );
    lines.push(chalk.cyan(`╠${border}╣`));
    lines.push(
      chalk.cyan('║') +
        padText(
          `  Estimated Total: ${chalk.bold(chalk.yellow(formatCostDisplay(data.cost.totalUsd)))}`,
          width - 2
        ) +
        chalk.cyan('║')
    );
    lines.push(
      chalk.cyan('║') + padText(`  Model: ${data.cost.model}`, width - 2) + chalk.cyan('║')
    );
  }

  lines.push(chalk.cyan(`╚${border}╝`));

  return lines.join('\n');
}

/**
 * Render a red team summary panel
 */
export function renderRedteamSummaryPanel(data: RedteamSummaryData): string {
  const width = 55;

  if (!isTTY) {
    return [
      '=== RED TEAM RESULTS ===',
      `Total Cases: ${data.totalCases}`,
      `Safe: ${data.safeResponses}  Unsafe: ${data.unsafeResponses}  Blocked: ${data.blockedResponses}  Errors: ${data.errorResponses}`,
      `Defense Rate: ${data.defenseRate.toFixed(1)}%`,
    ].join('\n');
  }

  const border = '═'.repeat(width - 2);

  const defenseColor =
    data.defenseRate >= 90 ? chalk.green : data.defenseRate >= 70 ? chalk.yellow : chalk.red;

  const lines = [
    chalk.magenta(`╔${border}╗`),
    chalk.magenta('║') + centerText(chalk.bold('RED TEAM RESULTS'), width - 2) + chalk.magenta('║'),
    chalk.magenta(`╠${border}╣`),
    chalk.magenta('║') +
      padText(`  Total Cases: ${data.totalCases}`, width - 2) +
      chalk.magenta('║'),
    chalk.magenta('║') +
      padText(
        `  ${chalk.green('✓')} Safe: ${data.safeResponses}    ${chalk.red('✗')} Unsafe: ${data.unsafeResponses}`,
        width - 2
      ) +
      chalk.magenta('║'),
    chalk.magenta('║') +
      padText(
        `  ${chalk.cyan('⊘')} Blocked: ${data.blockedResponses}    ${chalk.yellow('!')} Errors: ${data.errorResponses}`,
        width - 2
      ) +
      chalk.magenta('║'),
    chalk.magenta(`╠${border}╣`),
    chalk.magenta('║') +
      padText(`  Defense Rate: ${defenseColor(`${data.defenseRate.toFixed(1)}%`)}`, width - 2) +
      chalk.magenta('║'),
    chalk.magenta(`╚${border}╝`),
  ];

  return lines.join('\n');
}

/**
 * Render a simple info box
 */
export function renderInfoBox(title: string, lines: string[]): string {
  const width = 55;

  if (!isTTY) {
    return [`=== ${title} ===`, ...lines].join('\n');
  }

  const border = '─'.repeat(width - 2);

  const result = [
    chalk.gray(`┌─ ${chalk.bold(title)} ${border.slice(title.length + 3)}┐`),
    chalk.gray('│') + ' '.repeat(width - 2) + chalk.gray('│'),
  ];

  for (const line of lines) {
    result.push(chalk.gray('│') + padText(`  ${line}`, width - 2) + chalk.gray('│'));
  }

  result.push(chalk.gray('│') + ' '.repeat(width - 2) + chalk.gray('│'));
  result.push(chalk.gray(`└${border}┘`));

  return result.join('\n');
}
