/**
 * Real-time test status updates
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { isTTY } from './utils.js';
import { icons } from './colors.js';
import { renderProgressBar } from './progress.js';

export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

interface TestResult {
  name: string;
  status: TestStatus;
  duration?: number;
  error?: string;
}

/**
 * Live test status tracker with real-time updates
 */
export class LiveTestStatus {
  private spinner: Ora;
  private results: Map<string, TestResult> = new Map();
  private total: number;
  private startTime: number = Date.now();

  constructor(total: number) {
    this.total = total;
    this.spinner = ora({
      spinner: 'dots',
      color: 'cyan',
    });
  }

  /**
   * Start tracking a test
   */
  start(testId: string, testName: string): void {
    this.results.set(testId, { name: testName, status: 'running' });

    if (isTTY) {
      this.spinner.start(this.formatStatus());
    } else {
      console.log(`Running: ${testName}`);
    }
  }

  /**
   * Mark a test as passed
   */
  pass(testId: string, duration?: number): void {
    const result = this.results.get(testId);
    if (result) {
      result.status = 'passed';
      result.duration = duration;
    }
    this.updateSpinner();
  }

  /**
   * Mark a test as failed
   */
  fail(testId: string, error?: string, duration?: number): void {
    const result = this.results.get(testId);
    if (result) {
      result.status = 'failed';
      result.error = error;
      result.duration = duration;
    }
    this.updateSpinner();
  }

  /**
   * Mark a test as skipped
   */
  skip(testId: string): void {
    const result = this.results.get(testId);
    if (result) {
      result.status = 'skipped';
    }
    this.updateSpinner();
  }

  /**
   * Update spinner text
   */
  private updateSpinner(): void {
    if (isTTY) {
      this.spinner.text = this.formatStatus();
    }
  }

  /**
   * Format current status line
   */
  private formatStatus(): string {
    const passed = this.countByStatus('passed');
    const failed = this.countByStatus('failed');
    const running = this.countByStatus('running');
    const completed = passed + failed + this.countByStatus('skipped');

    const progressBar = renderProgressBar(completed, this.total, {
      width: 15,
      showPercentage: false,
      showCount: false,
    });

    return `${progressBar} ${chalk.green(passed)} passed, ${chalk.red(failed)} failed, ${chalk.blue(running)} running`;
  }

  /**
   * Count results by status
   */
  private countByStatus(status: TestStatus): number {
    return [...this.results.values()].filter((r) => r.status === status).length;
  }

  /**
   * Complete tracking and print final status
   */
  complete(): void {
    if (isTTY) {
      this.spinner.stop();
    }
    this.printFinalStatus();
  }

  /**
   * Print final status for all tests
   */
  private printFinalStatus(): void {
    console.log('');

    for (const [_, result] of this.results) {
      const icon = this.getStatusIcon(result.status);
      const duration = result.duration ? chalk.dim(` (${result.duration.toFixed(0)}ms)`) : '';
      console.log(`${icon} ${result.name}${duration}`);

      if (result.status === 'failed' && result.error) {
        console.log(chalk.red(`    ${result.error}`));
      }
    }

    console.log('');
  }

  /**
   * Get icon for status
   */
  private getStatusIcon(status: TestStatus): string {
    switch (status) {
      case 'passed':
        return icons.passed;
      case 'failed':
        return icons.failed;
      case 'skipped':
        return icons.skipped;
      case 'running':
        return icons.running;
      default:
        return chalk.gray('○');
    }
  }

  /**
   * Get summary statistics
   */
  getSummary(): { passed: number; failed: number; skipped: number; duration: number } {
    return {
      passed: this.countByStatus('passed'),
      failed: this.countByStatus('failed'),
      skipped: this.countByStatus('skipped'),
      duration: Date.now() - this.startTime,
    };
  }
}

/**
 * Simple spinner wrapper with consistent styling
 */
export class Spinner {
  private spinner: Ora;

  constructor(text?: string) {
    this.spinner = ora({
      text,
      spinner: 'dots',
      color: 'cyan',
    });
  }

  start(text?: string): this {
    if (isTTY) {
      this.spinner.start(text);
    } else if (text) {
      console.log(text);
    }
    return this;
  }

  update(text: string): this {
    if (isTTY) {
      this.spinner.text = text;
    }
    return this;
  }

  succeed(text?: string): this {
    if (isTTY) {
      this.spinner.succeed(text);
    } else if (text) {
      console.log(`${icons.passed} ${text}`);
    }
    return this;
  }

  fail(text?: string): this {
    if (isTTY) {
      this.spinner.fail(text);
    } else if (text) {
      console.log(`${icons.failed} ${text}`);
    }
    return this;
  }

  warn(text?: string): this {
    if (isTTY) {
      this.spinner.warn(text);
    } else if (text) {
      console.log(`${icons.warning} ${text}`);
    }
    return this;
  }

  info(text?: string): this {
    if (isTTY) {
      this.spinner.info(text);
    } else if (text) {
      console.log(`${icons.info} ${text}`);
    }
    return this;
  }

  stop(): this {
    if (isTTY) {
      this.spinner.stop();
    }
    return this;
  }
}

/**
 * Create a new spinner instance
 */
export function createSpinner(text?: string): Spinner {
  return new Spinner(text);
}
