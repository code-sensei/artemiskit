/**
 * Tests for manifest generation
 */

import { describe, expect, test } from 'bun:test';
import { createRunManifest } from './manifest';
import { assertRunManifestIntegrity } from './types';
import type { CaseResult } from './types';

describe('createRunManifest', () => {
  const mockCases: CaseResult[] = [
    {
      id: 'case-1',
      name: 'Test Case 1',
      ok: true,
      status: 'passed',
      latencyMs: 100,
      prompt: 'Hello',
      response: 'Hi there!',
      tokens: { prompt: 10, completion: 5, total: 15 },
      score: 1,
      matcherType: 'contains',
      expected: { type: 'contains', values: ['Hi'], mode: 'any' },
      tags: [],
    },
    {
      id: 'case-2',
      name: 'Test Case 2',
      ok: false,
      status: 'failed',
      latencyMs: 200,
      prompt: 'Goodbye',
      response: 'See you!',
      tokens: { prompt: 8, completion: 4, total: 12 },
      score: 0,
      matcherType: 'contains',
      expected: { type: 'contains', values: ['Bye'], mode: 'any' },
      tags: [],
    },
  ];

  test('creates manifest with correct structure', () => {
    const startTime = new Date('2024-01-01T00:00:00Z');
    const endTime = new Date('2024-01-01T00:01:00Z');

    const manifest = createRunManifest({
      project: 'test-project',
      config: {
        scenario: 'test-scenario',
        provider: 'openai',
        model: 'gpt-4',
      },
      cases: mockCases,
      startTime,
      endTime,
    });

    expect(manifest.version).toBe('1.3');
    expect(manifest.project).toBe('test-project');
    expect(manifest.run_id).toBeTruthy();
    expect(manifest.run_id.length).toBe(12);
    expect(manifest.config.scenario).toBe('test-scenario');
    expect(manifest.config.provider).toBe('openai');
    expect(manifest.config.model).toBe('gpt-4');
  });

  test('calculates metrics correctly', () => {
    const manifest = createRunManifest({
      project: 'test-project',
      config: {
        scenario: 'test-scenario',
        provider: 'openai',
        model: 'gpt-4',
      },
      cases: mockCases,
      startTime: new Date(),
      endTime: new Date(),
    });

    expect(manifest.metrics.total_cases).toBe(2);
    expect(manifest.metrics.passed_cases).toBe(1);
    expect(manifest.metrics.failed_cases).toBe(1);
    expect(manifest.metrics.success_rate).toBe(0.5);
    expect(manifest.metrics.total_attempts).toBe(2);
    expect(manifest.metrics.valid_evaluations).toBe(2);
    expect(manifest.metrics.invalid_evaluations).toBe(0);
    expect(manifest.metrics.outcome_rate_denominator).toBe(2);
    expect(manifest.metrics.total_tokens).toBe(27); // (10+5) + (8+4)
    expect(manifest.metrics.total_prompt_tokens).toBe(18); // 10 + 8
    expect(manifest.metrics.total_completion_tokens).toBe(9); // 5 + 4
  });

  test('calculates duration correctly', () => {
    const startTime = new Date('2024-01-01T00:00:00Z');
    const endTime = new Date('2024-01-01T00:01:00Z');

    const manifest = createRunManifest({
      project: 'test-project',
      config: {
        scenario: 'test-scenario',
        provider: 'openai',
        model: 'gpt-4',
      },
      cases: mockCases,
      startTime,
      endTime,
    });

    expect(manifest.duration_ms).toBe(60000); // 1 minute
    expect(manifest.start_time).toBe('2024-01-01T00:00:00.000Z');
    expect(manifest.end_time).toBe('2024-01-01T00:01:00.000Z');
  });

  test('handles empty cases array', () => {
    const manifest = createRunManifest({
      project: 'test-project',
      config: {
        scenario: 'test-scenario',
        provider: 'openai',
        model: 'gpt-4',
      },
      cases: [],
      startTime: new Date(),
      endTime: new Date(),
    });

    expect(manifest.metrics.total_cases).toBe(0);
    expect(manifest.metrics.passed_cases).toBe(0);
    expect(manifest.metrics.failed_cases).toBe(0);
    expect(manifest.metrics.success_rate).toBe(0);
    expect(manifest.metrics.total_attempts).toBe(0);
    expect(manifest.metrics.valid_evaluations).toBe(0);
    expect(manifest.metrics.invalid_evaluations).toBe(0);
    expect(manifest.metrics.outcome_rate_denominator).toBe(0);
    expect(manifest.metrics.median_latency_ms).toBe(0);
    expect(manifest.metrics.p95_latency_ms).toBe(0);
  });

  test('includes resolved_config when provided', () => {
    const manifest = createRunManifest({
      project: 'test-project',
      config: {
        scenario: 'test-scenario',
        provider: 'openai',
        model: 'gpt-4',
      },
      resolvedConfig: {
        provider: 'openai',
        model: 'gpt-4',
        source: {
          provider: 'cli',
          model: 'config',
        },
      },
      cases: mockCases,
      startTime: new Date(),
      endTime: new Date(),
    });

    expect(manifest.resolved_config).toBeDefined();
    expect(manifest.resolved_config?.provider).toBe('openai');
    expect(manifest.resolved_config?.source.provider).toBe('cli');
    expect(manifest.resolved_config?.source.model).toBe('config');
  });

  test('retains a validated workload identity when provided', () => {
    const manifest = createRunManifest({
      project: 'test-project',
      config: { scenario: 'test-scenario', provider: 'openai' },
      workloadIdentity: {
        schema_version: '1',
        workload: {
          schema_version: '1',
          algorithm: 'sha256',
          digest: 'a'.repeat(64),
        },
        rubric: {
          schema_version: '1',
          algorithm: 'sha256',
          digest: 'b'.repeat(64),
        },
      },
      cases: mockCases,
      startTime: new Date(),
      endTime: new Date(),
    });

    expect(manifest.workload_identity?.workload.digest).toBe('a'.repeat(64));
    expect(() => assertRunManifestIntegrity(manifest)).not.toThrow();
  });

  test('retains target and evaluator execution provenance separately', () => {
    const manifest = createRunManifest({
      project: 'test-project',
      config: { scenario: 'test-scenario', provider: 'openai' },
      executionProvenance: {
        schema_version: '1',
        target: {
          provider: 'openai',
          requested_models: ['gpt-requested'],
          observed_models: ['gpt-observed'],
          generation: { temperature: 0, max_tokens: 100, seed: 42 },
        },
        evaluator: { models: ['judge-model'] },
      },
      cases: mockCases,
      startTime: new Date(),
      endTime: new Date(),
    });

    expect(manifest.execution_provenance?.target.observed_models).toEqual(['gpt-observed']);
    expect(manifest.execution_provenance?.evaluator?.models).toEqual(['judge-model']);
    expect(() => assertRunManifestIntegrity(manifest)).not.toThrow();
  });

  test('includes provenance information', () => {
    const manifest = createRunManifest({
      project: 'test-project',
      config: {
        scenario: 'test-scenario',
        provider: 'openai',
        model: 'gpt-4',
      },
      cases: mockCases,
      startTime: new Date(),
      endTime: new Date(),
      runBy: 'test-user',
      runReason: 'unit-test',
    });

    expect(manifest.provenance.run_by).toBe('test-user');
    expect(manifest.provenance.run_reason).toBe('unit-test');
  });

  test('calculates latency percentiles correctly', () => {
    const casesWithLatencies: CaseResult[] = [
      { ...mockCases[0], latencyMs: 100 },
      { ...mockCases[0], id: 'case-2', latencyMs: 200 },
      { ...mockCases[0], id: 'case-3', latencyMs: 300 },
      { ...mockCases[0], id: 'case-4', latencyMs: 400 },
      { ...mockCases[0], id: 'case-5', latencyMs: 500 },
    ];

    const manifest = createRunManifest({
      project: 'test-project',
      config: {
        scenario: 'test-scenario',
        provider: 'openai',
        model: 'gpt-4',
      },
      cases: casesWithLatencies,
      startTime: new Date(),
      endTime: new Date(),
    });

    expect(manifest.metrics.median_latency_ms).toBe(300);
    expect(manifest.metrics.p95_latency_ms).toBe(500);
  });

  test('excludes invalid and target-error measurements from the success-rate denominator', () => {
    const manifest = createRunManifest({
      project: 'test-project',
      config: { scenario: 'test-scenario', provider: 'openai' },
      cases: [
        { ...mockCases[0], attempts: 2 },
        { ...mockCases[1], status: 'invalid', error: undefined },
        { ...mockCases[1], id: 'case-3', status: 'error', error: 'provider unavailable' },
      ],
      startTime: new Date(),
      endTime: new Date(),
    });

    expect(manifest.metrics).toMatchObject({
      total_attempts: 4,
      total_cases: 3,
      valid_evaluations: 1,
      invalid_evaluations: 2,
      outcome_rate_denominator: 1,
      passed_cases: 1,
      failed_cases: 0,
      success_rate: 1,
    });
  });

  test('maps historical manifests without a status using the documented legacy mapping', () => {
    const manifest = createRunManifest({
      project: 'test-project',
      config: { scenario: 'legacy', provider: 'openai' },
      cases: [
        { ...mockCases[0], status: undefined },
        { ...mockCases[1], status: undefined, error: 'legacy execution failure' },
      ],
      startTime: new Date(),
      endTime: new Date(),
    });

    expect(manifest.metrics).toMatchObject({
      valid_evaluations: 1,
      invalid_evaluations: 1,
      outcome_rate_denominator: 1,
      success_rate: 1,
    });
  });

  test('accepts historical cases without integrity fields but rejects malformed new evidence', () => {
    const historical = createRunManifest({
      project: 'test-project',
      config: { scenario: 'legacy', provider: 'openai' },
      cases: [{ ...mockCases[0], status: undefined, evidence: undefined }],
      startTime: new Date(),
      endTime: new Date(),
    });
    expect(() => assertRunManifestIntegrity(historical)).not.toThrow();

    const malformed = {
      ...historical,
      cases: [
        {
          ...mockCases[0],
          status: 'passed',
          evidence: { evaluator: 'custom', validation: { status: 'unknown' } },
        },
      ],
    };
    expect(() => assertRunManifestIntegrity(malformed)).toThrow('invalid evidence validation');

    expect(() =>
      assertRunManifestIntegrity({ ...historical, workload_identity: { schema_version: '1' } })
    ).toThrow('malformed workload identity');
    expect(() =>
      assertRunManifestIntegrity({
        ...historical,
        execution_provenance: { schema_version: '1', target: { provider: '' } },
      })
    ).toThrow('malformed execution provenance');
    expect(() =>
      assertRunManifestIntegrity({
        ...historical,
        cases: [{ ...historical.cases[0], target: { provider: '', observed_models: ['x'] } }],
      })
    ).toThrow('malformed target evidence');
  });
});
