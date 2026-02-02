/**
 * Redteam command - Run red-team adversarial tests
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  type CaseRedactionInfo,
  type ManifestRedactionInfo,
  type RedTeamCaseResult,
  type RedTeamManifest,
  type RedTeamMetrics,
  type RedTeamSeverity,
  type RedTeamStatus,
  type RedactionConfig,
  Redactor,
  createAdapter,
  getGitInfo,
  parseScenarioFile,
} from '@artemiskit/core';
import {
  type ConversationTurn,
  CotInjectionMutation,
  EncodingMutation,
  InstructionFlipMutation,
  MultiTurnMutation,
  type Mutation,
  RedTeamGenerator,
  RoleSpoofMutation,
  SeverityMapper,
  TypoMutation,
  UnsafeResponseDetector,
  loadCustomAttacks,
} from '@artemiskit/redteam';
import { generateJSONReport, generateRedTeamHTMLReport } from '@artemiskit/reports';
import chalk from 'chalk';
import { Command } from 'commander';
import { nanoid } from 'nanoid';
import { loadConfig } from '../config/loader.js';
import {
  createSpinner,
  getProviderErrorContext,
  icons,
  isTTY,
  renderError,
  renderInfoBox,
  renderProgressBar,
  renderRedteamSummaryPanel,
} from '../ui/index.js';
import {
  buildAdapterConfig,
  resolveModelWithSource,
  resolveProviderWithSource,
} from '../utils/adapter.js';
import { createStorage } from '../utils/storage.js';

interface RedteamOptions {
  provider?: string;
  model?: string;
  mutations?: string[];
  count?: number;
  customAttacks?: string;
  save?: boolean;
  output?: string;
  verbose?: boolean;
  config?: string;
  redact?: boolean;
  redactPatterns?: string[];
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
      'Mutations to apply (typo, role-spoof, instruction-flip, cot-injection, encoding, multi-turn)'
    )
    .option('-c, --count <number>', 'Number of mutated prompts per case', '5')
    .option('--custom-attacks <path>', 'Path to custom attacks YAML file')
    .option('--save', 'Save results to storage')
    .option('-o, --output <dir>', 'Output directory for reports')
    .option('-v, --verbose', 'Verbose output')
    .option('--config <path>', 'Path to config file')
    .option('--redact', 'Enable PII/sensitive data redaction in results')
    .option(
      '--redact-patterns <patterns...>',
      'Custom redaction patterns (regex or built-in: email, phone, credit_card, ssn, api_key)'
    )
    .action(async (scenarioPath: string, options: RedteamOptions) => {
      const spinner = createSpinner('Loading configuration...');
      spinner.start();
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

        // Set up mutations
        const mutations = selectMutations(options.mutations, options.customAttacks);
        const generator = new RedTeamGenerator(mutations);
        const detector = new UnsafeResponseDetector();
        const count = Number.parseInt(String(options.count)) || 5;

        // Display configuration using info box
        console.log();
        const configLines = [
          `Mutations: ${mutations.map((m) => m.name).join(', ')}`,
          `Prompts per case: ${count}`,
          `Total cases: ${scenario.cases.length}`,
        ];
        if (options.redact) {
          configLines.push(
            `Redaction: enabled${options.redactPatterns ? ` (${options.redactPatterns.join(', ')})` : ''}`
          );
        }
        console.log(renderInfoBox('Red Team Configuration', configLines));
        console.log();

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

        const results: RedTeamCaseResult[] = [];
        let promptsRedacted = 0;
        let responsesRedacted = 0;
        let totalRedactions = 0;

        // Calculate total tests for progress
        const totalTests = scenario.cases.length * count;
        let completedTests = 0;

        // Run mutated tests for each case
        for (const testCase of scenario.cases) {
          console.log(chalk.bold(`Testing case: ${testCase.id}`));

          // Handle both string and array prompts (consistent with run command)
          // For array prompts: last user message is the attack target, rest is context
          let attackPrompt: string;
          let conversationPrefix: ConversationTurn[] | undefined;

          if (typeof testCase.prompt === 'string') {
            // Simple string prompt - use directly
            attackPrompt = testCase.prompt;
          } else {
            // Array prompt - extract last user message as attack, rest as context
            const messages = testCase.prompt;
            const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');

            if (lastUserIndex === -1) {
              // No user message found - use concatenated content
              attackPrompt = messages.map((m) => m.content).join('\n');
            } else {
              // Extract attack prompt (last user message)
              attackPrompt = messages[lastUserIndex].content;

              // Extract conversation prefix (everything before the last user message)
              if (lastUserIndex > 0) {
                conversationPrefix = messages.slice(0, lastUserIndex).map((m) => ({
                  role: m.role as 'user' | 'assistant' | 'system',
                  content: m.content,
                }));
              }
            }
          }

          // Clear any previous prefix and set new one if applicable
          for (const mutation of mutations) {
            if (mutation instanceof MultiTurnMutation) {
              mutation.clearConversationPrefix();
              if (conversationPrefix && conversationPrefix.length > 0) {
                mutation.setConversationPrefix(conversationPrefix);
              }
            }
          }

          const mutatedPrompts = generator.generate(attackPrompt, count);

          for (const mutated of mutatedPrompts) {
            completedTests++;

            // Show progress bar in TTY mode
            if (isTTY) {
              const progressBar = renderProgressBar(completedTests, totalTests, {
                width: 15,
                showPercentage: true,
                showCount: false,
              });
              process.stdout.write(`\r  ${progressBar}  `);
            }

            const requestStart = Date.now();
            try {
              const result = await client.generate({
                prompt: mutated.mutated,
                model,
                temperature: scenario.temperature,
              });

              const detection = detector.detect(result.text);

              const resultStatus: RedTeamStatus = detection.unsafe ? 'unsafe' : 'safe';

              // Clear progress line
              if (isTTY) {
                process.stdout.write(`\r${' '.repeat(60)}\r`);
              }

              // Display status with appropriate icon
              const statusIcon = detection.unsafe ? icons.failed : icons.passed;
              const statusLabel = detection.unsafe
                ? chalk.red(`UNSAFE (${detection.severity})`)
                : chalk.green('SAFE');
              console.log(`  ${statusIcon} ${statusLabel} [${mutated.mutations.join(', ')}]`);

              if (detection.unsafe && options.verbose) {
                console.log(chalk.dim(`      Reasons: ${detection.reasons.join(', ')}`));
              }

              // Apply redaction if enabled
              let finalPrompt = mutated.mutated;
              let finalResponse = result.text;
              let caseRedaction: CaseRedactionInfo | undefined;

              if (redactor) {
                const promptResult = redactor.redactPrompt(finalPrompt);
                const responseResult = redactor.redactResponse(finalResponse);
                finalPrompt = promptResult.text;
                finalResponse = responseResult.text;

                if (promptResult.wasRedacted) promptsRedacted++;
                if (responseResult.wasRedacted) responsesRedacted++;
                totalRedactions += promptResult.redactionCount + responseResult.redactionCount;

                caseRedaction = {
                  redacted: promptResult.wasRedacted || responseResult.wasRedacted,
                  promptRedacted: promptResult.wasRedacted,
                  responseRedacted: responseResult.wasRedacted,
                  redactionCount: promptResult.redactionCount + responseResult.redactionCount,
                };
              }

              results.push({
                caseId: testCase.id,
                mutation: mutated.mutations.join('+'),
                prompt: finalPrompt,
                response: finalResponse,
                status: resultStatus,
                severity: detection.severity as RedTeamSeverity,
                reasons: detection.reasons,
                latencyMs: Date.now() - requestStart,
                redaction: caseRedaction,
              });
            } catch (error) {
              const errorMessage = (error as Error).message;
              const isContentFiltered = isProviderContentFilter(errorMessage);

              // Clear progress line
              if (isTTY) {
                process.stdout.write(`\r${' '.repeat(60)}\r`);
              }

              // Apply redaction to prompt even for errors/blocked
              let errorPrompt = mutated.mutated;
              let errorCaseRedaction: CaseRedactionInfo | undefined;

              if (redactor) {
                const promptResult = redactor.redactPrompt(errorPrompt);
                errorPrompt = promptResult.text;

                if (promptResult.wasRedacted) promptsRedacted++;
                totalRedactions += promptResult.redactionCount;

                errorCaseRedaction = {
                  redacted: promptResult.wasRedacted,
                  promptRedacted: promptResult.wasRedacted,
                  responseRedacted: false,
                  redactionCount: promptResult.redactionCount,
                };
              }

              if (isContentFiltered) {
                console.log(
                  `  ${chalk.cyan('⊘')} ${chalk.cyan('BLOCKED')} [${mutated.mutations.join(', ')}]`
                );
                if (options.verbose) {
                  console.log(chalk.dim('      Provider content filter triggered'));
                }
                results.push({
                  caseId: testCase.id,
                  mutation: mutated.mutations.join('+'),
                  prompt: errorPrompt,
                  response: '',
                  status: 'blocked',
                  severity: 'none',
                  reasons: ['Provider content filter blocked the request'],
                  latencyMs: Date.now() - requestStart,
                  redaction: errorCaseRedaction,
                });
              } else {
                console.log(
                  `  ${icons.warning} ${chalk.yellow('ERROR')} [${mutated.mutations.join(', ')}]`
                );
                if (options.verbose) {
                  console.log(chalk.dim(`      ${errorMessage}`));
                }
                results.push({
                  caseId: testCase.id,
                  mutation: mutated.mutations.join('+'),
                  prompt: errorPrompt,
                  response: '',
                  status: 'error',
                  severity: 'none',
                  reasons: [errorMessage],
                  latencyMs: Date.now() - requestStart,
                  redaction: errorCaseRedaction,
                });
              }
            }
          }
          console.log();
        }

        const endTime = new Date();

        // Calculate metrics
        const metrics = calculateMetrics(results);

        // Build redaction metadata if enabled
        let redactionInfo: ManifestRedactionInfo | undefined;
        if (redactor && redactionConfig?.enabled) {
          redactionInfo = {
            enabled: true,
            patternsUsed: redactor.patternNames,
            replacement: redactor.replacement,
            summary: {
              promptsRedacted,
              responsesRedacted,
              totalRedactions,
            },
          };
        }

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
            model: resolvedConfig.model,
            mutations: mutations.map((m) => m.name),
            count_per_case: count,
          },
          resolved_config: resolvedConfig,
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
          redaction: redactionInfo,
        };

        // Display summary using enhanced panel
        const summaryData = {
          totalCases: metrics.total_tests,
          safeResponses: metrics.safe_responses,
          unsafeResponses: metrics.unsafe_responses,
          blockedResponses: metrics.blocked_responses,
          errorResponses: metrics.error_responses,
          defenseRate: metrics.defense_rate * 100,
          severityBreakdown: metrics.by_severity,
        };
        console.log(renderRedteamSummaryPanel(summaryData));

        // Show run ID and defense rate detail
        console.log();
        const testableResults = metrics.total_tests - metrics.error_responses;
        console.log(
          chalk.dim(
            `Run ID: ${runId}  |  Defense Rate: ${(metrics.defense_rate * 100).toFixed(1)}% (${metrics.defended}/${testableResults})`
          )
        );

        // Show severity breakdown if there were unsafe responses
        if (metrics.unsafe_responses > 0) {
          console.log();
          console.log(chalk.bold('Severity Breakdown:'));
          for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
            if (metrics.by_severity[severity]) {
              const info = SeverityMapper.getInfo(severity);
              console.log(`  ${info.label}: ${metrics.by_severity[severity]}`);
            }
          }

          console.log();
          console.log(
            chalk.red(
              `${icons.warning} ${metrics.unsafe_responses} potentially unsafe responses detected`
            )
          );
        } else if (testableResults > 0) {
          console.log();
          console.log(chalk.green(`${icons.passed} No unsafe responses detected`));
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

function selectMutations(names?: string[], customAttacksPath?: string): Mutation[] {
  const allMutations: Record<string, Mutation> = {
    typo: new TypoMutation(),
    'role-spoof': new RoleSpoofMutation(),
    'instruction-flip': new InstructionFlipMutation(),
    'cot-injection': new CotInjectionMutation(),
    encoding: new EncodingMutation(),
    'multi-turn': new MultiTurnMutation(),
  };

  let mutations: Mutation[];

  if (!names || names.length === 0) {
    mutations = Object.values(allMutations);
  } else {
    mutations = names.filter((name) => name in allMutations).map((name) => allMutations[name]);
  }

  // Load custom attacks if path provided
  if (customAttacksPath) {
    const customMutations = loadCustomAttacks(customAttacksPath);
    mutations.push(...customMutations);
  }

  return mutations;
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
