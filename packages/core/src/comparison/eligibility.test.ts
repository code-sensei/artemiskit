import { describe, expect, test } from 'bun:test';
import type { RunManifest } from '../artifacts';
import { assessComparisonEligibility, isComparisonAvailable } from './eligibility';

function manifest(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    version: '1.3',
    run_id: 'run-id',
    project: 'project',
    start_time: '2026-09-10T00:00:00.000Z',
    end_time: '2026-09-10T00:00:01.000Z',
    duration_ms: 1000,
    config: { scenario: 'customer-service', provider: 'openai', model: 'model-a' },
    workload_identity: {
      schema_version: '1',
      workload: { schema_version: '1', algorithm: 'sha256', digest: 'a'.repeat(64) },
      rubric: { schema_version: '1', algorithm: 'sha256', digest: 'b'.repeat(64) },
    },
    execution_provenance: {
      schema_version: '1',
      target: { provider: 'openai', requested_models: ['model-a'], generation: { temperature: 0 } },
    },
    metrics: {
      success_rate: 1,
      total_cases: 1,
      passed_cases: 1,
      failed_cases: 0,
      median_latency_ms: 1,
      p95_latency_ms: 1,
      total_tokens: 1,
      total_prompt_tokens: 1,
      total_completion_tokens: 0,
    },
    git: { commit: 'commit', branch: 'main', dirty: false },
    provenance: { run_by: 'test' },
    cases: [],
    environment: { node_version: 'test', platform: 'test', arch: 'test' },
    ...overrides,
  };
}

describe('assessComparisonEligibility', () => {
  test('accepts matching declared workload, rubric, and execution configuration', () => {
    const eligibility = assessComparisonEligibility(manifest(), manifest({ run_id: 'current' }));

    expect(eligibility).toEqual({ schema_version: '1', status: 'compatible', reasons: [] });
    expect(isComparisonAvailable(eligibility)).toBe(true);
  });

  test('qualifies legacy artifacts instead of presenting them as fully compatible', () => {
    const legacy = manifest({ workload_identity: undefined, execution_provenance: undefined });
    const eligibility = assessComparisonEligibility(legacy, manifest({ run_id: 'current' }));

    expect(eligibility.status).toBe('qualified');
    expect(eligibility.reasons.map((reason) => reason.code)).toEqual([
      'workload_identity_missing',
      'rubric_identity_missing',
      'execution_provenance_missing',
    ]);
    expect(isComparisonAvailable(eligibility)).toBe(true);
  });

  test('qualifies a deliberate target-model change without treating it as the same execution', () => {
    const current = manifest({
      run_id: 'current',
      execution_provenance: {
        schema_version: '1',
        target: {
          provider: 'openai',
          requested_models: ['model-b'],
          generation: { temperature: 0 },
        },
      },
    });

    const eligibility = assessComparisonEligibility(manifest(), current);

    expect(eligibility.status).toBe('qualified');
    expect(eligibility.reasons).toEqual([{ code: 'target_model_changed' }]);
  });

  test('refuses deltas when workload or rubric evidence differs', () => {
    const current = manifest({
      run_id: 'current',
      workload_identity: {
        schema_version: '1',
        workload: { schema_version: '1', algorithm: 'sha256', digest: 'c'.repeat(64) },
        rubric: { schema_version: '1', algorithm: 'sha256', digest: 'd'.repeat(64) },
      },
    });

    const eligibility = assessComparisonEligibility(manifest(), current);

    expect(eligibility.status).toBe('incomparable');
    expect(eligibility.reasons.map((reason) => reason.code)).toEqual([
      'workload_mismatch',
      'rubric_mismatch',
    ]);
    expect(isComparisonAvailable(eligibility)).toBe(false);
  });
});
