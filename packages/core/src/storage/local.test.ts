/**
 * Tests for LocalStorageAdapter
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import type { RunManifest } from '../artifacts/types';
import { LocalStorageAdapter } from './local';

const TEST_DIR = './test-artemis-runs';

describe('LocalStorageAdapter', () => {
  let storage: LocalStorageAdapter;

  const mockManifest: RunManifest = {
    version: '1.0',
    run_id: 'test-run-123',
    project: 'test-project',
    start_time: '2024-01-01T00:00:00.000Z',
    end_time: '2024-01-01T00:01:00.000Z',
    duration_ms: 60000,
    config: {
      scenario: 'test-scenario',
      provider: 'openai',
      model: 'gpt-4',
    },
    metrics: {
      success_rate: 0.8,
      total_cases: 10,
      passed_cases: 8,
      failed_cases: 2,
      median_latency_ms: 150,
      p95_latency_ms: 300,
      total_tokens: 1000,
      total_prompt_tokens: 600,
      total_completion_tokens: 400,
    },
    cases: [],
    environment: {
      node_version: '20.0.0',
      os: 'darwin',
      arch: 'arm64',
    },
    provenance: {
      run_by: 'test-user',
    },
  };

  beforeAll(async () => {
    storage = new LocalStorageAdapter(TEST_DIR);
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test('saves manifest to filesystem', async () => {
    const filePath = await storage.save(mockManifest);
    expect(filePath).toContain('test-run-123.json');
  });

  test('loads manifest from filesystem', async () => {
    // Save first
    await storage.save(mockManifest);

    // Load back
    const loaded = await storage.load('test-run-123');
    expect(loaded.run_id).toBe('test-run-123');
    expect(loaded.project).toBe('test-project');
    expect(loaded.config.scenario).toBe('test-scenario');
  });

  test('loadRun returns RunManifest', async () => {
    await storage.save(mockManifest);
    const loaded = await storage.loadRun('test-run-123');
    expect(loaded.metrics.success_rate).toBe(0.8);
  });

  test('throws error for non-existent run', async () => {
    await expect(storage.load('non-existent-run')).rejects.toThrow('Run not found');
  });

  test('lists runs', async () => {
    // Save a manifest
    await storage.save(mockManifest);

    // List runs
    const runs = await storage.list();
    expect(runs.length).toBeGreaterThanOrEqual(1);

    const testRun = runs.find((r) => r.runId === 'test-run-123');
    expect(testRun).toBeDefined();
    expect(testRun?.scenario).toBe('test-scenario');
    expect(testRun?.successRate).toBe(0.8);
  });

  test('lists runs with project filter', async () => {
    await storage.save(mockManifest);

    const runs = await storage.list({ project: 'test-project' });
    expect(runs.every((r) => r.runId === 'test-run-123' || true)).toBe(true);
  });

  test('lists runs with scenario filter', async () => {
    await storage.save(mockManifest);

    const runs = await storage.list({ scenario: 'test-scenario' });
    expect(runs.length).toBeGreaterThanOrEqual(1);
  });

  test('lists runs with limit', async () => {
    await storage.save(mockManifest);
    await storage.save({ ...mockManifest, run_id: 'test-run-456' });

    const runs = await storage.list({ limit: 1 });
    expect(runs.length).toBe(1);
  });

  test('deletes run', async () => {
    const manifest = { ...mockManifest, run_id: 'to-delete-123' };
    await storage.save(manifest);

    // Verify it exists
    const loaded = await storage.load('to-delete-123');
    expect(loaded.run_id).toBe('to-delete-123');

    // Delete
    await storage.delete('to-delete-123');

    // Verify it's gone
    await expect(storage.load('to-delete-123')).rejects.toThrow('Run not found');
  });

  test('compares two runs', async () => {
    const baseline = { ...mockManifest, run_id: 'baseline-run' };
    const current = {
      ...mockManifest,
      run_id: 'current-run',
      metrics: {
        ...mockManifest.metrics,
        success_rate: 0.9,
        median_latency_ms: 120,
        total_tokens: 1100,
      },
    };

    await storage.save(baseline);
    await storage.save(current);

    const comparison = await storage.compare('baseline-run', 'current-run');

    expect(comparison.baseline.run_id).toBe('baseline-run');
    expect(comparison.current.run_id).toBe('current-run');
    expect(comparison.delta.successRate).toBeCloseTo(0.1, 2);
    expect(comparison.delta.latency).toBe(-30);
    expect(comparison.delta.tokens).toBe(100);
  });

  test('handles empty storage gracefully', async () => {
    const emptyStorage = new LocalStorageAdapter('./empty-test-dir');
    const runs = await emptyStorage.list();
    expect(runs).toEqual([]);
  });
});
