/**
 * Consistent color scheme for CLI output
 */

import type { CaseEvaluationStatus } from '@artemiskit/core';
import chalk from 'chalk';

export const colors = {
  // Status colors
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  muted: chalk.gray,

  // Semantic colors for test results
  passed: chalk.green,
  failed: chalk.red,
  invalid: chalk.yellow,
  executionError: chalk.magenta,
  skipped: chalk.gray,
  running: chalk.blue,

  // UI elements
  border: chalk.gray,
  highlight: chalk.cyan,
  label: chalk.bold,
  value: chalk.white,

  // Percentage thresholds
  percentGood: chalk.green, // >= 90%
  percentWarn: chalk.yellow, // >= 70%
  percentBad: chalk.red, // < 70%
};

/**
 * Returns appropriate color function based on percentage value
 */
export function colorByPercentage(value: number): typeof chalk {
  if (value >= 90) return colors.percentGood;
  if (value >= 70) return colors.percentWarn;
  return colors.percentBad;
}

/**
 * Format a percentage value with appropriate coloring
 */
export function formatPercentage(value: number): string {
  const color = colorByPercentage(value);
  return color(`${value.toFixed(1)}%`);
}

/**
 * Status icons with colors
 */
export const icons = {
  passed: chalk.green('✓'),
  failed: chalk.red('✗'),
  invalid: chalk.yellow('⚠'),
  error: chalk.magenta('!'),
  skipped: chalk.gray('○'),
  running: chalk.blue('◉'),
  warning: chalk.yellow('⚠'),
  info: chalk.blue('ℹ'),
  arrow: chalk.cyan('→'),
  bullet: chalk.gray('•'),
};

/** Render every terminal measurement status distinctly in human-facing CLI output. */
export function formatMeasurementStatus(status: CaseEvaluationStatus): string {
  switch (status) {
    case 'passed':
      return colors.passed('PASSED');
    case 'failed':
      return colors.failed('FAILED');
    case 'invalid':
      return colors.invalid('INVALID MEASUREMENT');
    case 'error':
      return colors.executionError('EXECUTION ERROR');
  }
}

/** Return the icon associated with a terminal measurement status. */
export function measurementStatusIcon(status: CaseEvaluationStatus): string {
  return icons[status];
}
