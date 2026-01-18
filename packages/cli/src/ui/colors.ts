/**
 * Consistent color scheme for CLI output
 */

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
  skipped: chalk.gray('○'),
  running: chalk.blue('◉'),
  warning: chalk.yellow('⚠'),
  info: chalk.blue('ℹ'),
  arrow: chalk.cyan('→'),
  bullet: chalk.gray('•'),
};
