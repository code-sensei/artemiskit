/**
 * Run command - Execute test scenarios
 */

import { basename } from 'node:path';
import {
  type BaselineStorageAdapter,
  type RedactionConfig,
  type RunManifest,
  createAdapter,
  parseScenarioFile,
  resolveScenarioPaths,
  runScenario,
} from '@artemiskit/core';
import chalk from 'chalk';
import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import type { ArtemisConfig } from '../config/schema.js';
import {
  createSpinner,
  formatDuration,
  getProviderErrorContext,
  icons,
  isInteractive,
  isTTY,
  padText,
  promptModel,
  promptProvider,
  promptScenarios,
  renderError,
  renderFailureReason,
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
  interactive?: boolean;
  /** CI mode - machine-readable output, no colors/spinners */
  ci?: boolean;
  /** Summary format: json, text, or security */
  summary?: 'json' | 'text' | 'security';
  /** Compare against baseline and detect regression */
  baseline?: boolean;
  /** Regression threshold (0-1), default 0.05 (5%) */
  threshold?: number;
}

interface ScenarioRunResult {
  scenarioPath: string;
  scenarioName: string;
  success: boolean;
  manifest: RunManifest;
  error?: string;
}

/**
 * Minimal spinner interface for CI/non-TTY compatibility
 */
interface SpinnerLike {
  start: (text?: string) => void;
  stop: () => void;
  succeed: (text?: string) => void;
  fail: (text?: string) => void;
  info: (text?: string) => void;
}

/**
 * CI-friendly JSON summary output
 */
interface CISummary {
  success: boolean;
  scenarios: {
    total: number;
    passed: number;
    failed: number;
  };
  cases: {
    total: number;
    passed: number;
    failed: number;
    successRate: number;
  };
  duration: {
    totalMs: number;
    formatted: string;
  };
  runs: Array<{
    runId: string;
    scenario: string;
    success: boolean;
    successRate: number;
    passedCases: number;
    failedCases: number;
    totalCases: number;
    durationMs: number;
  }>;
  baseline?: {
    compared: boolean;
    hasRegression: boolean;
    threshold: number;
    delta?: {
      successRate: number;
      latency: number;
      tokens: number;
    };
  };
}

/**
 * Security-focused summary for red team/security reporting
 */
interface SecuritySummary {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  successRate: number;
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recommendations: string[];
}

/**
 * Check if storage adapter supports baselines
 */
function isBaselineStorage(storage: unknown): storage is BaselineStorageAdapter {
  return (
    typeof storage === 'object' &&
    storage !== null &&
    'setBaseline' in storage &&
    'getBaseline' in storage &&
    'listBaselines' in storage &&
    'compareToBaseline' in storage
  );
}

/**
 * Build CI summary from results
 */
function buildCISummary(results: ScenarioRunResult[]): CISummary {
  const totalScenarios = results.length;
  const passedScenarios = results.filter((r) => r.success).length;
  const failedScenarios = totalScenarios - passedScenarios;

  const totalCases = results.reduce((sum, r) => sum + (r.manifest.metrics?.total_cases || 0), 0);
  const passedCases = results.reduce((sum, r) => sum + (r.manifest.metrics?.passed_cases || 0), 0);
  const failedCases = results.reduce((sum, r) => sum + (r.manifest.metrics?.failed_cases || 0), 0);
  const totalDuration = results.reduce((sum, r) => sum + (r.manifest.duration_ms || 0), 0);

  return {
    success: failedScenarios === 0,
    scenarios: {
      total: totalScenarios,
      passed: passedScenarios,
      failed: failedScenarios,
    },
    cases: {
      total: totalCases,
      passed: passedCases,
      failed: failedCases,
      successRate: totalCases > 0 ? passedCases / totalCases : 0,
    },
    duration: {
      totalMs: totalDuration,
      formatted: formatDuration(totalDuration),
    },
    runs: results.map((r) => ({
      runId: r.manifest.run_id || '',
      scenario: r.scenarioName,
      success: r.success,
      successRate: r.manifest.metrics?.success_rate || 0,
      passedCases: r.manifest.metrics?.passed_cases || 0,
      failedCases: r.manifest.metrics?.failed_cases || 0,
      totalCases: r.manifest.metrics?.total_cases || 0,
      durationMs: r.manifest.duration_ms || 0,
    })),
  };
}

