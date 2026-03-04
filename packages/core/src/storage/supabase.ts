/**
 * Supabase storage adapter with analytics capabilities
 */

import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import type { CaseResult, RunManifest } from '../artifacts/types';
import type {
  AnalyticsStorageAdapter,
  BaselineMetadata,
  CaseResultQueryOptions,
  CaseResultRecord,
  ComparisonResult,
  ListOptions,
  MetricsSnapshot,
  MetricsTrendOptions,
  RunListItem,
  TrendDataPoint,
} from './types';

export interface SupabaseStorageConfig {
  url: string;
  anonKey: string;
  bucket?: string;
}

/**
 * Map CaseResult from manifest to CaseResultRecord for storage
 */
function mapCaseToRecord(runId: string, caseResult: CaseResult): CaseResultRecord {
  return {
    runId,
    caseId: caseResult.id,
    caseName: caseResult.name,
    status: caseResult.error ? 'error' : caseResult.ok ? 'passed' : 'failed',
    score: caseResult.score,
    matcherType: caseResult.matcherType,
    reason: caseResult.reason,
    response: caseResult.response,
    latencyMs: caseResult.latencyMs,
    promptTokens: caseResult.tokens.prompt,
    completionTokens: caseResult.tokens.completion,
    totalTokens: caseResult.tokens.total,
    error: caseResult.error,
    tags: caseResult.tags,
  };
}

export class SupabaseStorageAdapter implements AnalyticsStorageAdapter {
  private client: SupabaseClient;
  private bucket: string;
  private project: string;

  constructor(config: SupabaseStorageConfig, project?: string) {
    this.client = createClient(config.url, config.anonKey);
    this.bucket = config.bucket || 'artemis-runs';
    this.project = project || 'default';
  }

  // ============================================================================
  // Core Storage Methods
  // ============================================================================

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

