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
