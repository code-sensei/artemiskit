/**
 * Tests for manifest generation
 */

import { describe, expect, test } from 'bun:test';
import { createRunManifest } from './manifest';
import type { CaseResult } from './types';

describe('createRunManifest', () => {
  const mockCases: CaseResult[] = [
    {
      id: 'case-1',
      name: 'Test Case 1',
      ok: true,
      latencyMs: 100,
      prompt: 'Hello',
      response: 'Hi there!',
      tokens: { prompt: 10, completion: 5 },
      evaluations: [
        {
          type: 'contains',
          passed: true,
          score: 1,
          reason: 'Contains expected value',
        },
      ],
    },
    {
      id: 'case-2',
      name: 'Test Case 2',
      ok: false,
      latencyMs: 200,
      prompt: 'Goodbye',
      response: 'See you!',
      tokens: { prompt: 8, completion: 4 },
      evaluations: [
        {
          type: 'contains',
          passed: false,
          score: 0,
          reason: 'Missing expected value',
        },
      ],
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

    expect(manifest.version).toBe('1.0');
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
});
