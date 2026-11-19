/**
 * Comparative experiment surfaces: validate, run and report.
 *
 * This module is the one engine behind both the SDK functions and the `akit experiment` CLI.
 * Fixture experiments bind every target to a deterministic in-memory client and make no network
 * calls. Live experiments additionally require an explicit `ExperimentLiveAuthorization`.
 */

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import {
  type AdapterConfig,
  type ContentIdentity,
  type ExperimentAttemptExecutor,
  type ExperimentLiveAuthorization,
  type ExperimentRunResult,
  type ExperimentTarget,
  type ExperimentTaskKind,
  type ModelClient,
  createAdapter,
  createScenarioExperimentExecutor,
  createWorkflowExperimentExecutor,
  isLoopbackEndpoint,
  runExperiment,
} from '@artemiskit/core';
import {
  type ExperimentCaseEvidenceFiles,
  type ExperimentCaseLevelSummary,
  type ExperimentReportFormat,
  type ExperimentReportView,
  createExperimentCaseSummary,
  createExperimentReport,
  listExperimentCaseEvidenceDigests,
  renderExperimentReportHTML,
  renderExperimentReportMarkdown,
} from '@artemiskit/reports';
import {
  EXPERIMENT_EVIDENCE_DIR,
  ExperimentSurfaceError,
  MAX_EXPERIMENT_RESULT_BYTES,
  defaultExperimentOutputDir,
  prepareEmptyDirectory,
  readBoundedText,
  readExperimentCaseEvidence,
  saveAttemptEvidence,
  saveExperimentResult,
  writeNewFile,
} from './experiment-files';
import { createExperimentFixtureClient } from './experiment-fixture';
import {
  EXPERIMENT_EXIT_CODES,
  type ExperimentExitCode,
  type ExperimentRunStatus,
  experimentRunStatus,
} from './experiment-summary';
import {
  type ExperimentValidation,
  isReasoningEffort,
  validateExperimentFile,
} from './experiment-validation';

export { ExperimentSurfaceError } from './experiment-files';
export {
  EXPERIMENT_EXIT_CODES,
  describeConcurrency,
  describeTargetDeployment,
  experimentRunStatus,
  formatExperimentCaseSummary,
  formatExperimentRunSummary,
} from './experiment-summary';
export type { ExperimentExitCode, ExperimentRunStatus } from './experiment-summary';
export { LOOPBACK_REQUIRED_MESSAGE, validateExperimentFile } from './experiment-validation';
export type {
  ExperimentCheck,
  ExperimentCheckStatus,
  ExperimentCheckSubject,
  ExperimentValidation,
} from './experiment-validation';
export { createExperimentFixtureClient } from './experiment-fixture';
export type { ExperimentFixtureClientOptions } from './experiment-fixture';

/**
 * Non-secret API key sent to loopback OpenAI-compatible servers (such as Ollama) that ignore
 * authentication. It keeps the OpenAI client from falling back to an ambient `OPENAI_API_KEY`,
 * so a real key never reaches a local endpoint unless the host configures one explicitly.
 */
export const LOCAL_ENDPOINT_PLACEHOLDER_API_KEY = 'artemiskit-local-no-key';

const DECISION_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const MAX_APPROVER_LENGTH = 128;
const MAX_REASON_LENGTH = 256;
const MAX_CONCURRENCY = 8;
type ApprovedConcurrency = NonNullable<ExperimentLiveAuthorization['approved_concurrency']>;

export interface CreateExperimentLiveAuthorizationOptions {
  /** Who approved the live run. */
  approvedBy: string;
  /** Why the live run is approved. */
  reason: string;
  /** Bounded decision ID; generated when omitted. */
  decisionId?: string;
  /** Decision time; defaults to now. */
  decidedAt?: Date;
  /**
   * Highest experiment concurrency this approval covers (integer 1..8). Required to run a
   * live experiment that declares concurrency above 1; omitted means serial live calls only.
   */
  maxConcurrency?: number;
}

