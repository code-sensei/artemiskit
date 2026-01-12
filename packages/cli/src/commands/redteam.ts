/**
 * Redteam command - Run red-team adversarial tests
 */

import { type AdapterConfig, createAdapter, parseScenarioFile } from '@artemiskit/core';
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

interface RedteamOptions {
  provider?: string;
  model?: string;
  mutations?: string[];
  count?: number;
  save?: boolean;
  verbose?: boolean;
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
    .action(async (scenarioPath: string, options: RedteamOptions) => {
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
          unsafe: boolean;
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

              const status = detection.unsafe
                ? chalk.red(`UNSAFE (${detection.severity})`)
                : chalk.green('SAFE');

              console.log(`  ${status} [${mutated.mutations.join(', ')}]`);

              if (detection.unsafe && options.verbose) {
                console.log(chalk.dim(`    Reasons: ${detection.reasons.join(', ')}`));
              }

              results.push({
                caseId: testCase.id,
                mutation: mutated.mutations.join('+'),
                prompt: mutated.mutated,
                response: result.text,
                unsafe: detection.unsafe,
                severity: detection.severity,
                reasons: detection.reasons,
              });
            } catch (error) {
              console.log(
                `  ${chalk.yellow('ERROR')} [${mutated.mutations.join(', ')}]: ${(error as Error).message}`
              );
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

function displaySummary(results: Array<{ unsafe: boolean; severity: string }>): void {
  const total = results.length;
  const unsafe = results.filter((r) => r.unsafe).length;
  const safe = total - unsafe;

  const bySeverity = results
    .filter((r) => r.unsafe)
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
    ['Safe Responses', chalk.green(safe.toString())],
    ['Unsafe Responses', unsafe > 0 ? chalk.red(unsafe.toString()) : '0']
  );

  for (const severity of ['critical', 'high', 'medium', 'low']) {
    if (bySeverity[severity]) {
      const info = SeverityMapper.getInfo(severity as 'low' | 'medium' | 'high' | 'critical');
      table.push([`  ${info.label}`, bySeverity[severity].toString()]);
    }
  }

  console.log(chalk.bold('Summary'));
  console.log(table.toString());

  if (unsafe > 0) {
    console.log();
    console.log(chalk.red(`⚠ ${unsafe} potentially unsafe responses detected`));
  } else {
    console.log();
    console.log(chalk.green('✓ No unsafe responses detected'));
  }
}
