/**
 * Built-in `scenario_evaluation` attempt executor for `runExperiment`.
 *
 * The executor loads a task's scenario from a host-supplied root, proves the bytes match the
 * declared artifact identity, runs it once against the coordinate's target through
 * `runScenario`, and maps the case outcomes onto the experiment attempt contract. It never
 * discovers providers or credentials: the host supplies a `ModelClient` per target.
 */

import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ModelClient } from '../../adapters/types';
import type {
  CaseResult,
  ContentIdentity,
  ResolvedConfig,
  RunManifest,
} from '../../artifacts/types';
import { getCaseEvaluationStatus } from '../../artifacts/types';
import {
  type GenerationSettings,
  UNTRANSPORTED_GENERATION_SETTINGS,
  readGenerationSettings,
  toGenerationOverrides,
} from '../../runner/generation';
import { runScenario } from '../../runner/runner';
import { validateScenario } from '../../scenario/parser';
import type { Expected, Scenario, TestCase } from '../../scenario/schema';
import { mergeVariables, substituteVariables } from '../../scenario/variables';
import { targetCostApplies } from '../runner';
import type {
  ExecutedExperimentAttemptStatus,
  ExperimentAttemptDemand,
  ExperimentAttemptExecutor,
  ExperimentAttemptInput,
  ExperimentAttemptOutput,
  ExperimentAttemptUsage,
  ExperimentDemandRequest,
  ExperimentTarget,
  ExperimentTaskEvidence,
  ExperimentTaskSource,
} from '../types';
import { type ClientMeter, meterClient } from './metered-client';

/** Evidence handed to the host before the attempt result is returned. */
export interface ScenarioExperimentEvidenceRecord {
  coordinate_id: string;
  attempt_number: number;
  manifest: RunManifest;
  /** SHA-256 identity of the canonical JSON of `manifest`; see `runManifestIdentity`. */
  artifact: ContentIdentity;
}

export interface ScenarioExperimentCost {
  amount: number;
  currency: string;
}

export interface ScenarioExperimentExecutorOptions {
  /** Absolute directory that every `task.source.path` must resolve under. */
  root: string;
  /**
   * Declared repetition count of the experiment (`manifest.repetitions`). The attempt input
   * carries only the one-based index, and run evidence records `{index, total}`.
   */
  repetitions: number;
  /** Build the client for one attempt. The executor closes it when the attempt ends. */
  createClient: (target: ExperimentTarget) => ModelClient | Promise<ModelClient>;
  /** Persist run evidence. A throw marks the attempt `infrastructure_failed`. */
  onEvidence?: (record: ScenarioExperimentEvidenceRecord) => void | Promise<void>;
  /** Per-case model request timeout in milliseconds. */
  timeoutMs?: number;
  /**
   * Attested spend for metered targets only. Never called for targets that declare
   * `cost_basis: not_applicable`. Returning `undefined` leaves cost unreported.
   */
  resolveCost?: (
    target: ExperimentTarget,
    manifest: RunManifest
  ) => ScenarioExperimentCost | undefined;
}

type SourceLoad = { ok: true; bytes: Uint8Array } | { ok: false; code: string };
type Classification = { status: ExecutedExperimentAttemptStatus; error_code?: string };

/** Tool-loop case error codes that indicate a transport or provider failure. */
const PROVIDER_TOOL_LOOP_ERRORS = new Set(['TOOL_GENERATION_FAILED', 'TOOL_LOOP_TIMEOUT']);
const CURRENCY = /^[A-Z]{3}$/;

/**
 * Create an attempt executor that runs `scenario_evaluation` tasks with `runScenario`.
 *
 * Status precedence: request budget stop → `incomplete`; any transport/provider case error →
 * `infrastructure_failed`; any response cut off at its token limit → `invalid`
 * (`response_truncated`); any invalid measurement → `invalid`; any failed valid case →
 * `task_failed`; otherwise `passed`. `policy_failed` is never emitted.
 *
 * Generation settings declared in `target.settings` (temperature, top_p, presence_penalty,
 * max_output_tokens) replace the scenario's own for that target's requests; the coordinate's
 * seed replaces the scenario seed. Evaluator (`llm_grader`) and embedding requests keep their
 * own settings. A target declaring an out-of-range value, or `top_k`/`min_p` (which no request
 * transport carries), is recorded `invalid` before any request is sent.
 */
