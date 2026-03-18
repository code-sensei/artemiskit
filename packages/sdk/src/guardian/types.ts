/**
 * Guardian Mode Types
 *
 * Types and interfaces for the ArtemisKit Guardian Mode -
 * runtime protection and validation for AI/LLM agents.
 */

/**
 * Guardian operating mode
 *
 * Canonical modes (recommended):
 * - 'observe': Log only, never block
 * - 'selective': Block high-confidence threats
 * - 'strict': Block all detected violations
 *
 * Legacy modes (deprecated, still supported):
 * - 'testing' → maps to 'observe'
 * - 'guardian' → maps to 'strict'
 * - 'hybrid' → maps to 'selective'
 */
export type GuardianMode = 'testing' | 'guardian' | 'hybrid' | 'observe' | 'selective' | 'strict';

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

// =============================================================================
// Guardian Mode Types (v0.3.2+)
// =============================================================================

/**
 * Canonical Guardian operating modes (v0.3.2+)
 *
 * - observe: Log only, never block (for monitoring and testing)
 * - selective: Block high-confidence threats only (threshold-based)
 * - strict: Block all detected violations (maximum protection)
 */
export type GuardianModeCanonical = 'observe' | 'selective' | 'strict';

/**
 * Legacy Guardian modes (deprecated, use canonical modes)
 * @deprecated Use GuardianModeCanonical instead
 *
 * Mapping:
 * - 'testing' → 'observe'
 * - 'guardian' → 'strict'
 * - 'hybrid' → 'selective'
 */
export type GuardianModeLegacy = 'testing' | 'guardian' | 'hybrid';

/**
 * All supported Guardian modes (canonical + legacy for backwards compatibility)
 */
export type GuardianModeAll = GuardianModeCanonical | GuardianModeLegacy;

// =============================================================================
// Content Validation Types (v0.3.2+)
// =============================================================================

/**
 * Validation categories for content checking
 * These define what types of threats/issues to validate for
 */
export type ValidationCategory =
  | 'prompt_injection'
  | 'jailbreak'
  | 'pii_disclosure'
  | 'role_manipulation'
  | 'data_extraction'
  | 'content_safety';

/**
 * Pattern matching categories for granular control
 */
export type PatternCategory =
  | 'injection'
  | 'pii'
  | 'role_hijack'
  | 'extraction'
  | 'tool_abuse'
  | 'content_filter'
  | 'custom';

/**
 * Pattern matching configuration
 */
export interface PatternConfig {
  /** Enable pattern matching (default: true when strategy is 'pattern' or 'hybrid') */
  enabled?: boolean;

  /** Case-insensitive matching (default: true) */
  caseInsensitive?: boolean;

  /** Custom patterns to add */
  customPatterns?: string[];

  /** Pattern categories to enable (default: all) */
  categories?: PatternCategory[];
}

/**
 * Content validation strategy configuration
 */
export interface ContentValidationConfig {
  /**
   * Validation strategy
   * - 'semantic': LLM-based validation (default, recommended)
   * - 'pattern': Regex/pattern-based validation only
   * - 'hybrid': Both semantic and pattern validation
   * - 'off': Disable content validation
   */
  strategy: 'semantic' | 'pattern' | 'hybrid' | 'off';

  /** Confidence threshold for semantic validation (0-1, default: 0.9) */
  semanticThreshold?: number;

  /** Categories to validate (default: all) */
  categories?: ValidationCategory[];

  /** Pattern matching configuration (supplementary when strategy != 'pattern') */
  patterns?: PatternConfig;
}

/**
 * Result from semantic validation
 */
export interface SemanticValidationResult {
  /** Whether content passed validation */
  valid: boolean;

  /** Confidence score (0-1) */
  confidence: number;

  /** Detected category if invalid */
  category?: ValidationCategory;

  /** Human-readable reason */
  reason?: string;

  /** Whether this should block based on threshold */
  shouldBlock: boolean;

  /** Raw LLM response for debugging */
  rawResponse?: string;
}

// =============================================================================
// Multi-Turn Detection Types (v0.3.3+)
// =============================================================================

/**
 * Storage type for sessions
 */
export type SessionStorageType = 'memory' | 'local' | 'supabase';

/**
 * Session storage configuration
 */
export interface SessionStorageConfig {
  /** Storage type */
  type: SessionStorageType;

  /** Base path for local storage (default: '.artemis/sessions') */
  basePath?: string;

  /** Supabase table name (default: 'guardian_sessions') */
  tableName?: string;
}

/**
 * Individual message in a conversation session
 */
export interface SessionMessage {
  /** Message role */
  role: 'user' | 'assistant';

  /** Message content */
  content: string;

  /** When message was sent */
  timestamp: Date;

  /** Risk score for this message (0-1) */
  riskScore?: number;

  /** Detection flags triggered */
  flags?: string[];
}

/**
 * Session metrics for tracking conversation patterns
 */
export interface SessionMetrics {
  /** Total messages in session */
  messageCount: number;

  /** Trust-building score accumulator (0-1) */
  trustBuildingScore: number;

