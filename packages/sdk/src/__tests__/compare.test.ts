/**
 * Tests for ArtemisKit.compare() method (v0.3.2+)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the core module
const mockStorageAdapter = {
  save: vi.fn(),
  load: vi.fn(),
  loadRun: vi.fn(),
  list: vi.fn(),
  delete: vi.fn(),
  compare: vi.fn(),
  setBaseline: vi.fn(),
  getBaseline: vi.fn(),
  getBaselineByRunId: vi.fn(),
  listBaselines: vi.fn(),
  removeBaseline: vi.fn(),
  removeBaselineByRunId: vi.fn(),
  compareToBaseline: vi.fn(),
};

vi.mock('@artemiskit/core', () => ({
  parseScenarioFile: vi.fn(),
  createAdapter: vi.fn().mockResolvedValue({
    provider: 'mock',
    generate: vi.fn(),
    capabilities: vi.fn(),
    close: vi.fn(),
  }),
  runScenario: vi.fn(),
  getGitInfo: vi.fn().mockResolvedValue({ commit: 'abc123', branch: 'main', dirty: false }),
  createStorageAdapter: vi.fn().mockReturnValue(mockStorageAdapter),
  LocalStorageAdapter: vi.fn().mockImplementation(() => mockStorageAdapter),
}));

vi.mock('@artemiskit/redteam', () => ({
  TypoMutation: class {
    name = 'typo';
  },
  RoleSpoofMutation: class {
    name = 'role-spoof';
  },
  InstructionFlipMutation: class {
    name = 'instruction-flip';
  },
  CotInjectionMutation: class {
    name = 'cot-injection';
  },
  EncodingMutation: class {
    name = 'encoding';
  },
  MultiTurnMutation: class {
    name = 'multi-turn';
  },
  RedTeamGenerator: class {
    generate() {
      return [];
    }
    listMutations() {
      return [];
    }
  },
  UnsafeResponseDetector: class {
    detect() {
      return { unsafe: false, blocked: false, reasons: [], severity: 'none' };
    }
  },
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'test-id-12345',
}));

import { ArtemisKit } from '../artemiskit';

// Sample manifests for testing
const createMockManifest = (
  runId: string,
  successRate: number,
  cases: { id: string; ok: boolean }[]
) => ({
  version: '1.0',
  run_id: runId,
  project: 'test-project',
  start_time: '2026-03-17T10:00:00Z',
  end_time: '2026-03-17T10:01:00Z',
  duration_ms: 60000,
  config: {
    scenario: 'test-scenario',
    provider: 'openai',
    model: 'gpt-4',
  },
  metrics: {
    success_rate: successRate,
    total_cases: cases.length,
    passed_cases: cases.filter((c) => c.ok).length,
    failed_cases: cases.filter((c) => !c.ok).length,
    median_latency_ms: 100,
    p95_latency_ms: 150,
    total_tokens: 1000,
    total_prompt_tokens: 600,
    total_completion_tokens: 400,
  },
  cases: cases.map((c) => ({
    id: c.id,
    name: `Case ${c.id}`,
    ok: c.ok,
    score: c.ok ? 1 : 0,
    matcherType: 'contains',
    reason: c.ok ? 'Passed' : 'Failed',
    latencyMs: 100,
    tokens: { prompt: 10, completion: 5, total: 15 },
    prompt: 'Test prompt',
    response: 'Test response',
    expected: { type: 'contains', values: ['test'], mode: 'any' },
    tags: [],
  })),
});

describe('ArtemisKit.compare()', () => {
  let kit: ArtemisKit;

  beforeEach(() => {
    vi.clearAllMocks();
    kit = new ArtemisKit({
      project: 'test-project',
      provider: 'openai',
      model: 'gpt-4',
      storage: {
        type: 'local',
        basePath: './test-runs',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('basic comparison', () => {
    it('should compare two runs successfully', async () => {
      const baselineManifest = createMockManifest('baseline-run', 0.9, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: true },
        { id: 'case-3', ok: true },
        { id: 'case-4', ok: false },
      ]);

      const currentManifest = createMockManifest('current-run', 0.8, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: false },
        { id: 'case-3', ok: true },
        { id: 'case-4', ok: true },
      ]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const result = await kit.compare({
        baseline: 'baseline-run',
        current: 'current-run',
        threshold: 0.05,
      });

      expect(result.baseline.runId).toBe('baseline-run');
      expect(result.current.runId).toBe('current-run');
      expect(result.baseline.successRate).toBeCloseTo(0.9, 5);
      expect(result.current.successRate).toBeCloseTo(0.8, 5);
      expect(result.comparison.successRateDelta).toBeCloseTo(-0.1, 5);
      expect(result.hasRegression).toBe(true);
    });

    it('should detect no regression when improvement occurs', async () => {
      const baselineManifest = createMockManifest('baseline-run', 0.8, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: true },
        { id: 'case-3', ok: false },
        { id: 'case-4', ok: false },
      ]);

      const currentManifest = createMockManifest('current-run', 0.9, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: true },
        { id: 'case-3', ok: true },
        { id: 'case-4', ok: false },
      ]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const result = await kit.compare({
        baseline: 'baseline-run',
        current: 'current-run',
        threshold: 0.05,
      });

      expect(result.comparison.successRateDelta).toBeCloseTo(0.1, 5);
      expect(result.hasRegression).toBe(false);
    });

    it('should detect no regression within threshold', async () => {
      const baselineManifest = createMockManifest('baseline-run', 0.9, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: true },
        { id: 'case-3', ok: true },
        { id: 'case-4', ok: false },
      ]);

      const currentManifest = createMockManifest('current-run', 0.87, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: true },
        { id: 'case-3', ok: false },
        { id: 'case-4', ok: true },
      ]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const result = await kit.compare({
        baseline: 'baseline-run',
        current: 'current-run',
        threshold: 0.05, // 5% threshold
      });

      // 3% drop is within 5% threshold
      expect(result.comparison.successRateDelta).toBeCloseTo(-0.03, 1);
      expect(result.hasRegression).toBe(false);
    });
  });

  describe('case-level comparison', () => {
    it('should identify new failures', async () => {
      const baselineManifest = createMockManifest('baseline-run', 1.0, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: true },
      ]);

      const currentManifest = createMockManifest('current-run', 0.5, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: false },
      ]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const result = await kit.compare({
        baseline: 'baseline-run',
        current: 'current-run',
      });

      expect(result.comparison.newFailures).toHaveLength(1);
      expect(result.comparison.newFailures[0].caseId).toBe('case-2');
      expect(result.comparison.newFailures[0].baselineStatus).toBe('passed');
      expect(result.comparison.newFailures[0].currentStatus).toBe('failed');
    });

    it('should identify new passes', async () => {
      const baselineManifest = createMockManifest('baseline-run', 0.5, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: false },
      ]);

      const currentManifest = createMockManifest('current-run', 1.0, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: true },
      ]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const result = await kit.compare({
        baseline: 'baseline-run',
        current: 'current-run',
      });

      expect(result.comparison.newPasses).toHaveLength(1);
      expect(result.comparison.newPasses[0].caseId).toBe('case-2');
      expect(result.comparison.newPasses[0].baselineStatus).toBe('failed');
      expect(result.comparison.newPasses[0].currentStatus).toBe('passed');
    });

    it('should identify unchanged cases', async () => {
      const baselineManifest = createMockManifest('baseline-run', 0.5, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: false },
      ]);

      const currentManifest = createMockManifest('current-run', 0.5, [
        { id: 'case-1', ok: true },
        { id: 'case-2', ok: false },
      ]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const result = await kit.compare({
        baseline: 'baseline-run',
        current: 'current-run',
      });

      expect(result.comparison.unchanged).toHaveLength(2);
      expect(result.comparison.newFailures).toHaveLength(0);
      expect(result.comparison.newPasses).toHaveLength(0);
    });
  });

  describe('threshold configuration', () => {
    it('should use default threshold of 0.05', async () => {
      const baselineManifest = createMockManifest('baseline-run', 0.9, [
        { id: 'case-1', ok: true },
      ]);
      // 4% drop (0.86 - 0.9 = -0.04) should be within 5% threshold
      const currentManifest = createMockManifest('current-run', 0.86, [
        { id: 'case-1', ok: false },
      ]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const result = await kit.compare({
        baseline: 'baseline-run',
        current: 'current-run',
        // No threshold specified, should default to 0.05
      });

      expect(result.threshold).toBe(0.05);
      // 4% drop is within 5% threshold - not a regression
      expect(result.hasRegression).toBe(false);
    });

    it('should respect custom threshold', async () => {
      const baselineManifest = createMockManifest('baseline-run', 0.9, [
        { id: 'case-1', ok: true },
      ]);
      const currentManifest = createMockManifest('current-run', 0.88, [
        { id: 'case-1', ok: false },
      ]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const result = await kit.compare({
        baseline: 'baseline-run',
        current: 'current-run',
        threshold: 0.01, // 1% threshold - more strict
      });

      expect(result.threshold).toBe(0.01);
      // 2% drop exceeds 1% threshold
      expect(result.hasRegression).toBe(true);
    });
  });

  describe('special baseline values', () => {
    it('should handle "latest" as baseline', async () => {
      const latestRun = {
        runId: 'latest-run-123',
        project: 'test-project',
        scenario: 'test-scenario',
        type: 'run' as const,
        startTime: '2026-03-17T10:00:00Z',
        endTime: '2026-03-17T10:01:00Z',
        durationMs: 60000,
        successRate: 0.9,
        totalCases: 4,
      };

      mockStorageAdapter.list.mockResolvedValue([latestRun]);

      const baselineManifest = createMockManifest('latest-run-123', 0.9, [
        { id: 'case-1', ok: true },
      ]);
      const currentManifest = createMockManifest('current-run', 0.8, [{ id: 'case-1', ok: false }]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const result = await kit.compare({
        baseline: 'latest',
        current: 'current-run',
      });

      expect(result.baseline.runId).toBe('latest-run-123');
      expect(mockStorageAdapter.list).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw error when baseline run not found', async () => {
      mockStorageAdapter.load.mockRejectedValue(new Error('Run not found: invalid-id'));

      await expect(
        kit.compare({
          baseline: 'invalid-id',
          current: 'current-run',
        })
      ).rejects.toThrow('Run not found');
    });

    it('should throw error when current run not found', async () => {
      const baselineManifest = createMockManifest('baseline-run', 0.9, []);
      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockRejectedValueOnce(new Error('Run not found: invalid-id'));

      await expect(
        kit.compare({
          baseline: 'baseline-run',
          current: 'invalid-id',
        })
      ).rejects.toThrow('Run not found');
    });

    it('should throw error when storage is not configured', async () => {
      const kitWithoutStorage = new ArtemisKit({
        project: 'test-project',
        provider: 'openai',
        model: 'gpt-4',
        // No storage configuration
      });

      await expect(
        kitWithoutStorage.compare({
          baseline: 'baseline-run',
          current: 'current-run',
        })
      ).rejects.toThrow(/storage/i);
    });
  });

  describe('progress events', () => {
    it('should emit progress events during comparison', async () => {
      const baselineManifest = createMockManifest('baseline-run', 0.9, [
        { id: 'case-1', ok: true },
      ]);
      const currentManifest = createMockManifest('current-run', 0.9, [{ id: 'case-1', ok: true }]);

      mockStorageAdapter.load
        .mockResolvedValueOnce(baselineManifest)
        .mockResolvedValueOnce(currentManifest);

      const progressHandler = vi.fn();
      kit.onProgress(progressHandler);

      await kit.compare({
        baseline: 'baseline-run',
        current: 'current-run',
      });

      expect(progressHandler).toHaveBeenCalled();
      expect(progressHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: expect.any(String),
        })
      );
    });
  });
});
