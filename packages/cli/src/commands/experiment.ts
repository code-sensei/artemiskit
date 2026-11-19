/**
 * `akit experiment validate | run | report` — thin CLI over the SDK experiment engine.
 */

import {
  type AdapterConfig,
  type ExperimentLiveAuthorization,
  type ExperimentTarget,
  isLoopbackEndpoint,
} from '@artemiskit/core';
import {
  EXPERIMENT_EXIT_CODES,
  type ExperimentCheck,
  type ExperimentFileRunOutcome,
  ExperimentSurfaceError,
  type ExperimentValidation,
  createExperimentLiveAuthorization,
  formatExperimentRunSummary,
  runExperimentFile,
  validateExperimentFile,
} from '@artemiskit/sdk';
import { Command } from 'commander';
import { loadConfig } from '../config/loader';
import { buildAdapterConfig } from '../utils/adapter';
import { experimentReportCommand } from './experiment-report';

const CHECK_SYMBOLS: Record<ExperimentCheck['status'], string> = {
  ok: '✓',
  warning: '!',
  error: '✗',
};

interface ExperimentRunCommandOptions {
  outputDir?: string;
  config?: string;
  approve?: boolean;
  approvedBy?: string;
  reason?: string;
  decisionId?: string;
  maxConcurrency?: string;
  timeout?: string;
}

export function formatExperimentValidation(validation: ExperimentValidation): string {
  const lines = [`Experiment file: ${validation.file}`];
  for (const check of validation.checks) {
    const subject = check.id ? `${check.subject} ${check.id}` : check.subject;
    lines.push(`  ${CHECK_SYMBOLS[check.status]} ${subject}: ${check.message}`);
  }
  lines.push(validation.valid ? 'Experiment is valid.' : 'Experiment is invalid.');
  return lines.join('\n');
}

function experimentValidateCommand(): Command {
  return new Command('validate')
    .description(
      'Check an experiment file, task source digests and target locality; no model calls'
    )
    .argument('<file>', 'Experiment YAML or JSON file')
    .option('--json', 'Print the validation result as JSON')
    .action(async (file: string, options: { json?: boolean }) => {
      const validation = await validateExperimentFile(file);
      if (options.json) {
        const { manifest: _manifest, ...printable } = validation;
        console.log(JSON.stringify(printable, null, 2));
      } else {
        const output = formatExperimentValidation(validation);
        if (validation.valid) console.log(output);
        else console.error(output);
      }
      process.exitCode = validation.exitCode;
    });
}

/**
 * Provider transport settings for live targets, loaded on first use so fixture runs never read
 * configuration or credentials. An explicit `--config` is loaded up front so a bad path fails
 * before anything runs. Loopback targets receive no configured or ambient API key: the engine
 * sends a non-secret placeholder that local OpenAI-compatible servers accept.
 */
async function createLiveConfigResolver(configPath: string | undefined) {
  const explicit = configPath ? await loadExplicitConfig(configPath) : undefined;
  let discovered: ReturnType<typeof loadConfig> | undefined;
  return async (target: ExperimentTarget): Promise<Partial<AdapterConfig>> => {
    const baseUrl = target.settings?.base_url;
    if (typeof baseUrl === 'string' && isLoopbackEndpoint(baseUrl)) return {};
    discovered ??= loadConfig();
    const config = explicit ?? (await discovered);
    return buildAdapterConfig({
      provider: target.provider,
      model: target.model,
      fileConfig: config,
      providerSource: 'scenario',
      modelSource: 'scenario',
    }).adapterConfig;
  };
}

async function loadExplicitConfig(configPath: string) {
  try {
    const config = await loadConfig(configPath);
    if (config) return config;
  } catch {
    // Fall through: configuration errors can quote file contents, so print no detail.
  }
  throw new ExperimentSurfaceError(
    'config_unavailable',
    'Provider configuration is unavailable or invalid',
    EXPERIMENT_EXIT_CODES.invalid
  );
}

