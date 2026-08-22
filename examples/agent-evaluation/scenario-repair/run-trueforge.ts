import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentAcceptanceCheck,
  AgentArtifactCheck,
  AgentEvaluationEvidence,
  AgentEvaluationScore,
  AgentOutcome,
  AgentTask,
  AgentTerminationStatus,
} from '@artemiskit/core';
import type { McpSandboxServerOptions } from '../../../packages/mcp-docker-sandbox/src/server';

const LING_API_BASE_URL = 'https://api.ant-ling.com/v1';
const TRUEFORGE_BASE_URL = 'http://localhost:8790';
const MCP_SERVER_NAME = 'artemiskit-ling-benchmark';

export type LingModelId = 'Ling-3.0-flash' | 'Ling-3.0-tiny';

export interface ArtifactCheckDefinition {
  id: string;
  path: string;
  expectedPath: string;
}

export interface BenchmarkTask extends AgentTask {
  instructions: string;
  allowedCommands?: string[];
  artifactChecks: ArtifactCheckDefinition[];
  models: LingModelId[];
}

export interface LingModelSelection {
  modelId: LingModelId;
  modelName: 'ling-3-flash' | 'ling-3-tiny';
}

type Environment = Readonly<Record<string, string | undefined>>;

interface CollectedEvidence {
  acceptanceChecks: AgentAcceptanceCheck[];
  artifactChecks: AgentArtifactCheck[];
}

export interface TrueForgeEvaluationResult {
  schemaVersion: 1;
  createdAt: string;
  repositoryCommit?: string;
  provider: { name: 'ling'; baseUrl: string };
  model: LingModelSelection;
  harness: { name: 'trueforge'; baseUrl: string };
  task: BenchmarkTask;
  outcome: AgentOutcome;
  evidence: AgentEvaluationEvidence;
  score: AgentEvaluationScore;
}

export interface TrueForgeAttemptOptions {
  repoRoot: string;
  taskRoot: string;
  task: BenchmarkTask;
  model: LingModelSelection;
  apiKey: string;
  akitBundlePath: string;
}

export function realAgentEvaluationEnabled(environment: Environment): boolean {
  return environment.LING_REAL_AGENT_TESTS === '1' && Boolean(environment.LING_API_KEY?.trim());
}

export function resolveLingModel(environment: Environment): LingModelSelection {
  const modelId = environment.LING_REAL_AGENT_MODEL ?? 'Ling-3.0-flash';
  if (modelId === 'Ling-3.0-flash') {
    return { modelId, modelName: 'ling-3-flash' };
  }
  if (modelId === 'Ling-3.0-tiny') {
    return { modelId, modelName: 'ling-3-tiny' };
  }
  throw new Error('LING_REAL_AGENT_MODEL must be either Ling-3.0-flash or Ling-3.0-tiny');
}

export function parseChangedPaths(status: string): string[] {
  return status
    .split('\n')
    .filter((line) => line.length >= 4)
    .map((line) => {
      const path = line.slice(3);
      const renameSeparator = path.indexOf(' -> ');
      return renameSeparator >= 0 ? path.slice(renameSeparator + 4) : path;
    });
}

export function buildAgentPrompt(
  task: AgentTask & { allowedCommands?: string[] },
  instructions?: string
): string {
  const target = task.allowedPaths[0] ?? 'the assigned fixture';
  const taskInstructions =
    instructions ??
    `Repair ${target} so that every acceptance command passes while preserving its intent.`;

  return [
    `Repair ${target} in the disposable workspace.`,
    '',
    taskInstructions.trim(),
    '',
    `Allowed tools: ${task.allowedTools.join(', ')}`,
    `Do not change files outside: ${task.allowedPaths.join(', ')}`,
    `Allowed commands: ${(task.allowedCommands ?? task.acceptanceCommands).join(', ')}`,
    `Acceptance commands: ${task.acceptanceCommands.join(', ')}`,
    '',
    'Tool contract:',
    '- Use workspace_read to inspect file contents; do not use workspace_run as cat.',
    '- Use workspace_patch for the edit, workspace_status for changed paths, and workspace_diff for the final patch.',
    '- workspace_run may execute only the listed allowed commands. Any other command is prohibited and fails this evaluation.',
    '- Do not run help, listing, search, package, shell, or discovery commands.',
    `Maximum tool actions: ${String(task.maxActions)}`,
    '',
    'Inspect the file, make the smallest valid change, run the acceptance command, and verify the final diff before finishing.',
    'Do not claim success unless the acceptance command exits successfully.',
  ].join('\n');
}

