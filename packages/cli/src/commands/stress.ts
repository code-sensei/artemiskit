/**
 * Stress command - Run load/stress tests against an LLM
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  type ManifestRedactionInfo,
  type RedactionConfig,
  Redactor,
  type StressManifest,
  type StressMetrics,
  type StressRequestResult,
  createAdapter,
  estimateCost,
  getGitInfo,
  getModelPricing,
  parseScenarioFile,
} from '@artemiskit/core';
import { generateJSONReport, generateStressHTMLReport } from '@artemiskit/reports';
import chalk from 'chalk';
import { Command } from 'commander';
import { nanoid } from 'nanoid';
import { loadConfig } from '../config/loader.js';
import {
  colors,
  createSpinner,
  getProviderErrorContext,
  isTTY,
  renderError,
  renderInfoBox,
  renderProgressBar,
  renderStressSummaryPanel,
} from '../ui/index.js';
import {
  buildAdapterConfig,
  resolveModelWithSource,
  resolveProviderWithSource,
} from '../utils/adapter.js';
import { createStorage } from '../utils/storage.js';

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
  redact?: boolean;
  redactPatterns?: string[];
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
    .option('--redact', 'Enable PII/sensitive data redaction in results')
    .option(
      '--redact-patterns <patterns...>',
      'Custom redaction patterns (regex or built-in: email, phone, credit_card, ssn, api_key)'
    )
    .action(async (scenarioPath: string, options: StressOptions) => {
      const spinner = createSpinner('Loading configuration...');
      spinner.start();
      const startTime = new Date();

      try {
        // Load config file if present
        const config = await loadConfig(options.config);
        if (config) {
          spinner.succeed(`Loaded config file`);
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

        // Set up redaction if enabled
        let redactionConfig: RedactionConfig | undefined;
        let redactor: Redactor | undefined;
        if (options.redact) {
          redactionConfig = {
            enabled: true,
            patterns: options.redactPatterns,
            redactPrompts: true,
            redactResponses: true,
            redactMetadata: false,
            replacement: '[REDACTED]',
          };
          redactor = new Redactor(redactionConfig);
        }

        // Display configuration using info box
        console.log();
        const configLines = [
          `Concurrency: ${concurrency}`,
          `Duration: ${durationSec}s`,
          `Ramp-up: ${rampUpSec}s`,
        ];
        if (maxRequests) {
          configLines.push(`Max requests: ${maxRequests}`);
        }
        if (options.redact) {
          configLines.push(
            `Redaction: enabled${options.redactPatterns ? ` (${options.redactPatterns.join(', ')})` : ''}`
          );
        }
        console.log(renderInfoBox('Stress Test Configuration', configLines));
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
          onProgress: (completed, active, _total) => {
            if (isTTY) {
              const progress = maxRequests
                ? renderProgressBar(completed, maxRequests, { width: 15, showPercentage: true })
                : `${completed} completed`;
              spinner.update(`Running stress test... ${progress}, ${active} active`);
            }
          },
          verbose: options.verbose,
        });

        spinner.succeed('Stress test completed');
        const endTime = new Date();
        console.log();

        // Calculate stats
        const metrics = calculateMetrics(
          results,
          endTime.getTime() - startTime.getTime(),
          resolvedConfig.model
        );

        // Build redaction metadata if enabled
        let redactionInfo: ManifestRedactionInfo | undefined;
        if (redactor && redactionConfig?.enabled) {
          redactionInfo = {
            enabled: true,
            patternsUsed: redactor.patternNames,
            replacement: redactor.replacement,
            summary: {
              promptsRedacted: 0, // Stress test doesn't track individual prompts
              responsesRedacted: 0,
              totalRedactions: 0,
            },
          };
        }

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
          redaction: redactionInfo,
        };

        // Display summary using enhanced panel
        const summaryData = {
          totalRequests: metrics.total_requests,
          successfulRequests: metrics.successful_requests,
          failedRequests: metrics.failed_requests,
          successRate: metrics.success_rate * 100,
          duration: endTime.getTime() - startTime.getTime(),
          avgLatency: metrics.avg_latency_ms,
          p50Latency: metrics.p50_latency_ms,
          p90Latency: metrics.p90_latency_ms,
          p95Latency: metrics.p95_latency_ms,
          p99Latency: metrics.p99_latency_ms,
          throughput: metrics.requests_per_second,
          tokens: metrics.tokens
            ? {
                total: metrics.tokens.total_tokens,
                prompt: metrics.tokens.total_prompt_tokens,
                completion: metrics.tokens.total_completion_tokens,
                avgPerRequest: metrics.tokens.avg_tokens_per_request,
              }
            : undefined,
          cost: metrics.cost
            ? {
                totalUsd: metrics.cost.estimated_total_usd,
                model: metrics.cost.model,
              }
            : undefined,
        };
        console.log(renderStressSummaryPanel(summaryData));

        // Show run ID
        console.log();
        console.log(chalk.dim(`Run ID: ${runId}`));

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

        // Display enhanced error message
        const provider = options.provider || 'unknown';
        const errorContext = getProviderErrorContext(provider, error as Error);
        console.log();
        console.log(renderError(errorContext));

        process.exit(1);
      }
    });

  return cmd;
}

interface StressTestOptions {
  client: {
    generate: (req: { prompt: string; model?: string; temperature?: number }) => Promise<{
      text: string;
      tokens?: { prompt: number; completion: number; total: number };
    }>;
  };
  model?: string;
  prompts: string[];
  concurrency: number;
  durationMs: number;
  rampUpMs: number;
  maxRequests?: number;
  temperature?: number;
  onProgress?: (completed: number, active: number, total?: number) => void;
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
      const response = await client.generate({
        prompt,
        model,
        temperature,
      });

      results.push({
        success: true,
        latencyMs: Date.now() - requestStart,
        timestamp: requestStart,
        tokens: response.tokens,
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
      onProgress?.(completed, active, maxRequests);
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

function calculateMetrics(
  results: StressRequestResult[],
  durationMs: number,
  model?: string
): StressMetrics {
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

  // Calculate token metrics if available
  const resultsWithTokens = results.filter((r) => r.tokens);
  let tokens: StressMetrics['tokens'];
  let cost: StressMetrics['cost'];

  if (resultsWithTokens.length > 0) {
    const totalPromptTokens = resultsWithTokens.reduce(
      (sum, r) => sum + (r.tokens?.prompt || 0),
      0
    );
    const totalCompletionTokens = resultsWithTokens.reduce(
      (sum, r) => sum + (r.tokens?.completion || 0),
      0
    );
    const totalTokens = totalPromptTokens + totalCompletionTokens;

    tokens = {
      total_prompt_tokens: totalPromptTokens,
      total_completion_tokens: totalCompletionTokens,
      total_tokens: totalTokens,
      avg_tokens_per_request:
        resultsWithTokens.length > 0 ? totalTokens / resultsWithTokens.length : 0,
    };

    // Estimate cost if model is known
    if (model && totalTokens > 0) {
      const costEstimate = estimateCost(totalPromptTokens, totalCompletionTokens, model);
      const pricing = getModelPricing(model);

      cost = {
        estimated_total_usd: costEstimate.totalUsd,
        breakdown: {
          prompt_cost_usd: costEstimate.promptCostUsd,
          completion_cost_usd: costEstimate.completionCostUsd,
        },
        model,
        pricing: {
          prompt_per_1k: pricing.promptPer1K,
          completion_per_1k: pricing.completionPer1K,
        },
      };
    }
  }

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
    tokens,
    cost,
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
    const bar = colors.highlight('█'.repeat(barLength));

    console.log(
      `${chalk.dim(`${rangeStart.toString().padStart(5)}-${rangeEnd.toString().padStart(5)}ms`)} │ ${bar} ${count}`
    );
  }
}
