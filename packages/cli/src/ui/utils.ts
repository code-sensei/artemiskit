/**
 * UI utility functions for terminal handling
 */

/**
 * Check if stdout is a TTY (interactive terminal)
 */
export const isTTY = process.stdout.isTTY ?? false;

/**
 * Get terminal width, with fallback for non-TTY environments
 */
export function getTerminalWidth(): number {
  return process.stdout.columns ?? 80;
}

/**
 * Render different output based on TTY availability
 * @param ttyOutput Output for interactive terminals
 * @param plainOutput Output for non-TTY (CI/CD) environments
 */
export function renderConditional(ttyOutput: string, plainOutput: string): string {
  return isTTY ? ttyOutput : plainOutput;
}

/**
 * Center text within a given width
 */
export function centerText(text: string, width: number): string {
  const visibleLength = stripAnsi(text).length;
  const padding = Math.max(0, Math.floor((width - visibleLength) / 2));
  const rightPadding = width - padding - visibleLength;
  return ' '.repeat(padding) + text + ' '.repeat(Math.max(0, rightPadding));
}

/**
 * Pad text to a specific width (accounting for ANSI codes)
 */
export function padText(
  text: string,
  width: number,
  align: 'left' | 'right' | 'center' = 'left'
): string {
  const visibleLength = stripAnsi(text).length;
  const paddingNeeded = Math.max(0, width - visibleLength);

  if (align === 'center') {
    return centerText(text, width);
  }
  if (align === 'right') {
    return ' '.repeat(paddingNeeded) + text;
  }
  return text + ' '.repeat(paddingNeeded);
}

/**
 * Strip ANSI escape codes from string (for length calculations)
 */
export function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes require control characters
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Truncate text to fit within a width, adding ellipsis if needed
 */
export function truncate(text: string, maxWidth: number): string {
  const visibleLength = stripAnsi(text).length;
  if (visibleLength <= maxWidth) return text;
  return `${text.slice(0, maxWidth - 1)}…`;
}

/**
 * Format duration in a human-readable way
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format a number with commas for readability
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}