/**
 * Build the explicit live-run approval record that `runExperimentFile` requires for
 * `mode: live` experiments. Throws `ExperimentSurfaceError` (exit code 3) on invalid input.
 */
export function createExperimentLiveAuthorization(
  options: CreateExperimentLiveAuthorizationOptions
): ExperimentLiveAuthorization {
  const decidedAt = options.decidedAt ?? new Date();
  const authorization: ExperimentLiveAuthorization = {
    approved: true,
    decision_id: options.decisionId ?? generateDecisionId(decidedAt),
    decided_at: decidedAt.toISOString(),
    approved_by: String(options.approvedBy ?? '').trim(),
    reason: String(options.reason ?? '').trim(),
    ...(options.maxConcurrency === undefined
      ? {}
      : { approved_concurrency: options.maxConcurrency as ApprovedConcurrency }),
  };
  if (!isValidLiveAuthorization(authorization)) {
    throw new ExperimentSurfaceError(
      'authorization_invalid',
      `Live approval needs an approver (1-${MAX_APPROVER_LENGTH} characters), a reason (1-${MAX_REASON_LENGTH} characters), a decision ID matching ${DECISION_ID} and, when given, a maximum concurrency from 1 to ${MAX_CONCURRENCY}`,
      EXPERIMENT_EXIT_CODES.unauthorized
    );
  }
  return authorization;
}

function generateDecisionId(now: Date): string {
  const stamp = now.toISOString().replace(/\D/g, '').slice(0, 14);
  return `live-${stamp}-${randomBytes(4).toString('hex')}`;
}

function isValidLiveAuthorization(value: unknown): value is ExperimentLiveAuthorization {
  const candidate = value as Partial<ExperimentLiveAuthorization> | undefined;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    candidate.approved === true &&
    typeof candidate.decision_id === 'string' &&
    DECISION_ID.test(candidate.decision_id) &&
    typeof candidate.decided_at === 'string' &&
    !Number.isNaN(Date.parse(candidate.decided_at)) &&
    boundedText(candidate.approved_by, MAX_APPROVER_LENGTH) &&
    boundedText(candidate.reason, MAX_REASON_LENGTH) &&
    (candidate.approved_concurrency === undefined ||
      (Number.isSafeInteger(candidate.approved_concurrency) &&
        candidate.approved_concurrency >= 1 &&
        candidate.approved_concurrency <= MAX_CONCURRENCY))
  );
}

function boundedText(value: unknown, maximum: number): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maximum;
}

export interface RunExperimentFileOptions {
  /** Experiment YAML or JSON file. Task sources resolve relative to its directory. */
  experiment: string;
  /**
   * New or empty directory for `result.json` and `evidence/`. Defaults to
   * `<cwd>/artemis-output/experiments/<experiment-id>/<timestamp>/`.
   */
  outputDir?: string;
  /** Base for the default output directory; defaults to `process.cwd()`. */
  cwd?: string;
  /** Required for `mode: live`; ignored for fixture experiments. */
  liveAuthorization?: ExperimentLiveAuthorization;
  /**
   * Live mode only: provider transport settings for a target (API key, timeout, organization).
   * The target's `settings.base_url`, provider and model always take precedence.
   */
  resolveTargetConfig?: (
    target: ExperimentTarget
  ) => Partial<AdapterConfig> | undefined | Promise<Partial<AdapterConfig> | undefined>;
  /** Live mode only: supply your own client per target instead of the built-in adapters. */
  createClient?: (target: ExperimentTarget) => ModelClient | Promise<ModelClient>;
  /**
   * Per-case model request timeout in milliseconds for scenario tasks. Live targets bound
   * through the built-in adapters also get an HTTP timeout of at least this value. Workflow
   * tasks keep their own declared `timeout_ms`.
   */
  timeoutMs?: number;
}

/**
 * Saved evidence for one executed attempt: the scenario run manifest, or the metadata-only
 * workflow record, as canonical JSON named by its SHA-256.
 */
export interface ExperimentEvidenceFile {
  coordinate_id: string;
  attempt_number: number;
  sha256: string;
  path: string;
}

