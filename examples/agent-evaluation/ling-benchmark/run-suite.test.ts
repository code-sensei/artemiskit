import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSuiteCoordinates,
  createSuiteAggregate,
  loadBenchmarkSuite,
  parseSuiteManifest,
  runLingBenchmarkSuite,
  runSuiteCoordinates,
  suiteExitCode,
  writeSuiteEvidence,
} from './run-suite';

const SUITE = {
  id: 'ling-artemiskit-agent-benchmark',
  repetitions: 3,
  tasks: [
    {
      id: 'scenario-repair',
      taskPath: 'examples/agent-evaluation/scenario-repair/task.yaml',
      models: ['Ling-3.0-flash', 'Ling-3.0-tiny'],
    },
    {
      id: 'tool-trace-authoring',
      taskPath: 'examples/agent-evaluation/ling-benchmark/tasks/tool-trace-authoring/task.yaml',
      models: ['Ling-3.0-flash'],
    },
  ],
};

describe('Ling benchmark suite', () => {
  it('loads the committed five-task schedule with three repetitions', async () => {
    const repoRoot = join(import.meta.dir, '..', '..', '..');
    const loaded = await loadBenchmarkSuite(
      repoRoot,
      'examples/agent-evaluation/ling-benchmark/suite.yaml'
    );
    const coordinates = buildSuiteCoordinates(loaded.manifest);

    expect(loaded.tasks).toHaveLength(5);
    expect(coordinates).toHaveLength(24);
    expect(
      coordinates.filter((coordinate) => coordinate.modelId === 'Ling-3.0-flash')
    ).toHaveLength(15);
    expect(coordinates.filter((coordinate) => coordinate.modelId === 'Ling-3.0-tiny')).toHaveLength(
      9
    );
  });

  it('parses a strict suite manifest and expands fresh serial coordinates', () => {
    const suite = parseSuiteManifest(SUITE);
    expect(buildSuiteCoordinates(suite)).toEqual([
      {
        taskId: 'scenario-repair',
        taskPath: 'examples/agent-evaluation/scenario-repair/task.yaml',
        modelId: 'Ling-3.0-flash',
        repetition: 1,
      },
      {
        taskId: 'scenario-repair',
        taskPath: 'examples/agent-evaluation/scenario-repair/task.yaml',
        modelId: 'Ling-3.0-flash',
        repetition: 2,
      },
      {
        taskId: 'scenario-repair',
        taskPath: 'examples/agent-evaluation/scenario-repair/task.yaml',
        modelId: 'Ling-3.0-flash',
        repetition: 3,
      },
      {
        taskId: 'scenario-repair',
        taskPath: 'examples/agent-evaluation/scenario-repair/task.yaml',
        modelId: 'Ling-3.0-tiny',
        repetition: 1,
      },
      {
        taskId: 'scenario-repair',
        taskPath: 'examples/agent-evaluation/scenario-repair/task.yaml',
        modelId: 'Ling-3.0-tiny',
        repetition: 2,
      },
      {
        taskId: 'scenario-repair',
        taskPath: 'examples/agent-evaluation/scenario-repair/task.yaml',
        modelId: 'Ling-3.0-tiny',
        repetition: 3,
      },
      {
        taskId: 'tool-trace-authoring',
        taskPath: 'examples/agent-evaluation/ling-benchmark/tasks/tool-trace-authoring/task.yaml',
        modelId: 'Ling-3.0-flash',
        repetition: 1,
      },
      {
        taskId: 'tool-trace-authoring',
        taskPath: 'examples/agent-evaluation/ling-benchmark/tasks/tool-trace-authoring/task.yaml',
        modelId: 'Ling-3.0-flash',
        repetition: 2,
      },
      {
        taskId: 'tool-trace-authoring',
        taskPath: 'examples/agent-evaluation/ling-benchmark/tasks/tool-trace-authoring/task.yaml',
        modelId: 'Ling-3.0-flash',
        repetition: 3,
      },
    ]);
  });

  it.each([
    ['duplicate task id', { ...SUITE, tasks: [SUITE.tasks[0], SUITE.tasks[0]] }],
    [
      'traversing task path',
      { ...SUITE, tasks: [{ ...SUITE.tasks[0], taskPath: '../scenario-repair/task.yaml' }] },
    ],
    ['unsupported model', { ...SUITE, tasks: [{ ...SUITE.tasks[0], models: ['unknown'] }] }],
    ['zero repetitions', { ...SUITE, repetitions: 0 }],
  ])('rejects %s', (_name, manifest) => {
    expect(() => parseSuiteManifest(manifest)).toThrow('suite.yaml');
  });

  it('runs coordinates serially and records failures without aborting later attempts', async () => {
    const coordinates = buildSuiteCoordinates({ ...parseSuiteManifest(SUITE), repetitions: 1 });
    const visited: string[] = [];
    let active = 0;
    let maximumActive = 0;
    const attempts = await runSuiteCoordinates(
      coordinates,
      async (coordinate) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        visited.push(`${coordinate.taskId}:${coordinate.modelId}`);
        await Promise.resolve();
        active -= 1;

        if (coordinate.modelId === 'Ling-3.0-tiny') throw new Error('failure with secret-key');
        return {
          score: {
            passed: coordinate.taskId !== 'tool-trace-authoring',
            verdict: coordinate.taskId === 'tool-trace-authoring' ? 'task_failed' : 'passed',
          },
        };
      },
      ['secret-key']
    );

    expect(maximumActive).toBe(1);
    expect(visited).toHaveLength(3);
    expect(attempts).toHaveLength(3);
    expect(attempts.map((attempt) => attempt.status)).toEqual([
      'passed',
      'infrastructure_failed',
      'task_failed',
    ]);
    expect(JSON.stringify(attempts)).not.toContain('secret-key');
    expect(suiteExitCode(attempts)).toBe(1);
  });

  it('writes sanitized attempt evidence and a compact aggregate beneath the ignored run root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'artemiskit-ling-suite-'));
    try {
      const coordinate = buildSuiteCoordinates({ ...parseSuiteManifest(SUITE), repetitions: 1 })[0];
      if (!coordinate) throw new Error('missing test coordinate');
      const attempts = [
        {
          coordinate,
          status: 'passed' as const,
          startedAt: '2026-08-22T00:00:00.000Z',
          completedAt: '2026-08-22T00:00:01.000Z',
          result: {
            score: { passed: true, verdict: 'passed' },
            note: 'secret-key',
            credentials: { apiKey: 'unlisted-key' },
          },
        },
      ];
      const aggregate = createSuiteAggregate(attempts);
      const outputDirectory = await writeSuiteEvidence(
        root,
        {
          schemaVersion: 1,
          suiteId: SUITE.id,
          createdAt: '2026-08-22T00:00:01.000Z',
          attempts,
          aggregate,
        },
        ['secret-key']
      );

      expect(outputDirectory.startsWith(join(root, 'agent-evaluation-runs'))).toBe(true);
      const attemptJson = await readFile(join(outputDirectory, 'attempts', '001.json'), 'utf8');
      const aggregateJson = await readFile(join(outputDirectory, 'aggregate.json'), 'utf8');
      expect(attemptJson).not.toContain('secret-key');
      expect(attemptJson).not.toContain('unlisted-key');
      expect(attemptJson).toContain('[REDACTED]');
      expect(JSON.parse(aggregateJson)).toEqual({
        total: 1,
        passed: 1,
        taskFailed: 0,
        infrastructureFailed: 0,
        byModel: { 'Ling-3.0-flash': { total: 1, passed: 1 } },
        byTask: { 'scenario-repair': { total: 1, passed: 1 } },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('is inert without both explicit opt-in and an API key', async () => {
    expect(await runLingBenchmarkSuite({})).toBe(0);
    expect(await runLingBenchmarkSuite({ LING_API_KEY: 'key' })).toBe(0);
  });

  it('executes the committed suite serially and records every coordinate through injected offline seams', async () => {
    const repoRoot = join(import.meta.dir, '..', '..', '..');
    const visited: string[] = [];
    let writtenAttempts = 0;
    const exitCode = await runLingBenchmarkSuite(
      { LING_REAL_AGENT_TESTS: '1', LING_API_KEY: 'secret-key' },
      {
        repoRoot,
        buildAkitBundle: async () => '/tmp/akit.js',
        runAttempt: async ({ model, task }) => {
          visited.push(`${task.id}:${model.modelId}`);
          return {
            score: {
              passed: task.id !== 'tool-trace-authoring',
              verdict: task.id === 'tool-trace-authoring' ? 'task_failed' : 'passed',
            },
          };
        },
        writeEvidence: async (_root, evidence, sensitiveValues) => {
          writtenAttempts = evidence.attempts.length;
          expect(sensitiveValues).toEqual(['secret-key']);
          return '/tmp/evidence';
        },
        log: () => undefined,
      }
    );

    expect(exitCode).toBe(1);
    expect(visited).toHaveLength(24);
    expect(writtenAttempts).toBe(24);
  });
});
