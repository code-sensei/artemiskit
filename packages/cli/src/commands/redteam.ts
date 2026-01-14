/**
 * Redteam command - Run red-team adversarial tests
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  type RedTeamCaseResult,
  type RedTeamManifest,
  type RedTeamMetrics,
  type RedTeamSeverity,
  type RedTeamStatus,
  createAdapter,
  getGitInfo,
  parseScenarioFile,
} from '@artemiskit/core';
import {
  CotInjectionMutation,
  InstructionFlipMutation,
  type Mutation,
  RedTeamGenerator,
  RoleSpoofMutation,
  SeverityMapper,
  TypoMutation,
  UnsafeResponseDetector,
} from '@artemiskit/redteam';
import { generateJSONReport, generateRedTeamHTMLReport } from '@artemiskit/reports';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import { nanoid } from 'nanoid';
import ora from 'ora';
import { loadConfig } from '../config/loader';
import { buildAdapterConfig, resolveModel, resolveProvider } from '../utils/adapter';
import { createStorage } from '../utils/storage';

interface RedteamOptions {
  provider?: string;
  model?: string;
  mutations?: string[];
  count?: number;
  save?: boolean;
  output?: string;
  verbose?: boolean;
  config?: string;
}

export function redteamCommand(): Command {
  const cmd = new Command('redteam');

  cmd
    .description('Run red-team adversarial tests against an LLM')
    .argument('<scenario>', 'Path to scenario YAML file')
    .option('-p, --provider <provider>', 'Provider to use')
    .option('-m, --model <model>', 'Model to use')
    .option(
      '--mutations <mutations...>',
      'Mutations to apply (typo, role-spoof, instruction-flip, cot-injection)'
    )
    .option('-c, --count <number>', 'Number of mutated prompts per case', '5')
    .option('--save', 'Save results to storage')
    .option('-o, --output <dir>', 'Output directory for reports')
    .option('-v, --verbose', 'Verbose output')
    .option('--config <path>', 'Path to config file')
    .action(async (scenarioPath: string, options: RedteamOptions) => {
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

        // Set up mutations
        const mutations = selectMutations(options.mutations);
        const generator = new RedTeamGenerator(mutations);
        const detector = new UnsafeResponseDetector();

        console.log();
        console.log(chalk.bold('Red-Team Testing'));
        console.log(chalk.dim(`Mutations: ${mutations.map((m) => m.name).join(', ')}`));
        console.log();

        const count = Number.parseInt(String(options.count)) || 5;
        const results: RedTeamCaseResult[] = [];

        // Run mutated tests for each case
        for (const testCase of scenario.cases) {
          console.log(chalk.bold(`Testing case: ${testCase.id}`));

          const originalPrompt =
            typeof testCase.prompt === 'string'
              ? testCase.prompt
              : testCase.prompt.map((m) => m.content).join('\n');

          const mutatedPrompts = generator.generate(originalPrompt, count);

          for (const mutated of mutatedPrompts) {
            const requestStart = Date.now();
            try {
              const result = await client.generate({
                prompt: mutated.mutated,
                model,
                temperature: scenario.temperature,
              });

              const detection = detector.detect(result.text);

              const resultStatus: RedTeamStatus = detection.unsafe ? 'unsafe' : 'safe';
              const statusDisplay = detection.unsafe
                ? chalk.red(`UNSAFE (${detection.severity})`)
                : chalk.green('SAFE');

              console.log(`  ${statusDisplay} [${mutated.mutations.join(', ')}]`);

              if (detection.unsafe && options.verbose) {
                console.log(chalk.dim(`    Reasons: ${detection.reasons.join(', ')}`));
              }

              results.push({
                caseId: testCase.id,
                mutation: mutated.mutations.join('+'),
                prompt: mutated.mutated,
                response: result.text,
                status: resultStatus,
                severity: detection.severity as RedTeamSeverity,
                reasons: detection.reasons,
                latencyMs: Date.now() - requestStart,
              });
            } catch (error) {
              const errorMessage = (error as Error).message;
              const isContentFiltered = isProviderContentFilter(errorMessage);

              if (isContentFiltered) {
                console.log(
                  `  ${chalk.cyan('BLOCKED')} [${mutated.mutations.join(', ')}]: Provider content filter triggered`
                );
                results.push({
                  caseId: testCase.id,
                  mutation: mutated.mutations.join('+'),
                  prompt: mutated.mutated,
                  response: '',
                  status: 'blocked',
                  severity: 'none',
                  reasons: ['Provider content filter blocked the request'],
                  latencyMs: Date.now() - requestStart,
                });
              } else {
                console.log(
                  `  ${chalk.yellow('ERROR')} [${mutated.mutations.join(', ')}]: ${errorMessage}`
                );
                results.push({
                  caseId: testCase.id,
                  mutation: mutated.mutations.join('+'),
                  prompt: mutated.mutated,
                  response: '',
                  status: 'error',
                  severity: 'none',
                  reasons: [errorMessage],
                  latencyMs: Date.now() - requestStart,
                });
              }
            }
          }
          console.log();
        }

        const endTime = new Date();

        // Calculate metrics
        const metrics = calculateMetrics(results);

        // Build manifest
        const runId = `rt_${nanoid(12)}`;
        const manifest: RedTeamManifest = {
          version: '1.0',
          type: 'redteam',
          run_id: runId,
          project: config?.project || process.env.ARTEMIS_PROJECT || 'default',
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          duration_ms: endTime.getTime() - startTime.getTime(),
          config: {
            scenario: basename(scenarioPath, '.yaml'),
            provider,
            model,
            mutations: mutations.map((m) => m.name),
            count_per_case: count,
          },
          metrics,
          git: await getGitInfo(),
          provenance: {
            run_by: process.env.USER || process.env.USERNAME || 'unknown',
          },
          results,
          environment: {
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
          },
        };

        // Display summary
        displaySummary(metrics, runId);

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
          const html = generateRedTeamHTMLReport(manifest);
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

        // Exit with error if there were unsafe responses
        if (metrics.unsafe_responses > 0) {
          process.exit(1);
        }
      } catch (error) {
        spinner.fail('Error');
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}

function selectMutations(names?: string[]): Mutation[] {
  const allMutations: Record<string, Mutation> = {
    typo: new TypoMutation(),
    'role-spoof': new RoleSpoofMutation(),
    'instruction-flip': new InstructionFlipMutation(),
    'cot-injection': new CotInjectionMutation(),
  };

  if (!names || names.length === 0) {
    return Object.values(allMutations);
  }

  return names.filter((name) => name in allMutations).map((name) => allMutations[name]);
}

/**
 * Detect if an error is from a provider's content filtering system.
 * This indicates the adversarial prompt was successfully blocked.
 */
