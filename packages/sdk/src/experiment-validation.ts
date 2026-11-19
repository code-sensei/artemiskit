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
  isLoopbackEndpoint,
  parseExperimentManifest,
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
 * its exact bytes match the declared SHA-256; that scenario sources parse; and that every target
 * declaring `cost_basis: not_applicable` names a loopback `settings.base_url`.
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

  for (const task of manifest.tasks) checks.push(await checkTask(root, task));
  for (const target of manifest.targets) checks.push(checkTarget(target));
  return finish(manifest);
}

async function checkTask(root: string, task: ExperimentTask): Promise<ExperimentCheck> {
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
      return fail('source_outside_root', `${task.source.path} resolves outside ${root}`);
    }
    if (!(await stat(realFile)).isFile()) {
      return fail('source_not_file', `${task.source.path} is not a regular file`);
    }
    bytes = await readFile(realFile);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? fail('source_missing', `${task.source.path} does not exist under ${root}`)
      : fail('source_unreadable', `${task.source.path} is unreadable`);
  }

  if (sha256Hex(bytes) !== task.source.artifact.digest) {
    return fail(
      'source_digest_mismatch',
      `${task.source.path}: SHA-256 of the file bytes does not match the declared digest`
    );
  }
  if (task.kind === 'agent_workflow') {
    return {
      subject: 'task',
      id: task.id,
      status: 'warning',
      code: 'task_kind_unsupported',
      message: `${task.source.path}: digest verified; agent_workflow tasks have no built-in experiment executor yet, so their coordinates will be recorded invalid`,
    };
  }
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    validateScenario(parseYaml(source));
  } catch {
    return fail('scenario_invalid', `${task.source.path}: digest verified but scenario is invalid`);
  }
  return {
    subject: 'task',
    id: task.id,
    status: 'ok',
    code: 'source_verified',
    message: `${task.source.path}: digest verified; scenario parsed`,
  };
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
