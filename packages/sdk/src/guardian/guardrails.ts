/**
 * Guardrails Module
 *
 * Provides input/output validation including:
 * - Injection detection (prompt injection, jailbreaks)
 * - PII detection and redaction
 * - Content filtering
 * - Custom validation rules
 */

import { nanoid } from 'nanoid';
import type {
  ContentCategory,
  ContentFilterResult,
  ContentFlag,
  GuardrailResult,
  InjectionDetection,
  InjectionType,
  PIIDetection,
  PIILocation,
  PIIType,
  PatternCategory,
  PatternConfig,
  Violation,
  ViolationSeverity,
} from './types';

// =============================================================================
// Pattern Matching Utilities
// =============================================================================

/**
 * Options for custom pattern matching
 */
export interface CustomPatternOptions {
  /** Case-insensitive matching (default: true) */
  caseInsensitive?: boolean;
  /** Pattern category for categorization */
  category?: PatternCategory;
  /** Severity level for matches */
  severity?: ViolationSeverity;
}

/**
 * Match a pattern against content with options
 */
export function matchPattern(
  content: string,
  pattern: string | RegExp,
  options: CustomPatternOptions = {}
): { matched: boolean; match?: RegExpMatchArray } {
  const { caseInsensitive = true } = options;

  if (typeof pattern === 'string') {
    // For string patterns, convert to regex with optional case insensitivity
    const flags = caseInsensitive ? 'gi' : 'g';
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPattern, flags);
    const match = content.match(regex);
    return { matched: !!match, match: match ?? undefined };
  }

  // For RegExp patterns, apply if case insensitivity is requested and not already set
  if (caseInsensitive && !pattern.flags.includes('i')) {
    const newRegex = new RegExp(pattern.source, `${pattern.flags}i`);
    const match = content.match(newRegex);
    return { matched: !!match, match: match ?? undefined };
  }

  const match = content.match(pattern);
  return { matched: !!match, match: match ?? undefined };
}

/**
 * Create a custom pattern guardrail
 */
export function createCustomPatternGuardrail(
  patterns: Array<string | RegExp>,
  options: CustomPatternOptions = {}
): (content: string, context?: Record<string, unknown>) => Promise<GuardrailResult> {
  const { caseInsensitive = true, category = 'injection', severity = 'high' } = options;

  return async (content: string) => {
    const violations: Violation[] = [];

    for (const pattern of patterns) {
      const result = matchPattern(content, pattern, { caseInsensitive });

      if (result.matched && result.match) {
        violations.push({
          id: nanoid(),
          type: 'injection_detection',
          severity,
          message: `Custom pattern match detected: ${category}`,
          details: {
            pattern: typeof pattern === 'string' ? pattern : pattern.source,
            category,
            matchedText: result.match[0],
          },
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        });
        break; // One match is enough
      }
    }

    if (violations.length > 0) {
      return { passed: false, violations };
    }

    return { passed: true, violations: [] };
  };
}

// =============================================================================
// Injection Detection
// =============================================================================

/**
 * Injection detection patterns
 */
