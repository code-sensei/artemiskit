/**
 * Local filesystem storage adapter
 */

import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { RunManifest } from '../artifacts/types';
import type { ComparisonResult, ListOptions, RunListItem, StorageAdapter } from './types';

export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath = './artemis-runs') {
    this.basePath = resolve(basePath);
  }

  async save(manifest: RunManifest): Promise<string> {
    const dir = join(this.basePath, manifest.project);
    await mkdir(dir, { recursive: true });

    const filePath = join(dir, `${manifest.run_id}.json`);
    await writeFile(filePath, JSON.stringify(manifest, null, 2));

    return filePath;
  }

  async load(runId: string): Promise<RunManifest> {
    const projects = await this.listDirectories(this.basePath);

    for (const project of projects) {
      const filePath = join(this.basePath, project, `${runId}.json`);
      try {
        const content = await readFile(filePath, 'utf-8');
        return JSON.parse(content);
      } catch {}
    }

    throw new Error(`Run not found: ${runId}`);
  }

  async list(options?: ListOptions): Promise<RunListItem[]> {
    const results: RunListItem[] = [];

    const projects = options?.project
      ? [options.project]
      : await this.listDirectories(this.basePath);

    for (const project of projects) {
      const projectDir = join(this.basePath, project);
      const files = await this.listFiles(projectDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await readFile(join(projectDir, file), 'utf-8');
          const manifest: RunManifest = JSON.parse(content);

          if (options?.scenario && manifest.config.scenario !== options.scenario) {
            continue;
          }

          results.push({
            runId: manifest.run_id,
            scenario: manifest.config.scenario,
            successRate: manifest.metrics.success_rate,
            createdAt: manifest.start_time,
          });
        } catch {}
      }
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const offset = options?.offset || 0;
    const limit = options?.limit;

    if (limit) {
      return results.slice(offset, offset + limit);
    }

    return results.slice(offset);
  }

  async delete(runId: string): Promise<void> {
    const projects = await this.listDirectories(this.basePath);

    for (const project of projects) {
      const filePath = join(this.basePath, project, `${runId}.json`);
      try {
        await unlink(filePath);
        return;
      } catch {}
    }
  }

  async compare(baselineId: string, currentId: string): Promise<ComparisonResult> {
    const [baseline, current] = await Promise.all([this.load(baselineId), this.load(currentId)]);

    return {
      baseline,
      current,
      delta: {
        successRate: current.metrics.success_rate - baseline.metrics.success_rate,
        latency: current.metrics.median_latency_ms - baseline.metrics.median_latency_ms,
        tokens: current.metrics.total_tokens - baseline.metrics.total_tokens,
      },
    };
  }

  private async listDirectories(path: string): Promise<string[]> {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  private async listFiles(path: string): Promise<string[]> {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch {
      return [];
    }
  }
}
