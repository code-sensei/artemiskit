/**
 * `akit experiment report` — regenerate experiment reports offline from a saved result.
 */

import path from 'node:path';
import {
  EXPERIMENT_EXIT_CODES,
  EXPERIMENT_REPORT_FORMATS,
  EXPERIMENT_REPORT_VIEWS,
  type ExperimentReportFormat,
  type ExperimentReportView,
  ExperimentSurfaceError,
  reportExperimentResult,
} from '@artemiskit/sdk';
import { Command } from 'commander';

interface ExperimentReportCommandOptions {
  view: string[];
  format: string[];
  outputDir?: string;
}

const collect = (value: string, previous: string[]) => [...previous, value];

/** Default report directory: `reports/` beside the saved result. */
export function defaultExperimentReportDir(resultFile: string): string {
  return path.join(path.dirname(path.resolve(resultFile)), 'reports');
}

export function experimentReportCommand(): Command {
  return new Command('report')
    .description(
      'Generate technical, executive and comprehensive reports offline from a saved result; no provider configuration'
    )
    .argument('<result>', 'Saved experiment result.json')
    .option(
      '--view <view>',
      `Report view, repeatable: ${EXPERIMENT_REPORT_VIEWS.join(', ')} (default: all)`,
      collect,
      []
    )
    .option(
      '--format <format>',
      `Report format, repeatable: ${EXPERIMENT_REPORT_FORMATS.join(', ')} (default: all)`,
      collect,
      []
    )
    .option(
      '--output-dir <directory>',
      'New or empty report directory (default: reports/ beside the result)'
    )
    .action(async (result: string, options: ExperimentReportCommandOptions) => {
      try {
        const reports = await reportExperimentResult({
          result,
          views: options.view as ExperimentReportView[],
          formats: options.format as ExperimentReportFormat[],
          outputDir: options.outputDir ?? defaultExperimentReportDir(result),
        });
        for (const report of reports)
          console.log(`${report.view} ${report.format}: ${report.path}`);
        // Report generation succeeds independently of the measured outcomes.
        process.exitCode = 0;
      } catch (error) {
        if (error instanceof ExperimentSurfaceError) {
          console.error(`Experiment report: ${error.message}.`);
          process.exitCode = error.exitCode;
        } else {
          console.error('Experiment report: unexpected failure; no report generated.');
          process.exitCode = EXPERIMENT_EXIT_CODES.error;
        }
      }
    });
}
