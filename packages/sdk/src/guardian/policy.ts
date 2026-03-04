/**
 * Policy Loader
 *
 * Loads and validates guardian policies from YAML files.
 * Policies define the guardrails, rules, and configurations for the guardian.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import type {
  CircuitBreakerConfig,
  CostLimitConfig,
  GuardianMode,
  GuardianPolicy,
  GuardrailType,
  PolicyRule,
  RateLimitConfig,
  ViolationAction,
  ViolationSeverity,
} from './types';

// =============================================================================
// Schema Definitions
// =============================================================================

const ViolationSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
const ViolationActionSchema = z.enum(['allow', 'warn', 'block', 'transform']);
const GuardianModeSchema = z.enum(['testing', 'guardian', 'hybrid']);
const GuardrailTypeSchema = z.enum([
  'input_validation',
  'output_validation',
  'action_validation',
  'intent_classification',
  'pii_detection',
  'injection_detection',
  'content_filter',
  'hallucination_check',
  'rate_limit',
  'cost_limit',
]);

const PolicyConditionSchema = z.object({
  field: z.string(),
  operator: z.enum([
    'equals',
    'contains',
    'matches',
    'not_equals',
    'not_contains',
    'greater_than',
    'less_than',
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const PolicyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: GuardrailTypeSchema,
  enabled: z.boolean().default(true),
  severity: ViolationSeveritySchema,
  action: ViolationActionSchema,
  config: z.record(z.unknown()).optional(),
  conditions: z.array(PolicyConditionSchema).optional(),
});

const CircuitBreakerConfigSchema = z.object({
  enabled: z.boolean().default(false),
  threshold: z.number().min(1).default(5),
  windowMs: z.number().min(1000).default(60000),
  cooldownMs: z.number().min(1000).default(300000),
  halfOpenRequests: z.number().min(1).default(3),
});

const RateLimitConfigSchema = z.object({
  enabled: z.boolean().default(false),
  requestsPerMinute: z.number().optional(),
  requestsPerHour: z.number().optional(),
  requestsPerDay: z.number().optional(),
  burstLimit: z.number().optional(),
});

const CostLimitConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxCostPerRequest: z.number().optional(),
  maxCostPerMinute: z.number().optional(),
  maxCostPerHour: z.number().optional(),
  maxCostPerDay: z.number().optional(),
  currency: z.string().default('USD'),
});

const GuardianPolicySchema = z.object({
  name: z.string(),
  version: z.string().default('1.0'),
  description: z.string().optional(),
  mode: GuardianModeSchema.default('guardian'),
  rules: z.array(PolicyRuleSchema).min(1),
  defaults: z
    .object({
      severity: ViolationSeveritySchema.optional(),
      action: ViolationActionSchema.optional(),
    })
    .optional(),
  circuitBreaker: CircuitBreakerConfigSchema.optional(),
  rateLimits: RateLimitConfigSchema.optional(),
  costLimits: CostLimitConfigSchema.optional(),
});

// =============================================================================
// Policy Loader
// =============================================================================

/**
 * Load a guardian policy from a YAML file
 */
export function loadPolicy(filePath: string): GuardianPolicy {
  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    throw new PolicyLoadError(`Policy file not found: ${absolutePath}`);
  }

  try {
    const content = readFileSync(absolutePath, 'utf-8');
    return parsePolicy(content);
  } catch (error) {
    if (error instanceof PolicyLoadError) {
      throw error;
    }
    throw new PolicyLoadError(`Failed to read policy file: ${(error as Error).message}`);
  }
}

/**
 * Parse a guardian policy from YAML string
 */
export function parsePolicy(yamlContent: string): GuardianPolicy {
  let parsed: unknown;

  try {
    parsed = YAML.parse(yamlContent);
  } catch (error) {
    throw new PolicyLoadError(`Invalid YAML: ${(error as Error).message}`);
  }

  const result = GuardianPolicySchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new PolicyValidationError(`Policy validation failed: ${errors}`);
  }

  return result.data as GuardianPolicy;
}

/**
 * Validate a guardian policy object
 */
export function validatePolicy(policy: unknown): GuardianPolicy {
  const result = GuardianPolicySchema.safeParse(policy);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new PolicyValidationError(`Policy validation failed: ${errors}`);
  }

  return result.data as GuardianPolicy;
}

/**
 * Create a default guardian policy
 */
