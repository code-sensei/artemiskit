import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeTrueForgeText } from '@artemiskit/adapter-trueforge';
import {
  type BenchmarkTask,
  type LingModelId,
  type TrueForgeAttemptOptions,
  buildAkitBundle,
  parseTaskManifest,
  realAgentEvaluationEnabled,
  resolveLingModel,
  runTrueForgeAttempt,
} from '../scenario-repair/run-trueforge';

export interface SuiteTaskSelection {
  id: string;
  taskPath: string;
  models: LingModelId[];
}

export interface BenchmarkSuiteManifest {
  id: string;
  repetitions: number;
  tasks: SuiteTaskSelection[];
}

export interface LoadedBenchmarkSuite {
  manifest: BenchmarkSuiteManifest;
  tasks: Array<{
    selection: SuiteTaskSelection;
    task: BenchmarkTask;
    taskRoot: string;
  }>;
}

export interface SuiteAttemptCoordinate {
  taskId: string;
  taskPath: string;
  modelId: LingModelId;
  repetition: number;
}

export type SuiteAttemptStatus = 'passed' | 'task_failed' | 'infrastructure_failed';

export interface SuiteAttemptRecord {
  coordinate: SuiteAttemptCoordinate;
  status: SuiteAttemptStatus;
  startedAt: string;
  completedAt: string;
  result?: unknown;
  error?: string;
}

export interface SuiteAggregate {
  total: number;
  passed: number;
  taskFailed: number;
  infrastructureFailed: number;
  byModel: Record<string, { total: number; passed: number }>;
  byTask: Record<string, { total: number; passed: number }>;
}

export interface SuiteEvidence {
  schemaVersion: 1;
  suiteId: string;
  createdAt: string;
  attempts: SuiteAttemptRecord[];
  aggregate: SuiteAggregate;
}

export interface SuiteRunDependencies {
  repoRoot?: string;
  suitePath?: string;
  buildAkitBundle?: (repoRoot: string) => Promise<string>;
  runAttempt?: (options: TrueForgeAttemptOptions) => Promise<unknown>;
  writeEvidence?: (
    repoRoot: string,
    evidence: SuiteEvidence,
    sensitiveValues: readonly string[]
  ) => Promise<string>;
  log?: (message: string) => void;
}

type Environment = Readonly<Record<string, string | undefined>>;

function invalidSuiteManifest(): never {
  throw new Error('suite.yaml does not satisfy the Ling benchmark suite contract');
}

function isDenseUniqueStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    Array.from({ length: value.length }, (_, index) => value[index]).every(
      (item) => typeof item === 'string' && item.trim().length > 0
    ) &&
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

export function parseSuiteManifest(value: unknown): BenchmarkSuiteManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidSuiteManifest();
  const suite = value as Record<string, unknown>;
  if (
    typeof suite.id !== 'string' ||
    suite.id.trim().length === 0 ||
    !Number.isInteger(suite.repetitions) ||
    (suite.repetitions as number) < 1 ||
    !Array.isArray(suite.tasks) ||
    suite.tasks.length === 0
  ) {
    return invalidSuiteManifest();
  }

  const tasks: SuiteTaskSelection[] = [];
  for (const value of suite.tasks) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidSuiteManifest();
    const task = value as Record<string, unknown>;
    if (
      typeof task.id !== 'string' ||
      task.id.trim().length === 0 ||
      typeof task.taskPath !== 'string' ||
      !isSafeRelativePath(task.taskPath) ||
      !isDenseUniqueStringArray(task.models) ||
      task.models.some((model) => model !== 'Ling-3.0-flash' && model !== 'Ling-3.0-tiny')
    ) {
      return invalidSuiteManifest();
    }
    tasks.push(task as unknown as SuiteTaskSelection);
  }

  if (
    new Set(tasks.map((task) => task.id)).size !== tasks.length ||
    new Set(tasks.map((task) => task.taskPath)).size !== tasks.length
  ) {
    return invalidSuiteManifest();
  }
  return suite as unknown as BenchmarkSuiteManifest;
}

export function buildSuiteCoordinates(suite: BenchmarkSuiteManifest): SuiteAttemptCoordinate[] {
  const coordinates: SuiteAttemptCoordinate[] = [];
  for (const task of suite.tasks) {
    for (const modelId of task.models) {
      for (let repetition = 1; repetition <= suite.repetitions; repetition += 1) {
        coordinates.push({
          taskId: task.id,
          taskPath: task.taskPath,
          modelId,
          repetition,
        });
      }
    }
  }
  return coordinates;
}