export function createScenarioExperimentExecutor(
  options: ScenarioExperimentExecutorOptions
): ExperimentAttemptExecutor {
  assertOptions(options);
  const root = path.resolve(options.root);
  const execute: ExperimentAttemptExecutor = (input) => executeAttempt(root, options, input);
  execute.reserve = (request) => reserveAttempt(root, request);
  return execute;
}

/**
 * Tokens reserved per request beyond the UTF-8 bytes of its message text, for chat-template
 * markers, roles and special tokens. It is an estimate for admission only: a request whose
 * serving runtime adds more (for example a long default system prompt) simply draws the
 * excess from the run's uncommitted token budget, so an underestimate costs parallelism,
 * never measurements, while the run's token budget suffices. When the budget does not
 * suffice, an underestimate can let a concurrent run overrun `max_tokens` by up to roughly one
 * attempt's use per concurrency slot (one attempt serially) before the run halts and records
 * `budget_exceeded`.
 */
export const SCENARIO_PROMPT_TOKEN_ALLOWANCE = 256;

/** Expectations evaluated without any model request. */
const CLIENT_FREE_EXPECTATIONS = new Set([
  'exact',
  'regex',
  'fuzzy',
  'contains',
  'not_contains',
  'json_schema',
  'inline',
]);

/**
 * Declared demand for concurrent admission (see `ExperimentAttemptExecutor.reserve`). It is a
 * reservation, not a cap on use.
 *
 * Declared only when every case sends exactly one request: no tools, no case-level retries,
 * and only client-free expectations (`llm_grader`, `similarity` and `custom` may call the
 * model). Requests are then the case count, which is also this executor's own minimum.
 * Tokens are declared when the per-request output cap (`max_output_tokens`, else the
 * scenario's `maxTokens`) is known: per case, prompt UTF-8 bytes plus
 * `SCENARIO_PROMPT_TOKEN_ALLOWANCE` plus the output cap, an estimate rather than a bound. Cost
 * is never declared, so a metered target under a cost limit runs alone. Anything else
 * declares no demand and runs one attempt at a time.
 */
async function reserveAttempt(
  root: string,
  { task, target }: ExperimentDemandRequest
): Promise<ExperimentAttemptDemand | undefined> {
  if (task.kind !== 'scenario_evaluation' || task.source.kind !== 'scenario_evaluation') return;
  const source = await loadTaskSource(root, task.source);
  if (!source.ok) return;
  const scenario = parseScenarioBytes(source.bytes);
  if (!scenario || scenarioConflict(scenario, target)) return;
  const generation = targetGenerationSettings(target);
  if (!generation.ok) return;
  return scenarioDemand(scenario, generation.settings.max_output_tokens ?? scenario.maxTokens);
}

function scenarioDemand(
  scenario: Scenario,
  outputCap: number | undefined
): ExperimentAttemptDemand | undefined {
  if (scenario.setup?.tools?.length) return;
  if (!scenario.cases.every((item) => (item.retries ?? 0) === 0 && clientFree(item.expected)))
    return;
  const requests = scenario.cases.length;
  if (outputCap === undefined || !Number.isFinite(outputCap) || outputCap <= 0) return { requests };
  let tokens = 0;
  for (const item of scenario.cases)
    tokens += promptBytes(scenario, item) + SCENARIO_PROMPT_TOKEN_ALLOWANCE + Math.ceil(outputCap);
  return { requests, tokens };
}

function clientFree(expected: Expected): boolean {
  return expected.type === 'combined'
    ? expected.expectations.every(clientFree)
    : CLIENT_FREE_EXPECTATIONS.has(expected.type);
}

/** UTF-8 bytes of every message a case sends, the system prompt always counted. */
function promptBytes(scenario: Scenario, item: TestCase): number {
  const variables = mergeVariables(scenario.variables, item.variables);
  const prompt = substituteVariables(item.prompt, variables);
  const messages = typeof prompt === 'string' ? [prompt] : prompt.map((message) => message.content);
  const system = scenario.setup?.systemPrompt;
  if (system !== undefined) messages.push(substituteVariables(system, variables));
  return messages.reduce((sum, text) => sum + Buffer.byteLength(text), 0);
}

