/**
 * Run command - Execute test scenarios
 */

import {
  type RedactionConfig,
  createAdapter,
  parseScenarioFile,
  runScenario,
} from '@artemiskit/core';
import chalk from 'chalk';
import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import {
  createSpinner,
  formatDuration,
  getProviderErrorContext,
  icons,
  isTTY,
  padText,
  renderError,
  renderProgressBar,
  renderSummaryPanel,
} from '../ui/index.js';
import {
  buildAdapterConfig,
  resolveModelWithSource,
  resolveProviderWithSource,
} from '../utils/adapter.js';
import { createStorage } from '../utils/storage.js';

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
  redact?: boolean;
  redactPatterns?: string[];
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
    .option('--redact', 'Enable PII/sensitive data redaction in results')
    .option(
      '--redact-patterns <patterns...>',
      'Custom redaction patterns (regex or built-in: email, phone, credit_card, ssn, api_key)'
    )
    .action(async (scenarioPath: string, options: RunOptions) => {
      const spinner = createSpinner('Loading configuration...');
      spinner.start();

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

        console.log();
        console.log(chalk.bold(`Running scenario: ${scenario.name}`));
        console.log();

        // Build redaction config from CLI options
        let redaction: RedactionConfig | undefined;
        if (options.redact) {
          redaction = {
            enabled: true,
            patterns: options.redactPatterns,
            redactPrompts: true,
            redactResponses: true,
            redactMetadata: false,
            replacement: '[REDACTED]',
          };
          console.log(
            chalk.dim(
              `Redaction enabled${options.redactPatterns ? ` with patterns: ${options.redactPatterns.join(', ')}` : ' (default patterns)'}`
            )
          );
          console.log();
        }

        // Track progress
        const totalCases = scenario.cases.length;
        let completedCases = 0;

        // Calculate max widths for alignment
        const maxIdLength = Math.max(...scenario.cases.map((c) => c.id.length));
        const maxScoreLength = 6; // "(100%)"
        const maxDurationLength = 6; // "10.0s" or "999ms"

        // Run scenario using core runner
        const result = await runScenario({
          scenario,
          client,
          project: config?.project || process.env.ARTEMIS_PROJECT || 'default',
          resolvedConfig,
          tags: options.tags,
          concurrency: Number.parseInt(String(options.concurrency)) || 1,
          timeout: options.timeout ? Number.parseInt(String(options.timeout)) : undefined,
          retries: options.retries ? Number.parseInt(String(options.retries)) : undefined,
          redaction,
          onCaseComplete: (caseResult) => {
            completedCases++;

            const statusIcon = caseResult.ok ? icons.passed : icons.failed;
            const scoreStr = `(${(caseResult.score * 100).toFixed(0)}%)`;
            const durationStr = caseResult.latencyMs ? formatDuration(caseResult.latencyMs) : '';

            // Pad columns for alignment
            const paddedId = padText(caseResult.id, maxIdLength);
            const paddedScore = padText(scoreStr, maxScoreLength, 'right');
            const paddedDuration = padText(durationStr, maxDurationLength, 'right');

            // Show result - with progress bar in TTY, simple format in CI/CD
            if (isTTY) {
              const progressBar = renderProgressBar(completedCases, totalCases, { width: 15 });
              console.log(
                `${statusIcon} ${paddedId}  ${chalk.dim(paddedScore)}  ${chalk.dim(paddedDuration)}  ${progressBar}`
              );
            } else {
              // CI/CD friendly output - no progress bar, just count
              console.log(
                `${statusIcon} ${paddedId}  ${chalk.dim(paddedScore)}  ${chalk.dim(paddedDuration)}  [${completedCases}/${totalCases}]`
              );
            }

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

        // Display summary using enhanced panel
        console.log();
        const summaryData = {
          passed: result.manifest.metrics.passed_cases,
          failed: result.manifest.metrics.failed_cases,
          skipped: 0,
          successRate: result.manifest.metrics.success_rate * 100,
          duration: result.manifest.duration_ms,
          title: 'TEST RESULTS',
        };
        console.log(renderSummaryPanel(summaryData));

        // Show additional metrics
        console.log();
        console.log(
          chalk.dim(
            `Run ID: ${result.manifest.run_id}  |  Median Latency: ${result.manifest.metrics.median_latency_ms}ms  |  Tokens: ${result.manifest.metrics.total_tokens.toLocaleString()}`
          )
        );

        // Show redaction info if enabled
        if (result.manifest.redaction?.enabled) {
          const r = result.manifest.redaction;
          console.log(
            chalk.dim(
              `Redactions: ${r.summary.totalRedactions} (${r.summary.promptsRedacted} prompts, ${r.summary.responsesRedacted} responses)`
            )
          );
        }

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

        // Get provider from options or default
        const provider = options.provider || 'unknown';

        // Display enhanced error message
        const errorContext = getProviderErrorContext(provider, error as Error);
        console.log();
        console.log(renderError(errorContext));

        if (options.verbose) {
          console.log();
          console.error(chalk.dim((error as Error).stack));
        }
        process.exit(1);
      }
    });

  return cmd;
}
