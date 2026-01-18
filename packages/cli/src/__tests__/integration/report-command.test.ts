/**
 * Integration tests for report command
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateHTMLReport, generateJSONReport } from '@artemiskit/reports';
import { createTestDir, cleanupTestDir } from '../helpers/test-utils.js';
import { createStorage } from '../../utils/storage.js';

describe('Report Command', () => {
  let testDir: string;
  let originalCwd: string;

  const sampleManifest = {
    run_id: 'test-run-001',
    project: 'test-project',
    config: {
      scenario: 'test-scenario',
      provider: 'openai',
      model: 'gpt-4o-mini',
    },
    start_time: new Date().toISOString(),
    duration_ms: 5000,
    metrics: {
      success_rate: 0.8,
      passed_cases: 4,
      failed_cases: 1,
      total_tokens: 500,
      median_latency_ms: 150,
      avg_latency_ms: 160,
      min_latency_ms: 100,
      max_latency_ms: 250,
      p95_latency_ms: 240,
      p99_latency_ms: 248,
    },
    cases: [
      {
        id: 'case-1',
        prompt: 'Test prompt 1',
        response: 'Test response 1',
        expected: { type: 'contains', values: ['test'], mode: 'any' },
        ok: true,
        score: 1.0,
        reason: 'Passed',
        latencyMs: 100,
        tokens: { input: 10, output: 20 },
      },
      {
        id: 'case-2',
        prompt: 'Test prompt 2',
        response: 'Test response 2',
        expected: { type: 'contains', values: ['expected'], mode: 'any' },
        ok: false,
        score: 0,
        reason: 'Did not contain expected value',
        latencyMs: 200,
        tokens: { input: 15, output: 25 },
      },
    ],
  };

  beforeEach(async () => {
    testDir = await createTestDir('report-test');
    originalCwd = process.cwd();
    process.chdir(testDir);

    // Create storage directory and save manifest
    await mkdir(join(testDir, 'artemis-runs', 'test-project'), { recursive: true });
    await writeFile(
      join(testDir, 'artemis-runs', 'test-project', 'test-run-001.json'),
      JSON.stringify(sampleManifest)
    );
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTestDir(testDir);
  });

  describe('report generation', () => {
    it('should load manifest from storage', async () => {
      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const manifest = await storage.load('test-run-001');

      expect(manifest.run_id).toBe('test-run-001');
      expect(manifest.config.scenario).toBe('test-scenario');
      expect(manifest.metrics.success_rate).toBe(0.8);
    });

    it('should generate HTML report from manifest', async () => {
      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const manifest = await storage.load('test-run-001');
      const html = generateHTMLReport(manifest);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('test-run-001');
    });

    it('should generate JSON report from manifest', async () => {
      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const manifest = await storage.load('test-run-001');
      const json = generateJSONReport(manifest, { pretty: true });
      const parsed = JSON.parse(json);

      expect(parsed.run_id).toBe('test-run-001');
      expect(parsed.metrics.success_rate).toBe(0.8);
    });

    it('should write HTML report to output directory', async () => {
      const outputDir = join(testDir, 'output');
      await mkdir(outputDir, { recursive: true });

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const manifest = await storage.load('test-run-001');
      const html = generateHTMLReport(manifest);
      const outputPath = join(outputDir, 'test-run-001.html');
      await writeFile(outputPath, html);

      expect(existsSync(outputPath)).toBe(true);

      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
    });

    it('should write JSON report to output directory', async () => {
      const outputDir = join(testDir, 'output');
      await mkdir(outputDir, { recursive: true });

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const manifest = await storage.load('test-run-001');
      const json = generateJSONReport(manifest, { pretty: true });
      const outputPath = join(outputDir, 'test-run-001.json');
      await writeFile(outputPath, json);

      expect(existsSync(outputPath)).toBe(true);

      const content = await readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.run_id).toBe('test-run-001');
    });

    it('should generate both formats when format is "both"', async () => {
      const outputDir = join(testDir, 'output');
      await mkdir(outputDir, { recursive: true });

      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const manifest = await storage.load('test-run-001');

      // Generate both formats
      const html = generateHTMLReport(manifest);
      const json = generateJSONReport(manifest, { pretty: true });

      await writeFile(join(outputDir, 'test-run-001.html'), html);
      await writeFile(join(outputDir, 'test-run-001.json'), json);

      expect(existsSync(join(outputDir, 'test-run-001.html'))).toBe(true);
      expect(existsSync(join(outputDir, 'test-run-001.json'))).toBe(true);
    });

    it('should throw error for non-existent run ID', async () => {
      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      await expect(storage.load('non-existent-run')).rejects.toThrow();
    });
  });

  describe('HTML report content', () => {
    it('should include test case details', async () => {
      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const manifest = await storage.load('test-run-001');
      const html = generateHTMLReport(manifest);

      expect(html).toContain('case-1');
      expect(html).toContain('case-2');
    });

    it('should include metrics summary', async () => {
      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const manifest = await storage.load('test-run-001');
      const html = generateHTMLReport(manifest);

      expect(html).toContain('80'); // 80% success rate
    });

    it('should include run ID in report', async () => {
      const storage = createStorage({
        fileConfig: {
          storage: { type: 'local', basePath: join(testDir, 'artemis-runs') },
        },
      });

      const manifest = await storage.load('test-run-001');
      const html = generateHTMLReport(manifest);

      expect(html).toContain('test-run-001');
    });
  });
});
