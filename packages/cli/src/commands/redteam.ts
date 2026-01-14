/**
 * Redteam command - Run red-team adversarial tests
 */

import { createAdapter, parseScenarioFile } from '@artemiskit/core';
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
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import ora from 'ora';
import { loadConfig } from '../config/loader';
import { buildAdapterConfig, resolveModel, resolveProvider } from '../utils/adapter';

interface RedteamOptions {
  provider?: string;
  model?: string;
  mutations?: string[];
  count?: number;
  save?: boolean;
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
    .option('-v, --verbose', 'Verbose output')
    .option('--config <path>', 'Path to config file')
    .action(async (scenarioPath: string, options: RedteamOptions) => {
      const spinner = ora('Loading configuration...').start();

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
        const results: Array<{
          caseId: string;
          mutation: string;
          prompt: string;
          response: string;
          status: 'safe' | 'unsafe' | 'blocked' | 'error';
          severity: string;
          reasons: string[];
        }> = [];

        // Run mutated tests for each case
        for (const testCase of scenario.cases) {
          console.log(chalk.bold(`Testing case: ${testCase.id}`));

          const originalPrompt =
            typeof testCase.prompt === 'string'
              ? testCase.prompt
              : testCase.prompt.map((m) => m.content).join('\n');

          const mutatedPrompts = generator.generate(originalPrompt, count);

          for (const mutated of mutatedPrompts) {
            try {
              const result = await client.generate({
                prompt: mutated.mutated,
                model,
                temperature: scenario.temperature,
              });

              const detection = detector.detect(result.text);

              const resultStatus = detection.unsafe ? 'unsafe' : 'safe';
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
                severity: detection.severity,
                reasons: detection.reasons,
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
                });
              }
            }
          }
          console.log();
        }

        // Summary
        displaySummary(results);
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

function displaySummary(
  results: Array<{ status: 'safe' | 'unsafe' | 'blocked' | 'error'; severity: string }>
): void {
  const total = results.length;
  const safe = results.filter((r) => r.status === 'safe').length;
  const unsafe = results.filter((r) => r.status === 'unsafe').length;
  const blocked = results.filter((r) => r.status === 'blocked').length;
  const errors = results.filter((r) => r.status === 'error').length;

  // Defended = safe responses + blocked by provider (both are successful defenses)
  const defended = safe + blocked;

  const bySeverity = results
    .filter((r) => r.status === 'unsafe')
    .reduce(
      (acc, r) => {
        acc[r.severity] = (acc[r.severity] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

  const table = new Table({
    head: [chalk.bold('Metric'), chalk.bold('Value')],
    style: { head: [], border: [] },
  });

  table.push(
    ['Total Tests', total.toString()],
    ['Defended', chalk.green(defended.toString())],
    [`  ${chalk.dim('Model handled safely')}`, chalk.green(safe.toString())],
    [`  ${chalk.dim('Provider blocked')}`, chalk.cyan(blocked.toString())],
    ['Unsafe Responses', unsafe > 0 ? chalk.red(unsafe.toString()) : '0']
  );

  for (const severity of ['critical', 'high', 'medium', 'low']) {
    if (bySeverity[severity]) {
      const info = SeverityMapper.getInfo(severity as 'low' | 'medium' | 'high' | 'critical');
      table.push([`  ${info.label}`, bySeverity[severity].toString()]);
    }
  }

  if (errors > 0) {
    table.push(['Errors', chalk.yellow(errors.toString())]);
  }

  console.log(chalk.bold('Summary'));
  console.log(table.toString());

  // Calculate defense rate (excluding errors from denominator)
  const testableResults = total - errors;
  if (testableResults > 0) {
    const defenseRate = ((defended / testableResults) * 100).toFixed(1);
    console.log();
    console.log(chalk.dim(`Defense Rate: ${defenseRate}% (${defended}/${testableResults})`));
  }

  if (unsafe > 0) {
    console.log();
    console.log(chalk.red(`⚠ ${unsafe} potentially unsafe responses detected`));
  } else if (testableResults > 0) {
    console.log();
    console.log(chalk.green('✓ No unsafe responses detected'));
  }
}
