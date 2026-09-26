/** Reviewable workflow authoring. No target, tool, or referenced fixture is executed here. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getWorkflowTool, listWorkflowTools, validateAgentWorkflow } from '@artemiskit/core';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { stringify } from 'yaml';
import { isInteractive } from '../ui/index.js';
import { validateCommand } from './validate';

export interface WorkflowAuthoringOptions {
  name?: string;
  provider?: string;
  model?: string;
  tools?: string;
  output?: string;
  instructions?: string;
  prompt?: string;
  maxActions?: string;
  maxToolCalls?: string;
  maxTokens?: string;
  maxOutputTokens?: string;
  maxModelRequests?: string;
  environment?: string;
  readPaths?: string;
  writePaths?: string;
  timeout?: string;
  expectState?: string;
  equals?: string;
  semanticRubric?: string;
  force?: boolean;
  yes?: boolean;
  interactive?: boolean;
}

/** All generated authority is explicit in the YAML, derived from selected catalog tools. */
export function buildAgentWorkflow(options: WorkflowAuthoringOptions) {
  const tools = (options.tools ?? 'request_approval').split(',').map((tool) => tool.trim());
  const permissions: Record<string, 'read' | 'write'> = {};
  for (const id of tools) {
    const tool = getWorkflowTool(id);
    if (!tool) throw new Error(`Unknown workflow tool: ${id}`);
    if (tool.authority.access !== 'none') {
      const resource = tool.authority.resource;
      if (permissions[resource] !== 'write') permissions[resource] = tool.authority.access;
    }
  }
  if ((options.expectState === undefined) !== (options.equals === undefined)) {
    throw new Error('--expect-state and --equals must be supplied together');
  }
  const deterministic =
    options.expectState !== undefined
      ? [
          {
            type: 'workflow_state',
            path: options.expectState,
            equals: JSON.parse(options.equals ?? ''),
          },
        ]
      : [{ type: 'tool_trace', tool: tools[0], minimum_calls: 1 }];
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: options.name ?? 'review-and-handoff',
    target: {
      provider: options.provider ?? 'openai',
      model: options.model ?? 'configured-model',
      generation: { max_tokens: Number(options.maxOutputTokens ?? 256) },
    },
    environment: {
      type: options.environment ?? 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions,
        ...(options.readPaths !== undefined || options.writePaths !== undefined
          ? {
              paths: {
                read:
                  options.readPaths
                    ?.split(',')
                    .map((path) => path.trim())
                    .filter(Boolean) ?? [],
                write:
                  options.writePaths
                    ?.split(',')
                    .map((path) => path.trim())
                    .filter(Boolean) ?? [],
              },
            }
          : {}),
        budgets: {
          max_actions: Number(options.maxActions ?? 10),
          max_tool_calls: Number(options.maxToolCalls ?? 10),
          timeout_ms: Number(options.timeout ?? 60000),
          max_tokens: Number(options.maxTokens ?? 4096),
          ...(options.maxModelRequests !== undefined
            ? { max_model_requests: Number(options.maxModelRequests) }
            : {}),
        },
      },
    },
    tools,
    workflow: {
      system_instructions:
        options.instructions ?? 'Use only the declared tools. Request human review when uncertain.',
      initial_state: {},
      turns: [{ role: 'user', content: options.prompt ?? 'Request approval for a human review.' }],
    },
    outcomes: {
      deterministic,
      ...(options.semanticRubric
        ? {
            semantic: [
              { type: 'llm_judge', mode: 'strict_assurance', rubric: options.semanticRubric },
            ],
          }
        : {}),
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}

export async function promptForAgentWorkflow(options: WorkflowAuthoringOptions) {
  const answers = await inquirer.prompt<WorkflowAuthoringOptions & { selectedTools: string[] }>([
    {
      type: 'input',
      name: 'name',
      message: 'Workflow name',
      default: options.name ?? 'review-and-handoff',
    },
    {
      type: 'input',
      name: 'provider',
      message: 'Target provider',
      default: options.provider ?? 'openai',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Target model',
      default: options.model ?? 'configured-model',
    },
    {
      type: 'checkbox',
      name: 'selectedTools',
      message: 'Permitted workflow tools (resource permissions are written in the YAML)',
      choices: listWorkflowTools().map((tool) => ({
        name: `${tool.id}: ${tool.description}`,
        value: tool.id,
      })),
      default: (options.tools ?? 'request_approval').split(','),
      validate: (value: string[]) => value.length > 0 || 'Select at least one tool',
    },
    {
      type: 'input',
      name: 'instructions',
      message: 'System instructions',
      default:
        options.instructions ?? 'Use only declared tools. Request human review when uncertain.',
    },
    {
      type: 'input',
      name: 'prompt',
      message: 'Initial user request',
      default: options.prompt ?? 'Request approval for a human review.',
    },
    {
      type: 'input',
      name: 'maxActions',
      message: 'Maximum actions',
      default: options.maxActions ?? '10',
    },
    {
      type: 'input',
      name: 'maxToolCalls',
      message: 'Maximum tool calls',
      default: options.maxToolCalls ?? '10',
    },
    {
      type: 'input',
      name: 'timeout',
      message: 'Timeout in milliseconds',
      default: options.timeout ?? '60000',
    },
    {
      type: 'input',
      name: 'maxTokens',
      message: 'Cumulative token limit for the complete workflow',
      default: options.maxTokens ?? '4096',
    },
    {
      type: 'input',
      name: 'maxOutputTokens',
      message: 'Maximum output tokens per model generation',
      default: options.maxOutputTokens ?? '256',
    },
    {
      type: 'input',
      name: 'maxModelRequests',
      message: 'Maximum model requests',
      default: options.maxModelRequests ?? options.maxActions ?? '10',
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Isolated environment',
      choices: ['simulated', 'sandbox'],
      default: options.environment ?? 'simulated',
    },
    {
      type: 'input',
      name: 'readPaths',
      message: 'Optional exact readable file paths, comma-separated',
      default: options.readPaths ?? '',
    },
    {
      type: 'input',
      name: 'writePaths',
      message: 'Optional exact writable file paths, comma-separated',
      default: options.writePaths ?? '',
    },
    {
      type: 'input',
      name: 'expectState',
      message: 'Required final state path (leave blank to require the first selected tool)',
      default: options.expectState ?? '',
    },
    {
      type: 'input',
      name: 'equals',
      message: 'Expected state value as JSON',
      default: options.equals ?? 'true',
      when: (a: { expectState: string }) => a.expectState.length > 0,
    },
    {
      type: 'input',
      name: 'semanticRubric',
      message: 'Optional semantic rubric (leave blank for deterministic checks only)',
      default: options.semanticRubric ?? '',
    },
  ]);
  return {
    ...options,
    ...answers,
    tools: answers.selectedTools.join(','),
    readPaths: answers.readPaths?.trim() || undefined,
    writePaths: answers.writePaths?.trim() || undefined,
    expectState: answers.expectState || undefined,
    equals: answers.expectState ? answers.equals : undefined,
  } as WorkflowAuthoringOptions;
}

