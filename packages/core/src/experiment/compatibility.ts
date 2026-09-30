import type {
  ExperimentComparisonReason,
  ExperimentCompatibility,
  ExperimentIdentity,
} from './types';

/**
 * Compare only workload-defining identities. Target configuration is an
 * expected experiment dimension and deliberately does not affect eligibility.
 */
export function assessExperimentCompatibility(
  baseline: ExperimentIdentity,
  candidate: ExperimentIdentity
): ExperimentCompatibility {
  const reasons: ExperimentComparisonReason[] = [];

  if (baseline.workload.digest !== candidate.workload.digest) {
    reasons.push({ code: 'workload_mismatch' });
  }
  if (baseline.rubric.digest !== candidate.rubric.digest) {
    reasons.push({ code: 'rubric_mismatch' });
  }

  compareOptionalIdentity('policy', baseline, candidate, reasons);
  compareOptionalIdentity('profile', baseline, candidate, reasons);

  const incomparable = reasons.some((reason) => reason.code.endsWith('_mismatch'));
  return {
    schema_version: '1',
    status: incomparable ? 'incomparable' : reasons.length > 0 ? 'qualified' : 'compatible',
    reasons,
  };
}

function compareOptionalIdentity(
  kind: 'policy' | 'profile',
  baseline: ExperimentIdentity,
  candidate: ExperimentIdentity,
  reasons: ExperimentComparisonReason[]
): void {
  const left = baseline[kind];
  const right = candidate[kind];
  if (!left && !right) return;
  if (!left || !right) {
    reasons.push({ code: `${kind}_identity_missing` });
    return;
  }
  if (left.digest !== right.digest) reasons.push({ code: `${kind}_mismatch` });
}