export interface ExperimentFileRunOutcome {
  status: ExperimentRunStatus;
  /** Same value `akit experiment run` exits with. */
  exitCode: ExperimentExitCode;
  validation: ExperimentValidation;
  /** Present once the run executed. */
  result?: ExperimentRunResult;
  outputDir?: string;
  resultPath?: string;
  evidence: ExperimentEvidenceFile[];
  /**
   * Present once the run executed: individual scenario cases from the saved, SHA-256-verified
   * evidence, or why they are unavailable. Coordinate-level counts stay in `result.summaries`.
   */
  caseLevel?: ExperimentCaseLevelSummary;
  /** Explanation for refusals (`invalid`, `unauthorized`). */
  message?: string;
}

/**
 * Validate, then run an experiment file and save the V1 result plus per-attempt evidence.
 *
 * Each task runs through the built-in executor for its kind: `scenario_evaluation` tasks
 * through the scenario runner and `agent_workflow` tasks through the native workflow engine
 * (simulated or sandbox environment, network denied). Fixture targets never call a tool, so
 * fixture workflow outcomes describe the pipeline, never a model.
 *
 * Refusals (`invalid`, `unauthorized`) return before any client is created or any attempt runs.
 * Output and persistence failures throw `ExperimentSurfaceError` (exit code 1).
 *
 * A target's generation settings (`temperature`, `top_p`, `presence_penalty`,
 * `max_output_tokens`) replace each task's own values for that target's requests, and every
 * request carries the coordinate's seed. `llm_grader` and embedding requests keep their own
 * sampling and output length. `reasoning_effort` is adapter configuration, so it also applies to
 * `llm_grader` requests made through the target's client. Workflow tasks get the same settings
 * and seed on every workflow model request. Each saved run manifest records the values sent in
 * `resolved_config`; each saved workflow record lists them in `configuration.generation`.
 */
export async function runExperimentFile(
  options: RunExperimentFileOptions
): Promise<ExperimentFileRunOutcome> {
  const validation = await validateExperimentFile(options.experiment);
  if (!validation.valid || !validation.manifest) {
    return refusal('invalid', validation, 'Experiment validation failed; nothing was executed');
  }
  const manifest = validation.manifest;
  const live = manifest.mode === 'live';
  if (live && !isValidLiveAuthorization(options.liveAuthorization)) {
    return refusal(
      'unauthorized',
      validation,
      'Live experiments require an explicit approval (approver, reason, decision ID); nothing was executed'
    );
  }
  const approvedConcurrency = options.liveAuthorization?.approved_concurrency ?? 1;
  if (live && manifest.concurrency > approvedConcurrency) {
    return refusal(
      'unauthorized',
      validation,
      `The experiment declares concurrency ${manifest.concurrency} but the live approval covers ${approvedConcurrency}; approve it explicitly (--max-concurrency ${manifest.concurrency}); nothing was executed`
    );
  }

  const outputDir = path.resolve(
    options.outputDir ??
      defaultExperimentOutputDir(manifest.id, options.cwd ?? process.cwd(), new Date())
  );
  await prepareEmptyDirectory(outputDir);

  const evidence: ExperimentEvidenceFile[] = [];
  const saveEvidence = async (
    attempt: { coordinate_id: string; attempt_number: number; artifact: ContentIdentity },
    content: unknown
  ) => {
    const file = await saveAttemptEvidence(outputDir, content, attempt.artifact.digest);
    evidence.push({
      coordinate_id: attempt.coordinate_id,
      attempt_number: attempt.attempt_number,
      sha256: attempt.artifact.digest,
      path: file,
    });
  };
  const executor = routeByTaskKind({
    scenario_evaluation: createScenarioExperimentExecutor({
      root: validation.root,
      repetitions: manifest.repetitions,
      timeoutMs: options.timeoutMs,
      createClient: live
        ? (target) => bindLiveClient(target, options)
        : (target) => createExperimentFixtureClient(target),
      onEvidence: (record) => saveEvidence(record, record.manifest),
    }),
    agent_workflow: createWorkflowExperimentExecutor({
      root: validation.root,
      createClient: live
        ? (target) => bindLiveClient(target, options)
        : (target) => createExperimentFixtureClient(target, { toolUse: true }),
      onEvidence: (record) => saveEvidence(record, record.record),
    }),
  });

  const result = await runExperiment(manifest, {
    execute_attempt: executor,
    ...(live ? { live_authorization: pickAuthorization(options.liveAuthorization) } : {}),
  });
  sortEvidence(evidence, result);
  const resultPath = await saveExperimentResult(outputDir, result);
  const status = experimentRunStatus(result);
  return {
    status,
    exitCode: EXPERIMENT_EXIT_CODES[status],
    validation,
    result,
    outputDir,
    resultPath,
    evidence,
    caseLevel: await savedRunCaseLevel(result, outputDir),
  };
}