export function initAgentWorkflowCommand(): Command {
  return new Command('agent-workflow')
    .description('Generate validated agent-workflow YAML without executing it')
    .option('--name <name>', 'Workflow name')
    .option('--provider <provider>', 'Target provider identifier')
    .option('--model <model>', 'Target model identifier')
    .option('--tools <ids>', 'Comma-separated catalog tools (default: request_approval)')
    .option('-o, --output <path>', 'YAML output path', 'scenarios/agent-workflow.yaml')
    .option('--instructions <text>', 'System instructions')
    .option('--prompt <text>', 'Initial user request')
    .option('--max-actions <n>', 'Maximum actions', '10')
    .option('--max-tool-calls <n>', 'Maximum tool calls', '10')
    .option('--max-tokens <n>', 'Cumulative token budget for the complete workflow', '4096')
    .option('--max-output-tokens <n>', 'Maximum output tokens per model generation', '256')
    .option('--max-model-requests <n>', 'Maximum model requests (default: action budget)')
    .option('--environment <type>', 'simulated or disposable sandbox', 'simulated')
    .option('--read-paths <paths>', 'Comma-separated exact readable file paths')
    .option('--write-paths <paths>', 'Comma-separated exact writable file paths')
    .option('--timeout <ms>', 'Timeout in milliseconds', '60000')
    .option('--expect-state <path>', 'Required final state path (paired with --equals)')
    .option('--equals <json>', 'Expected final state JSON value')
    .option('--semantic-rubric <text>', 'Optional strict semantic criterion')
    .option('-i, --interactive', 'Run the guided workflow wizard')
    .option('-y, --yes', 'Use supplied options/defaults without prompting')
    .option('-f, --force', 'Overwrite the output file')
    .action(async (_options: WorkflowAuthoringOptions, command: Command) => {
      // Commander consumes flags shared with `init` at the parent level.
      const options = command.optsWithGlobals<WorkflowAuthoringOptions>();
      try {
        if (options.interactive && options.yes) throw new Error('Choose --interactive or --yes');
        if (options.interactive && !isInteractive())
          throw new Error('Interactive authoring requires a terminal; use --yes and flags');
        const configured =
          options.interactive || (isInteractive() && !options.yes)
            ? await promptForAgentWorkflow(options)
            : options;
        const scenario = buildAgentWorkflow(configured);
        const output = resolve(options.output ?? 'scenarios/agent-workflow.yaml');
        await mkdir(dirname(output), { recursive: true });
        const header =
          '# ArtemisKit agent-workflow contract v1\n# Controlled native execution: artemiskit workflow run <file>. Outcome scoring remains unavailable.\n# Permissions govern isolated working state. Review tools, inputs, budgets, and outcomes before use.\n';
        await writeFile(output, header + stringify(scenario), { flag: options.force ? 'w' : 'wx' });
        console.log(
          `Created ${output}\nValidate with: artemiskit scenario validate ${JSON.stringify(output)}`
        );
      } catch (error) {
        console.error(`Agent workflow: ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });
}

export function workflowToolsCommand(): Command {
  const tools = new Command('tools').description(
    'Inspect the versioned simulated workflow tool catalog'
  );
  tools
    .command('list')
    .option('--json', 'Output descriptors as JSON')
    .action((options: { json?: boolean }) => {
      const catalog = listWorkflowTools();
      console.log(
        options.json
          ? JSON.stringify(catalog, null, 2)
          : catalog.map((tool) => `${tool.id}@${tool.version}  ${tool.description}`).join('\n')
      );
    });
  tools
    .command('describe <id>')
    .option('--json', 'Output the descriptor as JSON')
    .action((id: string) => {
      const tool = getWorkflowTool(id);
      if (!tool) {
        console.error(`Unknown workflow tool: ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(tool, null, 2));
    });
  return tools;
}

export function scenarioCommand(): Command {
  return new Command('scenario')
    .description('Inspect and validate scenario contracts')
    .addCommand(validateCommand());
}
