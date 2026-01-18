/**
 * Init command - Initialize ArtemisKit in a project
 */

import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { createSpinner, icons } from '../ui/index.js';
import { checkForUpdateAndNotify, getCurrentVersion } from '../utils/update-checker.js';

const DEFAULT_CONFIG = `# ArtemisKit Configuration
project: my-project

# Default provider settings
provider: openai
model: gpt-4o-mini

# Provider configurations
providers:
  openai:
    apiKey: \${OPENAI_API_KEY}
    defaultModel: gpt-4o-mini

  azure-openai:
    apiKey: \${AZURE_OPENAI_API_KEY}
    resourceName: \${AZURE_OPENAI_RESOURCE}
    deploymentName: \${AZURE_OPENAI_DEPLOYMENT}
    apiVersion: "2024-02-15-preview"

  anthropic:
    apiKey: \${ANTHROPIC_API_KEY}
    defaultModel: claude-sonnet-4-20250514

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
model: gpt-4o-mini
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

const ENV_KEYS = [
  '# ArtemisKit Environment Variables',
  'OPENAI_API_KEY=',
  'AZURE_OPENAI_API_KEY=',
  'AZURE_OPENAI_RESOURCE=',
  'AZURE_OPENAI_DEPLOYMENT=',
  'AZURE_OPENAI_API_VERSION=',
  'ANTHROPIC_API_KEY=',
];

function renderWelcomeBanner(): string {
  // Brand color for "KIT" portion: #fb923c (orange)
  const brandColor = chalk.hex('#fb923c');
  const version = getCurrentVersion();

  // Randomly color each border character white or brand color
  const colorBorderChar = (char: string): string => {
    return Math.random() > 0.5 ? chalk.white(char) : brandColor(char);
  };

  const colorBorder = (str: string): string => {
    return str.split('').map(colorBorderChar).join('');
  };

  // All lines are exactly 52 chars inside the borders for perfect alignment
  const topBorder = '╭' + '─'.repeat(52) + '╮';
  const bottomBorder = '╰' + '─'.repeat(52) + '╯';
  const sideBorderLeft = '│';
  const sideBorderRight = '│';
  const emptyContent = ' '.repeat(52);

  // Version line: "v0.1.7" centered in brand color
  const versionText = `v${version}`;
  const versionPadding = Math.floor((52 - versionText.length) / 2);
  const versionLine =
    ' '.repeat(versionPadding) +
    brandColor(versionText) +
    ' '.repeat(52 - versionPadding - versionText.length);

  // Tagline centered
  const tagline = 'Open-source testing toolkit for LLM applications';
  const taglinePadding = Math.floor((52 - tagline.length) / 2);
  const taglineLine =
    ' '.repeat(taglinePadding) +
    chalk.gray(tagline) +
    ' '.repeat(52 - taglinePadding - tagline.length);

  const lines = [
    '',
    '  ' + colorBorder(topBorder),
    '  ' + colorBorderChar(sideBorderLeft) + emptyContent + colorBorderChar(sideBorderRight),
    '  ' +
      colorBorderChar(sideBorderLeft) +
      '        ' +
      chalk.bold.white('▄▀█ █▀█ ▀█▀ █▀▀ █▀▄▀█ █ █▀ ') +
      brandColor.bold('█▄▀ █ ▀█▀') +
      '        ' +
      colorBorderChar(sideBorderRight),
    '  ' +
      colorBorderChar(sideBorderLeft) +
      '        ' +
      chalk.bold.white('█▀█ █▀▄  █  ██▄ █ ▀ █ █ ▄█ ') +
      brandColor.bold('█ █ █  █ ') +
      '        ' +
      colorBorderChar(sideBorderRight),
    '  ' + colorBorderChar(sideBorderLeft) + emptyContent + colorBorderChar(sideBorderRight),
    '  ' + colorBorderChar(sideBorderLeft) + versionLine + colorBorderChar(sideBorderRight),
    '  ' + colorBorderChar(sideBorderLeft) + emptyContent + colorBorderChar(sideBorderRight),
    '  ' + colorBorderChar(sideBorderLeft) + taglineLine + colorBorderChar(sideBorderRight),
    '  ' + colorBorderChar(sideBorderLeft) + emptyContent + colorBorderChar(sideBorderRight),
    '  ' + colorBorder(bottomBorder),
    '',
  ];
  return lines.join('\n');
}

function renderSuccessPanel(): string {
  const lines = [
    '',
    chalk.green('  ╭─────────────────────────────────────────────────────────╮'),
    chalk.green('  │') +
      chalk.bold.green('  ✓ ArtemisKit initialized successfully!                 ') +
      chalk.green('│'),
    chalk.green('  ├─────────────────────────────────────────────────────────┤'),
    chalk.green('  │                                                         │'),
    chalk.green('  │') +
      chalk.white('  Next steps:                                            ') +
      chalk.green('│'),
    chalk.green('  │                                                         │'),
    chalk.green('  │') +
      chalk.white('  1. Set your API key:                                   ') +
      chalk.green('│'),
    chalk.green('  │') +
      chalk.cyan('     export OPENAI_API_KEY="sk-..."                      ') +
      chalk.green('│'),
    chalk.green('  │                                                         │'),
    chalk.green('  │') +
      chalk.white('  2. Run your first test:                                ') +
      chalk.green('│'),
    chalk.green('  │') +
      chalk.cyan('     artemiskit run scenarios/example.yaml               ') +
      chalk.green('│'),
    chalk.green('  │                                                         │'),
    chalk.green('  │') +
      chalk.white('  3. View the docs:                                      ') +
      chalk.green('│'),
    chalk.green('  │') +
      chalk.cyan('     https://artemiskit.vercel.app/docs                  ') +
      chalk.green('│'),
    chalk.green('  │                                                         │'),
    chalk.green('  ╰─────────────────────────────────────────────────────────╯'),
    '',
  ];
  return lines.join('\n');
}

async function appendEnvKeys(cwd: string): Promise<{ added: string[]; skipped: string[] }> {
  const envPath = join(cwd, '.env');
  const added: string[] = [];
  const skipped: string[] = [];

  let existingContent = '';
  if (existsSync(envPath)) {
    existingContent = await readFile(envPath, 'utf-8');
  }

  const linesToAdd: string[] = [];

  for (const key of ENV_KEYS) {
    // Skip comments
    if (key.startsWith('#')) {
      // Only add comment if we're adding new keys and it's not already there
      if (!existingContent.includes(key)) {
        linesToAdd.push(key);
      }
      continue;
    }

    const keyName = key.split('=')[0];
    // Check if key already exists (with or without value)
    const keyPattern = new RegExp(`^${keyName}=`, 'm');
    if (keyPattern.test(existingContent)) {
      skipped.push(keyName);
    } else {
      linesToAdd.push(key);
      added.push(keyName);
    }
  }

  if (linesToAdd.length > 0) {
    // Add newline before our content if file exists and doesn't end with newline
    const prefix =
      existingContent && !existingContent.endsWith('\n') ? '\n\n' : existingContent ? '\n' : '';
    await appendFile(envPath, `${prefix + linesToAdd.join('\n')}\n`);
  }

  return { added, skipped };
}

export function initCommand(): Command {
  const cmd = new Command('init');

  cmd
    .description('Initialize ArtemisKit in the current directory')
    .option('-f, --force', 'Overwrite existing configuration')
    .option('--skip-env', 'Skip adding environment variables to .env')
    .action(async (options: { force?: boolean; skipEnv?: boolean }) => {
      const spinner = createSpinner();

      try {
        const cwd = process.cwd();

        // Show welcome banner
        console.log(renderWelcomeBanner());

        // Step 1: Create directories
        spinner.start('Creating project structure...');
        await mkdir(join(cwd, 'scenarios'), { recursive: true });
        await mkdir(join(cwd, 'artemis-runs'), { recursive: true });
        await mkdir(join(cwd, 'artemis-output'), { recursive: true });
        spinner.succeed('Created project structure');

        // Step 2: Write config file
        const configPath = join(cwd, 'artemis.config.yaml');
        const configExists = existsSync(configPath);

        if (configExists && !options.force) {
          spinner.info('Config file already exists (use --force to overwrite)');
        } else {
          spinner.start('Writing configuration...');
          await writeFile(configPath, DEFAULT_CONFIG);
          spinner.succeed(
            configExists ? 'Overwrote artemis.config.yaml' : 'Created artemis.config.yaml'
          );
        }

        // Step 3: Write example scenario
        const scenarioPath = join(cwd, 'scenarios', 'example.yaml');
        const scenarioExists = existsSync(scenarioPath);

        if (scenarioExists && !options.force) {
          spinner.info('Example scenario already exists (use --force to overwrite)');
        } else {
          spinner.start('Creating example scenario...');
          await writeFile(scenarioPath, DEFAULT_SCENARIO);
          spinner.succeed(
            scenarioExists ? 'Overwrote scenarios/example.yaml' : 'Created scenarios/example.yaml'
          );
        }

        // Step 4: Update .env file
        if (!options.skipEnv) {
          spinner.start('Updating .env file...');
          const { added, skipped } = await appendEnvKeys(cwd);

          if (added.length > 0) {
            spinner.succeed(`Added ${added.length} environment variable(s) to .env`);
            if (skipped.length > 0) {
              console.log(
                chalk.dim(
                  `  ${icons.info} Skipped ${skipped.length} existing key(s): ${skipped.join(', ')}`
                )
              );
            }
          } else if (skipped.length > 0) {
            spinner.info('All environment variables already exist in .env');
          } else {
            spinner.succeed('Created .env with environment variables');
          }
        }

        // Show success panel
        console.log(renderSuccessPanel());

        // Non-blocking update check (fire and forget)
        checkForUpdateAndNotify();
      } catch (error) {
        spinner.fail('Error');
        console.error(chalk.red(`\n${icons.failed} ${(error as Error).message}`));
        process.exit(1);
      }
    });

  return cmd;
}
