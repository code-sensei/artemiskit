/**
 * Supabase storage adapter
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StorageAdapter, RunListItem, ComparisonResult, ListOptions } from './types';
import type { RunManifest } from '../artifacts/types';

export interface SupabaseStorageConfig {
  url: string;
  anonKey: string;
  bucket?: string;
}

export class SupabaseStorageAdapter implements StorageAdapter {
  private client: SupabaseClient;
  private bucket: string;

  constructor(config: SupabaseStorageConfig) {
    this.client = createClient(config.url, config.anonKey);
    this.bucket = config.bucket || 'artemis-runs';
  }

  async save(manifest: RunManifest): Promise<string> {
    const filePath = `${manifest.project}/${manifest.run_id}.json`;

    const { error: uploadError } = await this.client.storage
      .from(this.bucket)
      .upload(filePath, JSON.stringify(manifest, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload manifest: ${uploadError.message}`);
    }

    const { error: dbError } = await this.client.from('runs').upsert({
      run_id: manifest.run_id,
      project: manifest.project,
      scenario: manifest.config.scenario,
      provider: manifest.config.provider,
      model: manifest.config.model,
      success_rate: manifest.metrics.success_rate,
      total_cases: manifest.metrics.total_cases,
      passed_cases: manifest.metrics.passed_cases,
      failed_cases: manifest.metrics.failed_cases,
      median_latency_ms: manifest.metrics.median_latency_ms,
      p95_latency_ms: manifest.metrics.p95_latency_ms,
      total_tokens: manifest.metrics.total_tokens,
      git_commit: manifest.git.commit,
      git_branch: manifest.git.branch,
      git_dirty: manifest.git.dirty,
      run_by: manifest.provenance.run_by,
      run_reason: manifest.provenance.run_reason,
      started_at: manifest.start_time,
      ended_at: manifest.end_time,
      manifest_path: filePath,
    });

    if (dbError) {
      throw new Error(`Failed to save run metadata: ${dbError.message}`);
    }

    return filePath;
  }

  async load(runId: string): Promise<RunManifest> {
    const { data: run, error: dbError } = await this.client
      .from('runs')
      .select('manifest_path')
      .eq('run_id', runId)
      .single();

    if (dbError || !run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const { data, error: downloadError } = await this.client.storage
      .from(this.bucket)
      .download(run.manifest_path);

    if (downloadError || !data) {
      throw new Error(`Failed to download manifest: ${downloadError?.message}`);
    }

    const text = await data.text();
    return JSON.parse(text);
  }

  async list(options?: ListOptions): Promise<RunListItem[]> {
    let query = this.client
      .from('runs')
      .select('run_id, scenario, success_rate, started_at')
      .order('started_at', { ascending: false });

    if (options?.project) {
      query = query.eq('project', options.project);
    }
    if (options?.scenario) {
      query = query.eq('scenario', options.scenario);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list runs: ${error.message}`);
    }

    return (data || []).map((r) => ({
      runId: r.run_id,
      scenario: r.scenario,
      successRate: r.success_rate,
      createdAt: r.started_at,
    }));
  }

  async delete(runId: string): Promise<void> {
    const { data: run } = await this.client
      .from('runs')
      .select('manifest_path')
      .eq('run_id', runId)
      .single();

    if (run) {
      await this.client.storage.from(this.bucket).remove([run.manifest_path]);
    }

    await this.client.from('runs').delete().eq('run_id', runId);
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
}
