/**
 * Guardian Mode Types
 *
 * Types and interfaces for the ArtemisKit Guardian Mode -
 * runtime protection and validation for AI/LLM agents.
 */

/**
 * Guardian operating mode
 */
export type GuardianMode = 'testing' | 'guardian' | 'hybrid';

/**
 * Severity levels for violations
 */
export type ViolationSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Action to take when a violation is detected
 */
export type ViolationAction = 'allow' | 'warn' | 'block' | 'transform';

/**
 * Types of guardrails available
 */
export type GuardrailType =
  | 'input_validation'
  | 'output_validation'
  | 'action_validation'
  | 'intent_classification'
  | 'pii_detection'
  | 'injection_detection'
  | 'content_filter'
  | 'hallucination_check'
  | 'rate_limit'
  | 'cost_limit';

/**
 * Violation detected by guardrails
 */
export interface Violation {
  id: string;
  type: GuardrailType;
  severity: ViolationSeverity;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  action: ViolationAction;
  blocked: boolean;
}

/**
 * Result of a guardrail check
 */
export interface GuardrailResult {
  passed: boolean;
  violations: Violation[];
  transformedContent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Policy rule for guardrails
 */
export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  type: GuardrailType;
  enabled: boolean;
  severity: ViolationSeverity;
  action: ViolationAction;
  config?: Record<string, unknown>;
  conditions?: PolicyCondition[];
}

/**
 * Condition for policy rules
 */
export interface PolicyCondition {
  field: string;
  operator:
    | 'equals'
    | 'contains'
    | 'matches'
    | 'not_equals'
    | 'not_contains'
    | 'greater_than'
    | 'less_than';
  value: string | number | boolean | RegExp;
}

/**
 * Guardian policy configuration
 */
export interface GuardianPolicy {
  name: string;
  version: string;
  description?: string;
  mode: GuardianMode;
  rules: PolicyRule[];
  defaults?: {
    severity?: ViolationSeverity;
    action?: ViolationAction;
  };
  circuitBreaker?: CircuitBreakerConfig;
  rateLimits?: RateLimitConfig;
  costLimits?: CostLimitConfig;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  enabled: boolean;
  threshold: number;
  windowMs: number;
  cooldownMs: number;
  halfOpenRequests?: number;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  burstLimit?: number;
}

/**
 * Cost limiting configuration
 */
export interface CostLimitConfig {
  enabled: boolean;
  maxCostPerRequest?: number;
  maxCostPerMinute?: number;
  maxCostPerHour?: number;
  maxCostPerDay?: number;
  currency?: string;
}

/**
 * Action definition for agent tool/function calls
 */
export interface ActionDefinition {
  name: string;
  description?: string;
  category?: string;
  riskLevel?: ViolationSeverity;
  parameters?: ActionParameter[];
  allowed?: boolean;
  requiresApproval?: boolean;
  maxCallsPerMinute?: number;
}

/**
 * Action parameter definition
 */
export interface ActionParameter {
  name: string;
  type: string;
  required?: boolean;
  validation?: ParameterValidation;
}

/**
 * Parameter validation rules
 */
export interface ParameterValidation {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  allowedValues?: (string | number)[];
  blockedValues?: (string | number)[];
  blockedPatterns?: string[];
}

/**
 * Intent classification result
 */
export interface IntentClassification {
  intent: string;
  confidence: number;
  category?: string;
  riskLevel?: ViolationSeverity;
  subIntents?: IntentClassification[];
}

/**
 * PII detection result
 */
export interface PIIDetection {
  found: boolean;
  types: PIIType[];
  locations: PIILocation[];
  redactedContent?: string;
}

/**
 * Types of PII that can be detected
 */
export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'address'
  | 'name'
  | 'date_of_birth'
  | 'password'
  | 'api_key'
  | 'jwt_token'
  | 'custom';

/**
 * Location of detected PII
 */
export interface PIILocation {
  type: PIIType;
  start: number;
  end: number;
  value?: string;
  masked?: string;
}