export function workspaceOperationBudget(task: AgentTask): number {
  // TrueForge can emit two tool calls in one loop iteration even when parallel execution is off.
  // Keep that bounded while reserving acceptance, status, and diff operations for the scorer.
  const evidenceOperations = task.acceptanceCommands.length + 2;
  return task.maxActions * 2 + evidenceOperations;
}

export function createSandboxOptions(
  task: BenchmarkTask,
  paths: { fixturePath: string; akitBundlePath: string }
): McpSandboxServerOptions {
  return {
    ...paths,
    allowedWritePaths: task.allowedPaths,
    allowedCommands: task.allowedCommands ?? task.acceptanceCommands,
    allowedTools: task.allowedTools,
    commandTimeoutMs: task.timeoutMs,
    maxCommands: task.maxActions + task.acceptanceCommands.length,
    maxOperations: workspaceOperationBudget(task),
  };
}

export function inferTerminationStatus(
  outcome: AgentOutcome,
  terminalStatus?: string
): AgentTerminationStatus {
  if (outcome.completed) return 'completed';
  if (/tim(?:e|ed)[ -]?out/i.test(outcome.error ?? '')) return 'timed_out';
  if (terminalStatus === 'error' || terminalStatus === 'cancelled') return 'agent_error';
  return 'infrastructure_error';
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    Array.from({ length: value.length }, (_, index) => value[index]).every(
      (item) => typeof item === 'string'
    )
  );
}

function isUniqueNonEmptyStrings(value: unknown): value is string[] {
  return (
    isStringArray(value) &&
    value.length > 0 &&
    value.every((item) => item.trim().length > 0) &&
    new Set(value).size === value.length
  );
}

function isSafeRelativePath(path: string): boolean {
  if (
    !path ||
    path.includes('\\') ||
    path.includes('\0') ||
    /^[A-Za-z]:\//.test(path) ||
    isAbsolute(path)
  ) {
    return false;
  }
  const normalized = normalize(path);
  return (
    normalized === path &&
    normalized !== '.' &&
    normalized !== '..' &&
    !normalized.startsWith(`..${sep}`)
  );
}

function isAllowedCommand(command: string): boolean {
  const match = /^(?:akit validate|bun test) ([a-zA-Z0-9._/-]+)$/.exec(command);
  const commandPath = match?.[1];
  if (!commandPath) return false;
  return isSafeRelativePath(commandPath.startsWith('./') ? commandPath.slice(2) : commandPath);
}

function invalidTaskManifest(): never {
  throw new Error('task.yaml does not satisfy the real-agent task contract');
}

export function parseTaskManifest(value: unknown): BenchmarkTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidTaskManifest();
  }
  const task = value as Record<string, unknown>;
  const artifactChecks = task.artifactChecks;
  if (
    typeof task.id !== 'string' ||
    task.id.trim().length === 0 ||
    typeof task.instructions !== 'string' ||
    task.instructions.trim().length === 0 ||
    typeof task.fixturePath !== 'string' ||
    !isSafeRelativePath(task.fixturePath) ||
    !isUniqueNonEmptyStrings(task.allowedPaths) ||
    task.allowedPaths.some((path) => !isSafeRelativePath(path)) ||
    !isUniqueNonEmptyStrings(task.allowedTools) ||
    task.allowedTools.some(
      (tool) =>
        ![
          'workspace_read',
          'workspace_patch',
          'workspace_status',
          'workspace_diff',
          'workspace_run',
        ].includes(tool)
    ) ||
    !Number.isInteger(task.maxActions) ||
    (task.maxActions as number) < 1 ||
    !Number.isInteger(task.timeoutMs) ||
    (task.timeoutMs as number) < 1 ||
    !isUniqueNonEmptyStrings(task.acceptanceCommands) ||
    task.acceptanceCommands.some((command) => !isAllowedCommand(command)) ||
    (task.allowedCommands !== undefined && !isUniqueNonEmptyStrings(task.allowedCommands)) ||
    (isStringArray(task.allowedCommands) &&
      task.allowedCommands.some((command) => !isAllowedCommand(command))) ||
    !isUniqueNonEmptyStrings(task.requiredArtifactChecks) ||
    !Array.isArray(artifactChecks) ||
    artifactChecks.length === 0 ||
    !isUniqueNonEmptyStrings(task.models) ||
    task.models.some((model) => model !== 'Ling-3.0-flash' && model !== 'Ling-3.0-tiny')
  ) {
    return invalidTaskManifest();
  }

  const parsedArtifactChecks: ArtifactCheckDefinition[] = [];
  for (const value of artifactChecks) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidTaskManifest();
    const check = value as Record<string, unknown>;
    if (
      typeof check.id !== 'string' ||
      check.id.trim().length === 0 ||
      typeof check.path !== 'string' ||
      !isSafeRelativePath(check.path) ||
      typeof check.expectedPath !== 'string' ||
      !isSafeRelativePath(check.expectedPath) ||
      !(task.allowedPaths as string[]).includes(check.path)
    ) {
      return invalidTaskManifest();
    }
    parsedArtifactChecks.push(check as unknown as ArtifactCheckDefinition);
  }

  const artifactIds = parsedArtifactChecks.map((check) => check.id);
  const requiredArtifactChecks = task.requiredArtifactChecks as string[];
  const allowedCommands = (task.allowedCommands ?? task.acceptanceCommands) as string[];
  if (
    new Set(artifactIds).size !== artifactIds.length ||
    requiredArtifactChecks.length !== artifactIds.length ||
    requiredArtifactChecks.some((id, index) => id !== artifactIds[index]) ||
    !(task.acceptanceCommands as string[]).every((command) => allowedCommands.includes(command))
  ) {
    return invalidTaskManifest();
  }

  return task as unknown as BenchmarkTask;
}

