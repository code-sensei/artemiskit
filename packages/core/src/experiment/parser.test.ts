import { describe, expect, test } from 'bun:test';
import { assessExperimentCompatibility } from './compatibility';
import { parseExperimentManifest } from './parser';
import type { ExperimentManifest } from './types';

const identity = (digit: string) => ({
  schema_version: '1' as const,
  algorithm: 'sha256' as const,
  digest: digit.repeat(64),
});

const MANIFEST: ExperimentManifest = {
  schema_version: '1',
  id: 'provider-comparison',
  mode: 'fixture',
  identities: {
    schema_version: '1',
    workload: identity('a'),
    rubric: identity('b'),
    policy: identity('c'),
    profile: identity('d'),
  },
  tasks: [
    {
      id: 'answer-case',
      kind: 'scenario_evaluation',
      required_capabilities: ['text'],
      language: 'en-NG',
      policy: 'customer-service',
    },
    {
      id: 'resolve-case',
      kind: 'agent_workflow',
      required_capabilities: ['text', 'tools'],
    },
  ],
  targets: [
    {
      id: 'fixture-a',
      provider: 'fixture',
      model: 'deterministic-a',
      capabilities: ['text'],
      settings: { temperature: 0, strict: true },
    },
    {
      id: 'fixture-b',
      provider: 'fixture',
      model: 'deterministic-b',
      capabilities: ['text', 'tools'],
    },
  ],
  repetitions: 3,
  retry_policy: { max_attempts: 2, retry_on: ['infrastructure_failed'] },
  budgets: { max_requests: 24 },
};

describe('parseExperimentManifest', () => {
  test('accepts bounded scenario and workflow tasks with provider-neutral targets', () => {
    expect(parseExperimentManifest(MANIFEST)).toEqual(MANIFEST);
    const { mode: _mode, ...withoutMode } = MANIFEST;
    expect(parseExperimentManifest(withoutMode).mode).toBe('fixture');
  });

  test('rejects duplicate task, target, capability, and retry identities', () => {
    expect(() =>
      parseExperimentManifest({ ...MANIFEST, tasks: [MANIFEST.tasks[0], MANIFEST.tasks[0]] })
    ).toThrow();
    expect(() =>
      parseExperimentManifest({ ...MANIFEST, targets: [MANIFEST.targets[0], MANIFEST.targets[0]] })
    ).toThrow();
    expect(() =>
      parseExperimentManifest({
        ...MANIFEST,
        tasks: [{ ...MANIFEST.tasks[0], required_capabilities: ['text', 'text'] }],
      })
    ).toThrow();
    expect(() =>
      parseExperimentManifest({
        ...MANIFEST,
        retry_policy: { max_attempts: 2, retry_on: ['invalid', 'invalid'] },
      })
    ).toThrow();
  });

  test('bounds the matrix and rejects credential-bearing settings', () => {
    expect(() =>
      parseExperimentManifest({
        ...MANIFEST,
        repetitions: 100,
        tasks: Array(101).fill(MANIFEST.tasks[0]),
      })
    ).toThrow();
    expect(() =>
      parseExperimentManifest({
        ...MANIFEST,
        targets: [{ ...MANIFEST.targets[0], settings: { api_key: 'secret' } }],
      })
    ).toThrow('target settings must not contain credentials or secrets');
  });

  test('requires request, token, and cost boundaries for live execution', () => {
    expect(() => parseExperimentManifest({ ...MANIFEST, mode: 'live' })).toThrow(
      'live experiments require an explicit token limit'
    );
    expect(
      parseExperimentManifest({
        ...MANIFEST,
        mode: 'live',
        budgets: {
          max_requests: 24,
          max_tokens: 50_000,
          max_cost: { amount: 5, currency: 'USD' },
        },
      }).mode
    ).toBe('live');
  });

  test('rejects unknown fields and malformed identities', () => {
    expect(() => parseExperimentManifest({ ...MANIFEST, provider: 'fixture' })).toThrow();
    expect(() =>
      parseExperimentManifest({
        ...MANIFEST,
        identities: { ...MANIFEST.identities, workload: identity('z') },
      })
    ).toThrow();
  });
});

describe('assessExperimentCompatibility', () => {
  test('accepts identical identities and ignores target configuration dimensions', () => {
    expect(assessExperimentCompatibility(MANIFEST.identities, MANIFEST.identities)).toEqual({
      schema_version: '1',
      status: 'compatible',
      reasons: [],
    });
  });

  test('rejects mismatched workload, rubric, policy, and profile identities', () => {
    expect(
      assessExperimentCompatibility(MANIFEST.identities, {
        ...MANIFEST.identities,
        workload: identity('e'),
        rubric: identity('f'),
        policy: identity('0'),
        profile: identity('1'),
      })
    ).toEqual({
      schema_version: '1',
      status: 'incomparable',
      reasons: [
        { code: 'workload_mismatch' },
        { code: 'rubric_mismatch' },
        { code: 'policy_mismatch' },
        { code: 'profile_mismatch' },
      ],
    });
  });

  test('visibly qualifies missing optional identity evidence', () => {
    expect(
      assessExperimentCompatibility(MANIFEST.identities, {
        ...MANIFEST.identities,
        policy: undefined,
        profile: undefined,
      })
    ).toEqual({
      schema_version: '1',
      status: 'qualified',
      reasons: [{ code: 'policy_identity_missing' }, { code: 'profile_identity_missing' }],
    });
  });
});