/**
 * Case-level summary read back from the files just saved, so a run reports exactly what a
 * later `report` of the same directory would. A result the report validator rejects (never
 * expected from the runner) yields an unavailable summary rather than failing the saved run.
 */
async function savedRunCaseLevel(
  result: ExperimentRunResult,
  outputDir: string
): Promise<ExperimentCaseLevelSummary> {
  const caseEvidence = await loadCaseEvidence(
    result,
    path.join(outputDir, EXPERIMENT_EVIDENCE_DIR)
  );
  try {
    return createExperimentCaseSummary(result, { caseEvidence });
  } catch {
    return {
      availability: 'unavailable',
      reason: 'result_invalid',
      detail:
        'Case-level summary unavailable: the saved result did not pass report validation. Coordinate-level counts are unaffected.',
      affectedEvidence: [],
      affectedEvidenceCount: 0,
    };
  }
}

/** Evidence bytes for the attempts a case-level summary reads; `undefined` without a directory. */
async function loadCaseEvidence(
  input: unknown,
  evidenceDir: string | undefined
): Promise<ExperimentCaseEvidenceFiles | undefined> {
  if (evidenceDir === undefined) return undefined;
  return readExperimentCaseEvidence(evidenceDir, listExperimentCaseEvidenceDigests(input));
}

/** Explicit evidence directory, else `evidence/` beside a result file; none for a parsed result. */
function caseEvidenceDir(
  result: string | ExperimentRunResult,
  evidenceDir: string | undefined
): string | undefined {
  if (evidenceDir !== undefined) return path.resolve(evidenceDir);
  if (typeof result !== 'string') return undefined;
  return path.join(path.dirname(path.resolve(result)), EXPERIMENT_EVIDENCE_DIR);
}

/** One attempt executor that hands each task, and its demand request, to its kind's executor. */
function routeByTaskKind(
  executors: Record<ExperimentTaskKind, ExperimentAttemptExecutor>
): ExperimentAttemptExecutor {
  const execute: ExperimentAttemptExecutor = (input) => executors[input.task.kind](input);
  execute.reserve = (request) => executors[request.task.kind].reserve?.(request);
  return execute;
}

function refusal(
  status: 'invalid' | 'unauthorized',
  validation: ExperimentValidation,
  message: string
): ExperimentFileRunOutcome {
  return {
    status,
    exitCode: EXPERIMENT_EXIT_CODES[status],
    validation,
    evidence: [],
    message,
  };
}

/** Core parses the authorization strictly; pass exactly the declared fields. */
function pickAuthorization(value: ExperimentLiveAuthorization | undefined) {
  const authorization = value as ExperimentLiveAuthorization;
  return {
    approved: authorization.approved,
    decision_id: authorization.decision_id,
    decided_at: authorization.decided_at,
    approved_by: authorization.approved_by,
    reason: authorization.reason,
    ...(authorization.approved_concurrency === undefined
      ? {}
      : { approved_concurrency: authorization.approved_concurrency }),
  };
}

