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
