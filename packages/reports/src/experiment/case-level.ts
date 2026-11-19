/**
 * Case-level summary of a validated experiment result.
 *
 * A coordinate (task × target × repetition) passes only when every case in it passes, so
 * coordinate counts alone hide how many individual cases passed. This module reads the cases
 * recorded in each coordinate's terminal attempt evidence (a scenario run manifest), after
 * proving the supplied bytes hash to the SHA-256 identity the result recorded for that attempt.
 *
 * It is pure: callers supply the evidence bytes. Any referenced evidence that is missing, fails
 * verification, cannot be read as a run manifest, or contradicts the recorded coordinate status
 * makes the whole case-level summary unavailable, so a partial count is never presented.
 */

import { createHash } from 'node:crypto';
import {
  type CaseEvaluationStatus,
  type ExperimentAttemptEvidence,
  type ExperimentCoordinateResult,
  type ExperimentRunResult,
  assertRunManifestIntegrity,
  getCaseEvaluationStatus,
} from '@artemiskit/core';

/** Saved evidence bytes keyed by recorded SHA-256 digest; `null` or absent means missing. */
export type ExperimentCaseEvidenceFiles = ReadonlyMap<string, Uint8Array | null | undefined>;

/** Case counts for one group of coordinates. Every number counts cases unless named otherwise. */
export interface ExperimentCaseCounts {
  /** Planned coordinates in the group (same denominator as the coordinate-level summary). */
  coordinates: number;
  /** Coordinates whose terminal attempt has verified scenario evidence. */
  coordinatesWithCaseEvidence: number;
  /** Scenario coordinates without case evidence: unattempted, excluded, unsupported or unavailable. */
  coordinatesWithoutCaseEvidence: number;
  /** Agent-workflow coordinates: their evidence holds no scenario cases. */
  coordinatesNotApplicable: number;
  /**
   * Cases planned: each scenario coordinate × its task's recorded case count. `null` when a task
   * in the group has no verified evidence, so its case count is unknown.
   */
  planned: number | null;
  /** Cases recorded in verified terminal evidence. */
  recorded: number;
  /** passed + failed. */
  valid: number;
  passed: number;
  failed: number;
  /** Invalid measurements, execution errors and cases of an attempt invalidated as a whole. */
  invalid: number;
  /** planned − recorded; `null` when planned is unknown. */
  unmeasured: number | null;
}

export interface ExperimentCaseGroup {
  key: string;
  counts: ExperimentCaseCounts;
}

export type ExperimentCaseUnavailableReason =
  | 'evidence_not_provided'
  | 'evidence_missing'
  | 'evidence_digest_mismatch'
  | 'evidence_invalid'
  | 'evidence_inconsistent'
  | 'case_set_inconsistent'
  | 'result_invalid';

export interface ExperimentCaseLevelAvailable {
  availability: 'available';
  /** Distinct evidence files read and verified. */
  verifiedEvidenceFiles: number;
  overall: ExperimentCaseCounts;
  targets: ExperimentCaseGroup[];
  tasks: ExperimentCaseGroup[];
  languages: ExperimentCaseGroup[];
  policies: ExperimentCaseGroup[];
}

export interface ExperimentCaseLevelUnavailable {
  availability: 'unavailable';
  reason: ExperimentCaseUnavailableReason;
  detail: string;
  /** Sorted digests of evidence that failed (at most {@link MAX_LISTED_EVIDENCE}). */
  affectedEvidence: string[];
  affectedEvidenceCount: number;
}

export type ExperimentCaseLevelSummary =
  | ExperimentCaseLevelAvailable
  | ExperimentCaseLevelUnavailable;

/** Largest single evidence file read. */
export const MAX_CASE_EVIDENCE_BYTES = 64 * 1024 * 1024;
const MAX_LISTED_EVIDENCE = 20;
const DIGEST = /^[a-f0-9]{64}$/;

type CaseOutcome = 'passed' | 'failed' | 'invalid';
interface CaseRecord {
  id: string;
  status: CaseEvaluationStatus;
}
type FileReading = { ok: true; cases: CaseRecord[] } | { ok: false; problem: FileProblem };
type FileProblem = 'evidence_missing' | 'evidence_digest_mismatch' | 'evidence_invalid';

/** Terminal attempt whose evidence a coordinate's cases come from, if it is scenario evidence. */
function scenarioEvidenceDigest(result: ExperimentCoordinateResult): string | undefined {
  if (result.coordinate.task_kind !== 'scenario_evaluation') return undefined;
  const terminal = result.attempts.at(-1);
  if (!terminal || terminal.evidence.availability !== 'available') return undefined;
  if (terminal.evidence.kind !== 'scenario_evaluation') return undefined;
  return terminal.evidence.artifact.digest;
}

/**
 * Digests of the evidence files a case-level summary reads: the terminal attempt of every
 * scenario coordinate with available evidence. Earlier retry attempts never count. Tolerates
 * any input shape (it returns what it can find) so hosts can load files before validation.
 */
