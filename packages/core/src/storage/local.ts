/**
 * Local filesystem storage adapter
 */

import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AnyManifest, RedTeamManifest, RunManifest, StressManifest } from '../artifacts/types';
import type { ComparisonResult, ListOptions, RunListItem, StorageAdapter } from './types';

/**
 * Get manifest type from a manifest object
 */
function getManifestType(manifest: AnyManifest): 'run' | 'redteam' | 'stress' {
  if ('type' in manifest) {
    if (manifest.type === 'redteam') return 'redteam';
    if (manifest.type === 'stress') return 'stress';
  }
  return 'run';
}

/**
 * Get success/defense rate from any manifest type
 */
function getSuccessRate(manifest: AnyManifest): number {
  const type = getManifestType(manifest);
  if (type === 'redteam') {
    return (manifest as RedTeamManifest).metrics.defense_rate;
  }
  if (type === 'stress') {
    return (manifest as StressManifest).metrics.success_rate;
  }
  return (manifest as RunManifest).metrics.success_rate;
}

/**
 * Get scenario name from any manifest type
 */
function getScenario(manifest: AnyManifest): string {
  return manifest.config.scenario;
}

export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath = './artemis-runs') {
    this.basePath = resolve(basePath);
  }

  async save(manifest: AnyManifest): Promise<string> {
    const dir = join(this.basePath, manifest.project);
    await mkdir(dir, { recursive: true });

    const filePath = join(dir, `${manifest.run_id}.json`);
    await writeFile(filePath, JSON.stringify(manifest, null, 2));

    return filePath;
  }

  async load(runId: string): Promise<AnyManifest> {
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

  async loadRun(runId: string): Promise<RunManifest> {
    const manifest = await this.load(runId);
    if (getManifestType(manifest) !== 'run') {
      throw new Error(`Run ${runId} is not a standard run manifest`);
    }
    return manifest as RunManifest;
  }

  async loadRedTeam(runId: string): Promise<RedTeamManifest> {
    const manifest = await this.load(runId);
    if (getManifestType(manifest) !== 'redteam') {
      throw new Error(`Run ${runId} is not a red team manifest`);
    }
    return manifest as RedTeamManifest;
  }

  async loadStress(runId: string): Promise<StressManifest> {
    const manifest = await this.load(runId);
    if (getManifestType(manifest) !== 'stress') {
      throw new Error(`Run ${runId} is not a stress test manifest`);
    }
    return manifest as StressManifest;
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
          const manifest: AnyManifest = JSON.parse(content);
          const manifestType = getManifestType(manifest);

          // Filter by type if specified
          if (options?.type && manifestType !== options.type) {
            continue;
          }

          if (options?.scenario && getScenario(manifest) !== options.scenario) {
            continue;
          }

          results.push({
            runId: manifest.run_id,
            scenario: getScenario(manifest),
            successRate: getSuccessRate(manifest),
            createdAt: manifest.start_time,
            type: manifestType,
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
    const [baseline, current] = await Promise.all([
      this.loadRun(baselineId),
      this.loadRun(currentId),
    ]);

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
