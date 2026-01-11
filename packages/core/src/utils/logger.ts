/**
 * Logger utility for Artemis
 */

import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const level = process.env.ARTEMIS_LOG_LEVEL || 'info';

const baseLogger = pino({
  level,
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

/**
 * Logger class for consistent logging across Artemis
 */
export class Logger {
  private logger: pino.Logger;

  constructor(name: string) {
    this.logger = baseLogger.child({ name });
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(data, message);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(data, message);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(data, message);
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData =
      error instanceof Error
        ? { error: { message: error.message, stack: error.stack, name: error.name } }
        : { error };
    this.logger.error({ ...data, ...errorData }, message);
  }

  child(bindings: Record<string, unknown>): Logger {
    const childLogger = new Logger('');
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger('artemis');