export function createDefaultPolicy(): GuardianPolicy {
  return {
    name: 'default-guardian-policy',
    version: '1.0',
    description: 'Default guardian policy with standard security rules',
    mode: 'guardian' as GuardianMode,
    rules: [
      {
        id: 'injection-detection',
        name: 'Prompt Injection Detection',
        description: 'Detect and block prompt injection attempts',
        type: 'injection_detection' as GuardrailType,
        enabled: true,
        severity: 'critical' as ViolationSeverity,
        action: 'block' as ViolationAction,
      },
      {
        id: 'pii-detection',
        name: 'PII Detection',
        description: 'Detect and redact personally identifiable information',
        type: 'pii_detection' as GuardrailType,
        enabled: true,
        severity: 'high' as ViolationSeverity,
        action: 'transform' as ViolationAction,
        config: {
          redact: true,
          allowedTypes: [],
        },
      },
      {
        id: 'content-filter',
        name: 'Content Filter',
        description: 'Filter harmful content categories',
        type: 'content_filter' as GuardrailType,
        enabled: true,
        severity: 'high' as ViolationSeverity,
        action: 'block' as ViolationAction,
        config: {
          blockedCategories: ['violence', 'hate_speech', 'self_harm', 'dangerous', 'illegal'],
          warnCategories: ['harassment', 'misinformation'],
        },
      },
      {
        id: 'intent-classification',
        name: 'Intent Classification',
        description: 'Classify and assess risky intents',
        type: 'intent_classification' as GuardrailType,
        enabled: true,
        severity: 'medium' as ViolationSeverity,
        action: 'warn' as ViolationAction,
        config: {
          blockHighRisk: true,
          confidenceThreshold: 0.7,
        },
      },
      {
        id: 'action-validation',
        name: 'Action Validation',
        description: 'Validate agent tool/function calls',
        type: 'action_validation' as GuardrailType,
        enabled: true,
        severity: 'high' as ViolationSeverity,
        action: 'block' as ViolationAction,
        config: {
          defaultAllow: false,
          blockHighRisk: true,
        },
      },
    ],
    defaults: {
      severity: 'medium' as ViolationSeverity,
      action: 'warn' as ViolationAction,
    },
    circuitBreaker: {
      enabled: true,
      threshold: 5,
      windowMs: 60000,
      cooldownMs: 300000,
      halfOpenRequests: 3,
    } as CircuitBreakerConfig,
    rateLimits: {
      enabled: true,
      requestsPerMinute: 100,
      requestsPerHour: 1000,
      burstLimit: 20,
    } as RateLimitConfig,
    costLimits: {
      enabled: false,
      currency: 'USD',
    } as CostLimitConfig,
  };
}

/**
 * Merge two policies (second overrides first)
 */
export function mergePolicies(
  base: GuardianPolicy,
  override: Partial<GuardianPolicy>
): GuardianPolicy {
  const merged: GuardianPolicy = {
    ...base,
    ...override,
    name: override.name ?? base.name,
    version: override.version ?? base.version,
    mode: override.mode ?? base.mode,
    rules: override.rules ?? base.rules,
    defaults: {
      ...base.defaults,
      ...override.defaults,
    },
    circuitBreaker: override.circuitBreaker ?? base.circuitBreaker,
    rateLimits: override.rateLimits ?? base.rateLimits,
    costLimits: override.costLimits ?? base.costLimits,
  };

  return merged;
}

/**
 * Get rules by type from a policy
 */
export function getRulesByType(policy: GuardianPolicy, type: GuardrailType): PolicyRule[] {
  return policy.rules.filter((rule) => rule.type === type && rule.enabled);
}

/**
 * Check if a rule is enabled in the policy
 */
export function isRuleEnabled(policy: GuardianPolicy, ruleId: string): boolean {
  const rule = policy.rules.find((r) => r.id === ruleId);
  return rule?.enabled ?? false;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when policy loading fails
 */
export class PolicyLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyLoadError';
  }
}

/**
 * Error thrown when policy validation fails
 */
export class PolicyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyValidationError';
  }
}

// =============================================================================
// Policy Template Generator
// =============================================================================

/**
 * Generate a YAML policy template
 */
export function generatePolicyTemplate(): string {
  return `# Guardian Policy Configuration
# This file defines the guardrails and security rules for your AI/LLM application.

name: my-guardian-policy
version: "1.0"
description: Custom guardian policy

# Operating mode: 'testing', 'guardian', or 'hybrid'
mode: guardian

# Default settings for all rules
defaults:
  severity: medium
  action: warn

# Guardrail rules
rules:
  # Prompt injection detection
  - id: injection-detection
    name: Prompt Injection Detection
    description: Detect and block prompt injection attempts
    type: injection_detection
    enabled: true
    severity: critical
    action: block

  # PII detection and redaction
  - id: pii-detection
    name: PII Detection
    description: Detect and redact personally identifiable information
    type: pii_detection
    enabled: true
    severity: high
    action: transform
    config:
      redact: true
      allowedTypes: []

  # Content filtering
  - id: content-filter
    name: Content Filter
    description: Filter harmful content categories
    type: content_filter
    enabled: true
    severity: high
    action: block
    config:
      blockedCategories:
        - violence
        - hate_speech
        - self_harm
        - dangerous
        - illegal
      warnCategories:
        - harassment
        - misinformation

  # Intent classification
  - id: intent-classification
    name: Intent Classification
    description: Classify and assess risky intents
    type: intent_classification
    enabled: true
    severity: medium
    action: warn
    config:
      blockHighRisk: true
      confidenceThreshold: 0.7

  # Action/tool validation
  - id: action-validation
    name: Action Validation
    description: Validate agent tool and function calls
    type: action_validation
    enabled: true
    severity: high
    action: block
    config:
      defaultAllow: false
      blockHighRisk: true

# Circuit breaker configuration
circuitBreaker:
  enabled: true
  threshold: 5          # Number of violations to trigger
  windowMs: 60000       # Time window in milliseconds (1 minute)
  cooldownMs: 300000    # Cooldown period (5 minutes)
  halfOpenRequests: 3   # Requests to allow in half-open state

# Rate limiting configuration
rateLimits:
  enabled: true
  requestsPerMinute: 100
  requestsPerHour: 1000
  burstLimit: 20

# Cost limiting configuration (optional)
costLimits:
  enabled: false
  maxCostPerRequest: 0.10
  maxCostPerHour: 10.00
  maxCostPerDay: 100.00
  currency: USD
`;
}
