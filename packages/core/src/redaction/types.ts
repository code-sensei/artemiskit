import { z } from 'zod';

/**
 * Built-in redaction pattern names
 */
export const BUILTIN_PATTERNS = {
  /** Email addresses */
  EMAIL: 'email',
  /** Phone numbers (various formats) */
  PHONE: 'phone',
  /** Credit card numbers */
  CREDIT_CARD: 'credit_card',
  /** Social Security Numbers */
  SSN: 'ssn',
  /** API keys (common formats) */
  API_KEY: 'api_key',
  /** IPv4 addresses */
  IPV4: 'ipv4',
  /** JWT tokens */
  JWT: 'jwt',
  /** AWS access keys */
  AWS_KEY: 'aws_key',
  /** Generic secrets (password=, secret=, etc.) */
  SECRETS: 'secrets',
} as const;

export type BuiltinPatternName = (typeof BUILTIN_PATTERNS)[keyof typeof BUILTIN_PATTERNS];

/**
 * Regex patterns for built-in redaction
 */
export const BUILTIN_REGEX_PATTERNS: Record<BuiltinPatternName, RegExp> = {
  [BUILTIN_PATTERNS.EMAIL]: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  [BUILTIN_PATTERNS.PHONE]: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
  [BUILTIN_PATTERNS.CREDIT_CARD]: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  [BUILTIN_PATTERNS.SSN]: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  [BUILTIN_PATTERNS.API_KEY]:
    /\b(?:sk|pk|api|key)[-_]?(?:[a-zA-Z0-9]+[-_]?){2,}[a-zA-Z0-9]{10,}\b/gi,
  [BUILTIN_PATTERNS.IPV4]: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  [BUILTIN_PATTERNS.JWT]: /\beyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*\b/g,
  [BUILTIN_PATTERNS.AWS_KEY]: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
  [BUILTIN_PATTERNS.SECRETS]:
    /\b(?:password|secret|token|apikey|api_key|auth)[\s]*[=:]\s*['"]?[^\s'"]+['"]?/gi,
};

/**
 * Default patterns to use when redaction is enabled without specific patterns
 */
export const DEFAULT_REDACTION_PATTERNS: BuiltinPatternName[] = [
  BUILTIN_PATTERNS.EMAIL,
  BUILTIN_PATTERNS.PHONE,
  BUILTIN_PATTERNS.CREDIT_CARD,
  BUILTIN_PATTERNS.SSN,
  BUILTIN_PATTERNS.API_KEY,
  BUILTIN_PATTERNS.AWS_KEY,
  BUILTIN_PATTERNS.SECRETS,
];

/**
 * Redaction configuration schema for scenarios
 */
export const RedactionConfigSchema = z.object({
  /** Enable redaction */
  enabled: z.boolean().default(false),
  /** Built-in pattern names or custom regex patterns */
  patterns: z.array(z.string()).optional(),
  /** Redact prompt content */
  redactPrompts: z.boolean().optional().default(true),
  /** Redact response content */
  redactResponses: z.boolean().optional().default(true),
  /** Redact metadata fields */
  redactMetadata: z.boolean().optional().default(false),
  /** Custom replacement string */
  replacement: z.string().optional().default('[REDACTED]'),
});

export type RedactionConfig = z.infer<typeof RedactionConfigSchema>;

/**
 * Redaction options used at runtime
 */
export interface RedactionOptions {
  enabled: boolean;
  patterns: (string | RegExp)[];
  redactPrompts: boolean;
  redactResponses: boolean;
  redactMetadata: boolean;
  replacement: string;
}

/**
 * Result of a redaction operation
 */
export interface RedactionResult {
  /** The redacted text */
  text: string;
  /** Whether any redaction was applied */
  wasRedacted: boolean;
  /** Count of redactions made */
  redactionCount: number;
  /** Types of patterns that matched */
  matchedPatterns: string[];
}

/**
 * Metadata about redaction in a manifest
 */
export interface RedactionMetadata {
  /** Whether redaction was enabled */
  enabled: boolean;
  /** Patterns used (names only, not actual regex) */
  patternsUsed: string[];
  /** Replacement string used */
  replacement: string;
  /** Summary of what was redacted */
  summary: {
    promptsRedacted: number;
    responsesRedacted: number;
    totalRedactions: number;
  };
}

/**
 * Redaction details for a single case result
 */
export interface CaseRedactionDetails {
  /** Whether this case had redaction applied */
  redacted: boolean;
  /** Whether prompt was redacted */
  promptRedacted: boolean;
  /** Whether response was redacted */
  responseRedacted: boolean;
  /** Number of redactions in this case */
  redactionCount: number;
}
