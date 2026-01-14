/**
 * Stress command - Run load/stress tests against an LLM
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  type StressManifest,
  type StressMetrics,
  type StressRequestResult,
  createAdapter,
  getGitInfo,
  parseScenarioFile,
} from '@artemiskit/core';
import { generateJSONReport, generateStressHTMLReport } from '@artemiskit/reports';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import { nanoid } from 'nanoid';
import ora from 'ora';
import { loadConfig } from '../config/loader';
import {
  buildAdapterConfig,
  resolveModelWithSource,
  resolveProviderWithSource,
} from '../utils/adapter';
import { createStorage } from '../utils/storage';

interface StressOptions {
  provider?: string;
  model?: string;
  concurrency?: number;
  requests?: number;
  duration?: number;
  rampUp?: number;
  save?: boolean;
  output?: string;
  verbose?: boolean;
  config?: string;
}

export function stressCommand(): Command {
  const cmd = new Command('stress');

  cmd
    .description('Run load/stress tests against an LLM')
    .argument('<scenario>', 'Path to scenario YAML file')
    .option('-p, --provider <provider>', 'Provider to use')
    .option('-m, --model <model>', 'Model to use')
    .option('-c, --concurrency <number>', 'Number of concurrent requests', '10')
    .option('-n, --requests <number>', 'Total number of requests to make')
    .option('-d, --duration <seconds>', 'Duration to run the test in seconds', '30')
    .option('--ramp-up <seconds>', 'Ramp-up time in seconds', '5')
    .option('--save', 'Save results to storage')
    .option('-o, --output <dir>', 'Output directory for reports')
    .option('-v, --verbose', 'Verbose output')
    .option('--config <path>', 'Path to config file')
    .action(async (scenarioPath: string, options: StressOptions) => {
      const spinner = ora('Loading configuration...').start();
      const startTime = new Date();

      try {
        // Load config file if present
        const config = await loadConfig(options.config);
        if (config) {
          spinner.succeed('Loaded config file');
        } else {
          spinner.info('No config file found, using defaults');
        }

        // Parse scenario
        spinner.start('Loading scenario...');
        const scenario = await parseScenarioFile(scenarioPath);
        spinner.succeed(`Loaded scenario: ${scenario.name}`);

        // Resolve provider and model with precedence and source tracking:
        // CLI > Scenario > Config > Default
        const { provider, source: providerSource } = resolveProviderWithSource(
          options.provider,
          scenario.provider,
          config?.provider
        );
        const { model, source: modelSource } = resolveModelWithSource(
          options.model,
          scenario.model,
          config?.model
        );

        // Build adapter config with full precedence chain and source tracking
        spinner.start(`Connecting to ${provider}...`);
        const { adapterConfig, resolvedConfig } = buildAdapterConfig({
          provider,
          model,
          providerSource,
          modelSource,
          scenarioConfig: scenario.providerConfig,
          fileConfig: config,
        });
        const client = await createAdapter(adapterConfig);
        spinner.succeed(`Connected to ${provider}`);

        // Configuration
        const concurrency = Number.parseInt(String(options.concurrency)) || 10;
        const durationSec = Number.parseInt(String(options.duration)) || 30;
        const rampUpSec = Number.parseInt(String(options.rampUp)) || 5;
        const maxRequests = options.requests
          ? Number.parseInt(String(options.requests))
          : undefined;

        console.log();
        console.log(chalk.bold('Stress Test Configuration'));
        console.log(chalk.dim(`Concurrency: ${concurrency}`));
        console.log(chalk.dim(`Duration: ${durationSec}s`));
        console.log(chalk.dim(`Ramp-up: ${rampUpSec}s`));
        if (maxRequests) {
          console.log(chalk.dim(`Max requests: ${maxRequests}`));
        }
        console.log();

        // Get test prompts from scenario cases
        const prompts = scenario.cases.map((c) =>
          typeof c.prompt === 'string' ? c.prompt : c.prompt.map((m) => m.content).join('\n')
        );

        if (prompts.length === 0) {
          throw new Error('No test cases found in scenario');
        }

        // Run stress test
        spinner.start('Running stress test...');
        const results = await runStressTest({
          client,
          model,
          prompts,
          concurrency,
          durationMs: durationSec * 1000,
          rampUpMs: rampUpSec * 1000,
          maxRequests,
          temperature: scenario.temperature,
          onProgress: (completed, active) => {
            spinner.text = `Running stress test... ${completed} completed, ${active} active`;
          },
          verbose: options.verbose,
        });

        spinner.succeed('Stress test completed');
        const endTime = new Date();
        console.log();

        // Calculate stats
        const metrics = calculateMetrics(results, endTime.getTime() - startTime.getTime());

        // Build manifest
        const runId = `st_${nanoid(12)}`;
        const manifest: StressManifest = {
          version: '1.0',
          type: 'stress',
          run_id: runId,
          project: config?.project || process.env.ARTEMIS_PROJECT || 'default',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          duration_ms: endTime.getTime() - startTime.getTime(),
          config: {
            scenario: basename(scenarioPath, '.yaml'),
            provider,
            model: resolvedConfig.model,
            concurrency,
            duration_seconds: durationSec,
            ramp_up_seconds: rampUpSec,
            max_requests: maxRequests,
          },
          resolved_config: resolvedConfig,
          metrics,
          git: await getGitInfo(),
          provenance: {
            run_by: process.env.USER || process.env.USERNAME || 'unknown',
          },
          // Sample results (keep only a sample to avoid huge files)
          sample_results: sampleResults(results, 100),
          environment: {
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
          },
        };

        // Display stats
        displayStats(metrics, runId);

        // Display latency histogram if verbose
        if (options.verbose) {
          displayHistogram(results);
        }

        // Save results if requested
        if (options.save) {
          spinner.start('Saving results...');
          const storage = createStorage({ fileConfig: config });
          const path = await storage.save(manifest);
          spinner.succeed(`Results saved: ${path}`);
        }

        // Generate reports if output directory specified
        if (options.output) {
          spinner.start('Generating reports...');
          await mkdir(options.output, { recursive: true });

          // HTML report
          const html = generateStressHTMLReport(manifest);
          const htmlPath = join(options.output, `${runId}.html`);
          await writeFile(htmlPath, html);

          // JSON report
          const json = generateJSONReport(manifest);
          const jsonPath = join(options.output, `${runId}.json`);
          await writeFile(jsonPath, json);

          spinner.succeed(`Reports generated: ${options.output}`);
          console.log(chalk.dim(`  HTML: ${htmlPath}`));
          console.log(chalk.dim(`  JSON: ${jsonPath}`));
        }
      } catch (error) {
        spinner.fail('Error');
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}

interface StressTestOptions {
  client: {
    generate: (req: { prompt: string; model?: string; temperature?: number }) => Promise<{
      text: string;
    }>;
  };
  model?: string;
  prompts: string[];
  concurrency: number;
  durationMs: number;
  rampUpMs: number;
  maxRequests?: number;
  temperature?: number;
  onProgress?: (completed: number, active: number) => void;
  verbose?: boolean;
}

async function runStressTest(options: StressTestOptions): Promise<StressRequestResult[]> {
  const {
    client,
    model,
    prompts,
    concurrency,
    durationMs,
    rampUpMs,
    maxRequests,
    temperature,
    onProgress,
  } = options;

  const results: StressRequestResult[] = [];
  const startTime = Date.now();
  const endTime = startTime + durationMs;
  let completed = 0;
  let active = 0;
  let promptIndex = 0;

  const makeRequest = async (): Promise<void> => {
    const prompt = prompts[promptIndex % prompts.length];
    promptIndex++;

    const requestStart = Date.now();
    active++;

    try {
      await client.generate({
        prompt,
        model,
        temperature,
      });

      results.push({
        success: true,
        latencyMs: Date.now() - requestStart,
        timestamp: requestStart,
      });
    } catch (error) {
      results.push({
        success: false,
        latencyMs: Date.now() - requestStart,
        error: (error as Error).message,
        timestamp: requestStart,
      });
    } finally {
      active--;
      completed++;
      onProgress?.(completed, active);
    }
  };

  // Calculate target concurrency based on ramp-up
  const getTargetConcurrency = (elapsed: number): number => {
    if (elapsed >= rampUpMs) return concurrency;
    return Math.ceil((elapsed / rampUpMs) * concurrency);
  };

  // Main loop
  const promises: Promise<void>[] = [];

  while (Date.now() < endTime) {
    if (maxRequests && completed >= maxRequests) break;

    const elapsed = Date.now() - startTime;
    const targetConcurrency = getTargetConcurrency(elapsed);

    // Launch new requests if below target
    while (active < targetConcurrency && Date.now() < endTime) {
      if (maxRequests && completed + active >= maxRequests) break;
      promises.push(makeRequest());
    }

    // Small delay to prevent tight loop
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // Wait for all pending requests
  await Promise.all(promises);

  return results;
}

function calculateMetrics(results: StressRequestResult[], durationMs: number): StressMetrics {
  const successful = results.filter((r) => r.success);
  const latencies = successful.map((r) => r.latencyMs).sort((a, b) => a - b);

  const totalRequests = results.length;
  const successfulRequests = successful.length;
  const failedRequests = totalRequests - successfulRequests;

  const minLatency = latencies[0] || 0;
  const maxLatency = latencies[latencies.length - 1] || 0;
  const avgLatency =
    latencies.length > 0 ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length : 0;

  const requestsPerSecond = durationMs > 0 ? (totalRequests / durationMs) * 1000 : 0;
  const successRate = totalRequests > 0 ? successfulRequests / totalRequests : 0;

  return {
    total_requests: totalRequests,
    successful_requests: successfulRequests,
    failed_requests: failedRequests,
    success_rate: successRate,
    requests_per_second: requestsPerSecond,
    min_latency_ms: minLatency,
    max_latency_ms: maxLatency,
    avg_latency_ms: Math.round(avgLatency),
    p50_latency_ms: percentile(latencies, 50),
    p90_latency_ms: percentile(latencies, 90),
    p95_latency_ms: percentile(latencies, 95),
    p99_latency_ms: percentile(latencies, 99),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function sampleResults(results: StressRequestResult[], maxSamples: number): StressRequestResult[] {
  if (results.length <= maxSamples) return results;

  // Sample evenly across the results
  const step = Math.floor(results.length / maxSamples);
  const sampled: StressRequestResult[] = [];
  for (let i = 0; i < results.length && sampled.length < maxSamples; i += step) {
    sampled.push(results[i]);
  }
  return sampled;
}

function displayStats(metrics: StressMetrics, runId: string): void {
  const table = new Table({
    head: [chalk.bold('Metric'), chalk.bold('Value')],
    style: { head: [], border: [] },
  });

  table.push(
    ['Run ID', runId],
    ['Total Requests', metrics.total_requests.toString()],
    ['Successful', chalk.green(metrics.successful_requests.toString())],
    ['Failed', metrics.failed_requests > 0 ? chalk.red(metrics.failed_requests.toString()) : '0'],
    ['', ''],
    ['Requests/sec', metrics.requests_per_second.toFixed(2)],
    ['', ''],
    ['Min Latency', `${metrics.min_latency_ms}ms`],
    ['Max Latency', `${metrics.max_latency_ms}ms`],
    ['Avg Latency', `${metrics.avg_latency_ms}ms`],
    ['p50 Latency', `${metrics.p50_latency_ms}ms`],
    ['p90 Latency', `${metrics.p90_latency_ms}ms`],
    ['p95 Latency', `${metrics.p95_latency_ms}ms`],
    ['p99 Latency', `${metrics.p99_latency_ms}ms`]
  );

  console.log(chalk.bold('Results'));
  console.log(table.toString());

  // Success rate
  const successRate = metrics.success_rate * 100;

  console.log();
  if (successRate >= 99) {
    console.log(chalk.green(`✓ Success rate: ${successRate.toFixed(2)}%`));
  } else if (successRate >= 95) {
    console.log(chalk.yellow(`⚠ Success rate: ${successRate.toFixed(2)}%`));
  } else {
    console.log(chalk.red(`✗ Success rate: ${successRate.toFixed(2)}%`));
  }
}

function displayHistogram(results: StressRequestResult[]): void {
  const successful = results.filter((r) => r.success);
  if (successful.length === 0) return;

  const latencies = successful.map((r) => r.latencyMs);
  const maxLatency = Math.max(...latencies);
  const bucketSize = Math.ceil(maxLatency / 10);
  const buckets = new Array(10).fill(0);

  for (const latency of latencies) {
    const bucket = Math.min(Math.floor(latency / bucketSize), 9);
    buckets[bucket]++;
  }

  const maxCount = Math.max(...buckets);

  console.log();
  console.log(chalk.bold('Latency Distribution'));
  console.log();

  for (let i = 0; i < 10; i++) {
    const rangeStart = i * bucketSize;
    const rangeEnd = (i + 1) * bucketSize;
    const count = buckets[i];
    const barLength = maxCount > 0 ? Math.round((count / maxCount) * 30) : 0;
    const bar = '█'.repeat(barLength);

    console.log(
      `${chalk.dim(`${rangeStart.toString().padStart(5)}-${rangeEnd.toString().padStart(5)}ms`)} │ ${chalk.cyan(bar)} ${count}`
    );
  }
}
