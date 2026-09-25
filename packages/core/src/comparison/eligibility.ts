/**
 * Compatibility decisions for comparisons of saved scenario-evaluation runs.
 *
 * This contract compares declared evidence only. A matching digest proves the
 * same canonical workload/rubric was declared; it does not attest to provider
 * behaviour or replace a future assessment-profile compatibility decision.
 */

import type { RunManifest } from '../artifacts/types';

export type ComparisonEligibilityStatus = 'compatible' | 'qualified' | 'incomparable';

export type ComparisonEligibilityReasonCode =
  | 'scenario_mismatch'
  | 'workload_identity_missing'
  | 'rubric_identity_missing'
  | 'workload_mismatch'
  | 'rubric_mismatch'
  | 'execution_provenance_missing'
  | 'target_provider_changed'
  | 'target_model_changed'
  | 'generation_settings_changed';

/** A bounded, machine-readable reason for a comparison decision. */
export interface ComparisonEligibilityReason {
  code: ComparisonEligibilityReasonCode;
}

/**
 * Versioned decision that accompanies every comparison. `qualified` permits
 * a visibly-qualified delta; `incomparable` prohibits a delta entirely.
 */
export interface ComparisonEligibility {
  schema_version: '1';
  status: ComparisonEligibilityStatus;
  reasons: ComparisonEligibilityReason[];
}

export function assessComparisonEligibility(
  baseline: RunManifest,
  current: RunManifest
): ComparisonEligibility {
  const reasons: ComparisonEligibilityReason[] = [];

  if (baseline.config.scenario !== current.config.scenario) {
    reasons.push({ code: 'scenario_mismatch' });
  }

  const baselineIdentity = baseline.workload_identity;
  const currentIdentity = current.workload_identity;
  if (!baselineIdentity || !currentIdentity) {
    if (!baselineIdentity || !currentIdentity) reasons.push({ code: 'workload_identity_missing' });
    if (!baselineIdentity || !currentIdentity) reasons.push({ code: 'rubric_identity_missing' });
  } else {
    if (baselineIdentity.workload.digest !== currentIdentity.workload.digest) {
      reasons.push({ code: 'workload_mismatch' });
    }
    if (baselineIdentity.rubric.digest !== currentIdentity.rubric.digest) {
      reasons.push({ code: 'rubric_mismatch' });
    }
  }

  if (reasons.some((reason) => isIncomparableReason(reason.code))) {
    return { schema_version: '1', status: 'incomparable', reasons };
  }

  const baselineExecution = baseline.execution_provenance;
  const currentExecution = current.execution_provenance;
  if (!baselineExecution || !currentExecution) {
    reasons.push({ code: 'execution_provenance_missing' });
  } else {
    if (baselineExecution.target.provider !== currentExecution.target.provider) {
      reasons.push({ code: 'target_provider_changed' });
    }
    if (
      !sameStringSet(
        baselineExecution.target.requested_models,
        currentExecution.target.requested_models
      )
    ) {
      reasons.push({ code: 'target_model_changed' });
    }
    if (!sameGeneration(baselineExecution.target.generation, currentExecution.target.generation)) {
      reasons.push({ code: 'generation_settings_changed' });
    }
  }

  return {
    schema_version: '1',
    status: reasons.length === 0 ? 'compatible' : 'qualified',
    reasons,
  };
}

export function isComparisonAvailable(eligibility: ComparisonEligibility): boolean {
  return eligibility.status !== 'incomparable';
}

function isIncomparableReason(code: ComparisonEligibilityReasonCode): boolean {
  return code === 'scenario_mismatch' || code === 'workload_mismatch' || code === 'rubric_mismatch';
}

function sameStringSet(left?: string[], right?: string[]): boolean {
  return JSON.stringify([...(left ?? [])].sort()) === JSON.stringify([...(right ?? [])].sort());
}

function sameGeneration(
  left?: { temperature?: number; max_tokens?: number; seed?: number },
  right?: { temperature?: number; max_tokens?: number; seed?: number }
): boolean {
  return (
    left?.temperature === right?.temperature &&
    left?.max_tokens === right?.max_tokens &&
    left?.seed === right?.seed
  );
}