/**
 * Concurrent attempts save evidence in completion order; list it in matrix order, then by
 * attempt number, so the evidence index is deterministic.
 */
function sortEvidence(evidence: ExperimentEvidenceFile[], result: ExperimentRunResult): void {
  const order = new Map(
    result.results.map((item, index) => [item.coordinate.coordinate_id, index])
  );
  const position = (item: ExperimentEvidenceFile) =>
    order.get(item.coordinate_id) ?? Number.MAX_SAFE_INTEGER;
  evidence.sort(
    (left, right) => position(left) - position(right) || left.attempt_number - right.attempt_number
  );
}

/**
 * Bind a live target through the adapter registry. Loopback targets never inherit an ambient
 * API key: they get the host's explicit key or a non-secret placeholder.
 */
async function bindLiveClient(
  target: ExperimentTarget,
  options: RunExperimentFileOptions
): Promise<ModelClient> {
  if (options.createClient) return options.createClient(target);
  const configured = (await options.resolveTargetConfig?.(target)) ?? {};
  const settingsBaseUrl = target.settings?.base_url;
  const baseUrl = typeof settingsBaseUrl === 'string' ? settingsBaseUrl : configured.baseUrl;
  const loopback = typeof baseUrl === 'string' && isLoopbackEndpoint(baseUrl);
  if (target.deployment?.cost_basis === 'not_applicable' && !loopback) {
    throw new Error('cost_not_applicable_requires_loopback');
  }
  return createAdapter({
    ...configured,
    provider: target.provider,
    defaultModel: target.model,
    baseUrl,
    apiKey: loopback
      ? (configured.apiKey ?? LOCAL_ENDPOINT_PLACEHOLDER_API_KEY)
      : configured.apiKey,
    maxRetries: 0,
    ...transportTimeoutConfig(configured.timeout, options.timeoutMs),
    ...reasoningEffortConfig(target),
  } as AdapterConfig);
}

/**
 * The adapter's HTTP timeout must never be shorter than the run's per-case timeout, or long
 * local generations are aborted by the transport (the OpenAI adapter defaults to 60 s) before
 * the declared per-case limit applies. Without a per-case timeout the adapter default stands.
 */
function transportTimeoutConfig(
  configuredMs: number | undefined,
  perCaseMs: number | undefined
): { timeout?: number } {
  if (perCaseMs === undefined) return {};
  return { timeout: Math.max(configuredMs ?? 0, perCaseMs) };
}

/** Map a target's declared `settings.reasoning_effort` onto the adapter option. */
function reasoningEffortConfig(target: ExperimentTarget): { reasoningEffort?: string } {
  const effort = target.settings?.reasoning_effort;
  if (effort === undefined) return {};
  if (!isReasoningEffort(effort)) throw new Error('invalid_reasoning_effort');
  return { reasoningEffort: effort };
}

export interface ReportExperimentResultOptions {
  /** Path to a saved `result.json`, or the parsed V1 result. */
  result: string | ExperimentRunResult;
  /** Views to generate; defaults to all three. */
  views?: ExperimentReportView[];
  /** Formats to generate; defaults to HTML and Markdown. */
  formats?: ExperimentReportFormat[];
  /** New or empty directory to write `<view>.<html|md>` files into; omit to only return content. */
  outputDir?: string;
  /**
   * Directory of saved per-attempt evidence for the case-level summary. Defaults to `evidence/`
   * beside a result file; a parsed result without this option reports case level unavailable.
   */
  evidenceDir?: string;
}

export interface ExperimentReportFile {
  view: ExperimentReportView;
  format: ExperimentReportFormat;
  content: string;
  /** Written file, when `outputDir` was given. */
  path?: string;
}

export const EXPERIMENT_REPORT_VIEWS: readonly ExperimentReportView[] = [
  'technical',
  'executive',
  'comprehensive',
];
export const EXPERIMENT_REPORT_FORMATS: readonly ExperimentReportFormat[] = ['html', 'markdown'];

