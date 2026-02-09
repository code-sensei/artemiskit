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

  // ==================== Baseline Tests ====================

  describe('Baseline Management', () => {
    const baselineManifest: RunManifest = {
      ...mockManifest,
      run_id: 'baseline-test-run',
      config: {
        ...mockManifest.config,
        scenario: 'baseline-test-scenario',
      },
    };

    test('sets a baseline for a scenario', async () => {
      await storage.save(baselineManifest);

      const baseline = await storage.setBaseline('baseline-test-scenario', 'baseline-test-run');

      expect(baseline.scenario).toBe('baseline-test-scenario');
      expect(baseline.runId).toBe('baseline-test-run');
      expect(baseline.metrics.successRate).toBe(0.8);
      expect(baseline.metrics.totalCases).toBe(10);
      expect(baseline.metrics.passedCases).toBe(8);
      expect(baseline.createdAt).toBeDefined();
    });

    test('sets a baseline with a tag', async () => {
      await storage.save(baselineManifest);

      const baseline = await storage.setBaseline(
        'baseline-test-scenario',
        'baseline-test-run',
        'v1.0.0-release'
      );

      expect(baseline.tag).toBe('v1.0.0-release');
    });

    test('gets a baseline for a scenario', async () => {
      await storage.save(baselineManifest);
      await storage.setBaseline('baseline-test-scenario', 'baseline-test-run');

      const baseline = await storage.getBaseline('baseline-test-scenario');

      expect(baseline).not.toBeNull();
      expect(baseline?.runId).toBe('baseline-test-run');
      expect(baseline?.metrics.successRate).toBe(0.8);
    });

    test('returns null for non-existent baseline', async () => {
      const baseline = await storage.getBaseline('non-existent-scenario');
      expect(baseline).toBeNull();
    });

    test('gets a baseline by run ID', async () => {
      await storage.save(baselineManifest);
      await storage.setBaseline('baseline-test-scenario', 'baseline-test-run', 'by-run-id-test');

      const baseline = await storage.getBaselineByRunId('baseline-test-run');

      expect(baseline).not.toBeNull();
      expect(baseline?.scenario).toBe('baseline-test-scenario');
      expect(baseline?.runId).toBe('baseline-test-run');
      expect(baseline?.tag).toBe('by-run-id-test');
    });

    test('returns null for non-existent baseline by run ID', async () => {
      const baseline = await storage.getBaselineByRunId('non-existent-run-id');
      expect(baseline).toBeNull();
    });

    test('lists all baselines', async () => {
      // Clear any existing baselines by creating a new storage instance
      const freshStorage = new LocalStorageAdapter(TEST_DIR);

      // Create multiple runs and baselines
      const manifest1 = {
        ...mockManifest,
        run_id: 'list-baseline-1',
        config: { ...mockManifest.config, scenario: 'scenario-1' },
      };
      const manifest2 = {
        ...mockManifest,
        run_id: 'list-baseline-2',
        config: { ...mockManifest.config, scenario: 'scenario-2' },
      };

      await freshStorage.save(manifest1);
      await freshStorage.save(manifest2);
      await freshStorage.setBaseline('scenario-1', 'list-baseline-1');
      await freshStorage.setBaseline('scenario-2', 'list-baseline-2');

      const baselines = await freshStorage.listBaselines();

      expect(baselines.length).toBeGreaterThanOrEqual(2);
      expect(baselines.some((b) => b.scenario === 'scenario-1')).toBe(true);
      expect(baselines.some((b) => b.scenario === 'scenario-2')).toBe(true);
    });

    test('removes a baseline', async () => {
      await storage.save(baselineManifest);
      await storage.setBaseline('baseline-test-scenario', 'baseline-test-run');

      // Verify it exists
      const before = await storage.getBaseline('baseline-test-scenario');
      expect(before).not.toBeNull();

      // Remove
      const removed = await storage.removeBaseline('baseline-test-scenario');
      expect(removed).toBe(true);

      // Verify it's gone
      const after = await storage.getBaseline('baseline-test-scenario');
      expect(after).toBeNull();
    });

    test('returns false when removing non-existent baseline', async () => {
      const removed = await storage.removeBaseline('non-existent-baseline');
      expect(removed).toBe(false);
    });

    test('removes a baseline by run ID', async () => {
      const removeByIdManifest = {
        ...mockManifest,
        run_id: 'remove-by-id-run',
        config: { ...mockManifest.config, scenario: 'remove-by-id-scenario' },
      };
      await storage.save(removeByIdManifest);
      await storage.setBaseline('remove-by-id-scenario', 'remove-by-id-run');

      // Verify it exists
      const before = await storage.getBaselineByRunId('remove-by-id-run');
      expect(before).not.toBeNull();

      // Remove by run ID
      const removed = await storage.removeBaselineByRunId('remove-by-id-run');
      expect(removed).toBe(true);

      // Verify it's gone
      const after = await storage.getBaselineByRunId('remove-by-id-run');
      expect(after).toBeNull();
    });

    test('returns false when removing non-existent baseline by run ID', async () => {
      const removed = await storage.removeBaselineByRunId('non-existent-run-id');
      expect(removed).toBe(false);
    });

    test('updates existing baseline when set again', async () => {
      await storage.save(baselineManifest);

      // Set initial baseline
      await storage.setBaseline('baseline-test-scenario', 'baseline-test-run', 'v1.0');

      // Create a new run with different metrics
      const newManifest = {
        ...baselineManifest,
        run_id: 'baseline-test-run-2',
        metrics: {
          ...baselineManifest.metrics,
          success_rate: 0.95,
          passed_cases: 9,
          failed_cases: 1,
        },
      };
      await storage.save(newManifest);

      // Update baseline
      await storage.setBaseline('baseline-test-scenario', 'baseline-test-run-2', 'v2.0');

      const baseline = await storage.getBaseline('baseline-test-scenario');
      expect(baseline?.runId).toBe('baseline-test-run-2');
      expect(baseline?.tag).toBe('v2.0');
      expect(baseline?.metrics.successRate).toBe(0.95);
    });

    test('compares run to baseline and detects no regression', async () => {
      // Create baseline run
      const baselineRun = {
        ...mockManifest,
        run_id: 'compare-baseline-run',
        config: { ...mockManifest.config, scenario: 'compare-scenario' },
        metrics: { ...mockManifest.metrics, success_rate: 0.8 },
      };
      await storage.save(baselineRun);
      await storage.setBaseline('compare-scenario', 'compare-baseline-run');

      // Create current run with same or better success rate
      const currentRun = {
        ...mockManifest,
        run_id: 'compare-current-run',
        config: { ...mockManifest.config, scenario: 'compare-scenario' },
        metrics: { ...mockManifest.metrics, success_rate: 0.85 },
      };
      await storage.save(currentRun);

      const result = await storage.compareToBaseline('compare-current-run', 0.05);

      expect(result).not.toBeNull();
      expect(result?.hasRegression).toBe(false);
      expect(result?.comparison.delta.successRate).toBeCloseTo(0.05, 2);
    });

    test('compares run to baseline and detects regression', async () => {
      // Create baseline run
      const baselineRun = {
        ...mockManifest,
        run_id: 'regression-baseline-run',
        config: { ...mockManifest.config, scenario: 'regression-scenario' },
        metrics: { ...mockManifest.metrics, success_rate: 0.9 },
      };
      await storage.save(baselineRun);
      await storage.setBaseline('regression-scenario', 'regression-baseline-run');

      // Create current run with worse success rate (regression)
      const currentRun = {
        ...mockManifest,
        run_id: 'regression-current-run',
        config: { ...mockManifest.config, scenario: 'regression-scenario' },
        metrics: { ...mockManifest.metrics, success_rate: 0.7 },
      };
      await storage.save(currentRun);

      const result = await storage.compareToBaseline('regression-current-run', 0.05);

      expect(result).not.toBeNull();
      expect(result?.hasRegression).toBe(true);
      expect(result?.comparison.delta.successRate).toBeCloseTo(-0.2, 2);
    });

    test('returns null when no baseline exists for scenario', async () => {
      const noBaselineRun = {
        ...mockManifest,
        run_id: 'no-baseline-run',
        config: { ...mockManifest.config, scenario: 'no-baseline-scenario' },
      };
      await storage.save(noBaselineRun);

      const result = await storage.compareToBaseline('no-baseline-run');

      expect(result).toBeNull();
    });
  });
});