/**
 * Build security summary (for --summary security)
 */
function buildSecuritySummary(results: ScenarioRunResult[]): SecuritySummary {
  const totalCases = results.reduce((sum, r) => sum + (r.manifest.metrics?.total_cases || 0), 0);
  const passedCases = results.reduce((sum, r) => sum + (r.manifest.metrics?.passed_cases || 0), 0);
  const successRate = totalCases > 0 ? passedCases / totalCases : 0;

  // Categorize risk based on success rate (for standard runs, invert for security context)
  let overallRisk: 'low' | 'medium' | 'high' | 'critical';
  if (successRate >= 0.95) overallRisk = 'low';
  else if (successRate >= 0.8) overallRisk = 'medium';
  else if (successRate >= 0.5) overallRisk = 'high';
  else overallRisk = 'critical';

  // Count failures by severity (simplified - can be enhanced with actual severity data)
  const failedCases = totalCases - passedCases;

  return {
    overallRisk,
    successRate,
    vulnerabilities: {
      critical: overallRisk === 'critical' ? failedCases : 0,
      high: overallRisk === 'high' ? failedCases : 0,
      medium: overallRisk === 'medium' ? failedCases : 0,
      low: overallRisk === 'low' ? failedCases : 0,
    },
    recommendations:
      successRate < 1
        ? [
            'Review failed test cases for potential issues',
            'Consider adding more comprehensive test coverage',
            successRate < 0.8 ? 'Investigate root causes of failures before deployment' : '',
          ].filter(Boolean)
        : ['All tests passing - continue monitoring'],
  };
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
  spinner: SpinnerLike,
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

      if (!caseResult.ok && options.verbose && caseResult.reason) {
        console.log(
          renderFailureReason(caseResult.reason, { matcherType: caseResult.matcherType })
        );
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
      '[scenario]',
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
    .option('-i, --interactive', 'Enable interactive mode for scenario/provider selection')
    .option('--ci', 'CI mode: machine-readable output, no colors/spinners, JSON summary')
    .option(
      '--summary <format>',
      'Summary output format: json, text, or security (implies --ci for json/security)',
      'text'
    )
    .option('--baseline', 'Compare against baseline and detect regression')
    .option('--threshold <number>', 'Regression threshold (0-1), e.g., 0.05 for 5%', '0.05')
    .action(async (scenarioPath: string | undefined, options: RunOptions) => {
      // Determine CI mode: explicit flag, environment variable, or summary format that implies CI
      const isCIMode =
        options.ci ||
        process.env.CI === 'true' ||
        options.summary === 'json' ||
        options.summary === 'security';

      // In CI mode, use a no-op spinner
      const spinner = isCIMode
        ? {
            start: () => {},
            stop: () => {},
            succeed: () => {},
            fail: () => {},
            info: () => {},
          }
        : createSpinner('Loading configuration...');

      if (!isCIMode) {
        spinner.start();
      }

      try {
        // Load config file if present
        const config = await loadConfig(options.config);
        if (!isCIMode) {
          if (config) {
            spinner.succeed(`Loaded config from ${config._path}`);
          } else {
            spinner.info('No config file found, using defaults');
          }
        }

        // Determine if we should use interactive mode (never in CI mode)
        const useInteractive =
          !isCIMode && (options.interactive || (!scenarioPath && isInteractive()));

        // Interactive provider/model selection if requested
        if (useInteractive && !options.provider) {
          spinner.stop();
          console.log(chalk.cyan('\n  Interactive mode enabled\n'));

          const provider = await promptProvider('Select a provider:');
          options.provider = provider;

          const model = await promptModel(provider, 'Select a model:');
          options.model = model;

          console.log(''); // spacing
          spinner.start('Discovering scenarios...');
        }

        // If no scenario path provided, try to find scenarios or prompt
        let resolvedScenarioPath = scenarioPath;
        if (!resolvedScenarioPath) {
          // Try default scenarios directory
          const defaultPath = config?.scenariosDir || './scenarios';
          spinner.start(`Looking for scenarios in ${defaultPath}...`);

          try {
            const defaultScenarios = await resolveScenarioPaths(defaultPath);
            if (defaultScenarios.length > 0) {
              spinner.stop();

              if (useInteractive) {
                // Let user select which scenarios to run
                const scenarioChoices = await Promise.all(
                  defaultScenarios.map(async (path) => {
                    try {
                      const scenario = await parseScenarioFile(path);
                      return { path, name: scenario.name || basename(path) };
                    } catch {
                      return { path, name: basename(path) };
                    }
                  })
                );

                const selectedPaths = await promptScenarios(
                  scenarioChoices,
                  'Select scenarios to run:'
                );

                if (selectedPaths.length === 0) {
                  console.log(chalk.yellow('\nNo scenarios selected. Exiting.'));
                  process.exit(0);
                }

                // Use the first selected scenario or create a temp pattern
                resolvedScenarioPath =
                  selectedPaths.length === 1 ? selectedPaths[0] : `{${selectedPaths.join(',')}}`;

                console.log(''); // spacing
                spinner.start('Preparing scenarios...');
              } else {
                spinner.succeed(`Found ${defaultScenarios.length} scenarios in ${defaultPath}`);
                resolvedScenarioPath = defaultPath;
              }
            } else {
              spinner.fail(`No scenarios found in ${defaultPath}`);
              console.log();
              console.log(chalk.yellow('Please provide a scenario path:'));
              console.log(chalk.dim('  artemiskit run <path-to-scenario.yaml>'));
              console.log(chalk.dim('  artemiskit run scenarios/'));
              console.log(chalk.dim('  artemiskit run "scenarios/**/*.yaml"'));
              process.exit(1);
            }
          } catch {
            spinner.fail('No scenario path provided');
            console.log();
            console.log(chalk.yellow('Usage: artemiskit run <scenario>'));
            console.log(chalk.dim('  <scenario> can be a file, directory, or glob pattern'));
            process.exit(1);
          }
        }

        // Resolve scenario paths (handles files, directories, and globs)
        spinner.start('Discovering scenarios...');
        const scenarioPaths = await resolveScenarioPaths(resolvedScenarioPath);

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
          spinner.succeed('Loaded scenario file');
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

        // Build CI summary (used for CI mode output and baseline comparison)
        const ciSummary = buildCISummary(results);

        // Baseline comparison (if enabled)
        let baselineResult: {
          hasRegression: boolean;
          threshold: number;
          delta?: { successRate: number; latency: number; tokens: number };
        } | null = null;

        if (options.baseline && results.length > 0) {
          const regressionThreshold = Number.parseFloat(String(options.threshold)) || 0.05;

          // Check each scenario against its baseline
          for (const result of results) {
            if (!result.manifest.run_id) continue;

            if (isBaselineStorage(storage) && storage.compareToBaseline) {
              try {
                const comparison = await storage.compareToBaseline(
                  result.manifest.run_id,
                  regressionThreshold
                );

                if (comparison) {
                  baselineResult = {
                    hasRegression: comparison.hasRegression,
                    threshold: comparison.regressionThreshold,
                    delta: comparison.comparison.delta,
                  };

                  // Add baseline info to CI summary
                  ciSummary.baseline = {
                    compared: true,
                    hasRegression: comparison.hasRegression,
                    threshold: comparison.regressionThreshold,
                    delta: comparison.comparison.delta,
                  };

                  if (!isCIMode && comparison.hasRegression) {
                    console.log();
                    console.log(
                      `${icons.failed} ${chalk.red('Regression detected!')} for ${chalk.bold(result.scenarioName)}`
                    );
                    console.log(
                      chalk.dim(
                        `  Success rate dropped by ${Math.abs(comparison.comparison.delta.successRate * 100).toFixed(1)}% (threshold: ${regressionThreshold * 100}%)`
                      )
                    );
                  }
                }
              } catch {
                // Baseline comparison failed, continue without it
              }
            }
          }
        }

        // Handle CI mode output
        if (isCIMode) {
          if (options.summary === 'json') {
            console.log(JSON.stringify(ciSummary, null, 2));
          } else if (options.summary === 'security') {
            const securitySummary = buildSecuritySummary(results);
            console.log(JSON.stringify(securitySummary, null, 2));
          } else {
            // Default CI text output (minimal)
            const totalCases = ciSummary.cases.total;
            const passedCases = ciSummary.cases.passed;
            const failedCases = ciSummary.cases.failed;
            const successRate = (ciSummary.cases.successRate * 100).toFixed(1);

            console.log(`ARTEMISKIT_RESULT=${ciSummary.success ? 'PASS' : 'FAIL'}`);
            console.log(`ARTEMISKIT_SCENARIOS_TOTAL=${ciSummary.scenarios.total}`);
            console.log(`ARTEMISKIT_SCENARIOS_PASSED=${ciSummary.scenarios.passed}`);
            console.log(`ARTEMISKIT_SCENARIOS_FAILED=${ciSummary.scenarios.failed}`);
            console.log(`ARTEMISKIT_CASES_TOTAL=${totalCases}`);
            console.log(`ARTEMISKIT_CASES_PASSED=${passedCases}`);
            console.log(`ARTEMISKIT_CASES_FAILED=${failedCases}`);
            console.log(`ARTEMISKIT_SUCCESS_RATE=${successRate}`);
            console.log(`ARTEMISKIT_DURATION_MS=${ciSummary.duration.totalMs}`);

            if (baselineResult) {
              console.log('ARTEMISKIT_BASELINE_COMPARED=true');
              console.log(
                `ARTEMISKIT_REGRESSION=${baselineResult.hasRegression ? 'true' : 'false'}`
              );
              if (baselineResult.delta) {
                console.log(
                  `ARTEMISKIT_DELTA_SUCCESS_RATE=${(baselineResult.delta.successRate * 100).toFixed(2)}`
                );
              }
            }

            // Also print run IDs for reference
            for (const run of ciSummary.runs) {
              if (run.runId) {
                console.log(
                  `ARTEMISKIT_RUN_ID_${run.scenario.toUpperCase().replace(/[^A-Z0-9]/g, '_')}=${run.runId}`
                );
              }
            }
          }
        } else {
          // Display aggregate summary for multiple scenarios (non-CI mode)
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
            const totalDuration = results.reduce(
              (sum, r) => sum + (r.manifest.duration_ms || 0),
              0
            );

            console.log(
              `Scenarios:  ${chalk.green(`${passedScenarios} passed`)}  ${failedScenarios > 0 ? chalk.red(`${failedScenarios} failed`) : ''}  ${chalk.dim(`(${totalScenarios} total)`)}`
            );
            console.log(
              `Test Cases: ${chalk.green(`${passedCases} passed`)}  ${failedCases > 0 ? chalk.red(`${failedCases} failed`) : ''}  ${chalk.dim(`(${totalCases} total)`)}`
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

          // Show baseline comparison result in non-CI mode
          if (baselineResult && !baselineResult.hasRegression) {
            console.log(`${icons.passed} ${chalk.green('No regression detected')}`);
          }
        }

        // Exit with error if any scenarios failed or regression detected
        const hasFailures = results.some((r) => !r.success);
        const hasRegression = baselineResult?.hasRegression || false;

        if (hasFailures || hasRegression) {
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
