/**
 * Storage types and interfaces
 */

import type { AnyManifest, RedTeamManifest, RunManifest, StressManifest } from '../artifacts/types';

/**
 * Run listing item
 */
export interface RunListItem {
  runId: string;
  scenario: string;
  successRate: number;
  createdAt: string;
  /** Type of manifest (run, redteam, stress) */
  type?: 'run' | 'redteam' | 'stress';
  /** Estimated cost in USD (optional, included when --show-cost is used) */
  estimatedCostUsd?: number;
}

/**
 * Comparison result between two runs
 */
export interface ComparisonResult {
  baseline: RunManifest;
  current: RunManifest;
  delta: {
    successRate: number;
    latency: number;
    tokens: number;
  };
}

/**
 * List options for filtering runs
 */
export interface ListOptions {
  project?: string;
  scenario?: string;
  limit?: number;
  offset?: number;
  /** Filter by manifest type */
  type?: 'run' | 'redteam' | 'stress';
  /** Include cost information in results */
  includeCost?: boolean;
}

/**
 * Storage adapter interface - implement to create custom storage backends
 */
export interface StorageAdapter {
  /**
   * Save a run manifest (any type)
   */
  save(manifest: AnyManifest): Promise<string>;

  /**
   * Load a run manifest by ID
   */
  load(runId: string): Promise<AnyManifest>;

  /**
   * Load a standard run manifest by ID
   */
  loadRun?(runId: string): Promise<RunManifest>;

  /**
   * Load a red team manifest by ID
   */
  loadRedTeam?(runId: string): Promise<RedTeamManifest>;

  /**
   * Load a stress manifest by ID
   */
  loadStress?(runId: string): Promise<StressManifest>;

  /**
   * List runs with optional filters
   */
  list(options?: ListOptions): Promise<RunListItem[]>;

  /**
   * Delete a run
   */
  delete(runId: string): Promise<void>;

  /**
   * Compare two runs
   */
  compare?(baselineId: string, currentId: string): Promise<ComparisonResult>;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  type: 'supabase' | 'local';
  url?: string;
  anonKey?: string;
  bucket?: string;
  basePath?: string;
}

/**
 * Baseline metadata for regression comparison
 */
export interface BaselineMetadata {
  /** Scenario name or identifier */
  scenario: string;
  /** Run ID of the baseline */
  runId: string;
  /** ISO timestamp when baseline was set */
  createdAt: string;
  /** Key metrics captured at baseline time */
  metrics: {
    successRate: number;
    medianLatencyMs: number;
    totalTokens: number;
    passedCases: number;
    failedCases: number;
    totalCases: number;
  };
  /** Optional description or tag */
  tag?: string;
}

/**
 * Extended storage adapter with baseline support
 */
export interface BaselineStorageAdapter extends StorageAdapter {
  /**
   * Set a baseline for a scenario
   */
  setBaseline(scenario: string, runId: string, tag?: string): Promise<BaselineMetadata>;

  /**
   * Get the baseline by scenario name
   */
  getBaseline(scenario: string): Promise<BaselineMetadata | null>;

  /**
   * Get the baseline by run ID
   */
  getBaselineByRunId(runId: string): Promise<BaselineMetadata | null>;

  /**
   * List all baselines
   */
  listBaselines(): Promise<BaselineMetadata[]>;

  /**
   * Remove a baseline by scenario name
   */
  removeBaseline(scenario: string): Promise<boolean>;

  /**
   * Remove a baseline by run ID
   */
  removeBaselineByRunId(runId: string): Promise<boolean>;

  /**
   * Compare a run against its baseline (if exists)
   * @param runId - The run ID to compare
   * @param regressionThreshold - Threshold for regression detection (0-1), default 0.05
   */
  compareToBaseline?(
    runId: string,
    regressionThreshold?: number
  ): Promise<{
    baseline: BaselineMetadata;
    comparison: ComparisonResult;
    hasRegression: boolean;
    regressionThreshold: number;
  } | null>;
}

// ============================================================================
// Case Results Types (for granular analytics)
// ============================================================================

/**
 * Status of an individual case result
 */
export type CaseResultStatus = 'passed' | 'failed' | 'error';

/**
 * Individual case result record for storage
 */