export async function buildAkitBundle(repoRoot: string): Promise<string> {
  const outputDirectory = join(repoRoot, 'agent-evaluation-runs', 'bin');
  await mkdir(outputDirectory, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(repoRoot, 'packages', 'cli', 'bin', 'artemis.ts')],
    outdir: outputDirectory,
    naming: 'akit.js',
    target: 'bun',
  });
  if (!result.success) {
    throw new Error(
      `Failed to build the isolated akit bundle: ${result.logs.map((log) => log.message).join('; ')}`
    );
  }
  return join(outputDirectory, 'akit.js');
}

export async function collectWorkspaceEvidence(
  task: AgentTask & { artifactChecks?: ArtifactCheckDefinition[] },
  workspace: {
    root: string;
    run(command: string): Promise<{ exitCode: number }>;
    status(): Promise<string>;
    diff(): Promise<string>;
  },
  taskRoot = fileURLToPath(new URL('.', import.meta.url))
): Promise<{
  collection: { acceptancePassed: boolean; changedPaths: string[]; finalDiff?: string };
  evidence: CollectedEvidence;
}> {
  const acceptanceChecks: AgentAcceptanceCheck[] = [];
  for (const command of task.acceptanceCommands) {
    const startedAt = performance.now();
    try {
      const result = await workspace.run(command);
      acceptanceChecks.push({
        command,
        status: result.exitCode === 0 ? 'passed' : 'failed',
        exitCode: result.exitCode,
        durationMs: performance.now() - startedAt,
      });
    } catch {
      acceptanceChecks.push({
        command,
        status: 'executor_error',
        exitCode: null,
        durationMs: performance.now() - startedAt,
      });
    }
  }

  const status = await workspace.status();
  const finalDiff = await workspace.diff();

  const artifactChecks: AgentArtifactCheck[] = [];
  for (const check of task.artifactChecks ?? []) {
    const startedAt = performance.now();
    try {
      const [actual, expected] = await Promise.all([
        readFile(join(workspace.root, check.path)),
        readFile(join(taskRoot, check.expectedPath)),
      ]);
      artifactChecks.push({
        id: check.id,
        status: actual.equals(expected) ? 'passed' : 'failed',
        durationMs: performance.now() - startedAt,
      });
    } catch {
      artifactChecks.push({
        id: check.id,
        status: 'executor_error',
        durationMs: performance.now() - startedAt,
      });
    }
  }

  return {
    collection: {
      acceptancePassed:
        acceptanceChecks.length > 0 && acceptanceChecks.every((check) => check.status === 'passed'),
      changedPaths: parseChangedPaths(status),
      ...(finalDiff === undefined ? {} : { finalDiff }),
    },
    evidence: { acceptanceChecks, artifactChecks },
  };
}

function fallbackEvidence(task: AgentTask): CollectedEvidence {
  return {
    acceptanceChecks: task.acceptanceCommands.map((command) => ({
      command,
      status: 'executor_error',
      exitCode: null,
      durationMs: 0,
    })),
    artifactChecks: (task.requiredArtifactChecks ?? []).map((id) => ({
      id,
      status: 'executor_error',
      durationMs: 0,
    })),
  };
}

