/**
 * Exit codes and the plain-text run summary shared by the SDK and `akit experiment run`.
 * The summary is descriptive: it lists targets in declared order and never ranks them.
 */

import type { ExperimentRunResult, ExperimentSummary, ExperimentTarget } from '@artemiskit/core';

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

/** Human-readable summary of a saved run. Makes no ranking or winner claim. */
export function formatExperimentRunSummary(
  result: ExperimentRunResult,
  options: { resultPath?: string } = {}
): string {
  const { manifest, summaries, completion } = result;
  const lines = [
    `Experiment ${result.experiment_id} — ${
      result.mode === 'fixture'
        ? 'fixture mode: deterministic offline client; outcomes measure the pipeline, not any model'
        : `live mode; approved by ${result.live_authorization?.approved_by ?? 'unknown'} (${result.live_authorization?.decision_id ?? 'no decision id'})`
    }`,
    `Matrix: ${summaries.overall.planned} planned coordinate(s) = ${manifest.tasks.length} task(s) × ${manifest.targets.length} target(s) × ${manifest.repetitions} repetition(s)`,
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
