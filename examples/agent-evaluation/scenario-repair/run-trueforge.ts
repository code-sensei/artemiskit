import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentAcceptanceCheck,
  AgentArtifactCheck,
  AgentEvaluationEvidence,
  AgentOutcome,
  AgentTask,
  AgentTerminationStatus,
} from '@artemiskit/core';

const LING_API_BASE_URL = 'https://api.ant-ling.com/v1';
const TRUEFORGE_BASE_URL = 'http://localhost:8790';
const MCP_SERVER_NAME = 'artemiskit-scenario-repair';

interface ScenarioRepairTask extends AgentTask {
  instructions: string;
}

interface LingModelSelection {
  modelId: 'Ling-3.0-flash' | 'Ling-3.0-tiny';
  modelName: 'ling-3-flash' | 'ling-3-tiny';
}

type Environment = Readonly<Record<string, string | undefined>>;

interface CollectedEvidence {
  acceptanceChecks: AgentAcceptanceCheck[];
  artifactChecks: AgentArtifactCheck[];
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

export function buildAgentPrompt(task: AgentTask, instructions?: string): string {
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
    `Acceptance commands: ${task.acceptanceCommands.join(', ')}`,
    'workspace_run may execute only the listed acceptance commands; do not use it for shell discovery.',
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
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseTask(value: unknown): ScenarioRepairTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('task.yaml must contain an object');
  }
  const task = value as Record<string, unknown>;
  if (
    typeof task.id !== 'string' ||
    typeof task.instructions !== 'string' ||
    typeof task.fixturePath !== 'string' ||
    !isStringArray(task.allowedPaths) ||
    !isStringArray(task.allowedTools) ||
    !Number.isInteger(task.maxActions) ||
    (task.maxActions as number) < 1 ||
    !Number.isInteger(task.timeoutMs) ||
    (task.timeoutMs as number) < 1 ||
    !isStringArray(task.acceptanceCommands) ||
    (task.requiredArtifactChecks !== undefined && !isStringArray(task.requiredArtifactChecks))
  ) {
    throw new Error('task.yaml does not satisfy the real-agent task contract');
  }
  return task as unknown as ScenarioRepairTask;
}

async function buildAkitBundle(repoRoot: string): Promise<string> {
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
  task: AgentTask,
  workspace: {
    root: string;
    run(command: string): Promise<{ exitCode: number }>;
    status(): Promise<string>;
    diff(): Promise<string>;
  }
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
  try {
    const { checkScenarioRepair } = await import('./acceptance');
    artifactChecks.push(await checkScenarioRepair(workspace.root));
  } catch {
    for (const id of task.requiredArtifactChecks ?? []) {
      artifactChecks.push({ id, status: 'executor_error', durationMs: 0 });
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
  const exampleRoot = join(repoRoot, 'examples', 'agent-evaluation', 'scenario-repair');
  const taskSource = await readFile(join(exampleRoot, 'task.yaml'), 'utf8');
  const task = parseTask(Bun.YAML.parse(taskSource));
  const model = resolveLingModel(process.env);
  const akitBundlePath = await buildAkitBundle(repoRoot);

  const { scoreAgentOutcome } = await import('@artemiskit/core');
  const { TrueForgeAdapter, createLingProviderSetup } = await import(
    '@artemiskit/adapter-trueforge'
  );
  const { startMcpSandboxServer } = await import('@artemiskit/mcp-docker-sandbox');
  const providerSetup = createLingProviderSetup({ apiKey, ...model });
  const server = await startMcpSandboxServer({
    fixturePath: resolve(exampleRoot, task.fixturePath),
    akitBundlePath,
    commandTimeoutMs: task.timeoutMs,
    maxCommands: task.maxActions + task.acceptanceCommands.length,
    maxOperations: workspaceOperationBudget(task),
  });
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
          description: 'Disposable, network-disabled ArtemisKit scenario-repair workspace',
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
        const collected = await collectWorkspaceEvidence(task, server.workspace);
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
    const timestamp = new Date().toISOString();
    const outputDirectory = join(
      repoRoot,
      'agent-evaluation-runs',
      'trueforge-ling',
      timestamp.replaceAll(':', '-').replaceAll('.', '-')
    );
    const outputPath = join(outputDirectory, 'result.json');
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          createdAt: timestamp,
          repositoryCommit: await currentCommit(repoRoot),
          provider: { name: 'ling', baseUrl: LING_API_BASE_URL },
          model,
          harness: { name: 'trueforge', baseUrl: TRUEFORGE_BASE_URL },
          task,
          outcome,
          evidence,
          score,
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    console.log(`Verdict: ${score.verdict}`);
    console.log(`Sanitized result: ${outputPath}`);
    return score.passed ? 0 : 1;
  } finally {
    await server.close();
  }
}

if (import.meta.main) {
  try {
    process.exitCode = await runTrueForgeEvaluation();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Real-agent evaluation failed');
    process.exitCode = 1;
  }
}
