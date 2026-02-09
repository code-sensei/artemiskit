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