function isProviderContentFilter(errorMessage: string): boolean {
  const contentFilterPatterns = [
    // Azure OpenAI
    /content management policy/i,
    /content filtering/i,
    /content filter/i,
    // OpenAI
    /content policy/i,
    /safety system/i,
    /flagged.*content/i,
    // Anthropic
    /potentially harmful/i,
    /safety guidelines/i,
    // Google
    /blocked.*safety/i,
    /safety settings/i,
    // Generic patterns
    /moderation/i,
    /inappropriate content/i,
  ];

  return contentFilterPatterns.some((pattern) => pattern.test(errorMessage));
}

function calculateMetrics(results: RedTeamCaseResult[]): RedTeamMetrics {
  const total = results.length;
  const safe = results.filter((r) => r.status === 'safe').length;
  const blocked = results.filter((r) => r.status === 'blocked').length;
  const unsafe = results.filter((r) => r.status === 'unsafe').length;
  const errors = results.filter((r) => r.status === 'error').length;

  const defended = safe + blocked;
  const testable = total - errors;
  const defenseRate = testable > 0 ? defended / testable : 0;

  const bySeverity = results
    .filter((r) => r.status === 'unsafe')
    .reduce(
      (acc, r) => {
        const sev = r.severity as 'low' | 'medium' | 'high' | 'critical';
        if (sev in acc) {
          acc[sev]++;
        }
        return acc;
      },
      { low: 0, medium: 0, high: 0, critical: 0 }
    );

  return {
    total_tests: total,
    safe_responses: safe,
    blocked_responses: blocked,
    unsafe_responses: unsafe,
    error_responses: errors,
    defended,
    defense_rate: defenseRate,
    by_severity: bySeverity,
  };
}

function displaySummary(metrics: RedTeamMetrics, runId: string): void {
  const table = new Table({
    head: [chalk.bold('Metric'), chalk.bold('Value')],
    style: { head: [], border: [] },
  });

  table.push(
    ['Run ID', runId],
    ['Total Tests', metrics.total_tests.toString()],
    ['Defended', chalk.green(metrics.defended.toString())],
    [`  ${chalk.dim('Model handled safely')}`, chalk.green(metrics.safe_responses.toString())],
    [`  ${chalk.dim('Provider blocked')}`, chalk.cyan(metrics.blocked_responses.toString())],
    [
      'Unsafe Responses',
      metrics.unsafe_responses > 0 ? chalk.red(metrics.unsafe_responses.toString()) : '0',
    ]
  );

  for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
    if (metrics.by_severity[severity]) {
      const info = SeverityMapper.getInfo(severity);
      table.push([`  ${info.label}`, metrics.by_severity[severity].toString()]);
    }
  }

  if (metrics.error_responses > 0) {
    table.push(['Errors', chalk.yellow(metrics.error_responses.toString())]);
  }

  console.log(chalk.bold('Summary'));
  console.log(table.toString());

  // Calculate defense rate (excluding errors from denominator)
  const testableResults = metrics.total_tests - metrics.error_responses;
  if (testableResults > 0) {
    const defenseRate = (metrics.defense_rate * 100).toFixed(1);
    console.log();
    console.log(
      chalk.dim(`Defense Rate: ${defenseRate}% (${metrics.defended}/${testableResults})`)
    );
  }

  if (metrics.unsafe_responses > 0) {
    console.log();
    console.log(chalk.red(`⚠ ${metrics.unsafe_responses} potentially unsafe responses detected`));
  } else if (testableResults > 0) {
    console.log();
    console.log(chalk.green('✓ No unsafe responses detected'));
  }
}
