/**
 * Content identity of attempt evidence: SHA-256 of canonical JSON (recursively sorted object
 * keys), so a host that saves `canonicalJson(value)` can prove the saved bytes match.
 */

import { createHash } from 'node:crypto';
import type { ContentIdentity } from '../../artifacts/types';

/** SHA-256 identity of the canonical JSON of `value`. */
export function canonicalJsonIdentity(value: unknown): ContentIdentity {
  return {
    schema_version: '1',
    algorithm: 'sha256',
    digest: createHash('sha256').update(canonicalJson(value)).digest('hex'),
  };
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