  /** Number of risk score increases */
  escalationCount: number;

  /** Most recent message risk score */
  lastRiskScore: number;

  /** Risk trend direction */
  riskTrend: 'stable' | 'increasing' | 'decreasing';
}

/**
 * Conversation session for multi-turn tracking
 */
export interface ConversationSession {
  /** Unique session identifier */
  sessionId: string;

  /** When session was created */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Session expiration time */
  expiresAt: Date;

  /** Messages in the session */
  messages: SessionMessage[];

  /** Session metrics */
  metrics: SessionMetrics;
}

/**
 * Trust-building detection heuristic config
 */
export interface TrustBuildingHeuristicConfig {
  /** Enable this heuristic */
  enabled: boolean;

  /** Score threshold to flag (default: 0.7) */
  threshold?: number;
}

/**
 * Escalation detection heuristic config
 */
export interface EscalationHeuristicConfig {
  /** Enable this heuristic */
  enabled: boolean;

  /** Number of consecutive increases to flag (default: 3) */
  consecutiveIncreases?: number;

  /** Minimum risk increase per message to count (default: 0.15) */
  minIncrement?: number;
}

/**
 * Context manipulation detection heuristic config
 */
export interface ContextManipulationHeuristicConfig {
  /** Enable this heuristic */
  enabled: boolean;

  /** Patterns that indicate claimed prior agreement */
  claimPatterns?: string[];
}

/**
 * Split payload detection heuristic config
 */
export interface SplitPayloadHeuristicConfig {
  /** Enable this heuristic */
  enabled: boolean;

  /** How many recent messages to combine for detection (default: 5) */
  combineWindow?: number;
}

/**
 * Multi-turn detection heuristics configuration
 */
export interface MultiTurnHeuristics {
  /** Detect trust-building patterns before sensitive requests */
  trustBuilding?: TrustBuildingHeuristicConfig;

  /** Detect escalating risk across messages */
  escalation?: EscalationHeuristicConfig;

  /** Detect false claims about prior conversation */
  contextManipulation?: ContextManipulationHeuristicConfig;

  /** Detect attack payloads split across messages */
  splitPayload?: SplitPayloadHeuristicConfig;
}

/**
 * LLM-based semantic analysis for multi-turn detection
 */
export interface MultiTurnSemanticConfig {
  /** Enable semantic analysis */
  enabled: boolean;

  /** Use same LLM client as Guardian (default: true) */
  useSameLLM?: boolean;

  /** Confidence threshold for flagging (default: 0.85) */
  threshold?: number;
}

/**
 * Multi-turn detection configuration
 */
export interface MultiTurnConfig {
  /** Enable multi-turn detection */
  enabled: boolean;

  /** Number of messages to keep in sliding window (default: 10) */
  windowSize?: number;

  /** Session timeout in ms (default: 3600000 = 1 hour) */
  timeout?: number;

  /** Session storage configuration */
  storage: SessionStorageConfig | 'memory';

  /** Detection heuristics (all enabled by default) */
  heuristics?: MultiTurnHeuristics;

  /** LLM-based semantic analysis */
  semanticAnalysis?: MultiTurnSemanticConfig;
}

/**
 * Individual heuristic result
 */
export interface HeuristicResult {
  /** Name of the heuristic */
  name: string;

  /** Whether this heuristic was triggered */
  triggered: boolean;

  /** Confidence/score for this heuristic */
  score: number;

  /** Details about what triggered it */
  details?: Record<string, unknown>;
}

/**
 * Combined results from all heuristics
 */
export interface HeuristicResults {
  /** Trust-building detection result */
  trustBuilding?: HeuristicResult;

  /** Escalation detection result */
  escalation?: HeuristicResult;

  /** Context manipulation detection result */
  contextManipulation?: HeuristicResult;

  /** Split payload detection result */
  splitPayload?: HeuristicResult;
}

/**
 * Result from multi-turn validation
 */
export interface MultiTurnValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Session identifier */
  sessionId: string;

  /** Index of this message in the session */
  messageIndex: number;

  /** Single-message risk score (0-1) */
  messageRisk: number;

  /** Conversation-level risk score (0-1) */
  conversationRisk: number;

  /** Individual heuristic flags */
  flags: {
    trustBuildingDetected: boolean;
    escalationPattern: boolean;
    contextManipulation: boolean;
    splitPayloadScore: number;
  };

  /** Semantic analysis result (if enabled) */
  semanticAnalysis?: {
    confidence: number;
    category?: string;
    reason?: string;
  };

  /** Recommended action based on all signals */
  recommendation: 'allow' | 'warn' | 'verify' | 'block';

  /** Detailed violations if any */
  violations: Violation[];
}

/**
 * Options for validating a message with session context
 */
export interface ValidateMessageOptions {
  /** Session identifier */
  sessionId: string;

  /** Message to validate */
  message: string;

  /** Message role (default: 'user') */
  role?: 'user' | 'assistant';

  /** Optional: provide history instead of relying on storage */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}
