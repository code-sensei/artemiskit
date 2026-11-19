/**
 * Attempt result and per-attempt client helpers shared by the built-in attempt executors.
 */

import type { ModelClient } from '../../adapters/types';
import type {
  ExecutedExperimentAttemptStatus,
  ExperimentAttemptOutput,
  ExperimentAttemptUsage,
  ExperimentTaskEvidence,
  ExperimentTaskKind,
} from '../types';

/** Attested spend reported for one attempt of a metered target. */
export interface ExperimentAttemptCost {
  amount: number;
  currency: string;
}

const CURRENCY = /^[A-Z]{3}$/;

export function attemptOutput(
  status: ExecutedExperimentAttemptStatus,
  usage: ExperimentAttemptUsage,
  evidence: ExperimentTaskEvidence,
  errorCode?: string
): ExperimentAttemptOutput {
  return errorCode === undefined
    ? { status, usage, evidence }
    : { status, usage, evidence, error_code: errorCode };
}

/** Evidence placeholder for an attempt that produced no stored artifact. */
export function unavailableEvidence(kind: ExperimentTaskKind): ExperimentTaskEvidence {
  // Narrow per kind so the literal matches exactly one evidence variant.
  return kind === 'scenario_evaluation'
    ? { kind, availability: 'unavailable' }
    : { kind, availability: 'unavailable' };
}

/** An attempt settled before any model request. */
export function attemptWithoutRequests(
  kind: ExperimentTaskKind,
  code: string,
  status: ExecutedExperimentAttemptStatus = 'invalid'
): ExperimentAttemptOutput {
  // Zero requests means zero tokens is a reported fact, so live runs keep the real cause
  // instead of halting with `usage_unreported`.
  return attemptOutput(status, { requests: 0, tokens: 0 }, unavailableEvidence(kind), code);
}

/**
 * Run a host cost resolver. Returns the cost, `undefined` when unreported, or `null` when the
 * resolver threw or returned a malformed value.
 */
export function resolveAttemptCost(
  resolve: () => ExperimentAttemptCost | undefined
): ExperimentAttemptCost | undefined | null {
  try {
    const cost = resolve();
    if (cost === undefined) return undefined;
    const valid =
      typeof cost === 'object' &&
      cost !== null &&
      Number.isFinite(cost.amount) &&
      cost.amount >= 0 &&
      typeof cost.currency === 'string' &&
      CURRENCY.test(cost.currency);
    return valid ? { amount: cost.amount, currency: cost.currency } : null;
  } catch {
    return null;
  }
}

export function isModelClient(value: unknown): value is ModelClient {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ModelClient).generate === 'function' &&
    typeof (value as ModelClient).capabilities === 'function'
  );
}

export async function closeClient(client: ModelClient): Promise<void> {
  try {
    await client.close?.();
  } catch {
    // The attempt result is already decided and its evidence stored; a failed close of a
    // per-attempt client cannot change the measurement.
  }
}