    // Also save individual case results for granular analytics
    if (manifest.cases && manifest.cases.length > 0) {
      const caseRecords = manifest.cases.map((c) => mapCaseToRecord(manifest.run_id, c));
      await this.saveCaseResults(caseRecords);
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

    // Case results are deleted via CASCADE
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

  // ============================================================================
  // Baseline Methods
  // ============================================================================

  async setBaseline(scenario: string, runId: string, tag?: string): Promise<BaselineMetadata> {
    // Load the run to get metrics
    const { data: run, error: runError } = await this.client
      .from('runs')
      .select('*')
      .eq('run_id', runId)
      .single();

    if (runError || !run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const baselineData = {
      project: run.project,
      scenario,
      run_id: runId,
      success_rate: run.success_rate,
      median_latency_ms: run.median_latency_ms,
      total_tokens: run.total_tokens,
      passed_cases: run.passed_cases,
      failed_cases: run.failed_cases,
      total_cases: run.total_cases,
      tag,
      created_by: run.run_by,
    };

    const { error } = await this.client.from('baselines').upsert(baselineData, {
      onConflict: 'project,scenario',
    });

    if (error) {
      throw new Error(`Failed to set baseline: ${error.message}`);
    }

    return {
      scenario,
      runId,
      createdAt: new Date().toISOString(),
      metrics: {
        successRate: run.success_rate,
        medianLatencyMs: run.median_latency_ms,
        totalTokens: run.total_tokens,
        passedCases: run.passed_cases,
        failedCases: run.failed_cases,
        totalCases: run.total_cases,
      },
      tag,
    };
  }

  async getBaseline(scenario: string): Promise<BaselineMetadata | null> {
    const { data, error } = await this.client
      .from('baselines')
      .select('*')
      .eq('project', this.project)
      .eq('scenario', scenario)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      scenario: data.scenario,
      runId: data.run_id,
      createdAt: data.created_at,
      metrics: {
        successRate: data.success_rate,
        medianLatencyMs: data.median_latency_ms,
        totalTokens: data.total_tokens,
        passedCases: data.passed_cases,
        failedCases: data.failed_cases,
        totalCases: data.total_cases,
      },
      tag: data.tag,
    };
  }

  async getBaselineByRunId(runId: string): Promise<BaselineMetadata | null> {
    const { data, error } = await this.client
      .from('baselines')
      .select('*')
      .eq('run_id', runId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      scenario: data.scenario,
      runId: data.run_id,
      createdAt: data.created_at,
      metrics: {
        successRate: data.success_rate,
        medianLatencyMs: data.median_latency_ms,
        totalTokens: data.total_tokens,
        passedCases: data.passed_cases,
        failedCases: data.failed_cases,
        totalCases: data.total_cases,
      },
      tag: data.tag,
    };
  }

  async listBaselines(): Promise<BaselineMetadata[]> {
    const { data, error } = await this.client
      .from('baselines')
      .select('*')
      .eq('project', this.project)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list baselines: ${error.message}`);
    }

    return (data || []).map((b) => ({
      scenario: b.scenario,
      runId: b.run_id,
      createdAt: b.created_at,
      metrics: {
        successRate: b.success_rate,
        medianLatencyMs: b.median_latency_ms,
        totalTokens: b.total_tokens,
        passedCases: b.passed_cases,
        failedCases: b.failed_cases,
        totalCases: b.total_cases,
      },
      tag: b.tag,
    }));
  }

  async removeBaseline(scenario: string): Promise<boolean> {
    const { error, count } = await this.client
      .from('baselines')
      .delete()
      .eq('project', this.project)
      .eq('scenario', scenario);

    if (error) {
      throw new Error(`Failed to remove baseline: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  async removeBaselineByRunId(runId: string): Promise<boolean> {
    const { error, count } = await this.client.from('baselines').delete().eq('run_id', runId);

    if (error) {
      throw new Error(`Failed to remove baseline: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }

  async compareToBaseline(
    runId: string,
    regressionThreshold = 0.05
  ): Promise<{
    baseline: BaselineMetadata;
    comparison: ComparisonResult;
    hasRegression: boolean;
    regressionThreshold: number;
  } | null> {
    // Get the run's scenario
    const { data: run, error: runError } = await this.client
      .from('runs')
      .select('scenario')
      .eq('run_id', runId)
      .single();

    if (runError || !run) {
      return null;
    }

    // Get the baseline for this scenario
    const baseline = await this.getBaseline(run.scenario);
    if (!baseline) {
      return null;
    }

    // Compare
    const comparison = await this.compare(baseline.runId, runId);

    // Check for regression (success rate dropped by more than threshold)
    const hasRegression = comparison.delta.successRate < -regressionThreshold;

    return {
      baseline,
      comparison,
      hasRegression,
      regressionThreshold,
    };
  }

  // ============================================================================
  // Case Results Methods
  // ============================================================================

  async saveCaseResult(result: CaseResultRecord): Promise<string> {
    const dbRecord = {
      run_id: result.runId,
      case_id: result.caseId,
      case_name: result.caseName,
      status: result.status,
      score: result.score,
      matcher_type: result.matcherType,
      reason: result.reason,
      response: result.response,
      latency_ms: result.latencyMs,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      total_tokens: result.totalTokens,
      error: result.error,
      tags: result.tags || [],
    };

    const { data, error } = await this.client
      .from('case_results')
      .upsert(dbRecord, { onConflict: 'run_id,case_id' })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to save case result: ${error.message}`);
    }

    return data?.id || result.caseId;
  }

  async saveCaseResults(results: CaseResultRecord[]): Promise<string[]> {
    if (results.length === 0) {
      return [];
    }

    const dbRecords = results.map((r) => ({
      run_id: r.runId,
      case_id: r.caseId,
      case_name: r.caseName,
      status: r.status,
      score: r.score,
      matcher_type: r.matcherType,
      reason: r.reason,
      response: r.response,
      latency_ms: r.latencyMs,
      prompt_tokens: r.promptTokens,
      completion_tokens: r.completionTokens,
      total_tokens: r.totalTokens,
      error: r.error,
      tags: r.tags || [],
    }));

    const { data, error } = await this.client
      .from('case_results')
      .upsert(dbRecords, { onConflict: 'run_id,case_id' })
      .select('id');

    if (error) {
      throw new Error(`Failed to save case results: ${error.message}`);
    }

    return (data || []).map((d) => d.id);
  }

  async getCaseResults(runId: string): Promise<CaseResultRecord[]> {
    const { data, error } = await this.client
      .from('case_results')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to get case results: ${error.message}`);
    }

    return (data || []).map((r) => ({
      id: r.id,
      runId: r.run_id,
      caseId: r.case_id,
      caseName: r.case_name,
      status: r.status,
      score: r.score,
      matcherType: r.matcher_type,
      reason: r.reason,
      response: r.response,
      latencyMs: r.latency_ms,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      error: r.error,
      tags: r.tags,
      createdAt: r.created_at,
    }));
  }

  async queryCaseResults(options: CaseResultQueryOptions): Promise<CaseResultRecord[]> {
    let query = this.client
      .from('case_results')
      .select('*')
      .order('created_at', { ascending: false });

    if (options.runId) {
      query = query.eq('run_id', options.runId);
    }
    if (options.caseId) {
      query = query.eq('case_id', options.caseId);
    }
    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.tags && options.tags.length > 0) {
      query = query.overlaps('tags', options.tags);
    }
    if (options.offset && options.limit) {
      query = query.range(options.offset, options.offset + options.limit - 1);
    } else if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to query case results: ${error.message}`);
    }

    return (data || []).map((r) => ({
      id: r.id,
      runId: r.run_id,
      caseId: r.case_id,
      caseName: r.case_name,
      status: r.status,
      score: r.score,
      matcherType: r.matcher_type,
      reason: r.reason,
      response: r.response,
      latencyMs: r.latency_ms,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      error: r.error,
      tags: r.tags,
      createdAt: r.created_at,
    }));
  }

  // ============================================================================
  // Metrics History Methods
  // ============================================================================

