/**
 * Run command - Execute test scenarios
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  parseScenarioFile,
  createAdapter,
  getEvaluator,
  createRunManifest,
  createStorageFromEnv,
  type Scenario,
  type TestCase,
  type CaseResult,
  type ModelClient,
  type AdapterConfig,
} from '@artemis/core';

interface RunOptions {
  provider?: string;
  model?: string;
  output?: string;
  verbose?: boolean;
  tags?: string[];
  save?: boolean;
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
    .action(async (scenarioPath: string, options: RunOptions) => {
      const spinner = ora('Loading scenario...').start();

      try {
        // Parse scenario
        const scenario = await parseScenarioFile(scenarioPath);
        spinner.succeed(`Loaded scenario: ${scenario.name}`);

        // Filter cases by tags if specified
        let cases = scenario.cases;
        if (options.tags && options.tags.length > 0) {
          cases = cases.filter((c) =>
            options.tags!.some((tag) => c.tags.includes(tag))
          );
          console.log(chalk.dim(`Filtered to ${cases.length} cases by tags: ${options.tags.join(', ')}`));
        }

        if (cases.length === 0) {
          console.log(chalk.yellow('No test cases to run.'));
          return;
        }

        // Create adapter
        const provider = options.provider || scenario.provider || 'openai';
        const model = options.model || scenario.model;

        spinner.start(`Connecting to ${provider}...`);
        const client = await createAdapter(buildAdapterConfig(provider, model));
        spinner.succeed(`Connected to ${provider}`);

        // Run tests
        console.log();
        console.log(chalk.bold(`Running ${cases.length} test cases...`));
        console.log();

        const startTime = new Date();
        const results: CaseResult[] = [];

        for (const testCase of cases) {
          const result = await runTestCase(client, testCase, scenario, options.verbose);
          results.push(result);

          const statusIcon = result.ok ? chalk.green('✓') : chalk.red('✗');
          const scoreStr = `(${(result.score * 100).toFixed(0)}%)`;
          console.log(`${statusIcon} ${testCase.id} ${chalk.dim(scoreStr)}`);

          if (!result.ok && options.verbose) {
            console.log(chalk.dim(`   Reason: ${result.reason}`));
          }
        }

        const endTime = new Date();

        // Create manifest
        const manifest = createRunManifest({
          project: process.env.ARTEMIS_PROJECT || 'default',
          config: {
            scenario: scenario.name,
            provider,
            model: model || 'unknown',
            temperature: scenario.temperature,
            seed: scenario.seed,
          },
          cases: results,
          startTime,
          endTime,
        });

        // Display summary
        console.log();
        displaySummary(manifest.metrics, manifest.run_id);

        // Save results
        if (options.save) {
          spinner.start('Saving results...');
          const storage = createStorageFromEnv();
          const path = await storage.save(manifest);
          spinner.succeed(`Results saved: ${path}`);
        }

        // Exit with error if any tests failed
        if (manifest.metrics.failed_cases > 0) {
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

async function runTestCase(
  client: ModelClient,
  testCase: TestCase,
  scenario: Scenario,
  verbose?: boolean
): Promise<CaseResult> {
  const startTime = Date.now();

  try {
    // Build prompt with system prompt if present
    let prompt = testCase.prompt;
    if (scenario.setup?.systemPrompt && typeof prompt === 'string') {
      prompt = [
        { role: 'system' as const, content: scenario.setup.systemPrompt },
        { role: 'user' as const, content: prompt },
      ];
    }

    // Generate response
    const result = await client.generate({
      prompt,
      model: testCase.model || scenario.model,
      temperature: scenario.temperature,
      maxTokens: scenario.maxTokens,
      seed: scenario.seed,
    });

    // Evaluate response
    const evaluator = getEvaluator(testCase.expected.type);
    const evalResult = await evaluator.evaluate(result.text, testCase.expected, {
      client,
      testCase,
    });

    return {
      id: testCase.id,
      name: testCase.name,
      ok: evalResult.passed,
      score: evalResult.score,
      matcherType: testCase.expected.type,
      reason: evalResult.reason,
      latencyMs: result.latencyMs,
      tokens: result.tokens,
      prompt: testCase.prompt,
      response: result.text,
      expected: testCase.expected,
      tags: testCase.tags,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      id: testCase.id,
      name: testCase.name,
      ok: false,
      score: 0,
      matcherType: testCase.expected.type,
      reason: `Error: ${(error as Error).message}`,
      latencyMs,
      tokens: { prompt: 0, completion: 0, total: 0 },
      prompt: testCase.prompt,
      response: '',
      expected: testCase.expected,
      tags: testCase.tags,
      error: (error as Error).message,
    };
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

    case 'vercel-ai':
      return {
        provider: 'vercel-ai',
        underlyingProvider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
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

  const successColor = metrics.success_rate >= 0.9 ? chalk.green : metrics.success_rate >= 0.7 ? chalk.yellow : chalk.red;

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
