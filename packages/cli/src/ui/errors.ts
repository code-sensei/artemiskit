/**
 * Enhanced error display formatting
 */

import chalk from 'chalk';
import { isTTY, padText, truncate } from './utils.js';

export interface ErrorContext {
  /** Main error title */
  title: string;
  /** Reason for the error */
  reason: string;
  /** Actionable suggestions for the user */
  suggestions?: string[];
  /** Additional context details */
  details?: Record<string, string>;
  /** Error code (if applicable) */
  code?: string;
}

/**
 * Render an enhanced error panel with context and suggestions
 *
 * @example
 * renderError({
 *   title: 'Failed to connect to Azure OpenAI',
 *   reason: 'Invalid API key or resource not found',
 *   suggestions: [
 *     'Check AZURE_OPENAI_API_KEY is set correctly',
 *     'Verify resource name: my-openai-resource',
 *     "Run 'artemiskit init' to reconfigure"
 *   ]
 * })
 */
export function renderError(ctx: ErrorContext): string {
  const width = 60;

  if (!isTTY) {
    // Plain text format for CI/CD
    const lines = [`ERROR: ${ctx.title}`, `Reason: ${ctx.reason}`];

    if (ctx.code) {
      lines.push(`Code: ${ctx.code}`);
    }

    if (ctx.details) {
      for (const [key, value] of Object.entries(ctx.details)) {
        lines.push(`${key}: ${value}`);
      }
    }

    if (ctx.suggestions?.length) {
      lines.push('Suggestions:');
      for (const suggestion of ctx.suggestions) {
        lines.push(`  - ${suggestion}`);
      }
    }

    return lines.join('\n');
  }

  const innerWidth = width - 4;
  const lines: string[] = [];

  // Top border with ERROR label
  const topBorder = '─'.repeat(width - 10);
  lines.push(chalk.red(`┌─ ERROR ${topBorder}┐`));
  lines.push(chalk.red('│') + ' '.repeat(width - 2) + chalk.red('│'));

  // Title
  lines.push(chalk.red('│') + padText(`  ${chalk.bold(ctx.title)}`, width - 2) + chalk.red('│'));
  lines.push(chalk.red('│') + ' '.repeat(width - 2) + chalk.red('│'));

  // Reason
  const reasonText = truncate(ctx.reason, innerWidth - 10);
  lines.push(chalk.red('│') + padText(`  Reason: ${reasonText}`, width - 2) + chalk.red('│'));

  // Code (if present)
  if (ctx.code) {
    lines.push(
      chalk.red('│') + padText(`  Code: ${chalk.dim(ctx.code)}`, width - 2) + chalk.red('│')
    );
  }

  // Details (if present)
  if (ctx.details && Object.keys(ctx.details).length > 0) {
    lines.push(chalk.red('│') + ' '.repeat(width - 2) + chalk.red('│'));
    for (const [key, value] of Object.entries(ctx.details)) {
      const detailText = truncate(`${key}: ${value}`, innerWidth);
      lines.push(
        chalk.red('│') + padText(`  ${chalk.dim(detailText)}`, width - 2) + chalk.red('│')
      );
    }
  }

  // Suggestions
  if (ctx.suggestions?.length) {
    lines.push(chalk.red('│') + ' '.repeat(width - 2) + chalk.red('│'));
    lines.push(chalk.red('│') + padText('  Suggestions:', width - 2) + chalk.red('│'));
    for (const suggestion of ctx.suggestions) {
      const suggestionText = truncate(suggestion, innerWidth - 4);
      lines.push(
        chalk.red('│') +
          padText(`  ${chalk.yellow('•')} ${suggestionText}`, width - 2) +
          chalk.red('│')
      );
    }
  }

  // Bottom border
  lines.push(chalk.red('│') + ' '.repeat(width - 2) + chalk.red('│'));
  lines.push(chalk.red(`└${'─'.repeat(width - 2)}┘`));

  return lines.join('\n');
}

/**
 * Render a warning panel (less severe than error)
 */
