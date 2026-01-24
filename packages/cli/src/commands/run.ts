/**
 * Run command - Execute test scenarios
 */

import {
  type RedactionConfig,
  type RunManifest,
  createAdapter,
  parseScenarioFile,
  resolveScenarioPaths,
  runScenario,
} from '@artemiskit/core';
import chalk from 'chalk';
import { Command } from 'commander';
import { basename } from 'node:path';
import type { ArtemisConfig } from '../config/schema.js';
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
  parallel?: number;
}

interface ScenarioRunResult {
  scenarioPath: string;
  scenarioName: string;
  success: boolean;
  manifest: RunManifest;
  error?: string;
}

/**
 * Run a single scenario and return the result (quiet mode for parallel execution)
 */
async function runSingleScenarioQuiet(
  scenarioPath: string,
  options: RunOptions,
  config: ArtemisConfig | null
): Promise<ScenarioRunResult> {
  // Parse scenario
  const scenario = await parseScenarioFile(scenarioPath);

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
  const { adapterConfig, resolvedConfig } = buildAdapterConfig({
    provider,
    model,
    providerSource,
    modelSource,
    scenarioConfig: scenario.providerConfig,
    fileConfig: config,
  });
  const client = await createAdapter(adapterConfig);

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
  }

  // Run scenario using core runner (no callbacks in quiet mode)
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
  });

  return {
    scenarioPath,
    scenarioName: scenario.name,
    success: result.success,
    manifest: result.manifest,
  };
}

/**
 * Run a single scenario and return the result (verbose mode for sequential execution)
 */
async function runSingleScenario(
  scenarioPath: string,
  options: RunOptions,
  config: ArtemisConfig | null,
  spinner: ReturnType<typeof createSpinner>,
  isMultiScenario: boolean
): Promise<ScenarioRunResult> {
  // Parse scenario
  const scenario = await parseScenarioFile(scenarioPath);

  if (isMultiScenario) {
    console.log();
    console.log(chalk.bold.cyan(`━━━ ${scenario.name} ━━━`));
    console.log(chalk.dim(`File: ${basename(scenarioPath)}`));
    console.log();
  }

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
  if (!isMultiScenario) {
    spinner.start(`Connecting to ${provider}...`);
  }
  const { adapterConfig, resolvedConfig } = buildAdapterConfig({
    provider,
    model,
    providerSource,
    modelSource,
    scenarioConfig: scenario.providerConfig,
    fileConfig: config,
  });
  const client = await createAdapter(adapterConfig);
  if (!isMultiScenario) {
    spinner.succeed(`Connected to ${provider}`);
    console.log();
    console.log(chalk.bold(`Running scenario: ${scenario.name}`));
    console.log();
  }

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
    if (!isMultiScenario) {
      console.log(
        chalk.dim(
          `Redaction enabled${options.redactPatterns ? ` with patterns: ${options.redactPatterns.join(', ')}` : ' (default patterns)'}`
        )
      );
      console.log();
    }
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

  return {
    scenarioPath,
    scenarioName: scenario.name,
    success: result.success,
    manifest: result.manifest,
  };
}

/**
 * Run scenarios in parallel with a concurrency limit
 */
async function runScenariosInParallel(
  scenarioPaths: string[],
  options: RunOptions,
  config: ArtemisConfig | null,
  parallelLimit: number,
  storage: ReturnType<typeof createStorage>
): Promise<ScenarioRunResult[]> {
  const results: ScenarioRunResult[] = [];
  let completedCount = 0;
  const totalCount = scenarioPaths.length;

  // Create a queue of scenario paths
  const queue = [...scenarioPaths];
  const inProgress = new Set<Promise<void>>();

  // Progress display function
  const updateProgress = (scenarioName: string, success: boolean) => {
    completedCount++;
    const icon = success ? icons.passed : icons.failed;
    const status = success ? chalk.green('passed') : chalk.red('failed');

    if (isTTY) {
      const progressBar = renderProgressBar(completedCount, totalCount, { width: 20 });
      console.log(`${icon} ${scenarioName}  ${status}  ${progressBar}`);
    } else {
      console.log(`${icon} ${scenarioName}  ${status}  [${completedCount}/${totalCount}]`);
    }
  };

  // Process a single scenario
  const processScenario = async (path: string): Promise<void> => {
    try {
      const result = await runSingleScenarioQuiet(path, options, config);
      results.push(result);
      updateProgress(result.scenarioName, result.success);

      // Save results if enabled
      if (options.save && result.manifest.run_id) {
        await storage.save(result.manifest);
      }
    } catch (error) {
      const scenarioName = basename(path);
      results.push({
        scenarioPath: path,
        scenarioName,
        success: false,
        manifest: {} as RunManifest,
        error: (error as Error).message,
      });
      updateProgress(scenarioName, false);
    }
  };

  // Run with concurrency limit
  while (queue.length > 0 || inProgress.size > 0) {
    // Start new tasks up to the limit
    while (queue.length > 0 && inProgress.size < parallelLimit) {
      const path = queue.shift()!;
      const promise = processScenario(path).then(() => {
        inProgress.delete(promise);
      });
      inProgress.add(promise);
    }

    // Wait for at least one task to complete
    if (inProgress.size > 0) {
      await Promise.race(inProgress);
    }
  }

  return results;
}