export async function loadBenchmarkSuite(
  repoRoot: string,
  suitePath: string
): Promise<LoadedBenchmarkSuite> {
  if (!isSafeRelativePath(suitePath)) return invalidSuiteManifest();
  const suiteSource = await readFile(join(repoRoot, suitePath), 'utf8');
  const manifest = parseSuiteManifest(Bun.YAML.parse(suiteSource));
  const tasks = await Promise.all(
    manifest.tasks.map(async (selection) => {
      const absoluteTaskPath = join(repoRoot, selection.taskPath);
      const taskSource = await readFile(absoluteTaskPath, 'utf8');
      const task = parseTaskManifest(Bun.YAML.parse(taskSource));
      if (
        task.id !== selection.id ||
        task.models.length !== selection.models.length ||
        task.models.some((model, index) => model !== selection.models[index])
      ) {
        return invalidSuiteManifest();
      }
      return { selection, task, taskRoot: dirname(absoluteTaskPath) };
    })
  );
  return { manifest, tasks };
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return /(?:apikey|authorization|cookie|credentials?|password|privatekey|secret|token)$/.test(
    normalized
  );
}

function sanitizeValue(value: unknown, sensitiveValues: readonly string[], key?: string): unknown {
  if (key && isSensitiveKey(key)) return '[REDACTED]';
  if (typeof value === 'string') return sanitizeTrueForgeText(value, sensitiveValues);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, sensitiveValues));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [
        entryKey,
        sanitizeValue(entry, sensitiveValues, entryKey),
      ])
    );
  }
  return value;
}

function resultStatus(result: unknown): SuiteAttemptStatus {
  if (!result || typeof result !== 'object' || Array.isArray(result))
    return 'infrastructure_failed';
  const score = (result as Record<string, unknown>).score;
  if (!score || typeof score !== 'object' || Array.isArray(score)) return 'infrastructure_failed';
  const scoreRecord = score as Record<string, unknown>;
  if (scoreRecord.passed === true) {
    return scoreRecord.verdict === 'passed' || scoreRecord.verdict === 'passed_with_recovery'
      ? 'passed'
      : 'infrastructure_failed';
  }
  if (scoreRecord.passed === false && scoreRecord.verdict === 'task_failed') return 'task_failed';
  return 'infrastructure_failed';
}

export async function runSuiteCoordinates(
  coordinates: readonly SuiteAttemptCoordinate[],
  runAttempt: (coordinate: SuiteAttemptCoordinate) => Promise<unknown>,
  sensitiveValues: readonly string[] = []
): Promise<SuiteAttemptRecord[]> {
  const attempts: SuiteAttemptRecord[] = [];
  for (const coordinate of coordinates) {
    const startedAt = new Date().toISOString();
    try {
      const result = sanitizeValue(await runAttempt(coordinate), sensitiveValues);
      attempts.push({
        coordinate,
        status: resultStatus(result),
        startedAt,
        completedAt: new Date().toISOString(),
        result,
      });
    } catch (error) {
      attempts.push({
        coordinate,
        status: 'infrastructure_failed',
        startedAt,
        completedAt: new Date().toISOString(),
        error: sanitizeTrueForgeText(
          error instanceof Error ? error.message : 'Benchmark attempt failed',
          sensitiveValues
        ),
      });
    }
  }
  return attempts;
}

export function createSuiteAggregate(attempts: readonly SuiteAttemptRecord[]): SuiteAggregate {
  const aggregate: SuiteAggregate = {
    total: attempts.length,
    passed: 0,
    taskFailed: 0,
    infrastructureFailed: 0,
    byModel: {},
    byTask: {},
  };
  for (const attempt of attempts) {
    if (attempt.status === 'passed') aggregate.passed += 1;
    if (attempt.status === 'task_failed') aggregate.taskFailed += 1;
    if (attempt.status === 'infrastructure_failed') aggregate.infrastructureFailed += 1;

    let model = aggregate.byModel[attempt.coordinate.modelId];
    if (!model) {
      model = { total: 0, passed: 0 };
      aggregate.byModel[attempt.coordinate.modelId] = model;
    }
    model.total += 1;
    if (attempt.status === 'passed') model.passed += 1;

    let task = aggregate.byTask[attempt.coordinate.taskId];
    if (!task) {
      task = { total: 0, passed: 0 };
      aggregate.byTask[attempt.coordinate.taskId] = task;
    }
    task.total += 1;
    if (attempt.status === 'passed') task.passed += 1;
  }
  return aggregate;
}

