/**
 * Validate command - Validate scenarios without running them
 */

import { readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { ScenarioValidator, type ValidationResult, type ValidationSummary } from '@artemiskit/core';
import { generateValidationJUnitReport } from '@artemiskit/reports';
import { Glob } from 'bun';
import chalk from 'chalk';
import { Command } from 'commander';
import { icons } from '../ui/index.js';

interface ValidateOptions {
  json?: boolean;
  strict?: boolean;
  quiet?: boolean;
  export?: 'junit';
  exportOutput?: string;
}

export function validateCommand(): Command {
  const cmd = new Command('validate');

  cmd
    .description('Validate scenario files without running them')
    .argument('<path>', 'Path to scenario file, directory, or glob pattern')
    .option('--json', 'Output as JSON')
    .option('--strict', 'Treat warnings as errors')
    .option('-q, --quiet', 'Only output errors (no success messages)')
    .option('--export <format>', 'Export results to format (junit for CI integration)')
    .option('--export-output <dir>', 'Output directory for exports (default: ./artemis-exports)')
    .action(async (pathArg: string, options: ValidateOptions) => {
      const validator = new ScenarioValidator({ strict: options.strict });

      // Resolve files to validate
      const files = resolveFiles(pathArg);

      if (files.length === 0) {
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                valid: false,
                error: `No scenario files found matching: ${pathArg}`,
                results: [],
                summary: { total: 0, passed: 0, failed: 0, withWarnings: 0 },
              },
              null,
              2
            )
          );
        } else {
          console.log(chalk.red(`${icons.failed} No scenario files found matching: ${pathArg}`));
        }
        process.exit(2);
      }

      // Validate all files
      const results: ValidationResult[] = [];

      if (!options.json && !options.quiet) {
        console.log(chalk.bold('Validating scenarios...\n'));
      }

      for (const file of files) {
        const result = validator.validate(file);
        results.push(result);

        // In strict mode, warnings become errors
        if (options.strict && result.warnings.length > 0) {
          result.valid = false;
          result.errors.push(
            ...result.warnings.map((w: ValidationResult['warnings'][0]) => ({
              ...w,
              severity: 'error' as const,
            }))
          );
        }

        if (!options.json) {
          printFileResult(result, options);
        }
      }

      // Calculate summary
      const summary: ValidationSummary = {
        total: results.length,
        passed: results.filter((r) => r.valid && r.warnings.length === 0).length,
        failed: results.filter((r) => !r.valid).length,
        withWarnings: results.filter((r) => r.valid && r.warnings.length > 0).length,
      };

      // Output results
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              valid: summary.failed === 0,
              results: results.map((r) => ({
                file: r.file,
                valid: r.valid,
                errors: r.errors,
                warnings: r.warnings,
              })),
              summary,
            },
            null,
            2
          )
        );
      } else if (!options.quiet) {
        console.log();
        printSummary(summary, options.strict);
      }

      // Export to JUnit if requested
      if (options.export === 'junit') {
        const exportDir = options.exportOutput || './artemis-exports';
        await mkdir(exportDir, { recursive: true });
        const junit = generateValidationJUnitReport(results);
        const junitPath = join(exportDir, `validation-${Date.now()}.xml`);
        await writeFile(junitPath, junit);
        if (!options.quiet) {
          console.log(chalk.dim(`Exported: ${junitPath}`));
        }
      }

      // Exit with appropriate code
      if (summary.failed > 0) {
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Resolve files from path argument (file, directory, or glob)
 */
function resolveFiles(pathArg: string): string[] {
  const resolved = resolve(pathArg);

  try {
    const stat = statSync(resolved);

    if (stat.isFile()) {
      // Single file
      return [resolved];
    }

    if (stat.isDirectory()) {
      // Directory - find all yaml files recursively
      return findYamlFiles(resolved);
    }
  } catch {
    // Path doesn't exist as file/directory - try as glob
  }

  // Try as glob pattern using Bun's Glob
  const glob = new Glob(pathArg);
  const matches: string[] = [];
  for (const file of glob.scanSync({ absolute: true, onlyFiles: true })) {
    if (file.endsWith('.yaml') || file.endsWith('.yml')) {
      matches.push(file);
    }
  }

  return matches;
}

/**
 * Find all YAML files in a directory recursively
 */
function findYamlFiles(dir: string): string[] {
  const files: string[] = [];

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findYamlFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Print result for a single file
 */
function printFileResult(result: ValidationResult, options: ValidateOptions): void {
  const fileName = basename(result.file);

  if (result.valid && result.warnings.length === 0) {
    if (!options.quiet) {
      console.log(`${icons.passed} ${chalk.green(fileName)}`);
    }
  } else if (result.valid && result.warnings.length > 0) {
    console.log(`${icons.warning} ${chalk.yellow(fileName)}`);
    for (const warning of result.warnings) {
      const location = warning.column
        ? `Line ${warning.line}:${warning.column}`
        : `Line ${warning.line}`;
      console.log(chalk.yellow(`    ${location}: ${warning.message}`));
      if (warning.suggestion) {
        console.log(chalk.dim(`    Suggestion: ${warning.suggestion}`));
      }
    }
  } else {
    console.log(`${icons.failed} ${chalk.red(fileName)}`);
    for (const error of result.errors) {
      const location = error.column ? `Line ${error.line}:${error.column}` : `Line ${error.line}`;
      console.log(chalk.red(`    ${location}: ${error.message}`));
      if (error.suggestion) {
        console.log(chalk.dim(`    Suggestion: ${error.suggestion}`));
      }
    }
    for (const warning of result.warnings) {
      const location = warning.column
        ? `Line ${warning.line}:${warning.column}`
        : `Line ${warning.line}`;
      console.log(chalk.yellow(`    ${location}: ${warning.message}`));
    }
  }
}

/**
 * Print validation summary
 */
function printSummary(summary: ValidationSummary, strict?: boolean): void {
  const parts: string[] = [];

  if (summary.passed > 0) {
    parts.push(chalk.green(`${summary.passed} passed`));
  }
  if (summary.failed > 0) {
    parts.push(chalk.red(`${summary.failed} failed`));
  }
  if (summary.withWarnings > 0 && !strict) {
    parts.push(chalk.yellow(`${summary.withWarnings} with warnings`));
  }

  const statusIcon = summary.failed > 0 ? icons.failed : icons.passed;
  const statusColor = summary.failed > 0 ? chalk.red : chalk.green;

  console.log(statusColor(`${statusIcon} ${parts.join(', ')}`));
  console.log(chalk.dim(`${summary.total} scenario(s) validated`));
}
