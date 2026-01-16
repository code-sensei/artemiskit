import { createHash } from 'node:crypto';
import {
  BUILTIN_REGEX_PATTERNS,
  type BuiltinPatternName,
  DEFAULT_REDACTION_PATTERNS,
  type RedactionConfig,
  type RedactionOptions,
  type RedactionResult,
} from './types';

/**
 * Resolve pattern strings to RegExp objects
 * Supports built-in pattern names and custom regex strings
 */
export function resolvePatterns(patterns: string[]): { regex: RegExp; name: string }[] {
  return patterns
    .map((pattern) => {
      // Check if it's a built-in pattern name
      if (pattern in BUILTIN_REGEX_PATTERNS) {
        const regex = BUILTIN_REGEX_PATTERNS[pattern as BuiltinPatternName];
        return { regex: new RegExp(regex.source, regex.flags), name: pattern };
      }

      // Treat as custom regex
      try {
        return { regex: new RegExp(pattern, 'g'), name: `custom:${pattern.slice(0, 20)}` };
      } catch {
        // Invalid regex, skip it
        console.warn(`Invalid redaction pattern: ${pattern}`);
        return null;
      }
    })
    .filter((p): p is { regex: RegExp; name: string } => p !== null);
}

/**
 * Create RedactionOptions from RedactionConfig
 */
export function createRedactionOptions(config: RedactionConfig): RedactionOptions {
  const patternNames = config.patterns?.length ? config.patterns : DEFAULT_REDACTION_PATTERNS;
  const resolvedPatterns = resolvePatterns(patternNames);

  return {
    enabled: config.enabled,
    patterns: resolvedPatterns.map((p) => p.regex),
    redactPrompts: config.redactPrompts ?? true,
    redactResponses: config.redactResponses ?? true,
    redactMetadata: config.redactMetadata ?? false,
    replacement: config.replacement ?? '[REDACTED]',
  };
}

/**
 * Apply redaction to a text string
 */
export function redactText(
  text: string,
  patterns: (string | RegExp)[],
  replacement = '[REDACTED]'
): RedactionResult {
  if (!text || patterns.length === 0) {
    return {
      text,
      wasRedacted: false,
      redactionCount: 0,
      matchedPatterns: [],
    };
  }

  let result = text;
  let totalCount = 0;
  const matchedPatterns: string[] = [];

  for (const pattern of patterns) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern;
    const matches = result.match(regex);

    if (matches && matches.length > 0) {
      totalCount += matches.length;
      matchedPatterns.push(regex.source.slice(0, 30));
      result = result.replace(regex, replacement);
    }
  }

  return {
    text: result,
    wasRedacted: totalCount > 0,
    redactionCount: totalCount,
    matchedPatterns: [...new Set(matchedPatterns)],
  };
}

/**
 * Generate a SHA-256 hash of the original text
 * Useful for audit trails where you need to verify content without storing it
 */
export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Redact text and return both redacted version and hash of original
 */
export function redactWithHash(
  text: string,
  patterns: (string | RegExp)[],
  replacement = '[REDACTED]'
): RedactionResult & { originalHash: string } {
  const originalHash = hashText(text);
  const result = redactText(text, patterns, replacement);
  return { ...result, originalHash };
}

/**
 * Main Redactor class for applying redaction with consistent configuration
 */
export class Redactor {
  private options: RedactionOptions;
  private resolvedPatterns: { regex: RegExp; name: string }[];

  constructor(config: RedactionConfig) {
    this.options = createRedactionOptions(config);
    const patternNames = config.patterns?.length ? config.patterns : DEFAULT_REDACTION_PATTERNS;
    this.resolvedPatterns = resolvePatterns(patternNames);
  }

  /**
   * Check if redaction is enabled
   */
  get enabled(): boolean {
    return this.options.enabled;
  }

  /**
   * Get pattern names being used
   */
  get patternNames(): string[] {
    return this.resolvedPatterns.map((p) => p.name);
  }

  /**
   * Get the replacement string
   */
  get replacement(): string {
    return this.options.replacement;
  }

  /**
   * Redact a prompt string
   */
  redactPrompt(prompt: string): RedactionResult {
    if (!this.options.enabled || !this.options.redactPrompts) {
      return {
        text: prompt,
        wasRedacted: false,
        redactionCount: 0,
        matchedPatterns: [],
      };
    }
    return redactText(prompt, this.options.patterns, this.options.replacement);
  }

  /**
   * Redact a response string
   */
  redactResponse(response: string): RedactionResult {
    if (!this.options.enabled || !this.options.redactResponses) {
      return {
        text: response,
        wasRedacted: false,
        redactionCount: 0,
        matchedPatterns: [],
      };
    }
    return redactText(response, this.options.patterns, this.options.replacement);
  }

  /**
   * Redact metadata object values
   */
  redactMetadata<T extends Record<string, unknown>>(metadata: T): T {
    if (!this.options.enabled || !this.options.redactMetadata) {
      return metadata;
    }

    const redacted = { ...metadata } as T;
    for (const key of Object.keys(redacted)) {
      const value = redacted[key];
      if (typeof value === 'string') {
        const result = redactText(value, this.options.patterns, this.options.replacement);
        (redacted as Record<string, unknown>)[key] = result.text;
      }
    }
    return redacted;
  }

  /**
   * Redact any text with current configuration
   */
  redact(text: string): RedactionResult {
    if (!this.options.enabled) {
      return {
        text,
        wasRedacted: false,
        redactionCount: 0,
        matchedPatterns: [],
      };
    }
    return redactText(text, this.options.patterns, this.options.replacement);
  }

  /**
   * Redact and get hash of original
   */
  redactAndHash(text: string): RedactionResult & { originalHash: string } {
    const originalHash = hashText(text);
    const result = this.redact(text);
    return { ...result, originalHash };
  }
}

/**
 * Create a no-op redactor that doesn't redact anything
 */
export function createNoOpRedactor(): Redactor {
  return new Redactor({
    enabled: false,
    redactPrompts: true,
    redactResponses: true,
    redactMetadata: false,
    replacement: '[REDACTED]',
  });
}

/**
 * Create a redactor with default patterns
 */
export function createDefaultRedactor(): Redactor {
  return new Redactor({
    enabled: true,
    redactPrompts: true,
    redactResponses: true,
    redactMetadata: false,
    replacement: '[REDACTED]',
  });
}
