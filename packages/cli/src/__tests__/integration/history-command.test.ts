/**
 * Integration tests for history command
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStorage } from '../../utils/storage.js';
import { cleanupTestDir, createTestDir } from '../helpers/test-utils.js';

describe('History Command', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = await createTestDir('history-test');
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Create storage directory
    await mkdir(join(testDir, 'artemis-runs', 'test-project'), { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTestDir(testDir);
  });

  describe('storage listing', () => {
    it('should list runs from local storage', async () => {
      // Create mock run manifests with correct structure
      const manifest1 = {
        run_id: 'run-001',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: new Date('2026-01-15T10:00:00Z').toISOString(),
        metrics: {
          success_rate: 1.0,
          passed_cases: 5,
          failed_cases: 0,
          total_tokens: 500,
          median_latency_ms: 100,
        },
        cases: [],
      };

      const manifest2 = {
        run_id: 'run-002',
        project: 'test-project',
        config: { scenario: 'another-scenario' },
        start_time: new Date('2026-01-16T10:00:00Z').toISOString(),
        metrics: {
          success_rate: 0.8,
          passed_cases: 4,
          failed_cases: 1,
          total_tokens: 600,
          median_latency_ms: 150,
        },
        cases: [],
      };

      // Write manifest files
      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'run-001.json'),
        JSON.stringify(manifest1)
      );
      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'run-002.json'),
        JSON.stringify(manifest2)
      );

      // Create storage and list using basePath
      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const runs = await storage.list({ limit: 10 });

      expect(runs.length).toBe(2);
      expect(runs.some((r) => r.runId === 'run-001')).toBe(true);
      expect(runs.some((r) => r.runId === 'run-002')).toBe(true);
    });

    it('should filter by scenario', async () => {
      const manifest1 = {
        run_id: 'run-001',
        project: 'test-project',
        config: { scenario: 'scenario-a' },
        start_time: new Date().toISOString(),
        metrics: {
          success_rate: 1.0,
          passed_cases: 5,
          failed_cases: 0,
          total_tokens: 500,
          median_latency_ms: 100,
        },
        cases: [],
      };

      const manifest2 = {
        run_id: 'run-002',
        project: 'test-project',
        config: { scenario: 'scenario-b' },
        start_time: new Date().toISOString(),
        metrics: {
          success_rate: 0.8,
          passed_cases: 4,
          failed_cases: 1,
          total_tokens: 600,
          median_latency_ms: 150,
        },
        cases: [],
      };

      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'run-001.json'),
        JSON.stringify(manifest1)
      );
      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'run-002.json'),
        JSON.stringify(manifest2)
      );

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const runs = await storage.list({ scenario: 'scenario-a', limit: 10 });

      expect(runs.length).toBe(1);
      expect(runs[0].scenario).toBe('scenario-a');
    });

    it('should respect limit parameter', async () => {
      // Create 5 manifests
      for (let i = 1; i <= 5; i++) {
        const manifest = {
          run_id: `run-00${i}`,
          project: 'test-project',
          config: { scenario: 'test-scenario' },
          start_time: new Date(Date.now() - i * 1000).toISOString(),
          metrics: {
            success_rate: 1.0,
            passed_cases: 5,
            failed_cases: 0,
            total_tokens: 500,
            median_latency_ms: 100,
          },
          cases: [],
        };
        await writeFile(
          join(testDir, 'artemis-runs', 'test-project', `run-00${i}.json`),
          JSON.stringify(manifest)
        );
      }

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const runs = await storage.list({ limit: 3 });

      expect(runs.length).toBe(3);
    });

    it('should return empty array when no runs exist', async () => {
      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const runs = await storage.list({ limit: 10 });

      expect(runs).toEqual([]);
    });
  });

  describe('run data', () => {
    it('should include success rate in listing', async () => {
      const manifest = {
        run_id: 'run-001',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: new Date().toISOString(),
        metrics: {
          success_rate: 0.75,
          passed_cases: 3,
          failed_cases: 1,
          total_tokens: 400,
          median_latency_ms: 120,
        },
        cases: [],
      };

      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'run-001.json'),
        JSON.stringify(manifest)
      );

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const runs = await storage.list({ limit: 10 });

      expect(runs[0].successRate).toBe(0.75);
    });

    it('should include creation date in listing', async () => {
      const startTime = '2026-01-17T12:00:00.000Z';
      const manifest = {
        run_id: 'run-001',
        project: 'test-project',
        config: { scenario: 'test-scenario' },
        start_time: startTime,
        metrics: {
          success_rate: 1.0,
          passed_cases: 5,
          failed_cases: 0,
          total_tokens: 500,
          median_latency_ms: 100,
        },
        cases: [],
      };

      await writeFile(
        join(testDir, 'artemis-runs', 'test-project', 'run-001.json'),
        JSON.stringify(manifest)
      );

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const runs = await storage.list({ limit: 10 });

      expect(runs[0].createdAt).toBe(startTime);
    });
  });
});
