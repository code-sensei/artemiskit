/**
 * Integration tests for compare command
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTestDir, cleanupTestDir } from '../helpers/test-utils.js';
import { createStorage } from '../../utils/storage.js';

describe('Compare Command', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = await createTestDir('compare-test');
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Create storage directory
    await mkdir(join(testDir, 'artemis-runs', 'test-project'), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTestDir(testDir);
  });

  describe('storage comparison', () => {
    it('should compare two runs and calculate deltas', async () => {
      const baselineManifest = {
        run_id: 'baseline-001',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: new Date('2026-01-15T10:00:00Z').toISOString(),
        metrics: {
          success_rate: 0.8,
          passed_cases: 4,
          failed_cases: 1,
          total_tokens: 500,
          median_latency_ms: 200,
        },
        cases: [],
      };

      const currentManifest = {
        run_id: 'current-001',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: new Date('2026-01-16T10:00:00Z').toISOString(),
        metrics: {
          success_rate: 1.0,
          passed_cases: 5,
          failed_cases: 0,
          total_tokens: 450,
          median_latency_ms: 150,
        },
        cases: [],
      };

      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'baseline-001.json'),
        JSON.stringify(baselineManifest)
      );
      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'current-001.json'),
        JSON.stringify(currentManifest)
      );

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const comparison = await storage.compare!('baseline-001', 'current-001');

      expect(comparison.baseline.metrics.success_rate).toBe(0.8);
      expect(comparison.current.metrics.success_rate).toBe(1.0);
      expect(comparison.delta.successRate).toBeCloseTo(0.2, 5); // 1.0 - 0.8
      expect(comparison.delta.latency).toBe(-50); // 150 - 200 (improved)
      expect(comparison.delta.tokens).toBe(-50); // 450 - 500 (reduced)
    });

    it('should detect regression when success rate drops', async () => {
      const baselineManifest = {
        run_id: 'baseline-002',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: new Date('2026-01-15T10:00:00Z').toISOString(),
        metrics: {
          success_rate: 1.0,
          passed_cases: 5,
          failed_cases: 0,
          total_tokens: 500,
          median_latency_ms: 200,
        },
        cases: [],
      };

      const currentManifest = {
        run_id: 'current-002',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: new Date('2026-01-16T10:00:00Z').toISOString(),
        metrics: {
          success_rate: 0.6,
          passed_cases: 3,
          failed_cases: 2,
          total_tokens: 600,
          median_latency_ms: 300,
        },
        cases: [],
      };

      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'baseline-002.json'),
        JSON.stringify(baselineManifest)
      );
      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'current-002.json'),
        JSON.stringify(currentManifest)
      );

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const comparison = await storage.compare!('baseline-002', 'current-002');

      // Success rate dropped by 0.4 (40%)
      expect(comparison.delta.successRate).toBeCloseTo(-0.4, 5);

      // This would be a regression (threshold typically 5%)
      const threshold = 0.05;
      const hasRegression = comparison.delta.successRate < -threshold;
      expect(hasRegression).toBe(true);
    });

    it('should handle identical runs', async () => {
      const manifest = {
        run_id: 'same-001',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: new Date().toISOString(),
        metrics: {
          success_rate: 0.9,
          passed_cases: 9,
          failed_cases: 1,
          total_tokens: 1000,
          median_latency_ms: 250,
        },
        cases: [],
      };

      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'same-001.json'),
        JSON.stringify(manifest)
      );

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const comparison = await storage.compare!('same-001', 'same-001');

      expect(comparison.delta.successRate).toBe(0);
      expect(comparison.delta.latency).toBe(0);
      expect(comparison.delta.tokens).toBe(0);
    });

    it('should throw error for non-existent baseline', async () => {
      const currentManifest = {
        run_id: 'exists-001',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: new Date().toISOString(),
        metrics: {
          success_rate: 1.0,
          passed_cases: 5,
          failed_cases: 0,
          total_tokens: 500,
          median_latency_ms: 200,
        },
        cases: [],
      };

      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'exists-001.json'),
        JSON.stringify(currentManifest)
      );

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      await expect(storage.compare!('non-existent', 'exists-001')).rejects.toThrow();
    });

    it('should throw error for non-existent current', async () => {
      const baselineManifest = {
        run_id: 'exists-002',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: new Date().toISOString(),
        metrics: {
          success_rate: 1.0,
          passed_cases: 5,
          failed_cases: 0,
          total_tokens: 500,
          median_latency_ms: 200,
        },
        cases: [],
      };

      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'exists-002.json'),
        JSON.stringify(baselineManifest)
      );

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      await expect(storage.compare!('exists-002', 'non-existent')).rejects.toThrow();
    });
  });
});
