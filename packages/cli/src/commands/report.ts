/**
 * Report command - Generate reports from stored runs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnyManifest, RedTeamManifest, RunManifest, StressManifest } from '@artemiskit/core';
import {
  generateHTMLReport,
  generateJSONReport,
  generateRedTeamHTMLReport,
  generateStressHTMLReport,
} from '@artemiskit/reports';
import { Command } from 'commander';
import { loadConfig } from '../config/loader.js';
import { createSpinner, icons, renderError, renderInfoBox } from '../ui/index.js';
import { createStorage } from '../utils/storage.js';

interface ReportOptions {
  format?: 'html' | 'json' | 'both';
  output?: string;
  config?: string;
}

/**
 * Get manifest type
 */
function getManifestType(manifest: AnyManifest): 'run' | 'redteam' | 'stress' {
  if ('type' in manifest) {
    if (manifest.type === 'redteam') return 'redteam';
    if (manifest.type === 'stress') return 'stress';
  }
  return 'run';
}

/**
 * Generate HTML report based on manifest type
 */
function generateHTML(manifest: AnyManifest): string {
  const type = getManifestType(manifest);
  switch (type) {
    case 'redteam':
      return generateRedTeamHTMLReport(manifest as RedTeamManifest);
    case 'stress':
      return generateStressHTMLReport(manifest as StressManifest);
    default:
      return generateHTMLReport(manifest as RunManifest);
  }
}

/**
 * Generate JSON report based on manifest type
 */
function generateJSON(manifest: AnyManifest): string {
  const type = getManifestType(manifest);
  switch (type) {
    case 'redteam':
      return generateJSONReport(manifest as RedTeamManifest, { pretty: true });
    case 'stress':
      return generateJSONReport(manifest as StressManifest, { pretty: true });
    default:
      return generateJSONReport(manifest as RunManifest, { pretty: true });
  }
}

export function reportCommand(): Command {
  const cmd = new Command('report');

  cmd
    .description('Generate a report from a stored run')
    .argument('<run-id>', 'Run ID to generate report for')
    .option('-f, --format <format>', 'Output format (html, json, both)', 'html')
    .option('-o, --output <dir>', 'Output directory', './artemis-output')
    .option('--config <path>', 'Path to config file')
    .action(async (runId: string, options: ReportOptions) => {
      const spinner = createSpinner('Loading run...');
      spinner.start();

      try {
        const config = await loadConfig(options.config);
        const storage = createStorage({ fileConfig: config });
        const manifest = await storage.load(runId);
        const manifestType = getManifestType(manifest);
        spinner.succeed(`Loaded ${manifestType} run: ${runId}`);

        // Create output directory
        const outputDir = options.output || './artemis-output';
        await mkdir(outputDir, { recursive: true });

        const format = options.format || 'html';
        const generatedFiles: string[] = [];

        if (format === 'html' || format === 'both') {
          spinner.start('Generating HTML report...');
          const html = generateHTML(manifest);
          const htmlPath = join(outputDir, `${runId}.html`);
          await writeFile(htmlPath, html);
          generatedFiles.push(htmlPath);
          spinner.succeed('Generated HTML report');
        }

        if (format === 'json' || format === 'both') {
          spinner.start('Generating JSON report...');
          const json = generateJSON(manifest);
          const jsonPath = join(outputDir, `${runId}.json`);
          await writeFile(jsonPath, json);
          generatedFiles.push(jsonPath);
          spinner.succeed('Generated JSON report');
        }

        // Show success panel
        console.log();
        console.log(
          renderInfoBox('Report Generated', [
            `Run ID: ${runId}`,
            `Type: ${manifestType}`,
            '',
            'Files:',
            ...generatedFiles.map((f) => `${icons.passed} ${f}`),
          ])
        );
      } catch (error) {
        spinner.fail('Error');
        console.log();
        console.log(
          renderError({
            title: 'Failed to Generate Report',
            reason: (error as Error).message,
            suggestions: [
              'Check that the run ID exists',
              'Run "artemiskit history" to see available runs',
              'Verify storage configuration in artemis.config.yaml',
            ],
          })
        );
        process.exit(1);
      }
    });

  return cmd;
}
