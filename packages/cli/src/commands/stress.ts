/**
 * Stress command - Run load/stress tests against an LLM
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  parseScenarioFile,
  createAdapter,
  type AdapterConfig,
} from '@artemis/core';

interface StressOptions {
  provider?: string;
  model?: string;
  concurrency?: number;
  requests?: number;
  duration?: number;
  rampUp?: number;
  verbose?: boolean;
}

interface RequestResult {
  success: boolean;
  latency: number;
  error?: string;
  timestamp: number;
}

interface StressStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  minLatency: number;
  maxLatency: number;
  avgLatency: number;
  p50Latency: number;
  p90Latency: number;
  p99Latency: number;
  requestsPerSecond: number;
  durationMs: number;
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
    .option('-v, --verbose', 'Verbose output')
    .action(async (scenarioPath: string, options: StressOptions) => {
      const spinner = ora('Loading scenario...').start();

      try {
        // Parse scenario
        const scenario = await parseScenarioFile(scenarioPath);
        spinner.succeed(`Loaded scenario: ${scenario.name}`);

        // Create adapter
        const provider = options.provider || scenario.provider || 'openai';
        const model = options.model || scenario.model;

        spinner.start(`Connecting to ${provider}...`);
        const client = await createAdapter(buildAdapterConfig(provider, model));
        spinner.succeed(`Connected to ${provider}`);

        // Configuration
        const concurrency = parseInt(String(options.concurrency)) || 10;
        const durationSec = parseInt(String(options.duration)) || 30;
        const rampUpSec = parseInt(String(options.rampUp)) || 5;
        const maxRequests = options.requests ? parseInt(String(options.requests)) : undefined;

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
        const prompts = scenario.cases.map(c =>
          typeof c.prompt === 'string' ? c.prompt : c.prompt.map(m => m.content).join('\n')
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
        console.log();

        // Calculate and display stats
        const stats = calculateStats(results);
        displayStats(stats);

        // Display latency histogram if verbose
        if (options.verbose) {
          displayHistogram(results);
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
  client: { generate: (req: { prompt: string; model?: string; temperature?: number }) => Promise<{ text: string }> };
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

async function runStressTest(options: StressTestOptions): Promise<RequestResult[]> {
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

  const results: RequestResult[] = [];
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
        latency: Date.now() - requestStart,
        timestamp: requestStart,
      });
    } catch (error) {
      results.push({
        success: false,
        latency: Date.now() - requestStart,
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
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Wait for all pending requests
  await Promise.all(promises);

  return results;
}

function calculateStats(results: RequestResult[]): StressStats {
  const successful = results.filter(r => r.success);
  const latencies = successful.map(r => r.latency).sort((a, b) => a - b);

  const totalRequests = results.length;
  const successfulRequests = successful.length;
  const failedRequests = totalRequests - successfulRequests;

  const minLatency = latencies[0] || 0;
  const maxLatency = latencies[latencies.length - 1] || 0;
  const avgLatency = latencies.length > 0
    ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
    : 0;

  const p50Latency = percentile(latencies, 50);
  const p90Latency = percentile(latencies, 90);
  const p99Latency = percentile(latencies, 99);

  const timestamps = results.map(r => r.timestamp);
  const durationMs = Math.max(...timestamps) - Math.min(...timestamps) + (latencies[latencies.length - 1] || 0);
  const requestsPerSecond = durationMs > 0 ? (totalRequests / durationMs) * 1000 : 0;

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    minLatency,
    maxLatency,
    avgLatency,
    p50Latency,
    p90Latency,
    p99Latency,
    requestsPerSecond,
    durationMs,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function displayStats(stats: StressStats): void {
  const table = new Table({
    head: [chalk.bold('Metric'), chalk.bold('Value')],
    style: { head: [], border: [] },
  });

  table.push(
    ['Total Requests', stats.totalRequests.toString()],
    ['Successful', chalk.green(stats.successfulRequests.toString())],
    ['Failed', stats.failedRequests > 0 ? chalk.red(stats.failedRequests.toString()) : '0'],
    ['', ''],
    ['Requests/sec', stats.requestsPerSecond.toFixed(2)],
    ['Duration', `${(stats.durationMs / 1000).toFixed(2)}s`],
    ['', ''],
    ['Min Latency', `${stats.minLatency}ms`],
    ['Max Latency', `${stats.maxLatency}ms`],
    ['Avg Latency', `${stats.avgLatency.toFixed(0)}ms`],
    ['p50 Latency', `${stats.p50Latency}ms`],
    ['p90 Latency', `${stats.p90Latency}ms`],
    ['p99 Latency', `${stats.p99Latency}ms`],
  );

  console.log(chalk.bold('Results'));
  console.log(table.toString());

  // Success rate
  const successRate = stats.totalRequests > 0
    ? (stats.successfulRequests / stats.totalRequests) * 100
    : 0;

  console.log();
  if (successRate >= 99) {
    console.log(chalk.green(`✓ Success rate: ${successRate.toFixed(2)}%`));
  } else if (successRate >= 95) {
    console.log(chalk.yellow(`⚠ Success rate: ${successRate.toFixed(2)}%`));
  } else {
    console.log(chalk.red(`✗ Success rate: ${successRate.toFixed(2)}%`));
  }
}

function displayHistogram(results: RequestResult[]): void {
  const successful = results.filter(r => r.success);
  if (successful.length === 0) return;

  const latencies = successful.map(r => r.latency);
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
      chalk.dim(`${rangeStart.toString().padStart(5)}-${rangeEnd.toString().padStart(5)}ms`) +
      ' │ ' +
      chalk.cyan(bar) +
      ` ${count}`
    );
  }
}

function buildAdapterConfig(provider: string, model?: string): AdapterConfig {
  switch (provider) {
    case 'openai':
      return {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        defaultModel: model,
      };

    case 'azure-openai':
      return {
        provider: 'azure-openai',
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        resourceName: process.env.AZURE_OPENAI_RESOURCE || '',
        deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT || '',
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
        defaultModel: model,
      };

    default:
      return {
        provider: provider as 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        defaultModel: model,
      };
  }
}
