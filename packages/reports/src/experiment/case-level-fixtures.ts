/**
 * Experiment fixtures with real per-attempt evidence bytes, for case-level summary tests.
 *
 * Matrix: tasks `s1` (3 cases, en, policy p1), `s2` (2 cases, fr) and workflow `w`; targets
 * `alpha` and `beta`; 2 repetitions; `s2` × `beta` is a declared exclusion.
 */

import { createHash } from 'node:crypto';
import {
  type ExecutedExperimentAttemptStatus,
  type ExperimentManifest,
  type ExperimentRunResult,
  runExperiment,
} from '@artemiskit/core';

type CaseStatus = 'passed' | 'failed' | 'invalid' | 'error';

export interface PlannedAttempt {
  status: ExecutedExperimentAttemptStatus;
  error_code?: string;
  /** Case statuses saved as the attempt's scenario evidence; omit for unavailable evidence. */
  cases?: CaseStatus[];
  /** Raw evidence value instead of a generated run manifest. */
  evidence?: unknown;
  /** Case ids override (defaults to `<task>-c<n>`). */
  caseIds?: string[];
}

const sha = (character: string) => character.repeat(64);

export function canonicalBytes(value: unknown): Uint8Array {
  const sortKeys = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sortKeys);
    if (item === null || typeof item !== 'object') return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])])
    );
  };
  return new TextEncoder().encode(JSON.stringify(sortKeys(value)));
}

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function runManifest(key: string, attempt: PlannedAttempt) {
  const task = key.split(':')[0];
  return {
    version: '1.4',
    run_id: `run-${key}`,
    cases: (attempt.cases ?? []).map((status, index) => ({
      id: attempt.caseIds?.[index] ?? `${task}-c${index + 1}`,
      ok: status === 'passed',
      status,
      score: status === 'passed' ? 1 : 0,
      matcherType: 'contains',
      latencyMs: 1,
      tokens: { prompt: 1, completion: 1, total: 2 },
      prompt: 'synthetic prompt',
      response: 'synthetic response',
      expected: {},
      tags: [],
    })),
  };
}

export function caseLevelManifest(): ExperimentManifest {
  const source = (path: string, kind: 'scenario_evaluation' | 'agent_workflow', c: string) => ({
    kind,
    path,
    artifact: { schema_version: '1' as const, algorithm: 'sha256' as const, digest: sha(c) },
  });
  return {
    schema_version: '1',
    id: 'case-level-fixture',
    mode: 'fixture',
    identities: {
      schema_version: '1',
      workload: { schema_version: '1', algorithm: 'sha256', digest: sha('1') },
      rubric: { schema_version: '1', algorithm: 'sha256', digest: sha('2') },
    },
    tasks: [
      {
        id: 's1',
        kind: 'scenario_evaluation',
        source: source('tasks/s1.yaml', 'scenario_evaluation', '4'),
        required_capabilities: [],
        language: 'en',
        policy: 'p1',
      },
      {
        id: 's2',
        kind: 'scenario_evaluation',
        source: source('tasks/s2.yaml', 'scenario_evaluation', '5'),
        required_capabilities: [],
        language: 'fr',
      },
      {
        id: 'w',
        kind: 'agent_workflow',
        source: source('tasks/w.json', 'agent_workflow', '6'),
        required_capabilities: [],
        language: 'en',
        policy: 'p1',
      },
    ],
    targets: [
      { id: 'alpha', provider: 'fixture', model: 'alpha-model', capabilities: [] },
      { id: 'beta', provider: 'fixture', model: 'beta-model', capabilities: [] },
    ],
    repetitions: 2,
    concurrency: 1,
    exclusions: [
      { id: 'skip-s2-beta', reason: 'Declared exclusion', task_id: 's2', target_id: 'beta' },
    ],
    retry_policy: { max_attempts: 2, retry_on: ['infrastructure_failed'] },
    budgets: { max_requests: 100, max_tokens: 100_000 },
  };
}

/** Mixed outcomes; keys are `<task>:<target>:<repetition>:<attempt>`. */
export function mixedCasePlan(): Record<string, PlannedAttempt> {
  return {
    's1:alpha:1:1': { status: 'passed', cases: ['passed', 'passed', 'passed'] },
    's1:alpha:2:1': {
      status: 'infrastructure_failed',
      error_code: 'provider_error',
      cases: ['passed', 'error', 'passed'],
    },
    's1:alpha:2:2': { status: 'task_failed', cases: ['passed', 'failed', 'passed'] },
    's1:beta:1:1': { status: 'task_failed', cases: ['failed', 'failed', 'passed'] },
    's1:beta:2:1': {
      status: 'invalid',
      error_code: 'response_truncated',
      cases: ['passed', 'passed', 'failed'],
    },
    's2:alpha:1:1': {
      status: 'invalid',
      error_code: 'measurement_invalid',
      cases: ['passed', 'invalid'],
    },
    's2:alpha:2:1': { status: 'passed', cases: ['passed', 'passed'] },
    'w:alpha:1:1': { status: 'policy_failed', evidence: { workflow: 'record-a1' } },
    'w:alpha:2:1': { status: 'passed', evidence: { workflow: 'record-a2' } },
    'w:beta:1:1': { status: 'passed', evidence: { workflow: 'record-b1' } },
    'w:beta:2:1': { status: 'task_failed', evidence: { workflow: 'record-b2' } },
  };
}

export interface CaseLevelFixture {
  result: ExperimentRunResult;
  /** Evidence bytes by digest for every attempt with available evidence. */
  files: Map<string, Uint8Array>;
  /** Digest of each planned attempt with available evidence, by plan key. */
  digests: Record<string, string>;
}

export async function caseLevelFixture(
  plan: Record<string, PlannedAttempt> = mixedCasePlan(),
  manifest: ExperimentManifest = caseLevelManifest()
): Promise<CaseLevelFixture> {
  const files = new Map<string, Uint8Array>();
  const digests: Record<string, string> = {};
  const result = await runExperiment(manifest, {
    execute_attempt: async (input) => {
      const { coordinate } = input;
      const key = `${coordinate.task_id}:${coordinate.target_id}:${coordinate.repetition_index}:${input.attempt_number}`;
      const attempt = plan[key];
      if (!attempt) throw new Error(`No planned attempt for ${key}`);
      const content = attempt.evidence ?? (attempt.cases ? runManifest(key, attempt) : undefined);
      const usage = { requests: 1, tokens: 3 };
      if (content === undefined)
        return {
          status: attempt.status,
          usage,
          evidence: { kind: coordinate.task_kind, availability: 'unavailable' },
          ...(attempt.error_code ? { error_code: attempt.error_code } : {}),
        };
      const bytes = canonicalBytes(content);
      const digest = sha256(bytes);
      files.set(digest, bytes);
      digests[key] = digest;
      return {
        status: attempt.status,
        usage,
        evidence: {
          kind: coordinate.task_kind,
          availability: 'available',
          artifact: { schema_version: '1', algorithm: 'sha256', digest },
        },
        ...(attempt.error_code ? { error_code: attempt.error_code } : {}),
      };
    },
  });
  return { result, files, digests };
}
