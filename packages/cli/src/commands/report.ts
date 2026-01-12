/**
 * Report command - Generate reports from stored runs
 */

import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { createStorageFromEnv } from '@artemiskit/core';
import { generateHTMLReport, generateJSONReport } from '@artemiskit/reports';

interface ReportOptions {
  format?: 'html' | 'json' | 'both';
  output?: string;
}

export function reportCommand(): Command {
  const cmd = new Command('report');

  cmd
    .description('Generate a report from a stored run')
    .argument('<run-id>', 'Run ID to generate report for')
    .option('-f, --format <format>', 'Output format (html, json, both)', 'html')
    .option('-o, --output <dir>', 'Output directory', './artemis-output')
    .action(async (runId: string, options: ReportOptions) => {
      const spinner = ora('Loading run...').start();

      try {
        const storage = createStorageFromEnv();
        const manifest = await storage.load(runId);
        spinner.succeed(`Loaded run: ${runId}`);

        // Create output directory
        const outputDir = options.output || './artemis-output';
        await mkdir(outputDir, { recursive: true });

        const format = options.format || 'html';
        const generatedFiles: string[] = [];

        if (format === 'html' || format === 'both') {
          spinner.start('Generating HTML report...');
          const html = generateHTMLReport(manifest);
          const htmlPath = join(outputDir, `${runId}.html`);
          await writeFile(htmlPath, html);
          generatedFiles.push(htmlPath);
          spinner.succeed(`Generated HTML report: ${htmlPath}`);
        }

        if (format === 'json' || format === 'both') {
          spinner.start('Generating JSON report...');
          const json = generateJSONReport(manifest, { pretty: true });
          const jsonPath = join(outputDir, `${runId}.json`);
          await writeFile(jsonPath, json);
          generatedFiles.push(jsonPath);
          spinner.succeed(`Generated JSON report: ${jsonPath}`);
        }

        console.log();
        console.log(chalk.bold('Report generated successfully!'));
        console.log();
        console.log('Files:');
        for (const file of generatedFiles) {
          console.log(`  ${chalk.green('•')} ${file}`);
        }
      } catch (error) {
        spinner.fail('Error');
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return cmd;
}
