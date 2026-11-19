/**
 * Offline validation of an experiment file: manifest contract, task source identities and the
 * host-side locality check for targets that declare no metered cost. Makes no model calls.
 */

import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  type ExperimentManifest,
  type ExperimentMode,
  type ExperimentTarget,
  type ExperimentTask,
  GENERATION_SETTING_KEYS,
  type GenerationSettingKey,
  isGenerationSettingKey,
  isLoopbackEndpoint,
  parseAgentWorkflow,
  parseExperimentManifest,
  readGenerationSettings,
  validateScenario,
} from '@artemiskit/core';
import { parse as parseYaml } from 'yaml';
import { MAX_EXPERIMENT_FILE_BYTES, readBoundedText, sha256Hex } from './experiment-files';

export type ExperimentCheckSubject = 'file' | 'manifest' | 'task' | 'target';
export type ExperimentCheckStatus = 'ok' | 'warning' | 'error';

/** One validation finding. `code` is stable and machine-readable. */
export interface ExperimentCheck {
  subject: ExperimentCheckSubject;
  /** Task or target ID for task and target checks. */
  id?: string;
  status: ExperimentCheckStatus;
  code: string;
  message: string;
}

export interface ExperimentValidation {
  /** True when no check has status `error`. Warnings do not block a run. */
  valid: boolean;
  /** Absolute path of the experiment file. */
  file: string;
  /** Directory that task source paths resolve under (the experiment file's directory). */
  root: string;
  experimentId?: string;
  mode?: ExperimentMode;
  /** Declared concurrency limit (coordinates in flight), when the manifest is valid. */
  concurrency?: number;
  /** Parsed manifest, present when the manifest contract itself is valid. */
  manifest?: ExperimentManifest;
  checks: ExperimentCheck[];
  /** CLI exit code for `akit experiment validate`: 0 valid, 1 unreadable file, 2 invalid. */
  exitCode: 0 | 1 | 2;
}

export const LOOPBACK_REQUIRED_MESSAGE =
  'cost not applicable is only accepted for loopback endpoints';

/**
 * Validate an experiment file without contacting any model or network endpoint.
 *
 * Checks the manifest contract; that each task source exists under the experiment directory and
 * its exact bytes match the declared SHA-256; that scenario and workflow sources parse; that
 * workflow tasks can run as declared (warnings otherwise); that every target
 * declaring `cost_basis: not_applicable` names a loopback `settings.base_url`; and that target
 * generation settings are in range and sent by the target's provider adapter.
 */
export async function validateExperimentFile(
  experimentFile: string
): Promise<ExperimentValidation> {
  const file = path.resolve(experimentFile);
  const root = path.dirname(file);
  const checks: ExperimentCheck[] = [];
  const finish = (manifest?: ExperimentManifest): ExperimentValidation => {
    const unreadable = checks.some((check) => check.code === 'file_unreadable');
    const valid = checks.every((check) => check.status !== 'error');
    return {
      valid,
      file,
      root,
      experimentId: manifest?.id,
      mode: manifest?.mode,
      concurrency: manifest?.concurrency,
      manifest,
      checks,
      exitCode: valid ? 0 : unreadable ? 1 : 2,
    };
  };

  let text: string;
  try {
    text = await readBoundedText(file, MAX_EXPERIMENT_FILE_BYTES);
  } catch {
    checks.push(
      fileError('file_unreadable', 'Experiment file is missing, unreadable or too large')
    );
    return finish();
  }

  let raw: unknown;
  try {
    // YAML is a superset of JSON. No `${VAR}` expansion: the manifest is taken as written.
    raw = parseYaml(text);
  } catch {
    checks.push(fileError('file_unparseable', 'Experiment file is not valid YAML or JSON'));
    return finish();
  }

  let manifest: ExperimentManifest;
  try {
    manifest = parseExperimentManifest(raw);
  } catch (error) {
    for (const message of manifestIssues(error)) {
      checks.push({ subject: 'manifest', status: 'error', code: 'manifest_invalid', message });
    }
    return finish();
  }
  checks.push({
    subject: 'manifest',
    status: 'ok',
    code: 'manifest_valid',
    message: `${manifest.mode} experiment: ${manifest.tasks.length} task(s) × ${manifest.targets.length} target(s) × ${manifest.repetitions} repetition(s)`,
  });

  for (const task of manifest.tasks) checks.push(...(await checkTask(root, task)));
  for (const target of manifest.targets) {
    checks.push(checkTarget(target), ...checkTargetSettings(target));
  }
  checks.push(...checkWorkflowRunConditions(manifest));
  return finish(manifest);
}