export function suiteExitCode(attempts: readonly SuiteAttemptRecord[]): number {
  return attempts.every((attempt) => attempt.status === 'passed') ? 0 : 1;
}

export async function writeSuiteEvidence(
  repoRoot: string,
  evidence: SuiteEvidence,
  sensitiveValues: readonly string[] = []
): Promise<string> {
  const outputDirectory = join(
    repoRoot,
    'agent-evaluation-runs',
    'trueforge-ling-suite',
    evidence.createdAt.replaceAll(':', '-').replaceAll('.', '-')
  );
  const attemptsDirectory = join(outputDirectory, 'attempts');
  await mkdir(attemptsDirectory, { recursive: true });
  const sanitized = sanitizeValue(evidence, sensitiveValues) as typeof evidence;
  await Promise.all([
    ...sanitized.attempts.map((attempt, index) =>
      writeFile(
        join(attemptsDirectory, `${String(index + 1).padStart(3, '0')}.json`),
        `${JSON.stringify(attempt, null, 2)}\n`,
        'utf8'
      )
    ),
    writeFile(
      join(outputDirectory, 'aggregate.json'),
      `${JSON.stringify(sanitized.aggregate, null, 2)}\n`,
      'utf8'
    ),
  ]);
  return outputDirectory;
}

export async function runLingBenchmarkSuite(
  environment: Environment = process.env,
  dependencies: SuiteRunDependencies = {}
): Promise<number> {
  if (!realAgentEvaluationEnabled(environment)) {
    (dependencies.log ?? console.log)(
      'Skipped: set LING_REAL_AGENT_TESTS=1 and LING_API_KEY to run the real Ling evaluation.'
    );
    return 0;
  }

  const apiKey = environment.LING_API_KEY?.trim();
  if (!apiKey) throw new Error('LING_API_KEY is required');
  const repoRoot = dependencies.repoRoot ?? fileURLToPath(new URL('../../..', import.meta.url));
  const suitePath = dependencies.suitePath ?? 'examples/agent-evaluation/ling-benchmark/suite.yaml';
  const loaded = await loadBenchmarkSuite(repoRoot, suitePath);
  const taskById = new Map(loaded.tasks.map((task) => [task.task.id, task]));
  const buildBundle = dependencies.buildAkitBundle ?? buildAkitBundle;
  const runAttempt = dependencies.runAttempt ?? runTrueForgeAttempt;
  const persistEvidence = dependencies.writeEvidence ?? writeSuiteEvidence;
  const akitBundlePath = await buildBundle(repoRoot);
  const attempts = await runSuiteCoordinates(
    buildSuiteCoordinates(loaded.manifest),
    async (coordinate) => {
      const loadedTask = taskById.get(coordinate.taskId);
      if (!loadedTask) throw new Error(`Suite task is unavailable: ${coordinate.taskId}`);
      return runAttempt({
        repoRoot,
        taskRoot: loadedTask.taskRoot,
        task: loadedTask.task,
        model: resolveLingModel({ LING_REAL_AGENT_MODEL: coordinate.modelId }),
        apiKey,
        akitBundlePath,
      });
    },
    [apiKey]
  );
  const evidence: SuiteEvidence = {
    schemaVersion: 1,
    suiteId: loaded.manifest.id,
    createdAt: new Date().toISOString(),
    attempts,
    aggregate: createSuiteAggregate(attempts),
  };
  const outputDirectory = await persistEvidence(repoRoot, evidence, [apiKey]);
  const log = dependencies.log ?? console.log;
  log(
    `Suite verdict: ${String(evidence.aggregate.passed)}/${String(evidence.aggregate.total)} passed`
  );
  log(`Sanitized suite evidence: ${outputDirectory}`);
  return suiteExitCode(attempts);
}

if (import.meta.main) {
  try {
    process.exitCode = await runLingBenchmarkSuite();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Ling benchmark suite failed');
    process.exitCode = 1;
  }
}