export function renderWarning(title: string, message: string, suggestions?: string[]): string {
  const width = 60;

  if (!isTTY) {
    const lines = [`WARNING: ${title}`, message];
    if (suggestions?.length) {
      lines.push('Suggestions:');
      for (const suggestion of suggestions) {
        lines.push(`  - ${suggestion}`);
      }
    }
    return lines.join('\n');
  }

  const innerWidth = width - 4;
  const lines: string[] = [];

  const topBorder = '─'.repeat(width - 12);
  lines.push(chalk.yellow(`┌─ WARNING ${topBorder}┐`));
  lines.push(chalk.yellow('│') + ' '.repeat(width - 2) + chalk.yellow('│'));
  lines.push(chalk.yellow('│') + padText(`  ${chalk.bold(title)}`, width - 2) + chalk.yellow('│'));
  lines.push(chalk.yellow('│') + ' '.repeat(width - 2) + chalk.yellow('│'));

  // Word wrap message if needed
  const words = message.split(' ');
  let currentLine = '  ';
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= innerWidth) {
      currentLine += (currentLine.length > 2 ? ' ' : '') + word;
    } else {
      lines.push(chalk.yellow('│') + padText(currentLine, width - 2) + chalk.yellow('│'));
      currentLine = `  ${word}`;
    }
  }
  if (currentLine.length > 2) {
    lines.push(chalk.yellow('│') + padText(currentLine, width - 2) + chalk.yellow('│'));
  }

  if (suggestions?.length) {
    lines.push(chalk.yellow('│') + ' '.repeat(width - 2) + chalk.yellow('│'));
    for (const suggestion of suggestions) {
      const suggestionText = truncate(suggestion, innerWidth - 4);
      lines.push(
        chalk.yellow('│') +
          padText(`  ${chalk.dim('•')} ${suggestionText}`, width - 2) +
          chalk.yellow('│')
      );
    }
  }

  lines.push(chalk.yellow('│') + ' '.repeat(width - 2) + chalk.yellow('│'));
  lines.push(chalk.yellow(`└${'─'.repeat(width - 2)}┘`));

  return lines.join('\n');
}

/**
 * Format provider-specific error messages with suggestions
 */
export function getProviderErrorContext(provider: string, error: Error): ErrorContext {
  const errorMessage = error.message.toLowerCase();

  // OpenAI errors
  if (provider === 'openai') {
    if (errorMessage.includes('api key') || errorMessage.includes('authentication')) {
      return {
        title: 'OpenAI Authentication Failed',
        reason: error.message,
        suggestions: [
          'Check that OPENAI_API_KEY is set correctly',
          'Verify the API key is valid and not expired',
          "Run 'artemiskit init' to reconfigure",
        ],
      };
    }
    if (errorMessage.includes('rate limit')) {
      return {
        title: 'OpenAI Rate Limit Exceeded',
        reason: error.message,
        suggestions: [
          'Wait a moment and try again',
          'Reduce concurrency with --concurrency flag',
          'Consider upgrading your OpenAI plan',
        ],
      };
    }
  }

  // Azure OpenAI errors
  if (provider === 'azure-openai') {
    if (errorMessage.includes('resource') || errorMessage.includes('deployment')) {
      return {
        title: 'Azure OpenAI Resource Error',
        reason: error.message,
        suggestions: [
          'Verify AZURE_OPENAI_RESOURCE_NAME is correct',
          'Check AZURE_OPENAI_DEPLOYMENT_NAME matches your deployment',
          'Ensure the deployment exists in your Azure portal',
        ],
      };
    }
  }

  // Anthropic errors
  if (provider === 'anthropic') {
    if (errorMessage.includes('api key') || errorMessage.includes('authentication')) {
      return {
        title: 'Anthropic Authentication Failed',
        reason: error.message,
        suggestions: [
          'Check that ANTHROPIC_API_KEY is set correctly',
          'Verify the API key is valid',
          "Run 'artemiskit init' to reconfigure",
        ],
      };
    }
  }

  // Generic fallback
  return {
    title: `${provider} Error`,
    reason: error.message,
    suggestions: [
      'Check your provider configuration',
      'Verify environment variables are set correctly',
      "Run 'artemiskit init' to reconfigure",
    ],
  };
}
