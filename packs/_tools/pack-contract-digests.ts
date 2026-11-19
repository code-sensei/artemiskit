/**
 * Digest rules shared by the pack generator and the pack contract tests.
 *
 *   task digest     = SHA-256 of the exact task file bytes
 *   workload digest = SHA-256 of JSON.stringify([[path, digest], ...]) sorted by path
 *   rubric digest   = SHA-256 of RUBRIC.md
 *
 * Paths are relative to the pack directory and sorted by UTF-16 code unit.
 */

import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Order strings by UTF-16 code unit, independent of locale. */
export function compareCodeUnits(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Task source paths relative to the pack directory, sorted by code unit. */
export function listTaskPaths(packDir: string): string[] {
  return readdirSync(join(packDir, 'tasks'))
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => `tasks/${name}`)
    .sort(compareCodeUnits);
}

export function workloadDigest(pairs: ReadonlyArray<readonly [string, string]>): string {
  const sorted = [...pairs].sort((left, right) => compareCodeUnits(left[0], right[0]));
  return sha256(JSON.stringify(sorted));
}
