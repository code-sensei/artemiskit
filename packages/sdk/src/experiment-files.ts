/**
 * File-system boundary for experiment surfaces: bounded reads, result directories and
 * write-once evidence files. Shared by the SDK functions and the `akit experiment` CLI.
 */

import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ExperimentRunResult } from '@artemiskit/core';
import { MAX_CASE_EVIDENCE_BYTES } from '@artemiskit/reports';

/** Largest experiment definition the surfaces will read. */
export const MAX_EXPERIMENT_FILE_BYTES = 1_048_576;
/** Largest saved experiment result the report surface will read. */
export const MAX_EXPERIMENT_RESULT_BYTES = 64 * 1_048_576;
/** Default output root, relative to the working directory; ignored by git. */
export const DEFAULT_EXPERIMENT_OUTPUT_ROOT = path.join('artemis-output', 'experiments');
export const EXPERIMENT_RESULT_FILE = 'result.json';
export const EXPERIMENT_EVIDENCE_DIR = 'evidence';

/** Owner-only permissions: evidence holds prompts and model responses. */
const PRIVATE_FILE_MODE = 0o600;

/**
 * Exit-code-bearing failure for the experiment surfaces. `exitCode` is the CLI exit code the
 * same failure maps to, so SDK callers and the CLI agree.
 */
export class ExperimentSurfaceError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode: number) {
    super(message);
    this.name = 'ExperimentSurfaceError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

/** Read a regular file of at most `limit` bytes as strict UTF-8. */
export async function readBoundedText(file: string, limit: number): Promise<string> {
  const metadata = await stat(file);
  if (!metadata.isFile()) throw new ExperimentSurfaceError('not_a_file', 'Not a regular file', 1);
  if (metadata.size > limit) {
    throw new ExperimentSurfaceError('file_too_large', `File exceeds ${limit} bytes`, 1);
  }
  const bytes = await readFile(file);
  if (bytes.byteLength > limit) {
    throw new ExperimentSurfaceError('file_too_large', `File exceeds ${limit} bytes`, 1);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Lowercase hex SHA-256 of exact bytes. */
export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Canonical JSON with recursively sorted object keys. Matches the serialization of core's
 * `runManifestIdentity` and `workflowRecordIdentity`, so a saved evidence file's SHA-256 equals
 * its recorded artifact digest.
 */
export function canonicalJson(value: unknown): string {
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

/** `artemis-output/experiments/<id>/<timestamp>` under `cwd`, with a filename-safe timestamp. */
export function defaultExperimentOutputDir(experimentId: string, cwd: string, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return path.resolve(cwd, DEFAULT_EXPERIMENT_OUTPUT_ROOT, experimentId, stamp);
}

/** Create `directory` (and parents) and refuse to reuse one that already holds files. */
export async function prepareEmptyDirectory(directory: string): Promise<void> {
  try {
    await mkdir(directory, { recursive: true });
    if ((await readdir(directory)).length > 0) throw new Error('not_empty');
  } catch {
    throw new ExperimentSurfaceError(
      'output_unavailable',
      'Output directory is unavailable or not empty; choose a new directory',
      1
    );
  }
}

/** Write a new file; never overwrite. */
export async function writeNewFile(file: string, content: string): Promise<void> {
  const handle = await open(file, 'wx', PRIVATE_FILE_MODE);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Save one attempt's evidence (a scenario run manifest or a workflow record) as canonical JSON
 * named by its digest, and prove the written bytes match the identity recorded in the
 * experiment result. A throw marks the attempt `infrastructure_failed` in the executor.
 */
export async function saveAttemptEvidence(
  directory: string,
  evidence: unknown,
  digest: string
): Promise<string> {
  const content = canonicalJson(evidence);
  if (sha256Hex(content) !== digest) throw new Error('evidence_digest_mismatch');
  const evidenceDir = path.join(directory, EXPERIMENT_EVIDENCE_DIR);
  await mkdir(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, `${digest}.json`);
  try {
    await writeNewFile(file, content);
  } catch (error) {
    // Identical content already stored under its own digest is the same evidence.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (sha256Hex(await readFile(file)) !== digest) throw error;
  }
  return file;
}

/** Persist the V1 experiment result as pretty JSON. */
export async function saveExperimentResult(
  directory: string,
  result: ExperimentRunResult
): Promise<string> {
  const file = path.join(directory, EXPERIMENT_RESULT_FILE);
  try {
    await writeNewFile(file, `${JSON.stringify(result, null, 2)}\n`);
  } catch {
    throw new ExperimentSurfaceError(
      'result_unwritable',
      'Unable to save the experiment result',
      1
    );
  }
  return file;
}

const EVIDENCE_DIGEST = /^[a-f0-9]{64}$/;

/**
 * Read the saved evidence files named by `digests` from an `evidence/` directory, as exact bytes
 * keyed by digest. A missing, unreadable or oversized file maps to `null` so the case-level
 * summary reports it; the bytes are verified against the digest by the report model, not here.
 * Returns `undefined` when the directory does not exist (results saved without evidence).
 */
export async function readExperimentCaseEvidence(
  evidenceDir: string,
  digests: readonly string[]
): Promise<Map<string, Uint8Array | null> | undefined> {
  try {
    if (!(await stat(evidenceDir)).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  const files = new Map<string, Uint8Array | null>();
  for (const digest of digests) {
    files.set(
      digest,
      EVIDENCE_DIGEST.test(digest) ? await readEvidenceBytes(evidenceDir, digest) : null
    );
  }
  return files;
}

async function readEvidenceBytes(evidenceDir: string, digest: string): Promise<Uint8Array | null> {
  const file = path.join(evidenceDir, `${digest}.json`);
  try {
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size > MAX_CASE_EVIDENCE_BYTES) return null;
    const bytes = await readFile(file);
    return bytes.byteLength > MAX_CASE_EVIDENCE_BYTES ? null : new Uint8Array(bytes);
  } catch {
    return null;
  }
}