const INJECTION_PATTERNS: Array<{
  type: InjectionType;
  patterns: RegExp[];
  severity: ViolationSeverity;
}> = [
  {
    type: 'prompt_injection',
    severity: 'critical',
    patterns: [
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
      /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/i,
      /forget\s+(everything|all)\s+(you|i)\s+(told|said)/i,
      /new\s+instructions?\s*:/i,
      /system\s*:\s*you\s+are/i,
      /\[SYSTEM\]/i,
      /\[INST\]/i,
      /<<SYS>>/i,
      /<\|im_start\|>/i,
      /\bACTUAL\s+SYSTEM\s+PROMPT\b/i,
    ],
  },
  {
    type: 'jailbreak',
    severity: 'critical',
    patterns: [
      /do\s+anything\s+now/i,
      /\bDAN\b.*\bmode\b/i,
      /bypass\s+(your\s+)?(safety|content|ethical)\s+(filters?|restrictions?)/i,
      /pretend\s+you\s+(have\s+)?no\s+(rules|restrictions|limitations)/i,
      /act\s+as\s+if\s+you\s+(have\s+)?no\s+(rules|restrictions)/i,
      /developer\s+mode\s+(enabled|activated)/i,
      /\bunlocked\b.*\bmode\b/i,
      /\bjailbreak(ed)?\b/i,
    ],
  },
  {
    type: 'role_hijack',
    severity: 'high',
    patterns: [
      /you\s+are\s+(now\s+)?(?!a\s+helpful)[a-z]+\s+assistant/i,
      /from\s+now\s+on,?\s+you\s+(are|will\s+be)/i,
      /your\s+new\s+(role|persona|identity)\s+is/i,
      /act\s+as\s+(if\s+you\s+are\s+)?a\s+different/i,
      /roleplay\s+as/i,
      /pretend\s+(to\s+be|you\s+are)/i,
    ],
  },
  {
    type: 'instruction_override',
    severity: 'high',
    patterns: [
      /override\s+(your\s+)?(instructions?|programming|directives?)/i,
      /new\s+(primary\s+)?(directive|instruction|command)/i,
      /highest\s+priority\s+(instruction|directive)/i,
      /supersede\s+(all\s+)?(other\s+)?instructions?/i,
    ],
  },
  {
    type: 'data_extraction',
    severity: 'critical',
    patterns: [
      /reveal\s+(your\s+)?(system\s+)?prompt/i,
      /show\s+(me\s+)?(your\s+)?(system\s+)?instructions/i,
      /what\s+(are|were)\s+(your\s+)?(initial|original)\s+(instructions|prompt)/i,
      /repeat\s+(everything|all)\s+(above|before)/i,
      /output\s+(your\s+)?(full\s+)?(system\s+)?prompt/i,
    ],
  },
  {
    type: 'system_prompt_leak',
    severity: 'high',
    patterns: [
      /print\s+(the\s+)?(system|hidden)\s+(prompt|message)/i,
      /leak\s+(the\s+)?system\s+prompt/i,
      /extract\s+(the\s+)?(system|hidden)\s+(instructions?|prompt)/i,
    ],
  },
  {
    type: 'delimiter_attack',
    severity: 'medium',
    patterns: [
      /```\s*system/i,
      /---\s*system\s*---/i,
      /\[\[SYSTEM\]\]/i,
      /\{\{SYSTEM\}\}/i,
      /<\/?system>/i,
    ],
  },
  {
    type: 'encoding_attack',
    severity: 'medium',
    patterns: [
      /base64\s*:\s*[A-Za-z0-9+/=]{20,}/i,
      /decode\s+(this\s+)?base64/i,
      /hex\s*:\s*[0-9a-fA-F]{20,}/i,
      /unicode\s*:\s*\\u[0-9a-fA-F]{4}/i,
    ],
  },
];

/**
 * Detect injection attempts in text
 */
export function detectInjection(text: string): InjectionDetection {
  for (const { type, patterns, severity } of INJECTION_PATTERNS) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          detected: true,
          type,
          confidence: severity === 'critical' ? 0.95 : severity === 'high' ? 0.85 : 0.7,
          pattern: pattern.source,
          location:
            match.index !== undefined
              ? { start: match.index, end: match.index + match[0].length }
              : undefined,
        };
      }
    }
  }

  return {
    detected: false,
    confidence: 0,
  };
}

/**
 * Create an injection detection guardrail
 */
export function createInjectionGuardrail(): (
  content: string,
  context?: Record<string, unknown>
) => Promise<GuardrailResult> {
  return async (content: string) => {
    const detection = detectInjection(content);

    if (detection.detected) {
      return {
        passed: false,
        violations: [
          {
            id: nanoid(),
            type: 'injection_detection',
            severity: 'critical',
            message: `Detected ${detection.type?.replace(/_/g, ' ')} attempt`,
            details: {
              type: detection.type,
              confidence: detection.confidence,
              pattern: detection.pattern,
            },
            timestamp: new Date(),
            action: 'block',
            blocked: true,
          },
        ],
      };
    }

    return { passed: true, violations: [] };
  };
}

// =============================================================================
// PII Detection
// =============================================================================

/**
 * PII detection patterns
 */
const PII_PATTERNS: Array<{
  type: PIIType;
  pattern: RegExp;
  mask: string;
}> = [
  {
    type: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    mask: '[EMAIL]',
  },
  {
    type: 'phone',
    pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    mask: '[PHONE]',
  },
  {
    type: 'ssn',
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    mask: '[SSN]',
  },
  {
    type: 'credit_card',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    mask: '[CREDIT_CARD]',
  },
  {
    type: 'ip_address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    mask: '[IP]',
  },
  {
    type: 'api_key',
    pattern: /\b(sk|pk|api|key|token|secret)[-_]?[a-zA-Z0-9]{20,}\b/gi,
    mask: '[API_KEY]',
  },
  {
    type: 'jwt_token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    mask: '[JWT]',
  },
  {
    type: 'password',
    pattern: /password\s*[:=]\s*['"]?[^\s'"]+['"]?/gi,
    mask: 'password:[REDACTED]',
  },
];

/**
 * Detect PII in text
 */
export function detectPII(text: string): PIIDetection {
  const locations: PIILocation[] = [];
  let redactedContent = text;

  for (const { type, pattern, mask } of PII_PATTERNS) {
    // Reset regex state
    const regex = new RegExp(pattern.source, pattern.flags);
    let match = regex.exec(text);

    while (match !== null) {
      locations.push({
        type,
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        masked: mask,
      });
      match = regex.exec(text);
    }

    // Redact in content
    redactedContent = redactedContent.replace(pattern, mask);
  }

  return {
    found: locations.length > 0,
    types: [...new Set(locations.map((l) => l.type))],
    locations,
    redactedContent,
  };
}

/**
 * Create a PII detection guardrail
 */
export function createPIIGuardrail(
  options: {
    redact?: boolean;
    block?: boolean;
    allowedTypes?: PIIType[];
  } = {}
): (content: string, context?: Record<string, unknown>) => Promise<GuardrailResult> {
  const { redact = true, block = false, allowedTypes = [] } = options;

  return async (content: string) => {
    const detection = detectPII(content);

    // Filter out allowed types
    const violations = detection.locations
      .filter((loc) => !allowedTypes.includes(loc.type))
      .map(
        (loc): Violation => ({
          id: nanoid(),
          type: 'pii_detection',
          severity: loc.type === 'ssn' || loc.type === 'credit_card' ? 'critical' : 'high',
          message: `Detected ${loc.type.replace(/_/g, ' ')} in content`,
          details: {
            piiType: loc.type,
            location: { start: loc.start, end: loc.end },
          },
          timestamp: new Date(),
          action: block ? 'block' : redact ? 'transform' : 'warn',
          blocked: block,
        })
      );

    if (violations.length === 0) {
      return { passed: true, violations: [] };
    }

    return {
      passed: !block,
      violations,
      transformedContent: redact ? detection.redactedContent : undefined,
    };
  };
}

// =============================================================================
// Content Filtering
// =============================================================================

/**
 * Content filter patterns by category
 */
const CONTENT_PATTERNS: Array<{
  category: ContentCategory;
  patterns: RegExp[];
  severity: ViolationSeverity;
}> = [
  {
    category: 'violence',
    severity: 'high',
    patterns: [
      /\b(kill|murder|assassinate|execute)\s+(people|someone|them|him|her)\b/i,
      /\bhow\s+to\s+(make|build)\s+(a\s+)?(bomb|weapon|explosive)\b/i,
      /\b(torture|mutilate|dismember)\b/i,
    ],
  },
  {
    category: 'hate_speech',
    severity: 'critical',
    patterns: [
      /\b(hate|kill|exterminate)\s+(all\s+)?(jews|muslims|christians|blacks|whites|asians)\b/i,
      /\b(racial|ethnic)\s+(slur|epithet)/i,
    ],
  },
  {
    category: 'self_harm',
    severity: 'critical',
    patterns: [
      /\bhow\s+to\s+(commit\s+)?suicide\b/i,
      /\bbest\s+way\s+to\s+(kill|hurt)\s+(yourself|myself)\b/i,
      /\bself[-\s]harm\s+(methods?|techniques?)\b/i,
    ],
  },
  {
    category: 'dangerous',
    severity: 'high',
    patterns: [
      /\bhow\s+to\s+make\s+(meth|drugs|poison)\b/i,
      /\b(synthesize|manufacture)\s+(illegal\s+)?(drugs?|narcotics?)\b/i,
    ],
  },
  {
    category: 'illegal',
    severity: 'high',
    patterns: [
      /\bhow\s+to\s+(hack|steal|launder|forge)\b/i,
      /\b(money\s+laundering|tax\s+evasion)\s+(guide|tutorial)\b/i,
    ],
  },
  {
    category: 'harassment',
    severity: 'medium',
    patterns: [
      /\b(threaten|harass|stalk|doxx)\s+(someone|them|him|her)\b/i,
      /\bfind\s+(someone'?s?|their)\s+(home\s+)?address\b/i,
    ],
  },
  {
    category: 'misinformation',
    severity: 'medium',
    patterns: [
      /\bfake\s+news\s+(about|regarding)\b/i,
      /\b(spread|create)\s+(false|fake)\s+(information|news)\b/i,
    ],
  },
];

/**
 * Filter content for harmful categories
 */
export function filterContent(text: string): ContentFilterResult {
  const flags: ContentFlag[] = [];
  const categories: ContentCategory[] = [];

  for (const { category, patterns, severity } of CONTENT_PATTERNS) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        flags.push({
          category,
          severity,
          confidence: 0.9,
          snippet: match[0],
        });
        if (!categories.includes(category)) {
          categories.push(category);
        }
        break; // One match per category is enough
      }
    }
  }

  return {
    passed: flags.length === 0,
    flags,
    categories,
  };
}

/**
 * Create a content filter guardrail
 */
export function createContentFilterGuardrail(
  options: {
    blockedCategories?: ContentCategory[];
    warnCategories?: ContentCategory[];
  } = {}
): (content: string, context?: Record<string, unknown>) => Promise<GuardrailResult> {
  const {
    blockedCategories = ['violence', 'hate_speech', 'self_harm', 'dangerous', 'illegal'],
    warnCategories = ['harassment', 'misinformation'],
  } = options;

  return async (content: string) => {
    const result = filterContent(content);

    const violations: Violation[] = result.flags.map((flag) => {
      const shouldBlock = blockedCategories.includes(flag.category);
      const shouldWarn = warnCategories.includes(flag.category);

      return {
        id: nanoid(),
        type: 'content_filter',
        severity: flag.severity,
        message: `Content flagged for ${flag.category.replace(/_/g, ' ')}`,
        details: {
          category: flag.category,
          confidence: flag.confidence,
          snippet: flag.snippet,
        },
        timestamp: new Date(),
        action: shouldBlock ? 'block' : shouldWarn ? 'warn' : 'allow',
        blocked: shouldBlock,
      };
    });

    return {
      passed: !violations.some((v) => v.blocked),
      violations,
    };
  };
}

// =============================================================================
// Composite Guardrail Factory
// =============================================================================

/**
 * Guardrail configuration options
 */
export interface GuardrailsConfig {
  /** Enable injection detection */
  injectionDetection?: boolean;

  /** Enable PII detection */
  piiDetection?: boolean;

  /** PII detection options */
  piiOptions?: {
    redact?: boolean;
    block?: boolean;
    allowedTypes?: PIIType[];
  };

  /** Enable content filtering */
  contentFilter?: boolean;

  /** Content filter options */
  contentFilterOptions?: {
    blockedCategories?: ContentCategory[];
    warnCategories?: ContentCategory[];
  };

  /**
   * Pattern matching configuration
   * Controls how custom patterns are matched
   */
  patternConfig?: PatternConfig;

  /**
   * Custom patterns to add to injection detection
   * These are checked in addition to built-in patterns
   */
  customPatterns?: Array<string | RegExp>;

  /**
   * Pattern categories to enable (default: all)
   * Use this to selectively enable pattern categories
   */
  enabledPatternCategories?: PatternCategory[];

  /** Custom guardrails */
  custom?: Array<(content: string, context?: Record<string, unknown>) => Promise<GuardrailResult>>;
}

/**
 * Create a composite guardrail from configuration
 */
export function createGuardrails(
  config: GuardrailsConfig = {}
): Array<(content: string, context?: Record<string, unknown>) => Promise<GuardrailResult>> {
  const guardrails: Array<
    (content: string, context?: Record<string, unknown>) => Promise<GuardrailResult>
  > = [];

  // Add injection detection if enabled
  if (config.injectionDetection !== false) {
    guardrails.push(createInjectionGuardrail());
  }

  // Add PII detection if enabled
  if (config.piiDetection !== false) {
    guardrails.push(createPIIGuardrail(config.piiOptions));
  }

  // Add content filtering if enabled
  if (config.contentFilter !== false) {
    guardrails.push(createContentFilterGuardrail(config.contentFilterOptions));
  }

  // Add custom patterns guardrail if patterns are provided
  if (config.customPatterns && config.customPatterns.length > 0) {
    // Determine category: single category uses that, multiple categories uses 'custom',
    // no categories defaults to 'injection'
    const categories = config.patternConfig?.categories ?? [];
    let category: PatternCategory;
    if (categories.length === 0) {
      category = 'injection';
    } else if (categories.length === 1) {
      category = categories[0];
    } else {
      // Multiple categories specified - use 'custom' since we can't assign
      // per-pattern categories with the current flat pattern array API
      category = 'custom';
    }

    const patternOptions: CustomPatternOptions = {
      caseInsensitive: config.patternConfig?.caseInsensitive ?? true,
      category,
      severity: 'high',
    };
    guardrails.push(createCustomPatternGuardrail(config.customPatterns, patternOptions));
  }

  // Add custom guardrails
  if (config.custom) {
    guardrails.push(...config.custom);
  }

  return guardrails;
}