/**
 * Generate experiment reports offline from a saved result. Loads no task, provider, credential
 * or network. Throws `ExperimentSurfaceError`: exit code 1 for unreadable input or unwritable
 * output, 2 for an invalid or unsupported saved result.
 */
export async function reportExperimentResult(
  options: ReportExperimentResultOptions
): Promise<ExperimentReportFile[]> {
  const views = uniqueChoices(options.views, EXPERIMENT_REPORT_VIEWS);
  const formats = uniqueChoices(options.formats, EXPERIMENT_REPORT_FORMATS);
  const input =
    typeof options.result === 'string' ? await readResult(options.result) : options.result;
  const caseEvidence = await loadCaseEvidence(
    input,
    caseEvidenceDir(options.result, options.evidenceDir)
  );

  let reports: ExperimentReportFile[];
  try {
    const report = createExperimentReport(input, { caseEvidence });
    reports = views.flatMap((view) =>
      formats.map((format) => ({
        view,
        format,
        content:
          format === 'html'
            ? renderExperimentReportHTML(report, { view })
            : renderExperimentReportMarkdown(report, { view }),
      }))
    );
  } catch {
    throw new ExperimentSurfaceError(
      'result_invalid',
      'Invalid, unsupported or ambiguous saved experiment result; no report generated',
      EXPERIMENT_EXIT_CODES.invalid
    );
  }

  if (options.outputDir !== undefined) {
    const directory = path.resolve(options.outputDir);
    await prepareEmptyDirectory(directory);
    for (const report of reports) {
      const file = path.join(
        directory,
        `${report.view}.${report.format === 'html' ? 'html' : 'md'}`
      );
      try {
        await writeNewFile(file, report.content);
      } catch {
        throw new ExperimentSurfaceError('report_unwritable', 'Unable to write report file', 1);
      }
      report.path = file;
    }
  }
  return reports;
}

export interface SummarizeExperimentCasesOptions {
  /** Path to a saved `result.json`, or the parsed V1 result. */
  result: string | ExperimentRunResult;
  /** Saved per-attempt evidence directory; defaults to `evidence/` beside a result file. */
  evidenceDir?: string;
}

/**
 * Case-level summary of a saved result, offline: individual scenario cases from each
 * coordinate's terminal attempt evidence, verified against the recorded SHA-256. Missing or
 * altered evidence yields an `unavailable` summary with its reason; an invalid result throws
 * `ExperimentSurfaceError` (exit code 1 unreadable, 2 invalid).
 */
export async function summarizeExperimentCases(
  options: SummarizeExperimentCasesOptions
): Promise<ExperimentCaseLevelSummary> {
  const input =
    typeof options.result === 'string' ? await readResult(options.result) : options.result;
  const caseEvidence = await loadCaseEvidence(
    input,
    caseEvidenceDir(options.result, options.evidenceDir)
  );
  try {
    return createExperimentCaseSummary(input, { caseEvidence });
  } catch {
    throw new ExperimentSurfaceError(
      'result_invalid',
      'Invalid, unsupported or ambiguous saved experiment result; no case-level summary',
      EXPERIMENT_EXIT_CODES.invalid
    );
  }
}

async function readResult(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readBoundedText(path.resolve(file), MAX_EXPERIMENT_RESULT_BYTES);
  } catch {
    throw new ExperimentSurfaceError(
      'result_unreadable',
      'Saved experiment result is missing, unreadable or too large',
      1
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ExperimentSurfaceError(
      'result_invalid',
      'Saved experiment result is not valid JSON',
      EXPERIMENT_EXIT_CODES.invalid
    );
  }
}

function uniqueChoices<T extends string>(requested: T[] | undefined, allowed: readonly T[]): T[] {
  if (requested === undefined || requested.length === 0) return [...allowed];
  if (requested.some((choice) => !allowed.includes(choice))) {
    throw new ExperimentSurfaceError(
      'report_option_invalid',
      `Choose from: ${allowed.join(', ')}`,
      EXPERIMENT_EXIT_CODES.invalid
    );
  }
  return allowed.filter((choice) => requested.includes(choice));
}
