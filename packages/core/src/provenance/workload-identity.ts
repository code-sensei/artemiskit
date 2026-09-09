/**
 * Canonical, redacted workload identities for reproducible assessment evidence.
 */

import { createHash } from 'node:crypto';
import type { WorkloadIdentity } from '../artifacts/types';
import { redactText, resolvePatterns } from '../redaction/redactor';
import { DEFAULT_REDACTION_PATTERNS } from '../redaction/types';
import type { Scenario } from '../scenario/schema';

const SENSITIVE_KEY = /(?:api[-_]?key|authorization|auth|credential|password|secret|token)$/i;
const REDACTED_SECRET = '[REDACTED_SECRET]';

/**
 * Create independent identities for the declared workload and its evaluation
 * criteria. Input is sorted, redacted, and hashed locally; raw material is
 * never retained in the identity artifact.
 */
export function createWorkloadIdentity(scenario: Scenario): WorkloadIdentity {
  const patterns = resolvePatterns([
    ...DEFAULT_REDACTION_PATTERNS,
    ...(scenario.redaction?.patterns ?? []),
  ]).map(({ regex }) => regex);

  const workload = {
    name: scenario.name,
    version: scenario.version,
    description: scenario.description,
    tags: scenario.tags,
    variables: scenario.variables,
    setup: scenario.setup,
    cases: scenario.cases.map((testCase) => ({
      id: testCase.id,
      name: testCase.name,
      description: testCase.description,
      prompt: testCase.prompt,
      tags: testCase.tags,
      metadata: testCase.metadata,
      timeout: testCase.timeout,
      retries: testCase.retries,
      variables: testCase.variables,
    })),
  };

  const rubric = {
    cases: scenario.cases.map((testCase) => ({
      id: testCase.id,
      expected: testCase.expected,
    })),
  };

  return {
    schema_version: '1',
    workload: createContentIdentity(workload, patterns),
    rubric: createContentIdentity(rubric, patterns),
  };
}

function createContentIdentity(value: unknown, patterns: RegExp[]) {
  const canonical = JSON.stringify(canonicalize(value, patterns));
  return {
    schema_version: '1' as const,
    algorithm: 'sha256' as const,
    digest: createHash('sha256').update(canonical).digest('hex'),
  };
}

function canonicalize(value: unknown, patterns: RegExp[], key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return REDACTED_SECRET;

  if (typeof value === 'string') {
    return redactText(value, patterns, REDACTED_SECRET).text;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item, patterns));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([nestedKey, nestedValue]) => [
          nestedKey,
          canonicalize(nestedValue, patterns, nestedKey),
        ])
    );
  }

  return value;
}
