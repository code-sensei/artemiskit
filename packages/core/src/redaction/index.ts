export {
  BUILTIN_PATTERNS,
  BUILTIN_REGEX_PATTERNS,
  DEFAULT_REDACTION_PATTERNS,
  RedactionConfigSchema,
  type BuiltinPatternName,
  type CaseRedactionDetails,
  type RedactionConfig,
  type RedactionMetadata,
  type RedactionOptions,
  type RedactionResult,
} from './types';

export {
  Redactor,
  createDefaultRedactor,
  createNoOpRedactor,
  createRedactionOptions,
  hashText,
  redactText,
  redactWithHash,
  resolvePatterns,
} from './redactor';
