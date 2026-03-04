/**
 * @artemiskit/sdk
 * Programmatic SDK for ArtemisKit LLM evaluation toolkit
 */

// Main class
export { ArtemisKit } from './artemiskit';

// Types
export type {
  // Configuration
  ArtemisKitConfig,
  RunOptions,
  RedTeamOptions,
  StressOptions,
  // Results
  RunResult,
  RedTeamResult,
  StressResult,
  // Events
  CaseStartEvent,
  CaseCompleteEvent,
  ProgressEvent,
  RedTeamMutationStartEvent,
  RedTeamMutationCompleteEvent,
  StressRequestCompleteEvent,
  // Event handlers
  CaseStartHandler,
  CaseCompleteHandler,
  ProgressHandler,
  RedTeamMutationStartHandler,
  RedTeamMutationCompleteHandler,
  StressRequestCompleteHandler,
  // Event emitter
  ArtemisKitEvents,
  ArtemisKitEventName,
} from './types';

// Re-export core types for convenience
export type {
  // Core types
  Scenario,
  TestCase,
  Expected,
  Provider,
  CaseResult,
  RunManifest,
  RedTeamManifest,
  StressManifest,
  RedTeamCaseResult,
  StressRequestResult,
  // Adapter types
  ModelClient,
  AdapterConfig,
  GenerateOptions,
  GenerateResult,
  // Redaction
  RedactionConfig,
} from '@artemiskit/core';

// Re-export redteam types for convenience
export type { Severity, SeverityInfo, CvssScore } from '@artemiskit/redteam';

// Export matchers
export {
  artemiskitMatchers,
  type ArtemisKitMatchers,
  type MatcherResult,
} from './matchers';

// Export guardian module for runtime protection
export {
  // Main Guardian class
  Guardian,
  createGuardian,
  // Interceptor
  GuardianInterceptor,
  GuardianBlockedError,
  createInterceptor,
  // Action Validator
  ActionValidator,
  createDefaultActionValidator,
  // Intent Classifier
  IntentClassifier,
  createIntentClassifier,
  // Guardrails
  detectInjection,
  createInjectionGuardrail,
  detectPII,
  createPIIGuardrail,
  filterContent,
  createContentFilterGuardrail,
  createGuardrails,
  // Policy
  loadPolicy,
  parsePolicy,
  validatePolicy,
  createDefaultPolicy,
  mergePolicies,
  generatePolicyTemplate,
  PolicyLoadError,
  PolicyValidationError,
  // Circuit Breaker and Metrics
  CircuitBreaker,
  MetricsCollector,
  RateLimiter,
} from './guardian';

// Export guardian types
export type {
  // Config types
  GuardianConfig,
  InterceptorConfig,
  ActionValidatorConfig,
  IntentClassifierConfig,
  GuardrailsConfig,
  RateLimiterConfig,
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
  IntentCategory,
  // Detection types
  PIIDetection,
  PIIType,
  PIILocation,
  InjectionDetection,
  InjectionType,
  ContentFilterResult,
  ContentFlag,
  ContentCategory,
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
} from './guardian';