async function checkTask(root: string, task: ExperimentTask): Promise<ExperimentCheck[]> {
  const fail = (code: string, message: string): ExperimentCheck => ({
    subject: 'task',
    id: task.id,
    status: 'error',
    code,
    message,
  });
  const resolved = path.resolve(root, task.source.path);

  let bytes: Uint8Array;
  try {
    const realRoot = await realpath(root);
    const realFile = await realpath(resolved);
    if (!isInside(realRoot, realFile)) {
      return [fail('source_outside_root', `${task.source.path} resolves outside ${root}`)];
    }
    if (!(await stat(realFile)).isFile()) {
      return [fail('source_not_file', `${task.source.path} is not a regular file`)];
    }
    bytes = await readFile(realFile);
  } catch (error) {
    return [
      (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? fail('source_missing', `${task.source.path} does not exist under ${root}`)
        : fail('source_unreadable', `${task.source.path} is unreadable`),
    ];
  }

  if (sha256Hex(bytes) !== task.source.artifact.digest) {
    return [
      fail(
        'source_digest_mismatch',
        `${task.source.path}: SHA-256 of the file bytes does not match the declared digest`
      ),
    ];
  }
  if (task.kind === 'agent_workflow') return checkWorkflowSource(task, bytes);
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    validateScenario(parseYaml(source));
  } catch {
    return [
      fail('scenario_invalid', `${task.source.path}: digest verified but scenario is invalid`),
    ];
  }
  return [
    {
      subject: 'task',
      id: task.id,
      status: 'ok',
      code: 'source_verified',
      message: `${task.source.path}: digest verified; scenario parsed`,
    },
  ];
}

/**
 * Parse a verified workflow source exactly as the executor does: no `${VAR}` expansion and no
 * fixture dereferencing. Semantic outcomes need an independent judge that experiment runs do
 * not configure, so they are reported as a warning.
 */