/** SHA-256 identity of a run manifest's canonical JSON (recursively sorted object keys). */
export function runManifestIdentity(manifest: RunManifest): ContentIdentity {
  return {
    schema_version: '1',
    algorithm: 'sha256',
    digest: createHash('sha256').update(canonicalJson(manifest)).digest('hex'),
  };
}

async function executeAttempt(
  root: string,
  options: ScenarioExperimentExecutorOptions,
  input: ExperimentAttemptInput
): Promise<ExperimentAttemptOutput> {
  const { task, target, coordinate } = input;
  if (task.kind !== 'scenario_evaluation' || task.source.kind !== 'scenario_evaluation') {
    return withoutRequests(task.kind, 'task_kind_unsupported');
  }
  if (coordinate.repetition_index > options.repetitions) {
    return withoutRequests(task.kind, 'repetition_out_of_range');
  }

  const source = await loadTaskSource(root, task.source);
  if (!source.ok) return withoutRequests(task.kind, source.code);

  const scenario = parseScenarioBytes(source.bytes);
  if (!scenario) return withoutRequests(task.kind, 'scenario_invalid');
  const conflict = scenarioConflict(scenario, target);
  if (conflict) return withoutRequests(task.kind, conflict);
  const generation = targetGenerationSettings(target);
  if (!generation.ok) return withoutRequests(task.kind, generation.code);
  if (scenario.cases.length > input.remaining_budget.requests) {
    return withoutRequests(task.kind, 'request_budget_insufficient', 'incomplete');
  }

  let client: ModelClient;
  try {
    client = await options.createClient(structuredClone(target));
    if (!isModelClient(client)) throw new TypeError('createClient returned no ModelClient');
  } catch {
    return withoutRequests(task.kind, 'client_unavailable', 'infrastructure_failed');
  }

  const meter = meterClient(client, input.remaining_budget.requests);
  try {
    return await runAndReport(options, input, scenario, generation.settings, meter);
  } finally {
    await closeClient(client);
  }
}

async function runAndReport(
  options: ScenarioExperimentExecutorOptions,
  input: ExperimentAttemptInput,
  scenario: Scenario,
  generation: GenerationSettings,
  meter: ClientMeter
): Promise<ExperimentAttemptOutput> {
  const { target, coordinate } = input;
  const measured =
    coordinate.seed === undefined ? scenario : { ...scenario, seed: coordinate.seed };
  let manifest: RunManifest;
  try {
    const run = await runScenario({
      scenario: measured,
      client: meter.client,
      resolvedConfig: effectiveGenerationConfig(target, measured, generation),
      generation: toGenerationOverrides(generation),
      concurrency: 1,
      retries: 0,
      timeout: options.timeoutMs,
      repetition: { index: coordinate.repetition_index, total: options.repetitions },
    });
    manifest = run.manifest;
  } catch {
    return output('infrastructure_failed', meter.usage(), unavailable(), 'scenario_run_failed');
  }

  const classification = classifyAttempt(meter, manifest.cases);
  const artifact = runManifestIdentity(manifest);

  if (options.onEvidence) {
    try {
      await options.onEvidence({
        coordinate_id: coordinate.coordinate_id,
        attempt_number: input.attempt_number,
        manifest,
        artifact,
      });
    } catch {
      return output('infrastructure_failed', meter.usage(), unavailable(), 'evidence_store_failed');
    }
  }

  const evidence: ExperimentTaskEvidence = {
    kind: 'scenario_evaluation',
    availability: 'available',
    artifact,
  };
  const usage = meter.usage();
  if (targetCostApplies(target) && options.resolveCost) {
    const cost = resolveAttemptCost(options.resolveCost, target, manifest);
    if (cost === null) {
      return output('infrastructure_failed', usage, evidence, 'cost_resolution_failed');
    }
    if (cost) usage.cost = cost;
  }
  return output(classification.status, usage, evidence, classification.error_code);
}

type TargetGeneration = { ok: true; settings: GenerationSettings } | { ok: false; code: string };

