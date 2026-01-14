/**
 * Run command - Execute test scenarios
 */

import { createAdapter, parseScenarioFile, runScenario } from '@artemiskit/core';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import ora from 'ora';
import { loadConfig } from '../config/loader';
import { buildAdapterConfig, resolveModel, resolveProvider } from '../utils/adapter';
import { createStorage } from '../utils/storage';

interface RunOptions {
  provider?: string;
  model?: string;
  output?: string;
  verbose?: boolean;
  tags?: string[];
  save?: boolean;
  concurrency?: number;
  timeout?: number;
  retries?: number;
  config?: string;
}

export function runCommand(): Command {
  const cmd = new Command('run');

  cmd
    .description('Run test scenarios against an LLM')
    .argument('<scenario>', 'Path to scenario YAML file')
    .option('-p, --provider <provider>', 'Provider to use (openai, azure-openai, vercel-ai)')
    .option('-m, --model <model>', 'Model to use')
    .option('-o, --output <dir>', 'Output directory for results')
    .option('-v, --verbose', 'Verbose output')
    .option('-t, --tags <tags...>', 'Filter test cases by tags')
    .option('--save', 'Save results to storage', true)
    .option('-c, --concurrency <number>', 'Number of concurrent test cases', '1')
    .option('--timeout <ms>', 'Timeout per test case in milliseconds')
    .option('--retries <number>', 'Number of retries per test case')
    .option('--config <path>', 'Path to config file')
    .action(async (scenarioPath: string, options: RunOptions) => {
      const spinner = ora('Loading configuration...').start();

      try {
        // Load config file if present
        const config = await loadConfig(options.config);
        if (config) {
          spinner.succeed(`Loaded config from ${(config as { _path?: string })._path}`);
        } else {
          spinner.info('No config file found, using defaults');
        }

        // Parse scenario
        spinner.start('Loading scenario...');
        const scenario = await parseScenarioFile(scenarioPath);
        spinner.succeed(`Loaded scenario: ${scenario.name}`);

        // Resolve provider and model with precedence:
        // CLI > Scenario > Config > Default
        const provider = resolveProvider(options.provider, scenario.provider, config?.provider);
        const model = resolveModel(options.model, scenario.model, config?.model);

        // Build adapter config with full precedence chain
        spinner.start(`Connecting to ${provider}...`);
        const adapterConfig = buildAdapterConfig({
          provider,
          model,
          scenarioConfig: scenario.providerConfig,
          fileConfig: config,
        });
        const client = await createAdapter(adapterConfig);
        spinner.succeed(`Connected to ${provider}`);

        console.log();
        console.log(chalk.bold(`Running scenario: ${scenario.name}`));
        console.log();

        // Run scenario using core runner
        const result = await runScenario({
          scenario,
          client,
          project: config?.project || process.env.ARTEMIS_PROJECT || 'default',
          tags: options.tags,
          concurrency: Number.parseInt(String(options.concurrency)) || 1,
          timeout: options.timeout ? Number.parseInt(String(options.timeout)) : undefined,
          retries: options.retries ? Number.parseInt(String(options.retries)) : undefined,
          onCaseComplete: (caseResult) => {
            const statusIcon = caseResult.ok ? chalk.green('✓') : chalk.red('✗');
            const scoreStr = `(${(caseResult.score * 100).toFixed(0)}%)`;
            console.log(`${statusIcon} ${caseResult.id} ${chalk.dim(scoreStr)}`);

            if (!caseResult.ok && options.verbose) {
              console.log(chalk.dim(`   Reason: ${caseResult.reason}`));
            }
          },
          onProgress: (message) => {
            if (options.verbose) {
              console.log(chalk.dim(message));
            }
          },
        });

        // Display summary
        console.log();
        displaySummary(result.manifest.metrics, result.manifest.run_id);

        // Save results
        if (options.save) {
          spinner.start('Saving results...');
          const storage = createStorage({ fileConfig: config });
          const path = await storage.save(result.manifest);
          spinner.succeed(`Results saved: ${path}`);
        }

        // Exit with error if any tests failed
        if (!result.success) {
          process.exit(1);
        }
      } catch (error) {
        spinner.fail('Error');
        console.error(chalk.red('Error:'), (error as Error).message);
        if (options.verbose) {
          console.error((error as Error).stack);
        }
        process.exit(1);
      }
    });

  return cmd;
}

function displaySummary(
  metrics: {
    success_rate: number;
    total_cases: number;
    passed_cases: number;
    failed_cases: number;
    median_latency_ms: number;
    total_tokens: number;
  },
  runId: string
): void {
  const table = new Table({
    head: [chalk.bold('Metric'), chalk.bold('Value')],
    style: { head: [], border: [] },
  });

  const successColor =
    metrics.success_rate >= 0.9
      ? chalk.green
      : metrics.success_rate >= 0.7
        ? chalk.yellow
        : chalk.red;

  table.push(
    ['Run ID', runId],
    ['Success Rate', successColor(`${(metrics.success_rate * 100).toFixed(1)}%`)],
    ['Passed', chalk.green(metrics.passed_cases.toString())],
    ['Failed', metrics.failed_cases > 0 ? chalk.red(metrics.failed_cases.toString()) : '0'],
    ['Median Latency', `${metrics.median_latency_ms}ms`],
    ['Total Tokens', metrics.total_tokens.toLocaleString()]
  );

  console.log(table.toString());
}