  async saveMetricsSnapshot(snapshot: MetricsSnapshot): Promise<string> {
    const dbRecord = {
      date: snapshot.date,
      project: snapshot.project,
      scenario: snapshot.scenario || null,
      total_runs: snapshot.totalRuns,
      total_cases: snapshot.totalCases,
      passed_cases: snapshot.passedCases,
      failed_cases: snapshot.failedCases,
      avg_success_rate: snapshot.avgSuccessRate,
      avg_latency_ms: snapshot.avgLatencyMs,
      avg_tokens_per_run: snapshot.avgTokensPerRun,
      min_success_rate: snapshot.minSuccessRate,
      max_success_rate: snapshot.maxSuccessRate,
      min_latency_ms: snapshot.minLatencyMs,
      max_latency_ms: snapshot.maxLatencyMs,
      total_tokens: snapshot.totalTokens,
    };

    const { data, error } = await this.client
      .from('metrics_history')
      .upsert(dbRecord, { onConflict: 'date,project,scenario' })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to save metrics snapshot: ${error.message}`);
    }

    return data?.id || `${snapshot.date}-${snapshot.project}`;
  }

  async getMetricsTrend(options: MetricsTrendOptions): Promise<TrendDataPoint[]> {
    let query = this.client
      .from('metrics_history')
      .select('date, avg_success_rate, avg_latency_ms, total_runs, total_tokens')
      .eq('project', options.project)
      .order('date', { ascending: true });

    if (options.scenario) {
      query = query.eq('scenario', options.scenario);
    } else {
      query = query.is('scenario', null);
    }

    if (options.startDate) {
      query = query.gte('date', options.startDate);
    }
    if (options.endDate) {
      query = query.lte('date', options.endDate);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get metrics trend: ${error.message}`);
    }

    return (data || []).map((m) => ({
      date: m.date,
      successRate: m.avg_success_rate,
      latencyMs: m.avg_latency_ms,
      totalRuns: m.total_runs,
      totalTokens: m.total_tokens,
    }));
  }

  async getMetricsSnapshot(
    date: string,
    project: string,
    scenario?: string
  ): Promise<MetricsSnapshot | null> {
    let query = this.client
      .from('metrics_history')
      .select('*')
      .eq('date', date)
      .eq('project', project);

    if (scenario) {
      query = query.eq('scenario', scenario);
    } else {
      query = query.is('scenario', null);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      date: data.date,
      project: data.project,
      scenario: data.scenario,
      totalRuns: data.total_runs,
      totalCases: data.total_cases,
      passedCases: data.passed_cases,
      failedCases: data.failed_cases,
      avgSuccessRate: data.avg_success_rate,
      avgLatencyMs: data.avg_latency_ms,
      avgTokensPerRun: data.avg_tokens_per_run,
      minSuccessRate: data.min_success_rate,
      maxSuccessRate: data.max_success_rate,
      minLatencyMs: data.min_latency_ms,
      maxLatencyMs: data.max_latency_ms,
      totalTokens: data.total_tokens,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async aggregateDailyMetrics(
    date: string,
    project: string,
    scenario?: string
  ): Promise<MetricsSnapshot> {
    // Query runs for this date
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    let query = this.client
      .from('runs')
      .select('*')
      .eq('project', project)
      .gte('started_at', startOfDay)
      .lte('started_at', endOfDay);

    if (scenario) {
      query = query.eq('scenario', scenario);
    }

    const { data: runs, error } = await query;

    if (error) {
      throw new Error(`Failed to aggregate metrics: ${error.message}`);
    }

    const runList = runs || [];

    if (runList.length === 0) {
      // Return empty snapshot
      const emptySnapshot: MetricsSnapshot = {
        date,
        project,
        scenario,
        totalRuns: 0,
        totalCases: 0,
        passedCases: 0,
        failedCases: 0,
        avgSuccessRate: 0,
        avgLatencyMs: 0,
        avgTokensPerRun: 0,
        totalTokens: 0,
      };
      await this.saveMetricsSnapshot(emptySnapshot);
      return emptySnapshot;
    }

    // Aggregate metrics
    const totalRuns = runList.length;
    const totalCases = runList.reduce((sum, r) => sum + r.total_cases, 0);
    const passedCases = runList.reduce((sum, r) => sum + r.passed_cases, 0);
    const failedCases = runList.reduce((sum, r) => sum + r.failed_cases, 0);
    const totalTokens = runList.reduce((sum, r) => sum + r.total_tokens, 0);

    const successRates = runList.map((r) => r.success_rate);
    const latencies = runList.map((r) => r.median_latency_ms);

    const snapshot: MetricsSnapshot = {
      date,
      project,
      scenario,
      totalRuns,
      totalCases,
      passedCases,
      failedCases,
      avgSuccessRate: successRates.reduce((a, b) => a + b, 0) / totalRuns,
      avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / totalRuns,
      avgTokensPerRun: totalTokens / totalRuns,
      minSuccessRate: Math.min(...successRates),
      maxSuccessRate: Math.max(...successRates),
      minLatencyMs: Math.min(...latencies),
      maxLatencyMs: Math.max(...latencies),
      totalTokens,
    };

    await this.saveMetricsSnapshot(snapshot);
    return snapshot;
  }
}