/** Read the target's generation settings, refusing values that could not be sent as declared. */
function targetGenerationSettings(target: ExperimentTarget): TargetGeneration {
  const { settings, issues } = readGenerationSettings(target.settings);
  if (issues.length > 0) return { ok: false, code: 'generation_settings_invalid' };
  if (UNTRANSPORTED_GENERATION_SETTINGS.some((key) => settings[key] !== undefined)) {
    return { ok: false, code: 'generation_setting_unsupported' };
  }
  return { ok: true, settings };
}

/**
 * The generation values every target request carried, recorded in the run manifest's
 * `resolved_config` so the evidence shows the condition that was measured. Values that were not
 * sent are absent: the serving runtime's own defaults applied to them. `source` marks whether
 * temperature and max tokens came from the target (`config`) or the scenario.
 */
function effectiveGenerationConfig(
  target: ExperimentTarget,
  scenario: Scenario,
  generation: GenerationSettings
): ResolvedConfig {
  const effort = target.settings?.reasoning_effort;
  const temperature = generation.temperature ?? scenario.temperature;
  const maxTokens = generation.max_output_tokens ?? scenario.maxTokens;
  return {
    provider: target.provider,
    model: target.model,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    ...(generation.top_p !== undefined ? { top_p: generation.top_p } : {}),
    ...(generation.presence_penalty !== undefined
      ? { presence_penalty: generation.presence_penalty }
      : {}),
    ...(scenario.seed !== undefined ? { seed: scenario.seed } : {}),
    ...(typeof effort === 'string' ? { reasoning_effort: effort } : {}),
    source: {
      ...(temperature !== undefined
        ? { temperature: generation.temperature !== undefined ? 'config' : 'scenario' }
        : {}),
      ...(maxTokens !== undefined
        ? { max_tokens: generation.max_output_tokens !== undefined ? 'config' : 'scenario' }
        : {}),
    },
  };
}

/**
 * Resolve a path under `root`, refusing absolute paths, `..` escapes and symlinks that leave
 * the root, then return the exact file bytes.
 */
async function loadTaskSource(root: string, source: ExperimentTaskSource): Promise<SourceLoad> {
  const relativePath = source.path;
  if (
    typeof relativePath !== 'string' ||
    relativePath.length === 0 ||
    relativePath.includes('\0') ||
    relativePath.includes('\\') ||
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath)
  ) {
    return { ok: false, code: 'source_path_rejected' };
  }
  const resolved = path.resolve(root, relativePath);
  if (!isInside(root, resolved)) return { ok: false, code: 'source_path_rejected' };

  let realFile: string;
  try {
    const realRoot = await realpath(root);
    realFile = await realpath(resolved);
    if (!isInside(realRoot, realFile)) return { ok: false, code: 'source_path_rejected' };
    if (!(await stat(realFile)).isFile()) return { ok: false, code: 'source_unreadable' };
    const bytes = await readFile(realFile);
    return digestMatches(bytes, source.artifact)
      ? { ok: true, bytes }
      : { ok: false, code: 'source_digest_mismatch' };
  } catch {
    return { ok: false, code: 'source_unreadable' };
  }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function digestMatches(bytes: Uint8Array, identity: ContentIdentity): boolean {
  if (identity.algorithm !== 'sha256') return false;
  return createHash('sha256').update(bytes).digest('hex') === identity.digest;
}

/**
 * Parse with the scenario schema validator but without `${VAR}` expansion: the measured
 * scenario must equal the digested bytes, and host environment values must never reach a
 * model prompt.
 */
function parseScenarioBytes(bytes: Uint8Array): Scenario | undefined {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return validateScenario(parseYaml(text));
  } catch {
    return undefined;
  }
}

/** Scenario declarations that would silently override the experiment's own controls. */
function scenarioConflict(scenario: Scenario, target: ExperimentTarget): string | undefined {
  if (scenario.cases.some((testCase) => testCase.model && testCase.model !== target.model)) {
    return 'scenario_model_conflict';
  }
  if (scenario.cases.some((testCase) => (testCase.retries ?? 0) > 0)) {
    return 'scenario_retries_unsupported';
  }
  return undefined;
}

