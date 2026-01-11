/**
 * Storage types and interfaces
 */

import type { RunManifest } from '../artifacts/types';

/**
 * Run listing item
 */
export interface RunListItem {
  runId: string;
  scenario: string;
  successRate: number;
  createdAt: string;
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
}

/**
 * Storage adapter interface - implement to create custom storage backends
 */
export interface StorageAdapter {
  /**
   * Save a run manifest
   */
  save(manifest: RunManifest): Promise<string>;

  /**
   * Load a run manifest by ID
   */
  load(runId: string): Promise<RunManifest>;

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