export function runCommand(): Command {
  const cmd = new Command('run');

  cmd
    .description(
      'Run test scenarios against an LLM. Accepts a file path, directory, or glob pattern.'
    )
    .argument(
      '<scenario>',
      'Path to scenario file, directory, or glob pattern (e.g., scenarios/**/*.yaml)'
    )
    .option('-p, --provider <provider>', 'Provider to use (openai, azure-openai, vercel-ai)')
    .option('-m, --model <model>', 'Model to use')
    .option('-o, --output <dir>', 'Output directory for results')
    .option('-v, --verbose', 'Verbose output')
    .option('-t, --tags <tags...>', 'Filter test cases by tags')
    .option('--save', 'Save results to storage', true)
    .option('-c, --concurrency <number>', 'Number of concurrent test cases per scenario', '1')
    .option('--parallel <number>', 'Number of scenarios to run in parallel (default: sequential)')
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
          spinner.succeed(`Loaded config from ${config._path}`);
        } else {
          spinner.info('No config file found, using defaults');
        }

        // Resolve scenario paths (handles files, directories, and globs)
        spinner.start('Discovering scenarios...');
        const scenarioPaths = await resolveScenarioPaths(scenarioPath);

        if (scenarioPaths.length === 0) {
          spinner.fail('No scenario files found');
          console.log();
          console.log(chalk.yellow(`No .yaml or .yml files found matching: ${scenarioPath}`));
          console.log(chalk.dim('Make sure the path exists and contains valid scenario files.'));
          process.exit(1);
        }

        const isMultiScenario = scenarioPaths.length > 1;
        const parallelLimit = options.parallel ? Number.parseInt(String(options.parallel)) : 0;
        const runInParallel = parallelLimit > 0 && isMultiScenario;

        if (isMultiScenario) {
          const modeStr = runInParallel
            ? chalk.cyan(`parallel (${parallelLimit} concurrent)`)
            : chalk.dim('sequential');
          spinner.succeed(`Found ${scenarioPaths.length} scenario files`);
          console.log();
          console.log(chalk.bold(`Running ${scenarioPaths.length} scenarios ${modeStr}...`));
          console.log();
        } else {
          spinner.succeed(`Loaded scenario file`);
        }

        // Run all scenarios
        const storage = createStorage({ fileConfig: config });
        let results: ScenarioRunResult[];

        if (runInParallel) {
          // Parallel execution
          results = await runScenariosInParallel(
            scenarioPaths,
            options,
            config,
            parallelLimit,
            storage
          );
        } else {
          // Sequential execution
          results = [];
          for (const path of scenarioPaths) {
            try {
              const result = await runSingleScenario(
                path,
                options,
                config,
                spinner,
                isMultiScenario
              );
              results.push(result);

              // Display per-scenario summary
              const summaryData = {
                passed: result.manifest.metrics.passed_cases,
                failed: result.manifest.metrics.failed_cases,
                skipped: 0,
                successRate: result.manifest.metrics.success_rate * 100,
                duration: result.manifest.duration_ms,
                title: isMultiScenario ? result.scenarioName.toUpperCase() : 'TEST RESULTS',
              };
              console.log();
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
                const savedPath = await storage.save(result.manifest);
                console.log(chalk.dim(`Saved: ${savedPath}`));
              }
            } catch (error) {
              // Record failed scenario
              console.log();
              console.log(chalk.red(`${icons.failed} Failed to run: ${basename(path)}`));
              if (options.verbose) {
                console.log(chalk.dim((error as Error).message));
              }
              results.push({
                scenarioPath: path,
                scenarioName: basename(path),
                success: false,
                manifest: {} as RunManifest,
              });
            }
          }
        }

        // Display aggregate summary for multiple scenarios
        if (isMultiScenario) {
          console.log();
          console.log(chalk.bold.cyan('━━━ AGGREGATE SUMMARY ━━━'));
          console.log();

          const totalScenarios = results.length;
          const passedScenarios = results.filter((r) => r.success).length;
          const failedScenarios = totalScenarios - passedScenarios;

          const totalCases = results.reduce(
            (sum, r) => sum + (r.manifest.metrics?.total_cases || 0),
            0
          );
          const passedCases = results.reduce(
            (sum, r) => sum + (r.manifest.metrics?.passed_cases || 0),
            0
          );
          const failedCases = results.reduce(
            (sum, r) => sum + (r.manifest.metrics?.failed_cases || 0),
            0
          );
          const totalDuration = results.reduce((sum, r) => sum + (r.manifest.duration_ms || 0), 0);

          console.log(
            `Scenarios:  ${chalk.green(passedScenarios + ' passed')}  ${failedScenarios > 0 ? chalk.red(failedScenarios + ' failed') : ''}  ${chalk.dim('(' + totalScenarios + ' total)')}`
          );
          console.log(
            `Test Cases: ${chalk.green(passedCases + ' passed')}  ${failedCases > 0 ? chalk.red(failedCases + ' failed') : ''}  ${chalk.dim('(' + totalCases + ' total)')}`
          );
          console.log(`Duration:   ${chalk.dim(formatDuration(totalDuration))}`);

          if (runInParallel) {
            console.log(
              `Mode:       ${chalk.cyan('parallel')} ${chalk.dim(`(${parallelLimit} concurrent)`)}`
            );
          }
          console.log();

          // List failed scenarios
          const failedResults = results.filter((r) => !r.success);
          if (failedResults.length > 0) {
            console.log(chalk.red('Failed scenarios:'));
            for (const result of failedResults) {
              console.log(chalk.red(`  ${icons.failed} ${result.scenarioName}`));
              if (result.error && options.verbose) {
                console.log(chalk.dim(`      ${result.error}`));
              }
            }
            console.log();
          }
        }

        // Exit with error if any scenarios failed
        const hasFailures = results.some((r) => !r.success);
        if (hasFailures) {
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
