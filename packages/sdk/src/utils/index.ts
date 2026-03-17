/**
 * @artemiskit/sdk
 * Utility types and helper functions
 */

import type {
  AdapterConfig,
  AnyManifest,
  CaseResult,
  Expected,
  RedTeamManifest,
  RunManifest,
  Scenario,
  StressManifest,
} from '@artemiskit/core';
import type { RedTeamResult, RunResult, StressResult } from '../types';

// ============================================================================
// Provider Name Types
// ============================================================================

/**
 * All supported provider names as a union type
 */
export type ProviderName = AdapterConfig['provider'];

/**
 * All supported expectation types
 */
export type ExpectationType = Expected['type'];

// ============================================================================
// Result Union Types
// ============================================================================

/**
 * Union of all SDK result types
 */
export type AnyResult = RunResult | RedTeamResult | StressResult;

/**
 * Union of all manifest types (re-export from core for convenience)
 */
export type { AnyManifest };

// ============================================================================
// Type Extraction Utilities
// ============================================================================

/**
 * Extract case results from a RunResult
 */
export type ExtractRunCases = RunResult['cases'];

/**
 * Extract red team cases from a RedTeamResult
 */
export type ExtractRedTeamCases = RedTeamResult['manifest']['results'];

/**
 * Extract stress results from a StressResult
 */
export type ExtractStressResults = StressResult['manifest']['sample_results'];

/**
 * Extract the manifest type from any result type
 */
export type ExtractManifest<T extends AnyResult> = T extends RunResult
  ? RunManifest
  : T extends RedTeamResult
    ? RedTeamManifest
    : T extends StressResult
      ? StressManifest
      : never;

// ============================================================================
// Partial Types for Construction
// ============================================================================

/**
 * Deep partial utility type - makes all nested properties optional
 */
export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * Partial scenario for incremental construction
 */
export type PartialScenario = DeepPartial<Scenario>;

/**
 * Make specific fields required
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific fields optional
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// ============================================================================
// Strict Configuration Types
// ============================================================================

/**
 * Strict version of AdapterConfig with all common fields required
 */
export type StrictAdapterConfig = RequireFields<AdapterConfig, 'provider' | 'apiKey'>;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for RunResult
 */
export function isRunResult(result: AnyResult): result is RunResult {
  return 'cases' in result && Array.isArray(result.cases) && !('defenseRate' in result);
}

/**
 * Type guard for RedTeamResult
 */
export function isRedTeamResult(result: AnyResult): result is RedTeamResult {
  return 'defenseRate' in result && 'unsafeCount' in result;
}

/**
 * Type guard for StressResult
 */
export function isStressResult(result: AnyResult): result is StressResult {
  return 'rps' in result && 'p95LatencyMs' in result;
}

/**
 * Type guard for RunManifest
 */
export function isRunManifestType(manifest: AnyManifest): manifest is RunManifest {
  return !('type' in manifest) || manifest.type === undefined;
}

/**
 * Type guard for RedTeamManifest
 */
export function isRedTeamManifestType(manifest: AnyManifest): manifest is RedTeamManifest {
  return 'type' in manifest && manifest.type === 'redteam';
}

/**
 * Type guard for StressManifest
 */
export function isStressManifestType(manifest: AnyManifest): manifest is StressManifest {
  return 'type' in manifest && manifest.type === 'stress';
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a value is defined (non-null, non-undefined)
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/**
 * Assert that a condition is true
 */
export function assert(condition: boolean, message = 'Assertion failed'): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ============================================================================
// Result Analysis Helpers
// ============================================================================

/**
 * Get failed cases from a run result
 */
export function getFailedCases(result: RunResult): CaseResult[] {
  return result.cases.filter((c) => !c.ok);
}

/**
 * Get passed cases from a run result
 */
export function getPassedCases(result: RunResult): CaseResult[] {
  return result.cases.filter((c) => c.ok);
}

/**
 * Get cases by tag from a run result
 */
export function getCasesByTag(result: RunResult, tag: string): CaseResult[] {
  return result.cases.filter((c) => c.tags.includes(tag));
}

/**
 * Calculate success rate from a run result
 */
export function calculateSuccessRate(result: RunResult): number {
  if (result.cases.length === 0) return 0;
  return result.cases.filter((c) => c.ok).length / result.cases.length;
}
