/**
 * Integration tests for CLI UI components
 */

import { describe, expect, it } from 'bun:test';
import {
  renderProgressBar,
  renderSummaryPanel,
  renderError,
  renderInfoBox,
  createSpinner,
  icons,
  colors,
  padText,
  formatDuration,
} from '../../ui/index.js';

describe('UI Components', () => {
  describe('renderProgressBar', () => {
    it('should render empty progress bar at 0%', () => {
      const bar = renderProgressBar(0, 10);
      expect(bar).toContain('0/10');
      expect(bar).toContain('0%');
    });

    it('should render full progress bar at 100%', () => {
      const bar = renderProgressBar(10, 10);
      expect(bar).toContain('10/10');
      expect(bar).toContain('100%');
    });

    it('should render partial progress bar', () => {
      const bar = renderProgressBar(5, 10);
      expect(bar).toContain('5/10');
      expect(bar).toContain('50%');
    });

    it('should respect custom width option', () => {
      const bar = renderProgressBar(5, 10, { width: 30 });
      expect(bar).toContain('5/10');
    });

    it('should handle edge case of 0 total', () => {
      const bar = renderProgressBar(0, 0);
      expect(bar).toBeDefined();
    });
  });

  describe('renderSummaryPanel', () => {
    it('should render all metrics', () => {
      const panel = renderSummaryPanel({
        passed: 8,
        failed: 2,
        skipped: 0,
        successRate: 80,
        duration: 12500,
      });

      expect(panel).toContain('8');
      expect(panel).toContain('2');
      expect(panel).toContain('80');
      expect(panel).toContain('TEST RESULTS');
    });

    it('should use box drawing characters', () => {
      const panel = renderSummaryPanel({
        passed: 5,
        failed: 0,
        skipped: 1,
        successRate: 100,
        duration: 5000,
      });

      expect(panel).toContain('╔');
      expect(panel).toContain('╗');
      expect(panel).toContain('╚');
      expect(panel).toContain('╝');
      expect(panel).toContain('║');
    });

    it('should support custom title', () => {
      const panel = renderSummaryPanel({
        passed: 5,
        failed: 0,
        skipped: 0,
        successRate: 100,
        duration: 1000,
        title: 'CUSTOM TITLE',
      });

      expect(panel).toContain('CUSTOM TITLE');
    });
  });

  describe('renderError', () => {
    it('should render error title and reason', () => {
      const error = renderError({
        title: 'Connection Failed',
        reason: 'Network timeout',
      });

      expect(error).toContain('Connection Failed');
      expect(error).toContain('Network timeout');
      expect(error).toContain('ERROR');
    });

    it('should render suggestions when provided', () => {
      const error = renderError({
        title: 'Auth Failed',
        reason: 'Invalid API key',
        suggestions: ['Check your API key', 'Verify environment variables'],
      });

      expect(error).toContain('Check your API key');
      expect(error).toContain('Verify environment variables');
      expect(error).toContain('Suggestions');
    });

    it('should use box drawing characters', () => {
      const error = renderError({
        title: 'Test Error',
        reason: 'Test reason',
      });

      expect(error).toContain('┌');
      expect(error).toContain('┐');
      expect(error).toContain('└');
      expect(error).toContain('┘');
    });
  });

  describe('renderInfoBox', () => {
    it('should render title and content', () => {
      const box = renderInfoBox('Info Title', ['Line 1', 'Line 2']);

      expect(box).toContain('Info Title');
      expect(box).toContain('Line 1');
      expect(box).toContain('Line 2');
    });

    it('should use box drawing characters', () => {
      const box = renderInfoBox('Test', ['content']);

      // Uses standard box drawing (may be rounded or square depending on implementation)
      expect(box).toContain('┌');
      expect(box).toContain('┐');
      expect(box).toContain('└');
      expect(box).toContain('┘');
    });
  });

  describe('createSpinner', () => {
    it('should create a spinner with text', () => {
      const spinner = createSpinner('Loading...');
      expect(spinner).toBeDefined();
      expect(typeof spinner.start).toBe('function');
      expect(typeof spinner.succeed).toBe('function');
      expect(typeof spinner.fail).toBe('function');
      expect(typeof spinner.info).toBe('function');
    });
  });

  describe('icons', () => {
    it('should have all required icons', () => {
      expect(icons.passed).toBeDefined();
      expect(icons.failed).toBeDefined();
      expect(icons.skipped).toBeDefined();
      expect(icons.running).toBeDefined();
      expect(icons.info).toBeDefined();
      expect(icons.warning).toBeDefined();
    });
  });

  describe('colors', () => {
    it('should have all required color functions', () => {
      expect(typeof colors.success).toBe('function');
      expect(typeof colors.error).toBe('function');
      expect(typeof colors.warning).toBe('function');
      expect(typeof colors.info).toBe('function');
      expect(typeof colors.muted).toBe('function');
    });

    it('should apply colors to text', () => {
      const colored = colors.success('test');
      expect(colored).toContain('test');
    });
  });

  describe('padText', () => {
    it('should pad text to specified width', () => {
      const padded = padText('hello', 10);
      expect(padded.length).toBe(10);
      expect(padded).toBe('hello     ');
    });

    it('should right-align text', () => {
      const padded = padText('hello', 10, 'right');
      expect(padded.length).toBe(10);
      expect(padded).toBe('     hello');
    });

    it('should center text', () => {
      const padded = padText('hi', 10, 'center');
      expect(padded.length).toBe(10);
      expect(padded).toContain('hi');
    });

    it('should not truncate text longer than width by default', () => {
      // padText does not truncate by default, it just pads shorter text
      const padded = padText('hello world', 5);
      expect(padded).toBe('hello world'); // text unchanged if longer than width
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(50)).toBe('50ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(2000)).toBe('2.0s');
    });

    it('should handle zero', () => {
      expect(formatDuration(0)).toBe('0ms');
    });
  });
});