function checkWorkflowSource(task: ExperimentTask, bytes: Uint8Array): ExperimentCheck[] {
  const check = (
    status: ExperimentCheckStatus,
    code: string,
    message: string
  ): ExperimentCheck => ({ subject: 'task', id: task.id, status, code, message });
  let semanticOutcomes: number;
  let environment: string;
  try {
    const workflow = parseAgentWorkflow(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    semanticOutcomes = workflow.outcomes.semantic?.length ?? 0;
    environment = workflow.environment.type;
  } catch {
    return [
      check(
        'error',
        'workflow_invalid',
        `${task.source.path}: digest verified but agent workflow is invalid`
      ),
    ];
  }
  const checks = [
    check(
      'ok',
      'source_verified',
      `${task.source.path}: digest verified; agent workflow parsed (${environment} environment, network denied)`
    ),
  ];
  if (semanticOutcomes > 0) {
    checks.push(
      check(
        'warning',
        'semantic_judge_unavailable',
        `${task.source.path}: declares semantic outcomes, which need an independent judge that experiment runs do not configure; its coordinates will be recorded invalid`
      )
    );
  }
  return checks;
}

/** Target settings the workflow engine sends; any other generation setting is refused. */
const WORKFLOW_GENERATION_SETTINGS: readonly GenerationSettingKey[] = [
  'temperature',
  'max_output_tokens',
];

/**
 * Warn about experiment controls the workflow engine cannot honour. The executor records the
 * affected workflow coordinates invalid rather than measuring a different condition.
 */
function checkWorkflowRunConditions(manifest: ExperimentManifest): ExperimentCheck[] {
  if (!manifest.tasks.some((task) => task.kind === 'agent_workflow')) return [];
  const checks: ExperimentCheck[] = [];
  if (manifest.seed) {
    checks.push({
      subject: 'manifest',
      status: 'warning',
      code: 'workflow_seed_unsupported',
      message:
        'The workflow engine sends no seed, so agent_workflow coordinates of a seeded experiment will be recorded invalid',
    });
  }
  for (const target of manifest.targets) {
    const { settings } = readGenerationSettings(target.settings ?? {});
    const unsent = GENERATION_SETTING_KEYS.filter(
      (key) => settings[key] !== undefined && !WORKFLOW_GENERATION_SETTINGS.includes(key)
    );
    if (unsent.length === 0) continue;
    checks.push({
      subject: 'target',
      id: target.id,
      status: 'warning',
      code: 'workflow_setting_unsupported',
      message: `The workflow engine sends only ${WORKFLOW_GENERATION_SETTINGS.join(' and ')}; with settings.${unsent.join(', settings.')} this target's agent_workflow coordinates will be recorded invalid`,
    });
  }
  return checks;
}

/** Values accepted for a target's `settings.reasoning_effort`. */
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const;

export function isReasoningEffort(value: unknown): value is (typeof REASONING_EFFORTS)[number] {
  return typeof value === 'string' && (REASONING_EFFORTS as readonly string[]).includes(value);
}

function checkTarget(target: ExperimentTarget): ExperimentCheck {
  const effort = target.settings?.reasoning_effort;
  if (effort !== undefined && !isReasoningEffort(effort)) {
    return {
      subject: 'target',
      id: target.id,
      status: 'error',
      code: 'invalid_reasoning_effort',
      message: `settings.reasoning_effort must be one of ${REASONING_EFFORTS.join(', ')}`,
    };
  }
  if (target.deployment?.cost_basis !== 'not_applicable') {
    return {
      subject: 'target',
      id: target.id,
      status: 'ok',
      code: 'target_declared',
      message: `${target.provider} ${target.model}`,
    };
  }
  const baseUrl = target.settings?.base_url;
  if (typeof baseUrl !== 'string' || !isLoopbackEndpoint(baseUrl)) {
    // The URL itself is not echoed: a rejected URL may carry userinfo credentials.
    return {
      subject: 'target',
      id: target.id,
      status: 'error',
      code: 'cost_not_applicable_requires_loopback',
      message: `${LOOPBACK_REQUIRED_MESSAGE}; settings.base_url is ${
        typeof baseUrl === 'string' ? 'not a loopback http(s) URL' : 'missing'
      }`,
    };
  }
  return {
    subject: 'target',
    id: target.id,
    status: 'ok',
    code: 'loopback_verified',
    message: `${target.provider} ${target.model} on a loopback endpoint; cost not applicable`,
  };
}

/** Target settings keys the built-in executor and adapters read, besides generation keys. */
const TRANSPORT_SETTING_KEYS = new Set(['base_url', 'reasoning_effort']);

/**
 * Providers whose built-in adapter sends each generation setting. `temperature` and
 * `max_output_tokens` replace the scenario's own values, which every adapter receives. No
 * adapter sends `top_k` or `min_p`: the OpenAI chat completions request has no such field, and
 * Ollama's /v1/chat/completions decodes neither (https://docs.ollama.com/api/openai-compatibility).
 */
const GENERATION_SETTING_PROVIDERS: Readonly<
  Record<GenerationSettingKey, readonly string[] | 'all'>
> = {
  temperature: 'all',
  max_output_tokens: 'all',
  top_p: ['openai', 'azure-openai', 'anthropic', 'vercel-ai'],
  presence_penalty: ['openai', 'azure-openai'],
  top_k: [],
  min_p: [],
};

/**
 * Common spellings of generation settings and the declared key they mean. Setting names are
 * lowercase identifiers, so camelCase spellings are already refused by the manifest parser.
 */
const GENERATION_SETTING_ALIASES: Readonly<Record<string, GenerationSettingKey>> = {
  max_tokens: 'max_output_tokens',
  maxtokens: 'max_output_tokens',
  max_completion_tokens: 'max_output_tokens',
  maxoutputtokens: 'max_output_tokens',
  num_predict: 'max_output_tokens',
  topp: 'top_p',
  topk: 'top_k',
  minp: 'min_p',
  presencepenalty: 'presence_penalty',
};

/** Names that look like sampling or output controls but are not supported target settings. */
const GENERATION_LIKE_KEY =
  /temperature|top_?[pk]|min_?p|penalty|tokens|predict|seed|^stop|mirostat|typical|sampl|num_ctx/i;

/**
 * Check target generation settings: values in range, sent by the target's provider adapter, and
 * no unrecognised generation-like keys. Other unknown keys are reported as unused.
 */
function checkTargetSettings(target: ExperimentTarget): ExperimentCheck[] {
  const settings = target.settings ?? {};
  const checks: ExperimentCheck[] = [];
  const error = (code: string, message: string): ExperimentCheck => ({
    subject: 'target',
    id: target.id,
    status: 'error',
    code,
    message,
  });

  for (const key of Object.keys(settings)) {
    if (isGenerationSettingKey(key) || TRANSPORT_SETTING_KEYS.has(key)) continue;
    const alias = GENERATION_SETTING_ALIASES[key];
    if (alias) {
      checks.push(
        error('unknown_generation_setting', `settings.${key} is not supported; use ${alias}`)
      );
    } else if (key === 'seed') {
      checks.push(
        error(
          'unknown_generation_setting',
          'settings.seed is not supported; declare the experiment seed (seed.value and seed.strategy) instead'
        )
      );
    } else if (GENERATION_LIKE_KEY.test(key)) {
      checks.push(
        error(
          'unknown_generation_setting',
          `settings.${key} is not a supported generation setting; supported: ${GENERATION_SETTING_KEYS.join(', ')}`
        )
      );
    } else {
      checks.push({
        subject: 'target',
        id: target.id,
        status: 'warning',
        code: 'target_setting_unused',
        message: `settings.${key} is recorded with the target but not sent to the model`,
      });
    }
  }

  const { settings: generation, issues } = readGenerationSettings(settings);
  for (const issue of issues) checks.push(error('invalid_generation_setting', issue.message));
  for (const key of GENERATION_SETTING_KEYS) {
    if (generation[key] === undefined || providerSends(key, target.provider)) continue;
    checks.push(error('generation_setting_unsupported', unsupportedMessage(key, target)));
  }

  const declared = GENERATION_SETTING_KEYS.filter((key) => generation[key] !== undefined);
  if (declared.length > 0 && checks.every((check) => check.status !== 'error')) {
    checks.push({
      subject: 'target',
      id: target.id,
      status: 'ok',
      code: 'generation_settings',
      message: `${declared.map((key) => `${key} ${generation[key]}`).join(', ')} replace task values for this target`,
    });
  }
  return checks;
}

function providerSends(key: GenerationSettingKey, provider: string): boolean {
  const providers = GENERATION_SETTING_PROVIDERS[key];
  return providers === 'all' || providers.includes(provider);
}

function unsupportedMessage(key: GenerationSettingKey, target: ExperimentTarget): string {
  if (key !== 'top_k' && key !== 'min_p') {
    return `settings.${key} is not sent by the ${target.provider} adapter; remove it`;
  }
  const ollama = target.deployment?.runtime === 'ollama' || target.provider === 'openai';
  return ollama
    ? `settings.${key} cannot be sent: OpenAI-compatible chat completions (including Ollama's /v1 endpoint) have no ${key} field, so the model's server default would apply silently. Remove it and record the model's default (for Ollama, its Modelfile PARAMETER ${key}) instead`
    : `settings.${key} cannot be sent: no built-in adapter carries ${key}, so the model's default would apply silently. Remove it`;
}

function fileError(code: string, message: string): ExperimentCheck {
  return { subject: 'file', status: 'error', code, message };
}

/** Bounded, path-qualified messages from a manifest parse failure. */
function manifestIssues(error: unknown): string[] {
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] })?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return ['Experiment manifest is invalid'];
  return issues
    .slice(0, 20)
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`);
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
