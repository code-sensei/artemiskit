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
  // Validation types (v0.3.2+)
  ValidateOptions,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ScenarioValidation,
  // Comparison types (v0.3.2+)
  CompareOptions,
  CompareResult,
  RunSummary,
  ComparisonDetails,
} from './types';

// ============================================================================
// Core Types - Scenarios & Test Cases
// ============================================================================

export type {
  Scenario,
  TestCase,
  Expected,
  Provider,
  ProviderConfig,
  ChatMessageType,
  Variables,
} from '@artemiskit/core';

// ============================================================================
// Core Types - Results & Manifests
// ============================================================================

export type {
  // Case results
  CaseResult,
  CaseRedactionInfo,
  // Run manifest
  RunManifest,
  RunConfig,
  RunMetrics,
  // Red team manifest
  RedTeamManifest,
  RedTeamConfig,
  RedTeamMetrics,
  RedTeamCaseResult,
  RedTeamStatus,
  RedTeamSeverity,
  // Stress manifest
  StressManifest,
  StressConfig,
  StressMetrics,
  StressRequestResult,
  // Common
  AnyManifest,
  ResolvedConfig,
  ConfigSource,
  ManifestRedactionInfo,
  CostEstimateInfo,
  GitInfo,
  ProvenanceInfo,
} from '@artemiskit/core';

// ============================================================================
// Core Types - Adapters
// ============================================================================

export type {
  // Client interface
  ModelClient,
  ModelCapabilities,
  // Request/Response
  GenerateOptions,
  GenerateResult,
  TokenUsage,
  // Messages
  ChatMessage,
  // Function/Tool calling
  FunctionDefinition,
  ToolDefinition,
  ToolCall,
  // Config types
  AdapterConfig,
  BaseAdapterConfig,
  OpenAIAdapterConfig,
  AzureOpenAIAdapterConfig,
  VercelAIAdapterConfig,
  AnthropicAdapterConfig,
  LangChainAdapterConfig,
  DeepAgentsAdapterConfig,
  ProviderType,
} from '@artemiskit/core';

// ============================================================================
// Core Types - Evaluators
// ============================================================================

export type { Evaluator, EvaluatorContext, EvaluatorResult } from '@artemiskit/core';

// ============================================================================
// Core Types - Storage
// ============================================================================

export type {
  StorageAdapter,
  StorageConfig,
  RunListItem,
  ListOptions,
  ComparisonResult,
  BaselineMetadata,
  BaselineStorageAdapter,
  // Analytics
  CaseResultRecord,
  CaseResultStatus,
  CaseResultQueryOptions,
  MetricsSnapshot,
  MetricsTrendOptions,
  TrendDataPoint,
  AnalyticsStorageAdapter,
} from '@artemiskit/core';

// ============================================================================
// Core Types - Redaction
// ============================================================================

export type { RedactionConfig } from '@artemiskit/core';

// ============================================================================
// Core Functions - Type Guards (from core)
// ============================================================================

export { isRunManifest, isRedTeamManifest, isStressManifest } from '@artemiskit/core';

// ============================================================================
// Redteam Types
// ============================================================================

export type { Severity, SeverityInfo, CvssScore } from '@artemiskit/redteam';

// ============================================================================
// Matchers
// ============================================================================

export { artemiskitMatchers, type ArtemisKitMatchers, type MatcherResult } from './matchers';

// ============================================================================
// Utility Types & Functions
// ============================================================================

export {
  // Type guards for results
  isRunResult,
  isRedTeamResult,
  isStressResult,
  isRunManifestType,
  isRedTeamManifestType,
  isStressManifestType,
  // Assertion helpers
  assertDefined,
  assert,
  // Result analysis helpers
  getFailedCases,
  getPassedCases,
  getCasesByTag,
  calculateSuccessRate,
} from './utils';

export type {
  // Provider/Expectation types
  ProviderName,
  ExpectationType,
  // Result types
  AnyResult,
  ExtractRunCases,
  ExtractRedTeamCases,
  ExtractStressResults,
  ExtractManifest,
  // Partial types
  DeepPartial,
  PartialScenario,
  RequireFields,
  OptionalFields,
  StrictAdapterConfig,
} from './utils';

// ============================================================================
// Contracts for Custom Implementations
// ============================================================================

export {
  // Adapter contract
  defineAdapter,
  // Evaluator contract
  defineEvaluator,
  // Storage contract
  defineStorage,
  // Plugin system
  definePlugin,
} from './contracts';

export type {
  AdapterContract,
  EvaluatorContract,
  StorageContract,
  AdapterFactory,
  EvaluatorFactory,
  StorageFactory,
  ArtemisKitPlugin,
} from './contracts';

// ============================================================================
// Builders for Programmatic Scenario Construction
// ============================================================================

export {
  // Builder classes
  ScenarioBuilder,
  TestCaseBuilder,
  // Factory functions
  scenario,
  testCase,
  // Quick helpers
  containsCase,
  exactCase,
  regexCase,
  jsonCase,
  gradedCase,
  // Expectation helpers
  exact,
  contains,
  notContains,
  regex,
  fuzzy,
  jsonSchema,
  llmGrade,
  similarity,
  inline,
  allOf,
  anyOf,
} from './builders';

// ============================================================================
// Guardian Module - Runtime Protection
// ============================================================================

export {
  // Main Guardian class
  Guardian,
  createGuardian,
  // Mode normalization (v0.3.2+)
  normalizeGuardianMode,
  // Semantic Validator (v0.3.2+)
  SemanticValidator,
  createSemanticValidator,
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
  // Pattern matching utilities (v0.3.2+)
  matchPattern,
  createCustomPatternGuardrail,
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
  CustomPatternOptions,
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
  // Mode types (v0.3.2+)
  GuardianModeCanonical,
  GuardianModeLegacy,
  GuardianModeAll,
  // Content validation types (v0.3.2+)
  ContentValidationConfig,
  PatternConfig,
  ValidationCategory,
  PatternCategory,
  SemanticValidationResult,
  // Multi-turn detection types (v0.3.3+)
  SessionStorageType,
  SessionStorageConfig,
  SessionMessage,
  SessionMetrics,
  ConversationSession,
  TrustBuildingHeuristicConfig,
  EscalationHeuristicConfig,
  ContextManipulationHeuristicConfig,
  SplitPayloadHeuristicConfig,
  MultiTurnHeuristics,
  MultiTurnSemanticConfig,
  MultiTurnConfig,
  HeuristicResult,
  HeuristicResults,
  MultiTurnValidationResult,
  ValidateMessageOptions,
} from './guardian';
