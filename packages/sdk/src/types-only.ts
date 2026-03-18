/**
 * @artemiskit/sdk/types
 * Types-only exports for consumers who only need type definitions
 *
 * Use this export when you only need types for type-checking
 * without importing any runtime code.
 *
 * @example
 * ```typescript
 * import type {
 *   Scenario,
 *   TestCase,
 *   RunResult,
 *   ArtemisKitConfig
 * } from '@artemiskit/sdk/types'
 * ```
 */

// ============================================================================
// SDK Types
// ============================================================================

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
// Redteam Types
// ============================================================================

export type { Severity, SeverityInfo, CvssScore } from '@artemiskit/redteam';

// ============================================================================
// Guardian Types
// ============================================================================

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

// ============================================================================
// Matcher Types
// ============================================================================

export type { ArtemisKitMatchers, MatcherResult } from './matchers';

// ============================================================================
// Utility Types
// ============================================================================

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
// Contract Types
// ============================================================================

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
// Builder Types
// ============================================================================

export type { ScenarioBuilder, TestCaseBuilder } from './builders';