export interface CaseResultRecord {
  /** Unique ID (auto-generated if not provided) */
  id?: string;
  /** Run ID this case belongs to */
  runId: string;
  /** Case ID from the test */
  caseId: string;
  /** Optional case name */
  caseName?: string;
  /** Result status */
  status: CaseResultStatus;
  /** Score from 0.0 to 1.0 */
  score: number;
  /** Type of matcher used */
  matcherType: string;
  /** Reason for the status */
  reason?: string;
  /** Model response */
  response: string;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Prompt tokens used */
  promptTokens: number;
  /** Completion tokens used */
  completionTokens: number;
  /** Total tokens used */
  totalTokens: number;
  /** Error message if status is 'error' */
  error?: string;
  /** Tags for categorization */
  tags?: string[];
  /** ISO timestamp when created */
  createdAt?: string;
}

/**
 * Options for querying case results
 */
export interface CaseResultQueryOptions {
  /** Filter by run ID */
  runId?: string;
  /** Filter by case ID */
  caseId?: string;
  /** Filter by status */
  status?: CaseResultStatus;
  /** Filter by tags (any match) */
  tags?: string[];
  /** Maximum results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ============================================================================
// Metrics History Types (for trending)
// ============================================================================

/**
 * Daily metrics snapshot for a project/scenario
 */
export interface MetricsSnapshot {
  /** Unique ID (auto-generated if not provided) */
  id?: string;
  /** Date of the snapshot (YYYY-MM-DD) */
  date: string;
  /** Project name */
  project: string;
  /** Optional scenario name (null for project-wide) */
  scenario?: string;
  /** Total runs on this date */
  totalRuns: number;
  /** Total cases across all runs */
  totalCases: number;
  /** Total passed cases */
  passedCases: number;
  /** Total failed cases */
  failedCases: number;
  /** Average success rate */
  avgSuccessRate: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Average tokens per run */
  avgTokensPerRun: number;
  /** Minimum success rate */
  minSuccessRate?: number;
  /** Maximum success rate */
  maxSuccessRate?: number;
  /** Minimum latency in ms */
  minLatencyMs?: number;
  /** Maximum latency in ms */
  maxLatencyMs?: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** ISO timestamp when created */
  createdAt?: string;
  /** ISO timestamp when last updated */
  updatedAt?: string;
}

/**
 * Options for querying metrics history
 */
export interface MetricsTrendOptions {
  /** Project to query */
  project: string;
  /** Optional scenario filter */
  scenario?: string;
  /** Start date (YYYY-MM-DD) */
  startDate?: string;
  /** End date (YYYY-MM-DD) */
  endDate?: string;
  /** Maximum results to return */
  limit?: number;
}

/**
 * Trend data point for visualization
 */
export interface TrendDataPoint {
  date: string;
  successRate: number;
  latencyMs: number;
  totalRuns: number;
  totalTokens: number;
}

// ============================================================================
// Enhanced Storage Adapter with Analytics
// ============================================================================

/**
 * Extended storage adapter with analytics capabilities
 */
export interface AnalyticsStorageAdapter extends BaselineStorageAdapter {
  /**
   * Save an individual case result
   */
  saveCaseResult(result: CaseResultRecord): Promise<string>;

  /**
   * Save multiple case results in batch
   */
  saveCaseResults(results: CaseResultRecord[]): Promise<string[]>;

  /**
   * Get case results for a run
   */
  getCaseResults(runId: string): Promise<CaseResultRecord[]>;

  /**
   * Query case results with filters
   */
  queryCaseResults(options: CaseResultQueryOptions): Promise<CaseResultRecord[]>;

  /**
   * Save a metrics snapshot
   */
  saveMetricsSnapshot(snapshot: MetricsSnapshot): Promise<string>;

  /**
   * Get metrics trend data
   */
  getMetricsTrend(options: MetricsTrendOptions): Promise<TrendDataPoint[]>;

  /**
   * Get a specific metrics snapshot
   */
  getMetricsSnapshot(
    date: string,
    project: string,
    scenario?: string
  ): Promise<MetricsSnapshot | null>;

  /**
   * Aggregate and save daily metrics from runs
   * This can be called to build/update metrics_history from existing runs
   */
  aggregateDailyMetrics?(
    date: string,
    project: string,
    scenario?: string
  ): Promise<MetricsSnapshot>;
}