export function listExperimentCaseEvidenceDigests(input: unknown): string[] {
  const digests = new Set<string>();
  const results = (input as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  for (const result of results) {
    try {
      const digest = scenarioEvidenceDigest(result as ExperimentCoordinateResult);
      if (typeof digest === 'string' && DIGEST.test(digest)) digests.add(digest);
    } catch {
      // A malformed entry is rejected later by result validation; nothing to load for it.
    }
  }
  return [...digests].sort();
}

function readEvidence(digest: string, bytes: Uint8Array | null | undefined): FileReading {
  if (!bytes) return { ok: false, problem: 'evidence_missing' };
  if (createHash('sha256').update(bytes).digest('hex') !== digest)
    return { ok: false, problem: 'evidence_digest_mismatch' };
  try {
    if (bytes.byteLength > MAX_CASE_EVIDENCE_BYTES) throw new Error('too_large');
    const manifest: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    assertRunManifestIntegrity(manifest);
    const ids = new Set<string>();
    const cases = manifest.cases.map((item) => {
      if (typeof item.id !== 'string' || ids.has(item.id)) throw new Error('case_id');
      ids.add(item.id);
      return { id: item.id, status: getCaseEvaluationStatus(item) };
    });
    return { ok: true, cases };
  } catch {
    return { ok: false, problem: 'evidence_invalid' };
  }
}

/**
 * Whether the recorded case statuses describe the measurement. The runner derives `passed`,
 * `task_failed`, `measurement_invalid` and `provider_error` outcomes from the case statuses;
 * any other terminal outcome (a truncated response, an exhausted budget, a failed cost lookup)
 * is not attributable to a single case, so every case in that attempt counts as invalid.
 */
function caseStatusesAttributable(
  result: ExperimentCoordinateResult,
  terminal: ExperimentAttemptEvidence
): boolean {
  if (['passed', 'task_failed', 'policy_failed'].includes(result.status)) return true;
  if (result.status === 'invalid') return terminal.error_code === 'measurement_invalid';
  if (result.status === 'infrastructure_failed') return terminal.error_code === 'provider_error';
  return false;
}

/** Recorded case statuses must agree with the coordinate status the runner derived from them. */
function consistentWithCoordinate(
  result: ExperimentCoordinateResult,
  terminal: ExperimentAttemptEvidence,
  cases: CaseRecord[]
): boolean {
  const has = (...statuses: CaseEvaluationStatus[]) =>
    cases.some((item) => statuses.includes(item.status));
  if (cases.length === 0) return false;
  if (result.status === 'passed') return !has('failed', 'invalid', 'error');
  if (result.status === 'task_failed') return has('failed') && !has('invalid', 'error');
  if (result.status === 'invalid' && terminal.error_code === 'measurement_invalid')
    return has('invalid', 'error');
  if (result.status === 'infrastructure_failed' && terminal.error_code === 'provider_error')
    return has('error');
  return true;
}

function caseOutcome(status: CaseEvaluationStatus): CaseOutcome {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  return 'invalid';
}

interface CoordinateCases {
  result: ExperimentCoordinateResult;
  kind: 'cases' | 'without_evidence' | 'not_applicable';
  outcomes: CaseOutcome[];
}

function emptyCounts(): ExperimentCaseCounts {
  return {
    coordinates: 0,
    coordinatesWithCaseEvidence: 0,
    coordinatesWithoutCaseEvidence: 0,
    coordinatesNotApplicable: 0,
    planned: 0,
    recorded: 0,
    valid: 0,
    passed: 0,
    failed: 0,
    invalid: 0,
    unmeasured: 0,
  };
}

function count(items: CoordinateCases[], caseCounts: ReadonlyMap<string, number>) {
  const counts = emptyCounts();
  let planned: number | null = 0;
  for (const item of items) {
    counts.coordinates += 1;
    if (item.kind === 'not_applicable') {
      counts.coordinatesNotApplicable += 1;
      continue;
    }
    const taskCases = caseCounts.get(item.result.coordinate.task_id);
    planned = planned === null || taskCases === undefined ? null : planned + taskCases;
    if (item.kind === 'without_evidence') {
      counts.coordinatesWithoutCaseEvidence += 1;
      continue;
    }
    counts.coordinatesWithCaseEvidence += 1;
    for (const outcome of item.outcomes) counts[outcome] += 1;
    counts.recorded += item.outcomes.length;
  }
  counts.valid = counts.passed + counts.failed;
  counts.planned = planned;
  counts.unmeasured = planned === null ? null : planned - counts.recorded;
  return counts;
}

function grouped(
  items: CoordinateCases[],
  caseCounts: ReadonlyMap<string, number>,
  keys: string[],
  keyOf: (item: CoordinateCases) => string
): ExperimentCaseGroup[] {
  return keys.map((key) => ({
    key,
    counts: count(
      items.filter((item) => keyOf(item) === key),
      caseCounts
    ),
  }));
}

function unavailable(
  reason: ExperimentCaseUnavailableReason,
  detail: string,
  affected: Iterable<string> = []
): ExperimentCaseLevelUnavailable {
  const sorted = [...new Set(affected)].sort();
  return {
    availability: 'unavailable',
    reason,
    detail,
    affectedEvidence: sorted.slice(0, MAX_LISTED_EVIDENCE),
    affectedEvidenceCount: sorted.length,
  };
}

const PROBLEM_ORDER: FileProblem[] = [
  'evidence_digest_mismatch',
  'evidence_invalid',
  'evidence_missing',
];

function problemDetail(problems: Map<string, FileProblem>): ExperimentCaseLevelUnavailable {
  const of = (problem: FileProblem) =>
    [...problems].filter(([, value]) => value === problem).map(([digest]) => digest);
  const reason = PROBLEM_ORDER.find((problem) => of(problem).length > 0) as FileProblem;
  const detail = `Case-level summary withheld: ${of('evidence_digest_mismatch').length} referenced evidence file(s) failed SHA-256 verification, ${of('evidence_invalid').length} could not be read as a run manifest, and ${of('evidence_missing').length} were missing or unreadable. Partial case counts are not reported.`;
  return unavailable(reason, detail, problems.keys());
}

/**
 * Summarize individual scenario cases of a result that already passed V1 validation.
 * `files` holds evidence bytes by digest; pass `undefined` when no evidence was saved or found.
 */
export function summarizeValidatedCaseLevel(
  run: ExperimentRunResult,
  files: ExperimentCaseEvidenceFiles | undefined
): ExperimentCaseLevelSummary {
  const required = listExperimentCaseEvidenceDigests(run);
  if (required.length > 0 && files === undefined)
    return unavailable(
      'evidence_not_provided',
      'Case-level summary unavailable: the saved per-attempt evidence was not provided (for example, a result saved without its evidence directory). Coordinate-level counts are unaffected.'
    );

  const readings = new Map<string, FileReading>();
  const problems = new Map<string, FileProblem>();
  for (const digest of required) {
    const reading = readEvidence(digest, files?.get(digest));
    readings.set(digest, reading);
    if (!reading.ok) problems.set(digest, reading.problem);
  }
  if (problems.size > 0) return problemDetail(problems);

  const caseSets = new Map<string, string[]>();
  const inconsistent = new Set<string>();
  const mismatchedSets = new Set<string>();
  const items: CoordinateCases[] = run.results.map((result) => {
    const digest = scenarioEvidenceDigest(result);
    if (result.coordinate.task_kind !== 'scenario_evaluation')
      return { result, kind: 'not_applicable', outcomes: [] };
    if (digest === undefined) return { result, kind: 'without_evidence', outcomes: [] };
    const reading = readings.get(digest) as { ok: true; cases: CaseRecord[] };
    const terminal = result.attempts.at(-1) as ExperimentAttemptEvidence;
    if (!consistentWithCoordinate(result, terminal, reading.cases)) inconsistent.add(digest);
    const ids = reading.cases.map((item) => item.id);
    const known = caseSets.get(result.coordinate.task_id);
    if (!known) caseSets.set(result.coordinate.task_id, ids);
    else if (known.join('\u0000') !== ids.join('\u0000')) mismatchedSets.add(digest);
    const attributable = caseStatusesAttributable(result, terminal);
    return {
      result,
      kind: 'cases',
      outcomes: reading.cases.map((item) => (attributable ? caseOutcome(item.status) : 'invalid')),
    };
  });
  if (inconsistent.size > 0)
    return unavailable(
      'evidence_inconsistent',
      `Case-level summary withheld: ${inconsistent.size} verified evidence file(s) record case statuses that contradict the coordinate status saved in the result. Partial case counts are not reported.`,
      inconsistent
    );
  if (mismatchedSets.size > 0)
    return unavailable(
      'case_set_inconsistent',
      `Case-level summary withheld: ${mismatchedSets.size} verified evidence file(s) record a different set of cases than other evidence for the same task. Partial case counts are not reported.`,
      mismatchedSets
    );

  const caseCounts = new Map([...caseSets].map(([task, ids]) => [task, ids.length]));
  const keysOf = (groups: { key: string }[]) => groups.map((group) => group.key);
  return {
    availability: 'available',
    verifiedEvidenceFiles: required.length,
    overall: count(items, caseCounts),
    targets: grouped(
      items,
      caseCounts,
      keysOf(run.summaries.targets),
      (item) => item.result.coordinate.target_id
    ),
    tasks: grouped(
      items,
      caseCounts,
      keysOf(run.summaries.tasks),
      (item) => item.result.coordinate.task_id
    ),
    languages: grouped(
      items,
      caseCounts,
      keysOf(run.summaries.languages),
      (item) => item.result.coordinate.language ?? 'und'
    ),
    policies: grouped(
      items,
      caseCounts,
      keysOf(run.summaries.policies),
      (item) => item.result.coordinate.policy ?? 'unclassified'
    ),
  };
}

/** "passed / valid (rate%)" for a case group, or "unavailable" with no valid cases. */
export function formatCaseRate(counts: ExperimentCaseCounts): string {
  if (counts.valid === 0) return 'unavailable';
  return `${counts.passed}/${counts.valid} (${Math.round((counts.passed / counts.valid) * 1000) / 10}%)`;
}
