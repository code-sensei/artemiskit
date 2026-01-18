/**
 * Progress bar rendering utilities
 */

import chalk from 'chalk';
import { isTTY, stripAnsi } from './utils.js';

export interface ProgressBarOptions {
  /** Width of the progress bar in characters */
  width?: number;
  /** Character for filled portion */
  filledChar?: string;
  /** Character for empty portion */
  emptyChar?: string;
  /** Show percentage */
  showPercentage?: boolean;
  /** Show count (current/total) */
  showCount?: boolean;
  /** Label to show before the bar */
  label?: string;
}

const defaultOptions: Required<ProgressBarOptions> = {
  width: 20,
  filledChar: '█',
  emptyChar: '░',
  showPercentage: true,
  showCount: true,
  label: '',
};

/**
 * Render a progress bar
 *
 * @example
 * renderProgressBar(3, 10)
 * // "████████░░░░░░░░░░░░ 3/10 (30%)"
 *
 * renderProgressBar(3, 10, { label: 'Running tests' })
 * // "Running tests ████████░░░░░░░░░░░░ 3/10 (30%)"
 */
export function renderProgressBar(
  current: number,
  total: number,
  options: ProgressBarOptions = {}
): string {
  const opts = { ...defaultOptions, ...options };
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const filled = total > 0 ? Math.round((current / total) * opts.width) : 0;
  const empty = opts.width - filled;

  // For non-TTY, use simple text format
  if (!isTTY) {
    const parts: string[] = [];
    if (opts.label) parts.push(opts.label);
    if (opts.showCount) parts.push(`${current}/${total}`);
    if (opts.showPercentage) parts.push(`(${percentage}%)`);
    return parts.join(' ');
  }

  const bar =
    chalk.green(opts.filledChar.repeat(filled)) + chalk.gray(opts.emptyChar.repeat(empty));

  const parts: string[] = [];
  if (opts.label) parts.push(opts.label);
  parts.push(bar);
  if (opts.showCount) parts.push(`${current}/${total}`);
  if (opts.showPercentage) parts.push(`(${percentage}%)`);

  return parts.join(' ');
}

/**
 * Create a progress bar manager for updating in-place
 */
export class ProgressBar {
  private current = 0;
  private total: number;
  private options: Required<ProgressBarOptions>;
  private lastOutput = '';

  constructor(total: number, options: ProgressBarOptions = {}) {
    this.total = total;
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * Update progress and render
   */
  update(current: number): void {
    this.current = current;
    this.render();
  }

  /**
   * Increment progress by one
   */
  increment(): void {
    this.update(this.current + 1);
  }

  /**
   * Render the progress bar
   */
  private render(): void {
    const output = renderProgressBar(this.current, this.total, this.options);

    if (isTTY) {
      // Clear previous line and write new output
      const clearLength = stripAnsi(this.lastOutput).length;
      process.stdout.write(`\r${' '.repeat(clearLength)}\r`);
      process.stdout.write(output);
      this.lastOutput = output;
    }
  }

  /**
   * Complete the progress bar and move to next line
   */
  complete(): void {
    this.update(this.total);
    if (isTTY) {
      process.stdout.write('\n');
    }
  }
}

/**
 * Render a compact inline progress indicator
 * Useful for spinners or status lines
 */
export function renderInlineProgress(current: number, total: number, label?: string): string {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  if (label) {
    return `${label}: ${current}/${total} (${percentage}%)`;
  }
  return `${current}/${total} (${percentage}%)`;
}