async function currentCommit(repoRoot: string): Promise<string | undefined> {
  const process = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const [exitCode, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);
  return exitCode === 0 ? stdout.trim() : undefined;
}

export async function runTrueForgeAttempt(
  options: TrueForgeAttemptOptions
): Promise<TrueForgeEvaluationResult> {
  const { repoRoot, taskRoot, task, model, apiKey, akitBundlePath } = options;
  const { scoreAgentOutcome } = await import('@artemiskit/core');
  const { TrueForgeAdapter, createLingProviderSetup } = await import(
    '@artemiskit/adapter-trueforge'
  );
  const { startMcpSandboxServer } = await import('@artemiskit/mcp-docker-sandbox');
  const providerSetup = createLingProviderSetup({ apiKey, ...model });
  const server = await startMcpSandboxServer(
    createSandboxOptions(task, {
      fixturePath: resolve(taskRoot, task.fixturePath),
      akitBundlePath,
    })
  );
  let collectedEvidence: CollectedEvidence | undefined;
  let terminalStatus: string | undefined;

  try {
    const adapter = new TrueForgeAdapter({
      baseUrl: TRUEFORGE_BASE_URL,
      buildPrompt: () => buildAgentPrompt(task, task.instructions),
      turnTimeoutMs: task.timeoutMs,
      failureCollectionGraceMs: 1_000,
      setup: {
        provider: providerSetup.provider,
        mcpServer: {
          type: 'remote',
          name: MCP_SERVER_NAME,
          description: 'Disposable, network-disabled ArtemisKit benchmark workspace',
          url: server.url.toString(),
        },
      },
      agent: {
        model: {
          ...providerSetup.model,
          params: { temperature: 0, maxTokens: 2_048, parallelToolCalls: false },
        },
        mcpServers: [
          {
            name: MCP_SERVER_NAME,
            enableTools: ['@all'],
            requireApprovalForTools: [],
            preload: true,
          },
        ],
        config: {
          askUserQuestions: { enabled: false },
          dynamicSubAgents: { enabled: false },
          generativeUi: { enabled: false },
          iterationLimit: task.maxActions,
          sandbox: { enabled: false },
        },
      },
      collectOutcome: async (context) => {
        terminalStatus = context.terminalState?.status;
        const collected = await collectWorkspaceEvidence(task, server.workspace, taskRoot);
        collectedEvidence = collected.evidence;
        return collected.collection;
      },
    });

    await adapter.setup();
    const outcome = await adapter.run(task);
    const evidence: AgentEvaluationEvidence = {
      termination: { status: inferTerminationStatus(outcome, terminalStatus) },
      ...(collectedEvidence ?? fallbackEvidence(task)),
    };
    const score = scoreAgentOutcome(task, outcome, evidence);
    return {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      repositoryCommit: await currentCommit(repoRoot),
      provider: { name: 'ling', baseUrl: LING_API_BASE_URL },
      model,
      harness: { name: 'trueforge', baseUrl: TRUEFORGE_BASE_URL },
      task,
      outcome,
      evidence,
      score,
    };
  } finally {
    await server.close();
  }
}

export async function runTrueForgeEvaluation(): Promise<number> {
  if (!realAgentEvaluationEnabled(process.env)) {
    console.log(
      'Skipped: set LING_REAL_AGENT_TESTS=1 and LING_API_KEY to run the real Ling evaluation.'
    );
    return 0;
  }

  const apiKey = process.env.LING_API_KEY?.trim();
  if (!apiKey) throw new Error('LING_API_KEY is required');

  const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const taskRoot = join(repoRoot, 'examples', 'agent-evaluation', 'scenario-repair');
  const taskSource = await readFile(join(taskRoot, 'task.yaml'), 'utf8');
  const task = parseTaskManifest(Bun.YAML.parse(taskSource));
  const result = await runTrueForgeAttempt({
    repoRoot,
    taskRoot,
    task,
    model: resolveLingModel(process.env),
    apiKey,
    akitBundlePath: await buildAkitBundle(repoRoot),
  });
  const outputDirectory = join(
    repoRoot,
    'agent-evaluation-runs',
    'trueforge-ling',
    result.createdAt.replaceAll(':', '-').replaceAll('.', '-')
  );
  const outputPath = join(outputDirectory, 'result.json');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  console.log(`Verdict: ${result.score.verdict}`);
  console.log(`Sanitized result: ${outputPath}`);
  return result.score.passed ? 0 : 1;
}

if (import.meta.main) {
  try {
    process.exitCode = await runTrueForgeEvaluation();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Real-agent evaluation failed');
    process.exitCode = 1;
  }
}