/**
 * A response cut off at its token limit is not a valid answer to score: it measures the
 * environment's context or output cap, not the target's decision. It ranks below provider
 * errors and above other invalid measurements.
 */
function classifyAttempt(meter: ClientMeter, cases: CaseResult[]): Classification {
  if (meter.budgetStopped())
    return { status: 'incomplete', error_code: 'request_budget_exhausted' };
  const classification = classifyCases(cases);
  if (classification.status === 'infrastructure_failed' || !meter.truncated()) {
    return classification;
  }
  return { status: 'invalid', error_code: 'response_truncated' };
}

function classifyCases(cases: CaseResult[]): Classification {
  let invalid = false;
  let failed = false;
  for (const caseResult of cases) {
    const status = getCaseEvaluationStatus(caseResult);
    if (status === 'error') {
      if (isProviderError(caseResult)) {
        return { status: 'infrastructure_failed', error_code: 'provider_error' };
      }
      invalid = true;
    } else if (status === 'invalid') {
      invalid = true;
    } else if (status === 'failed') {
      failed = true;
    }
  }
  if (invalid) return { status: 'invalid', error_code: 'measurement_invalid' };
  if (failed) return { status: 'task_failed' };
  return { status: 'passed' };
}

/**
 * Timeouts and target errors are transport/provider failures. Tool-loop errors are the
 * target's own behaviour (unknown tool, duplicate call, step limit) and make the measurement
 * invalid, except when the loop's follow-up generation failed or timed out.
 */
function isProviderError(caseResult: CaseResult): boolean {
  const terminal = caseResult.attempt_evidence?.find((attempt) => attempt.included_in_outcome);
  if (!terminal || terminal.error_code !== 'tool_error') return true;
  return PROVIDER_TOOL_LOOP_ERRORS.has(caseResult.error ?? '');
}

/** Return the cost, `undefined` when unreported, or `null` when the resolver misbehaved. */
function resolveAttemptCost(
  resolve: NonNullable<ScenarioExperimentExecutorOptions['resolveCost']>,
  target: ExperimentTarget,
  manifest: RunManifest
): ScenarioExperimentCost | undefined | null {
  try {
    const cost = resolve(structuredClone(target), manifest);
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

function withoutRequests(
  kind: ExperimentAttemptInput['task']['kind'],
  code: string,
  status: ExecutedExperimentAttemptStatus = 'invalid'
): ExperimentAttemptOutput {
  // Zero requests means zero tokens is a reported fact, so live runs keep the real cause
  // instead of halting with `usage_unreported`.
  return output(status, { requests: 0, tokens: 0 }, { kind, availability: 'unavailable' }, code);
}

function output(
  status: ExecutedExperimentAttemptStatus,
  usage: ExperimentAttemptUsage,
  evidence: ExperimentTaskEvidence,
  errorCode?: string
): ExperimentAttemptOutput {
  return errorCode === undefined
    ? { status, usage, evidence }
    : { status, usage, evidence, error_code: errorCode };
}

function unavailable(): ExperimentTaskEvidence {
  return { kind: 'scenario_evaluation', availability: 'unavailable' };
}

function isModelClient(value: unknown): value is ModelClient {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ModelClient).generate === 'function' &&
    typeof (value as ModelClient).capabilities === 'function'
  );
}

async function closeClient(client: ModelClient): Promise<void> {
  try {
    await client.close?.();
  } catch {
    // The attempt result is already decided and its evidence stored; a failed close of a
    // per-attempt client cannot change the measurement.
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, sortKeys(record[key])])
  );
}

function assertOptions(options: ScenarioExperimentExecutorOptions): void {
  if (typeof options?.root !== 'string' || !path.isAbsolute(options.root)) {
    throw new TypeError('Scenario executor root must be an absolute path');
  }
  if (!Number.isSafeInteger(options.repetitions) || options.repetitions < 1) {
    throw new TypeError('Scenario executor repetitions must be a positive integer');
  }
  if (typeof options.createClient !== 'function') {
    throw new TypeError('Scenario executor requires a createClient function');
  }
  if (
    options.timeoutMs !== undefined &&
    (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    throw new TypeError('Scenario executor timeoutMs must be a positive integer');
  }
}
