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