function buildAuthorization(options: ExperimentRunCommandOptions): {
  authorization?: ExperimentLiveAuthorization;
  problem?: string;
} {
  if (!options.approve) {
    return { problem: 'pass --approve with --approved-by <name> and --reason <text>' };
  }
  let maxConcurrency: number | undefined;
  if (options.maxConcurrency !== undefined) {
    maxConcurrency = Number(options.maxConcurrency);
    if (!/^[1-8]$/.test(options.maxConcurrency.trim()))
      return { problem: '--max-concurrency must be an integer from 1 to 8' };
  }
  try {
    return {
      authorization: createExperimentLiveAuthorization({
        approvedBy: options.approvedBy ?? '',
        reason: options.reason ?? '',
        decisionId: options.decisionId,
        maxConcurrency,
      }),
    };
  } catch (error) {
    return { problem: (error as Error).message };
  }
}

function parseTimeout(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1) {
    throw new ExperimentSurfaceError(
      'timeout_invalid',
      'Timeout must be a positive integer number of milliseconds',
      EXPERIMENT_EXIT_CODES.invalid
    );
  }
  return timeout;
}

function reportRunOutcome(
  outcome: ExperimentFileRunOutcome,
  options: ExperimentRunCommandOptions,
  authorizationProblem: string | undefined
): void {
  if (outcome.status === 'invalid') {
    console.error(formatExperimentValidation(outcome.validation));
    console.error(`Experiment run refused: ${outcome.message}.`);
    return;
  }
  if (outcome.status === 'unauthorized') {
    console.error(
      `Experiment run refused: ${outcome.message}. Live approval: ${authorizationProblem ?? 'invalid'}.`
    );
    return;
  }
  if (outcome.validation.mode === 'fixture' && options.approve) {
    console.log('Approval flags ignored: fixture experiments make no model calls.');
  }
  for (const check of outcome.validation.checks) {
    if (check.status === 'warning') console.warn(`Warning: ${check.message}`);
  }
  if (outcome.result) {
    console.log(formatExperimentRunSummary(outcome.result, { resultPath: outcome.resultPath }));
    console.log(`Evidence: ${outcome.evidence.length} run manifest(s) in ${outcome.outputDir}`);
  }
}

function experimentRunCommand(): Command {
  return new Command('run')
    .description(
      'Validate, then run an experiment (fixture mode by default) and save the V1 result and evidence'
    )
    .argument('<file>', 'Experiment YAML or JSON file')
    .option(
      '--output-dir <directory>',
      'New or empty result directory (default: artemis-output/experiments/<id>/<timestamp>)'
    )
    .option('--config <file>', 'Provider transport configuration for live non-loopback targets')
    .option('--approve', 'Approve a live experiment (required with mode: live)')
    .option('--approved-by <name>', 'Who approved the live run (recorded in the result)')
    .option('--reason <text>', 'Why the live run is approved (recorded in the result)')
    .option('--decision-id <id>', 'Approval decision ID (default: generated)')
    .option(
      '--max-concurrency <n>',
      'Highest concurrency (1-8) this live approval covers; required when the experiment declares concurrency above 1 (recorded in the result)'
    )
    .option(
      '--timeout <ms>',
      'Per-case model request timeout in milliseconds (also the minimum HTTP timeout for live targets)'
    )
    .action(async (file: string, options: ExperimentRunCommandOptions) => {
      try {
        const timeoutMs = parseTimeout(options.timeout);
        const { authorization, problem } = buildAuthorization(options);
        const outcome = await runExperimentFile({
          experiment: file,
          outputDir: options.outputDir,
          liveAuthorization: authorization,
          timeoutMs,
          resolveTargetConfig: await createLiveConfigResolver(options.config),
        });
        reportRunOutcome(outcome, options, problem);
        process.exitCode = outcome.exitCode;
      } catch (error) {
        handleFailure(error);
      }
    });
}

function handleFailure(error: unknown): void {
  if (error instanceof ExperimentSurfaceError) {
    console.error(`Experiment: ${error.message}.`);
    process.exitCode = error.exitCode;
    return;
  }
  // Unexpected failures print no detail: provider errors can echo request configuration.
  console.error('Experiment: unexpected failure; no sensitive details were printed.');
  process.exitCode = EXPERIMENT_EXIT_CODES.error;
}

export function experimentCommand(): Command {
  return new Command('experiment')
    .description(
      'Validate, run and report comparative experiments across declared targets (no ranking)'
    )
    .addCommand(experimentValidateCommand())
    .addCommand(experimentRunCommand())
    .addCommand(experimentReportCommand());
}
