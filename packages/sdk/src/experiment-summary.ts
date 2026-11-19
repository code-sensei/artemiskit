/**
 * Exit codes and the plain-text run summary shared by the SDK and `akit experiment run`.
 * The summary is descriptive: it lists targets in declared order and never ranks them.
 */

import type { ExperimentRunResult, ExperimentSummary, ExperimentTarget } from '@artemiskit/core';
import {
  type ExperimentCaseCounts,
  type ExperimentCaseLevelSummary,
  formatCaseRate,
} from '@artemiskit/reports';

/** Exit codes for `akit experiment run`; SDK outcomes carry the same value. */
export const EXPERIMENT_EXIT_CODES = {
  /** Completed with a valid passed or failed measurement for every declared coordinate. */
  complete: 0,
  /** Unexpected I/O or internal failure, including an unusable output directory. */
  error: 1,
  /** The experiment file, a task source or a target declaration failed validation. */
  invalid: 2,
  /** Live experiment without a valid explicit approval; nothing was executed. */
  unauthorized: 3,
  /** Execution stopped early (budget or usage stop condition); see the stop reason. */
  stopped: 4,
  /** Finished, but some coordinates are invalid, unsupported, excluded, errored or incomplete. */
  coverageIncomplete: 5,
} as const;

export type ExperimentRunStatus = keyof typeof EXPERIMENT_EXIT_CODES;
export type ExperimentExitCode = (typeof EXPERIMENT_EXIT_CODES)[ExperimentRunStatus];

/** Classify a finished run. Early stops take precedence over incomplete coverage. */
export function experimentRunStatus(
  result: ExperimentRunResult
): 'complete' | 'stopped' | 'coverageIncomplete' {
  if (result.stop_reason !== undefined || !result.completion.execution_complete) return 'stopped';
  if (!result.completion.valid_measurement_coverage_complete) return 'coverageIncomplete';
  return 'complete';
}

/** Deployment label for a target, e.g. "open-weight, run locally via ollama; cost not applicable". */
export function describeTargetDeployment(target: ExperimentTarget): string {
  const deployment = target.deployment;
  const weights = target.weights?.availability === 'open' ? 'open-weight, ' : '';
  if (deployment?.locality !== 'local') return `${weights}remote; metered cost`;
  const runtime = deployment.runtime ?? 'an unspecified runtime';
  const cost = deployment.cost_basis === 'not_applicable' ? 'cost not applicable' : 'metered cost';
  return `${weights}run locally via ${runtime}; ${cost}`;
}

/**
 * Declared concurrency limit and, for concurrent runs, the recorded peak and caveat, e.g.
 * "up to 4 coordinates in flight (declared limit); recorded peak 3; completion order and
 * sampled outputs may differ from a serial run".
 */
export function describeConcurrency(result: ExperimentRunResult): string {
  const limit = result.manifest.concurrency;
  if (limit === 1) return '1 (serial)';
  const peak = result.execution ? `; recorded peak ${result.execution.peak_in_flight}` : '';
  return `up to ${limit} coordinates in flight (declared limit)${peak}; completion order and sampled outputs may differ from a serial run`;
}

