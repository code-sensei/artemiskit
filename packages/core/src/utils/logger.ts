/**
 * Logger utility for Artemis
 */

import { type ConsolaInstance, LogLevels, createConsola } from 'consola';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_MAP: Record<LogLevel, number> = {
  debug: LogLevels.debug,
  info: LogLevels.info,
  warn: LogLevels.warn,
  error: LogLevels.error,
};

const level = (process.env.ARTEMIS_LOG_LEVEL as LogLevel) || 'info';

const baseLogger = createConsola({
  level: LOG_LEVEL_MAP[level] ?? LogLevels.info,
  formatOptions: {
    colors: true,
    date: true,
  },
});

/**
 * Logger class for consistent logging across Artemis
 */
export class Logger {
  private logger: ConsolaInstance;

  constructor(name: string) {
    this.logger = baseLogger.withTag(name);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.debug(message, data);
    } else {
      this.logger.debug(message);
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.info(message, data);
    } else {
      this.logger.info(message);
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.warn(message, data);
    } else {
      this.logger.warn(message);
    }
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData =
      error instanceof Error
        ? { error: { message: error.message, stack: error.stack, name: error.name } }
        : error
          ? { error }
          : undefined;

    const mergedData = errorData || data ? { ...data, ...errorData } : undefined;

    if (mergedData) {
      this.logger.error(message, mergedData);
    } else {
      this.logger.error(message);
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    const childLogger = new Logger('');
    const tag = bindings.name ? String(bindings.name) : '';
    childLogger.logger = this.logger.withTag(tag);
    return childLogger;
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger('artemis');
