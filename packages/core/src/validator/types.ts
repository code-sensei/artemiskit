/**
 * Validator types
 */

/**
 * Validation error severity
 */
export type ValidationSeverity = 'error' | 'warning';

/**
 * Validation error/warning
 */
export interface ValidationIssue {
  /** Line number in the file (1-indexed) */
  line: number;
  /** Column number (optional) */
  column?: number;
  /** Error/warning message */
  message: string;
  /** Rule that triggered this issue */
  rule: string;
  /** Severity level */
  severity: ValidationSeverity;
  /** Suggested fix (optional) */
  suggestion?: string;
}

/**
 * Result for a single file validation
 */
export interface ValidationResult {
  /** File path that was validated */
  file: string;
  /** Whether the file is valid (no errors) */
  valid: boolean;
  /** List of errors found */
  errors: ValidationIssue[];
  /** List of warnings found */
  warnings: ValidationIssue[];
}

/**
 * Summary of validation across multiple files
 */
export interface ValidationSummary {
  /** Total files validated */
  total: number;
  /** Files that passed validation */
  passed: number;
  /** Files that failed validation */
  failed: number;
  /** Files with warnings only */
  withWarnings: number;
}

/**
 * Options for the validator
 */
export interface ValidatorOptions {
  /** Treat warnings as errors */
  strict?: boolean;
}