/** Human-readable summary of a saved run. Makes no ranking or winner claim. */
export function formatExperimentRunSummary(
  result: ExperimentRunResult,
  options: { resultPath?: string; caseLevel?: ExperimentCaseLevelSummary } = {}
): string {
  const { manifest, summaries, completion } = result;
  const lines = [
    `Experiment ${result.experiment_id} — ${
      result.mode === 'fixture'
        ? 'fixture mode: deterministic offline client; outcomes measure the pipeline, not any model'
        : `live mode; approved by ${result.live_authorization?.approved_by ?? 'unknown'} (${result.live_authorization?.decision_id ?? 'no decision id'})`
    }`,
    `Matrix: ${summaries.overall.planned} planned coordinate(s) = ${manifest.tasks.length} task(s) × ${manifest.targets.length} target(s) × ${manifest.repetitions} repetition(s)`,
    `Concurrency: ${describeConcurrency(result)}`,
    COORDINATE_LEVEL_LINE,
    'Targets (declared order; counts describe this run only):',
  ];
  const groups = new Map(summaries.targets.map((group) => [group.key, group.summary]));
  for (const target of manifest.targets) {
    const publisher = target.publisher ? `; published by ${target.publisher.name}` : '';
    lines.push(
      `  - ${target.id}: ${target.provider} ${target.model} — ${describeTargetDeployment(target)}${publisher}`
    );
    const summary = groups.get(target.id);
    if (summary) lines.push(`      ${formatCounts(summary)}`);
  }
  lines.push(
    `Overall: ${formatCounts(summaries.overall)}`,
    ...(options.caseLevel
      ? [
          formatExperimentCaseSummary(
            options.caseLevel,
            manifest.targets.map((target) => target.id)
          ),
        ]
      : []),
    `Stop reason: ${result.stop_reason ?? 'none'}`,
    `Completion: matrix ${completeness(completion.matrix_complete)}; execution ${completeness(
      completion.execution_complete
    )}; valid-measurement coverage ${completeness(completion.valid_measurement_coverage_complete)}`,
    `Usage: ${summaries.operational.requests} request(s); ${summaries.operational.tokens} token(s); cost ${formatCost(result)}`,
    'No ranking or winner is implied. Generate a report for methodology, evidence and limitations.'
  );
  if (options.resultPath) lines.push(`Result: ${options.resultPath}`);
  return lines.join('\n');
}

const COORDINATE_LEVEL_LINE =
  'Coordinate level: counts below are task × target × repetition coordinates; a scenario coordinate passes only when all of its cases pass.';

/**
 * Plain-text case-level summary: individual scenario cases from verified per-attempt evidence,
 * per target (in `targetOrder` when given) and overall, or why it is unavailable. No ranking.
 */
export function formatExperimentCaseSummary(
  caseLevel: ExperimentCaseLevelSummary,
  targetOrder: readonly string[] = []
): string {
  if (caseLevel.availability === 'unavailable')
    return `Case level: unavailable. ${caseLevel.detail}`;
  const position = (key: string) => {
    const index = targetOrder.indexOf(key);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const targets = [...caseLevel.targets].sort(
    (left, right) => position(left.key) - position(right.key)
  );
  return [
    `Case level: counts below are individual scenario cases from ${caseLevel.verifiedEvidenceFiles} SHA-256-verified evidence file(s) (terminal attempt per coordinate):`,
    ...targets.map((group) => `  - ${group.key}: ${formatCaseCounts(group.counts)}`),
    `Overall cases: ${formatCaseCounts(caseLevel.overall)}`,
  ].join('\n');
}

function formatCaseCounts(counts: ExperimentCaseCounts): string {
  const unknown = (value: number | null) => (value === null ? 'unavailable' : String(value));
  return [
    `passed ${counts.passed} and failed ${counts.failed} of ${counts.valid} valid case(s) (passed/valid ${formatCaseRate(counts)})`,
    `invalid ${counts.invalid}`,
    `planned ${unknown(counts.planned)}`,
    `unmeasured ${unknown(counts.unmeasured)}`,
    `coordinates without case evidence ${counts.coordinatesWithoutCaseEvidence}`,
    `agent-workflow coordinates ${counts.coordinatesNotApplicable}`,
  ].join('; ');
}

function formatCounts(summary: ExperimentSummary): string {
  return [
    `valid ${summary.valid}/${summary.planned} planned`,
    `passed ${summary.passed} and task-failed ${summary.task_failed} of ${summary.valid} valid`,
    `invalid ${summary.invalid}`,
    `infrastructure-failed ${summary.infrastructure_failed}`,
    `unsupported ${summary.unsupported}`,
    `excluded ${summary.excluded}`,
    `incomplete ${summary.incomplete}`,
  ].join('; ');
}

function formatCost(result: ExperimentRunResult): string {
  const allLocal = result.manifest.targets.every(
    (target) => target.deployment?.cost_basis === 'not_applicable'
  );
  if (allLocal) return 'not applicable (local targets only)';
  const cost = result.summaries.operational.cost;
  return cost ? `${cost.amount} ${cost.currency}` : 'not reported';
}

function completeness(value: boolean): string {
  return value ? 'complete' : 'incomplete';
}
