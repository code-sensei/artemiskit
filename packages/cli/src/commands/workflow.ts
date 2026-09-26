import { type FileHandle, open, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  type AgentWorkflowRecord,
  createAdapter,
  createAgentWorkflowSession,
  createModelClientTarget,
  loadAgentWorkflow,
} from '@artemiskit/core';
import { Command } from 'commander';
import { loadConfig } from '../config/loader';
import { buildAdapterConfig } from '../utils/adapter';

interface WorkflowExecutionOptions {
  config?: string;
  fixtureRoot?: string;
  output?: string;
  stateOutput?: string;
  cleanupTimeout?: string;
  preflight?: boolean;
  json?: boolean;
}

/** Execution success does not imply verified task success. */
export function workflowExitCode(record: AgentWorkflowRecord): number {
  if (record.execution === 'cancelled') return 130;
  if (record.policy === 'denied') return 4;
  if (record.reason === 'usage_unavailable') return 7;
  if (record.execution === 'invalid') return 2;
  if (record.execution === 'unsupported') return 3;
  if (record.execution === 'budget_exceeded') return 5;
  if (record.execution === 'timeout') return 6;
  if (
    record.execution !== 'completed' ||
    record.usage.status !== 'reported' ||
    record.cleanup.status !== 'completed'
  )
    return 7;
  return 0;
}

interface ReservedOutput {
  path: string;
  handle: FileHandle;
  written: boolean;
}
async function reserveOutputs(options: WorkflowExecutionOptions) {
  const outputs: { record?: ReservedOutput; state?: ReservedOutput } = {};
  const paths = await Promise.all(
    [options.output, options.stateOutput].map(async (path) =>
      path ? join(await realpath(dirname(resolve(path))), basename(path)) : undefined
    )
  );
  if (paths[0] && paths[0] === paths[1]) throw new Error('colliding_output_paths');
  try {
    for (const [index, key] of ['record', 'state'].entries()) {
      const path = paths[index];
      if (path)
        outputs[key as keyof typeof outputs] = {
          path,
          handle: await open(path, 'wx', 0o600),
          written: false,
        };
    }
    return outputs;
  } catch {
    await releaseOutputs(outputs);
    throw new Error('output_unavailable');
  }
}
async function releaseOutputs(outputs: { record?: ReservedOutput; state?: ReservedOutput }) {
  for (const output of Object.values(outputs)) {
    await output.handle.close();
    if (!output.written) await unlink(output.path);
  }
}
async function save(output: ReservedOutput | undefined, value: unknown) {
  if (!output) return;
  await output.handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
  output.written = true;
}

export function workflowCommand(): Command {
  const workflow = new Command('workflow').description(
    'Execute controlled agent workflows (task scoring unavailable)'
  );
  for (const preflightOnly of [false, true]) {
    const command = new Command(preflightOnly ? 'preflight' : 'run')
      .argument('<file>', 'Agent workflow YAML file')
      .description(
        preflightOnly
          ? 'Probe structured tool support without executing workflow turns'
          : 'Run the native workflow engine with declared authority and cumulative budgets'
      )
      .option('--config <file>', 'Trusted provider transport configuration')
      .option('--fixture-root <directory>', 'Fixture directory (default: workflow file directory)')
      .option('--output <file>', 'Save metadata-only execution record; must not exist')
      .option(
        '--state-output <file>',
        'Explicit sensitive final-state export (0600); must not exist'
      )
      .option('--cleanup-timeout <ms>', 'Override environment cleanup wait, 1–10000 ms')
      .option('--json', 'Print metadata-only record as JSON');
    if (!preflightOnly)
      command.option('--preflight', 'Probe structured tool support before workflow turns');
    command.action(async (file: string, options: WorkflowExecutionOptions) => {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      process.on('SIGINT', cancel);
      process.on('SIGTERM', cancel);
      let outputs: Awaited<ReturnType<typeof reserveOutputs>> = {};
      let phase: 'load' | 'setup' | 'execution' = 'load';
      try {
        const cleanupTimeoutMs =
          options.cleanupTimeout === undefined ? undefined : Number(options.cleanupTimeout);
        if (
          cleanupTimeoutMs !== undefined &&
          (!Number.isInteger(cleanupTimeoutMs) || cleanupTimeoutMs < 1 || cleanupTimeoutMs > 10000)
        ) {
          process.exitCode = 2;
          console.error('Workflow: cleanup timeout must be an integer from 1 to 10000 ms.');
          return;
        }
        const path = resolve(file);
        const scenario = await loadAgentWorkflow(path);
        phase = 'setup';
        outputs = await reserveOutputs(options);
        const config = await loadConfig(options.config);
        if (options.config && !config) throw new Error('explicit_config_unavailable');
        const { adapterConfig } = buildAdapterConfig({
          provider: scenario.target.provider,
          model: scenario.target.model,
          fileConfig: config,
          providerSource: 'scenario',
          modelSource: 'scenario',
        });
        if (adapterConfig.provider !== scenario.target.provider) {
          process.exitCode = 3;
          console.error('Workflow: configured provider is unsupported.');
          return;
        }
        const client = await createAdapter({
          ...adapterConfig,
          defaultModel: scenario.target.model,
          maxRetries: 0,
        });
        const session = createAgentWorkflowSession({
          workflow: scenario,
          target: createModelClientTarget(client),
          fixtureRoot: options.fixtureRoot ? resolve(options.fixtureRoot) : dirname(path),
          preflight: options.preflight,
          preflightOnly,
          signal: controller.signal,
          cleanupTimeoutMs,
        });
        phase = 'execution';
        const result = await session.run();
        await save(outputs.record, result.record);
        let missingState = false;
        if (outputs.state) {
          if (result.state === null) missingState = true;
          else await save(outputs.state, result.state);
        }
        console.log(
          options.json
            ? JSON.stringify(result.record, null, 2)
            : `Execution: ${result.record.execution} (${result.record.reason})\nPolicy: ${result.record.policy}\nUsage: ${result.record.usage.status}\nCleanup: ${result.record.cleanup.status}\nTask verification: unavailable (outcome scoring is not part of this milestone).`
        );
        process.exitCode = workflowExitCode(result.record);
        if (missingState) {
          console.error('Workflow: final state is unavailable; no state export was written.');
          process.exitCode = 1;
        }
      } catch (error) {
        const code = (error as { code?: string })?.code;
        process.exitCode =
          phase === 'load'
            ? code === 'SCENARIO_READ_ERROR'
              ? 1
              : 2
            : ['PROVIDER_UNAVAILABLE', 'UNKNOWN_PROVIDER'].includes(code ?? '')
              ? 3
              : 1;
        console.error(
          phase === 'load'
            ? 'Workflow: unable to read or validate the workflow file.'
            : 'Workflow: configuration, output preparation or persistence failed; no sensitive details were printed.'
        );
      } finally {
        process.removeListener('SIGINT', cancel);
        process.removeListener('SIGTERM', cancel);
        await releaseOutputs(outputs).catch(() => {
          console.error('Workflow: output cleanup failed.');
          process.exitCode = 1;
        });
      }
    });
    workflow.addCommand(command);
  }
  return workflow;
}
