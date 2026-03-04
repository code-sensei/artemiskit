/**
 * Guardian Module - Runtime protection for AI/LLM applications
 *
 * Provides comprehensive guardrails to prevent AI agents from performing
 * harmful or unauthorized actions.
 *
 * @example
 * ```typescript
 * import { Guardian, createGuardian } from '@artemiskit/sdk/guardian';
 *
 * const guardian = createGuardian({
 *   mode: 'guardian',
 *   blockOnFailure: true,
 * });
 *
 * // Wrap your LLM client
 * const protectedClient = guardian.protect(myLLMClient);
 *
 * // Validate tool calls
 * const result = await guardian.validateAction('delete_file', { path: '/etc/passwd' });
 * if (!result.valid) {
 *   console.log('Blocked:', result.violations);
 * }
 * ```
 */

// Main Guardian class
export { Guardian, createGuardian, type GuardianConfig } from './guardian';

// Interceptor
export {
  GuardianInterceptor,
  GuardianBlockedError,
  createInterceptor,
  type InterceptorConfig,
  type InterceptorStats,
  type GuardrailFn,
} from './interceptor';

// Action Validator
export {
  ActionValidator,
  createDefaultActionValidator,
  type ActionValidatorConfig,
  type ActionValidationResult,
} from './action-validator';

// Intent Classifier
export {
  IntentClassifier,
  createIntentClassifier,
  type IntentClassifierConfig,
  type IntentCategory,
} from './intent-classifier';

// Guardrails
export {
  detectInjection,
  createInjectionGuardrail,
  detectPII,
  createPIIGuardrail,
  filterContent,
  createContentFilterGuardrail,
  createGuardrails,
  type GuardrailsConfig,
} from './guardrails';

// Policy
export {
  loadPolicy,
  parsePolicy,
  validatePolicy,
  createDefaultPolicy,
  mergePolicies,
  getRulesByType,
  isRuleEnabled,
  generatePolicyTemplate,
  PolicyLoadError,
  PolicyValidationError,
} from './policy';

// Circuit Breaker and Metrics
export {
  CircuitBreaker,
  MetricsCollector,
  RateLimiter,
  type CircuitBreakerEvent,
  type CircuitBreakerEventHandler,
  type RateLimiterConfig,
} from './circuit-breaker';

// Types
export type {
  // Core types
  GuardianMode,
  ViolationSeverity,
  ViolationAction,
  GuardrailType,
  Violation,
  GuardrailResult,
  // Policy types
  PolicyRule,
  PolicyCondition,
  GuardianPolicy,
  CircuitBreakerConfig,
  RateLimitConfig,
  CostLimitConfig,
  // Action types
  ActionDefinition,
  ActionParameter,
  ParameterValidation,
  // Intent types
  IntentClassification,
  // Detection types
  PIIDetection,
  PIIType,
  PIILocation,
  InjectionDetection,
  InjectionType,
  ContentFilterResult,
  ContentFlag,
  ContentCategory,
  HallucinationCheckResult,
  Citation,
  UnsupportedClaim,
  // Metrics types
  GuardianMetrics,
  CircuitBreakerState,
  CostTracking,
  // Event types
  GuardianEventType,
  GuardianEvent,
  GuardianEventHandler,
  // Interceptor types
  InterceptedRequest,
  InterceptedResponse,
  InterceptedToolCall,
  InterceptedAgentStep,
  // Framework types
  FrameworkType,
  FrameworkIntegrationConfig,
} from './types';