/**
 * Injection detection result
 */
export interface InjectionDetection {
  detected: boolean;
  type?: InjectionType;
  confidence: number;
  pattern?: string;
  location?: { start: number; end: number };
}

/**
 * Types of injections that can be detected
 */
export type InjectionType =
  | 'prompt_injection'
  | 'jailbreak'
  | 'role_hijack'
  | 'instruction_override'
  | 'data_extraction'
  | 'system_prompt_leak'
  | 'delimiter_attack'
  | 'encoding_attack';

/**
 * Content filter result
 */
export interface ContentFilterResult {
  passed: boolean;
  flags: ContentFlag[];
  categories: ContentCategory[];
}

/**
 * Content flag
 */
export interface ContentFlag {
  category: ContentCategory;
  severity: ViolationSeverity;
  confidence: number;
  snippet?: string;
}

/**
 * Content categories for filtering
 */
export type ContentCategory =
  | 'violence'
  | 'hate_speech'
  | 'sexual'
  | 'self_harm'
  | 'dangerous'
  | 'illegal'
  | 'harassment'
  | 'misinformation'
  | 'spam'
  | 'profanity';

/**
 * Hallucination check result
 */
export interface HallucinationCheckResult {
  passed: boolean;
  confidence: number;
  citations?: Citation[];
  unsupportedClaims?: UnsupportedClaim[];
}

/**
 * Citation for hallucination checking
 */
export interface Citation {
  claim: string;
  source?: string;
  verified: boolean;
}

/**
 * Unsupported claim detected
 */
export interface UnsupportedClaim {
  claim: string;
  reason: string;
  suggestedFix?: string;
}

/**
 * Guardian metrics
 */
export interface GuardianMetrics {
  totalRequests: number;
  blockedRequests: number;
  warnedRequests: number;
  allowedRequests: number;
  violationsByType: Record<GuardrailType, number>;
  violationsBySeverity: Record<ViolationSeverity, number>;
  averageLatencyMs: number;
  circuitBreakerState: CircuitBreakerState;
  requestsPerSecond: number;
  costTracking?: CostTracking;
}

/**
 * Circuit breaker state
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Cost tracking metrics
 */
export interface CostTracking {
  totalCost: number;
  costPerMinute: number;
  costPerHour: number;
  costPerDay: number;
  currency: string;
}

/**
 * Guardian event types
 */
export type GuardianEventType =
  | 'request_start'
  | 'request_complete'
  | 'violation_detected'
  | 'request_blocked'
  | 'circuit_breaker_open'
  | 'circuit_breaker_close'
  | 'rate_limit_exceeded'
  | 'cost_limit_exceeded';

/**
 * Guardian event
 */
export interface GuardianEvent {
  type: GuardianEventType;
  timestamp: Date;
  data: Record<string, unknown>;
}

/**
 * Guardian event handler
 */
export type GuardianEventHandler = (event: GuardianEvent) => void;

/**
 * Input/output wrapper for interceptor
 */
export interface InterceptedRequest {
  id: string;
  input: string | unknown[];
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Intercepted response
 */
export interface InterceptedResponse {
  id: string;
  requestId: string;
  output: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  latencyMs: number;
}

/**
 * Framework integration types
 */
export type FrameworkType = 'langchain' | 'crewai' | 'autogen' | 'custom';

/**
 * Framework integration config
 */
export interface FrameworkIntegrationConfig {
  framework: FrameworkType;
  enabled: boolean;
  interceptTools?: boolean;
  interceptMessages?: boolean;
  interceptAgentSteps?: boolean;
}

/**
 * Tool call intercepted from agentic frameworks
 */
export interface InterceptedToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  agentId?: string;
  timestamp: Date;
}

/**
 * Agent step intercepted from agentic frameworks
 */
export interface InterceptedAgentStep {
  id: string;
  agentId: string;
  stepType: 'plan' | 'execute' | 'observe' | 'reflect';
  input: unknown;
  output?: unknown;
  timestamp: Date;
}
