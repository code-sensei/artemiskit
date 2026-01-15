/**
 * Init command - Initialize ArtemisKit in a project
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';

const DEFAULT_CONFIG = `# ArtemisKit Configuration
project: my-project

# Default provider settings
provider: openai
model: gpt-4

# Provider configurations
providers:
  openai:
    apiKey: \${OPENAI_API_KEY}
    defaultModel: gpt-4

  azure-openai:
    apiKey: \${AZURE_OPENAI_API_KEY}
    resourceName: \${AZURE_OPENAI_RESOURCE}
    deploymentName: \${AZURE_OPENAI_DEPLOYMENT}
    apiVersion: "2024-02-15-preview"

# Storage configuration
storage:
  type: local
  basePath: ./artemis-runs

# Scenarios directory
scenariosDir: ./scenarios

# Output settings
output:
  format: json
  dir: ./artemis-output
`;

const DEFAULT_SCENARIO = `name: Example Scenario
description: Basic example scenario for testing
version: "1.0"
provider: openai
model: gpt-4
temperature: 0

cases:
  - id: greeting
    name: Simple Greeting
    prompt: "Say hello in exactly 3 words."
    expected:
      type: regex
      pattern: "^\\\\w+\\\\s+\\\\w+\\\\s+\\\\w+$"
    tags:
      - greeting
      - basic

  - id: math
    name: Basic Math
    prompt: "What is 2 + 2? Reply with just the number."
    expected:
      type: exact
      value: "4"
    tags:
      - math
      - basic
`;

export function initCommand(): Command {
  const cmd = new Command('init');

  cmd
    .description('Initialize ArtemisKit in the current directory')
    .option('-f, --force', 'Overwrite existing configuration')
    .action(async () => {
      try {
        const cwd = process.cwd();

        // Create directories
        await mkdir(join(cwd, 'scenarios'), { recursive: true });
        await mkdir(join(cwd, 'artemis-runs'), { recursive: true });
        await mkdir(join(cwd, 'artemis-output'), { recursive: true });

        // Write config file
        const configPath = join(cwd, 'artemis.config.yaml');
        await writeFile(configPath, DEFAULT_CONFIG);
        console.log(chalk.green('✓'), 'Created artemis.config.yaml');

        // Write example scenario
        const scenarioPath = join(cwd, 'scenarios', 'example.yaml');
        await writeFile(scenarioPath, DEFAULT_SCENARIO);
        console.log(chalk.green('✓'), 'Created scenarios/example.yaml');

        console.log();
        console.log(chalk.bold('ArtemisKit initialized successfully!'));
        console.log();
        console.log('Next steps:');
        console.log('  1. Configure your API keys in .env or environment variables');
        console.log('  2. Edit scenarios/example.yaml to add your test cases');
        console.log('  3. Run tests with: artemiskit run scenarios/example.yaml');
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
