/**
 * Error handling utilities for Artemis
 */

/**
 * Error codes used throughout Artemis
 */
export type ArtemisErrorCode =
  | 'UNKNOWN_PROVIDER'
  | 'PROVIDER_UNAVAILABLE'
  | 'SCENARIO_READ_ERROR'
  | 'SCENARIO_PARSE_ERROR'
  | 'SCENARIO_VALIDATION_ERROR'
  | 'ADAPTER_ERROR'
  | 'GENERATION_ERROR'
  | 'EVALUATION_ERROR'
  | 'STORAGE_ERROR'
  | 'CONFIG_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Custom error class for Artemis
 */
export class ArtemisError extends Error {
  readonly code: ArtemisErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ArtemisErrorCode = 'UNKNOWN_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ArtemisError';
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Check if error is an ArtemisError
 */
export function isArtemisError(error: unknown): error is ArtemisError {
  return error instanceof ArtemisError;
}

/**
 * Wrap unknown errors in ArtemisError
 */
export function wrapError(
  error: unknown,
  code: ArtemisErrorCode = 'UNKNOWN_ERROR',
  context?: string
): ArtemisError {
  if (error instanceof ArtemisError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  return new ArtemisError(context ? `${context}: ${message}` : message, code, {
    originalError: error,
  });
}
