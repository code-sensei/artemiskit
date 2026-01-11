/**
 * Runner types and interfaces
 */

import type { Scenario, TestCase } from '../scenario/schema';
import type { CaseResult, RunManifest } from '../artifacts/types';
import type { ModelClient } from '../adapters/types';

/**
 * Options for running a scenario
 */
export interface RunOptions {
  /** The scenario to run */
  scenario: Scenario;
  /** Model client to use */
  client: ModelClient;
  /** Project name for the manifest */
  project?: string;
  /** Filter cases by tags */
  tags?: string[];
  /** Number of concurrent requests */
  concurrency?: number;
  /** Timeout per case in milliseconds */
  timeout?: number;
  /** Number of retries per case */
  retries?: number;
  /** Callback for each case result */
  onCaseComplete?: (result: CaseResult, index: number, total: number) => void;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Result of a scenario run
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
 * Context passed to case executor
 */
export interface ExecutorContext {
  client: ModelClient;
  scenario: Scenario;
  timeout?: number;
  retries?: number;
}
