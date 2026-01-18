/**
 * CLI UI Components
 *
 * Centralized UI utilities for consistent CLI output formatting.
 */

// Color scheme and icons
export { colors, icons, colorByPercentage, formatPercentage } from './colors.js';

// Utility functions
export {
  isTTY,
  getTerminalWidth,
  renderConditional,
  centerText,
  padText,
  stripAnsi,
  truncate,
  formatDuration,
  formatNumber,
} from './utils.js';

// Progress bars
export { renderProgressBar, ProgressBar, renderInlineProgress } from './progress.js';
export type { ProgressBarOptions } from './progress.js';

// Summary panels
export {
  renderSummaryPanel,
  renderStressSummaryPanel,
  renderRedteamSummaryPanel,
  renderInfoBox,
} from './panels.js';
export type { SummaryData, StressSummaryData, RedteamSummaryData } from './panels.js';

// Error display
export { renderError, renderWarning, getProviderErrorContext } from './errors.js';
export type { ErrorContext } from './errors.js';

// Live status tracking
export { LiveTestStatus, Spinner, createSpinner } from './live-status.js';
export type { TestStatus } from './live-status.js';
