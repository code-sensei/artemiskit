/**
 * @artemiskit/sdk
 * Type definitions for the programmatic SDK
 */

import type {
  AdapterConfig,
  CaseResult,
  ModelClient,
  RedTeamManifest,
  RunManifest,
  StorageConfig,
  StressManifest,
  StressRequestResult,
} from '@artemiskit/core';
import type { RedactionConfig } from '@artemiskit/core';
import type { Scenario } from '@artemiskit/core';

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event emitted when a test case starts
 */
export interface CaseStartEvent {
  caseId: string;
  caseName?: string;
  index: number;
  total: number;
}

/**
 * Event emitted when a test case completes
 */
export interface CaseCompleteEvent {
  result: CaseResult;
  index: number;
  total: number;
}

/**
 * Event emitted for progress updates
 */
export interface ProgressEvent {
  message: string;
  phase: 'setup' | 'running' | 'teardown';
  progress?: number; // 0-100 percentage
}

/**
 * Event emitted when a red team mutation starts
 */
export interface RedTeamMutationStartEvent {
  mutation: string;
  caseId: string;
  index: number;
  total: number;
}

/**
 * Event emitted when a red team mutation completes
 */
export interface RedTeamMutationCompleteEvent {
  mutation: string;
  caseId: string;
  status: 'safe' | 'unsafe' | 'blocked' | 'error';
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  index: number;
  total: number;
}

/**
 * Event emitted for stress test request completion
 */
export interface StressRequestCompleteEvent {
  result: StressRequestResult;
  index: number;
  total: number;
  currentRPS: number;
}

// ============================================================================
// Event Handler Types
// ============================================================================

export type CaseStartHandler = (event: CaseStartEvent) => void;
export type CaseCompleteHandler = (event: CaseCompleteEvent) => void;
export type ProgressHandler = (event: ProgressEvent) => void;
export type RedTeamMutationStartHandler = (event: RedTeamMutationStartEvent) => void;
export type RedTeamMutationCompleteHandler = (event: RedTeamMutationCompleteEvent) => void;
export type StressRequestCompleteHandler = (event: StressRequestCompleteEvent) => void;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * SDK-level configuration options
 */
export interface ArtemisKitConfig {
  /** Project name for manifest grouping */
  project?: string;
  /** Default provider to use */
  provider?: AdapterConfig['provider'];
  /** Default model to use */
  model?: string;
  /** Provider-specific configuration */
  providerConfig?: Partial<AdapterConfig>;
  /** Default redaction settings */
  redaction?: RedactionConfig;
  /** Default timeout per case in milliseconds */
  timeout?: number;
  /** Default number of retries per case */
  retries?: number;
  /** Default concurrency for parallel execution */
  concurrency?: number;
  /**
   * Storage configuration for persisting and loading run manifests
   * Required for compare() method to load historical runs
   * @since 0.3.2
   */
  storage?: StorageConfig;
}

/**
 * Options for running test scenarios
 */
export interface RunOptions {
  /** Path to scenario file or inline Scenario object */
  scenario: string | Scenario;
  /** Override provider */
  provider?: AdapterConfig['provider'];
  /** Override model */
  model?: string;
  /** Provider-specific configuration override */
  providerConfig?: Partial<AdapterConfig>;
  /** Pre-configured model client (skips adapter creation) */
  client?: ModelClient;
  /** Filter test cases by tags */
  tags?: string[];
  /** Number of concurrent requests */
  concurrency?: number;
  /** Timeout per case in milliseconds */
  timeout?: number;
  /** Number of retries per case */
  retries?: number;
  /** Redaction configuration */
  redaction?: RedactionConfig;
}

/**
 * Options for red team testing
 */
export interface RedTeamOptions {
  /** Path to scenario file or inline Scenario object */
  scenario: string | Scenario;
  /** Override provider */
  provider?: AdapterConfig['provider'];
  /** Override model */
  model?: string;
  /** Provider-specific configuration override */
  providerConfig?: Partial<AdapterConfig>;
  /** Pre-configured model client (skips adapter creation) */
  client?: ModelClient;
  /** Mutations to apply (default: all) */
  mutations?: string[];
  /** Number of mutations per case */
  countPerCase?: number;
  /** Filter test cases by tags */
  tags?: string[];
  /** Timeout per case in milliseconds */
  timeout?: number;
  /** Redaction configuration */
  redaction?: RedactionConfig;
}

/**
 * Options for stress testing
 */
