/**
 * Loading of an experiment task's source artifact for the built-in attempt executors.
 *
 * A source path must stay under the host-supplied root, and the loaded bytes must match the
 * declared artifact identity before anything is parsed or any model client is created.
 */

import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ContentIdentity } from '../../artifacts/types';
import type { ExperimentTaskSource } from '../types';

/** Exact verified bytes, or a sanitized refusal code. */
export type TaskSourceLoad =
  | { ok: true; bytes: Uint8Array; file: string }
  | { ok: false; code: 'source_path_rejected' | 'source_unreadable' | 'source_digest_mismatch' };

/**
 * Resolve `source.path` under `root`, refusing absolute paths, `..` escapes and symlinks that
 * leave the root, then return the exact file bytes and the real path they were read from.
 */
export async function loadTaskSource(
  root: string,
  source: ExperimentTaskSource
): Promise<TaskSourceLoad> {
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

  try {
    const realRoot = await realpath(root);
    const realFile = await realpath(resolved);
    if (!isInside(realRoot, realFile)) return { ok: false, code: 'source_path_rejected' };
    if (!(await stat(realFile)).isFile()) return { ok: false, code: 'source_unreadable' };
    const bytes = await readFile(realFile);
    return digestMatches(bytes, source.artifact)
      ? { ok: true, bytes, file: realFile }
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

/** Decode strict UTF-8, or `undefined` for invalid byte sequences. */
export function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}