export interface StressOptions {
  /** Path to scenario file or inline Scenario object */
  scenario: string | Scenario;
  /** Override provider */
  provider?: AdapterConfig['provider'];
  /** Override model */
  model?: string;
  /** Provider-specific configuration override */
  providerConfig?: Partial<AdapterConfig>;
  /** Pre-configured model client (skips adapter creation) */
  client?: ModelClient;
  /** Number of concurrent requests */
  concurrency?: number;
  /** Test duration in seconds */
  duration?: number;
  /** Ramp-up period in seconds */
  rampUp?: number;
  /** Maximum number of requests (optional limit) */
  maxRequests?: number;
  /** Redaction configuration */
  redaction?: RedactionConfig;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result from a test scenario run
 */
export interface RunResult {
  /** The generated manifest */
  manifest: RunManifest;
  /** Individual case results */
  cases: CaseResult[];
  /** Whether all cases passed */
  success: boolean;
}

/**
 * Result from a red team test run
 */
export interface RedTeamResult {
  /** The generated manifest */
  manifest: RedTeamManifest;
  /** Whether the defense rate is acceptable (>= threshold) */
  success: boolean;
  /** Defense rate (0-1) */
  defenseRate: number;
  /** Count of unsafe responses */
  unsafeCount: number;
}

/**
 * Result from a stress test run
 */
export interface StressResult {
  /** The generated manifest */
  manifest: StressManifest;
  /** Whether the test passed success rate threshold */
  success: boolean;
  /** Success rate (0-1) */
  successRate: number;
  /** Requests per second achieved */
  rps: number;
  /** P95 latency in milliseconds */
  p95LatencyMs: number;
}

// ============================================================================
// Event Emitter Interface
// ============================================================================

/**
 * Event types supported by ArtemisKit
 */
export interface ArtemisKitEvents {
  caseStart: CaseStartEvent;
  caseComplete: CaseCompleteEvent;
  progress: ProgressEvent;
  redteamMutationStart: RedTeamMutationStartEvent;
  redteamMutationComplete: RedTeamMutationCompleteEvent;
  stressRequestComplete: StressRequestCompleteEvent;
}

export type ArtemisKitEventName = keyof ArtemisKitEvents;

// ============================================================================
// Validation Types (v0.3.2+)
// ============================================================================

/**
 * Options for validating scenario files
 */
export interface ValidateOptions {
  /**
   * Scenario file path(s) or glob pattern
   * Can be a single path, array of paths, or glob pattern
   */
  scenario: string | string[];

  /**
   * Strict mode - fail on warnings as well as errors
   * @default false
   */
  strict?: boolean;
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** File path where error occurred */
  file: string;
  /** Error message */
  message: string;
  /** Line number if available */
  line?: number;
  /** Column number if available */
  column?: number;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  /** File path where warning occurred */
  file: string;
  /** Warning message */
  message: string;
  /** Line number if available */
  line?: number;
  /** Column number if available */
  column?: number;
}

/**
 * Per-scenario validation result
 */
export interface ScenarioValidation {
  /** File path */
  file: string;
  /** Scenario name */
  name: string;
  /** Number of test cases */
  caseCount: number;
  /** Whether this scenario is valid */
  valid: boolean;
}

/**
 * Result from validate() method
 */
export interface ValidationResult {
  /** Overall validation passed */
  valid: boolean;
  /** Individual scenario validation results */
  scenarios: ScenarioValidation[];
  /** Validation errors */
  errors: ValidationError[];
  /** Validation warnings (informational) */
  warnings: ValidationWarning[];
}

// ============================================================================
// Comparison Types (v0.3.2+)
// ============================================================================

/**
 * Options for comparing test runs
 */
export interface CompareOptions {
  /**
   * Baseline run identifier
   * Can be a run ID, 'latest', or a named baseline
   */
  baseline: string;

  /**
   * Current run identifier
   * Can be a run ID
   */
  current: string;

  /**
   * Regression threshold (0-1)
   * A regression is detected if success rate drops by more than this amount
   * @default 0.05 (5%)
   */
  threshold?: number;
}

/**
 * Summary of a run for comparison
 */
export interface RunSummary {
  /** Run identifier */
  runId: string;
  /** Success rate (0-1) */
  successRate: number;
  /** Total number of test cases */
  totalCases: number;
  /** Number of passed cases */
  passedCases: number;
  /** Number of failed cases */
  failedCases: number;
}

/**
 * Comparison details between two runs
 */
export interface ComparisonDetails {
  /** Change in success rate (current - baseline) */
  successRateDelta: number;
  /** Cases that passed in baseline but failed in current */
  newFailures: Array<{
    caseId: string;
    caseName?: string;
    baselineStatus: string;
    currentStatus: string;
  }>;
  /** Cases that failed in baseline but passed in current */
  newPasses: Array<{
    caseId: string;
    caseName?: string;
    baselineStatus: string;
    currentStatus: string;
  }>;
  /** Cases with unchanged status */
  unchanged: Array<{
    caseId: string;
    status: string;
  }>;
  /** Cases that exist in current run but not in baseline (new test cases) */
  addedCases: Array<{
    caseId: string;
    caseName?: string;
    status: string;
  }>;
  /** Cases that exist in baseline but not in current run (removed test cases) */
  removedCases: Array<{
    caseId: string;
    caseName?: string;
    status: string;
  }>;
}

/**
 * Result from compare() method
 */
export interface CompareResult {
  /** Baseline run summary */
  baseline: RunSummary;
  /** Current run summary */
  current: RunSummary;
  /** Detailed comparison */
  comparison: ComparisonDetails;
  /** Whether a regression was detected */
  hasRegression: boolean;
  /** Threshold used for regression detection */
  threshold: number;
}
