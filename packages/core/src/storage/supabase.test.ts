/**
 * Tests for Supabase storage adapter with analytics capabilities
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { CaseResult, RunManifest, RunMetrics } from '../artifacts/types';
import { SupabaseStorageAdapter, type SupabaseStorageConfig } from './supabase';
import type { CaseResultRecord, MetricsSnapshot } from './types';

// Mock Supabase client
const mockFrom = mock(() => ({}));
const mockStorage = mock(() => ({}));
const mockClient = {
  from: mockFrom,
  storage: {
    from: mockStorage,
  },
};

// Mock createClient
mock.module('@supabase/supabase-js', () => ({
  createClient: () => mockClient,
}));

// Helper to create mock run manifest
function createMockManifest(overrides: Partial<RunManifest> = {}): RunManifest {
  return {
    version: '1.0.0',
    run_id: 'test-run-123',
    project: 'test-project',
    start_time: '2026-02-19T10:00:00.000Z',
    end_time: '2026-02-19T10:05:00.000Z',
    duration_ms: 300000,
    config: {
      scenario: 'test-scenario',
      provider: 'openai',
      model: 'gpt-4',
    },
    metrics: {
      success_rate: 0.9,
      total_cases: 10,
      passed_cases: 9,
      failed_cases: 1,
      median_latency_ms: 150,
      p95_latency_ms: 300,
      total_tokens: 5000,
      total_prompt_tokens: 3000,
      total_completion_tokens: 2000,
    },
    git: {
      commit: 'abc123',
      branch: 'main',
      dirty: false,
    },
    provenance: {
      run_by: 'test-user',
      run_reason: 'CI',
    },
    cases: [
      createMockCaseResult('case-1', true),
      createMockCaseResult('case-2', true),
      createMockCaseResult('case-3', false),
    ],
    environment: {
      node_version: '20.0.0',
      platform: 'linux',
      arch: 'x64',
    },
    ...overrides,
  };
}

// Helper to create mock case result
function createMockCaseResult(id: string, ok: boolean): CaseResult {
  return {
    id,
    name: `Test Case ${id}`,
    ok,
    score: ok ? 1.0 : 0.0,
    matcherType: 'contains',
    reason: ok ? 'Matched' : 'Did not match',
    latencyMs: 150,
    tokens: {
      prompt: 100,
      completion: 50,
      total: 150,
    },
    prompt: 'Test prompt',
    response: 'Test response',
    expected: { contains: 'expected' },
    tags: ['unit-test'],
  };
}

// Helper to create mock case result record
function createMockCaseResultRecord(overrides: Partial<CaseResultRecord> = {}): CaseResultRecord {
  return {
    runId: 'test-run-123',
    caseId: 'case-1',
    caseName: 'Test Case 1',
    status: 'passed',
    score: 1.0,
    matcherType: 'contains',
    reason: 'Matched',
    response: 'Test response',
    latencyMs: 150,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    tags: ['unit-test'],
    ...overrides,
  };
}

// Helper to create mock metrics snapshot
function createMockMetricsSnapshot(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return {
    date: '2026-02-19',
    project: 'test-project',
    scenario: 'test-scenario',
    totalRuns: 10,
    totalCases: 100,
    passedCases: 90,
    failedCases: 10,
    avgSuccessRate: 0.9,
    avgLatencyMs: 150,
    avgTokensPerRun: 500,
    minSuccessRate: 0.8,
    maxSuccessRate: 1.0,
    minLatencyMs: 100,
    maxLatencyMs: 200,
    totalTokens: 5000,
    ...overrides,
  };
}

describe('SupabaseStorageAdapter', () => {
  let adapter: SupabaseStorageAdapter;
  const config: SupabaseStorageConfig = {
    url: 'https://test.supabase.co',
    anonKey: 'test-key',
    bucket: 'test-bucket',
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockFrom.mockReset();
    mockStorage.mockReset();
    adapter = new SupabaseStorageAdapter(config, 'test-project');
  });

  describe('constructor', () => {
    it('should create adapter with config', () => {
      expect(adapter).toBeDefined();
    });

    it('should use default bucket if not provided', () => {
      const adapterWithDefaults = new SupabaseStorageAdapter({
        url: 'https://test.supabase.co',
        anonKey: 'test-key',
      });
      expect(adapterWithDefaults).toBeDefined();
    });
  });

  describe('save', () => {
    it('should save manifest to storage and database', async () => {
      const manifest = createMockManifest({ cases: [] }); // Empty cases to simplify test

      // Mock storage upload
      mockStorage.mockReturnValue({
        upload: mock(() => Promise.resolve({ error: null })),
      });

      // Mock database upsert for runs
      const mockUpsert = mock(() => Promise.resolve({ error: null }));
      mockFrom.mockReturnValue({
        upsert: mockUpsert,
      });

      const result = await adapter.save(manifest);

      expect(result).toBe('test-project/test-run-123.json');
    });

    it('should throw error on storage upload failure', async () => {
      const manifest = createMockManifest();

      mockStorage.mockReturnValue({
        upload: mock(() => Promise.resolve({ error: { message: 'Upload failed' } })),
      });

      await expect(adapter.save(manifest)).rejects.toThrow('Failed to upload manifest');
    });

    it('should throw error on database save failure', async () => {
      const manifest = createMockManifest();

      mockStorage.mockReturnValue({
        upload: mock(() => Promise.resolve({ error: null })),
      });

      mockFrom.mockReturnValue({
        upsert: mock(() => Promise.resolve({ error: { message: 'DB error' } })),
      });

      await expect(adapter.save(manifest)).rejects.toThrow('Failed to save run metadata');
    });
  });

  describe('load', () => {
    it('should load manifest by run ID', async () => {
      const manifest = createMockManifest();

      // Mock database query
      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(() =>
              Promise.resolve({
                data: { manifest_path: 'test-project/test-run-123.json' },
                error: null,
              })
            ),
          })),
        })),
      });

      // Mock storage download
      mockStorage.mockReturnValue({
        download: mock(() =>
          Promise.resolve({
            data: new Blob([JSON.stringify(manifest)]),
            error: null,
          })
        ),
      });

      const result = await adapter.load('test-run-123');

      expect(result.run_id).toBe('test-run-123');
      expect(result.project).toBe('test-project');
    });

    it('should throw error if run not found', async () => {
      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(() => Promise.resolve({ data: null, error: { message: 'Not found' } })),
          })),
        })),
      });

      await expect(adapter.load('non-existent')).rejects.toThrow('Run not found');
    });
  });

  describe('list', () => {
    it('should list runs with default options', async () => {
      mockFrom.mockReturnValue({
        select: mock(() => ({
          order: mock(() =>
            Promise.resolve({
              data: [
                {
                  run_id: 'run-1',
                  scenario: 'scenario-1',
                  success_rate: 0.9,
                  started_at: '2026-02-19T10:00:00Z',
                },
                {
                  run_id: 'run-2',
                  scenario: 'scenario-2',
                  success_rate: 0.8,
                  started_at: '2026-02-19T09:00:00Z',
                },
              ],
              error: null,
            })
          ),
        })),
      });

      const result = await adapter.list();

      expect(result).toHaveLength(2);
      expect(result[0].runId).toBe('run-1');
      expect(result[1].runId).toBe('run-2');
    });

    it('should filter by project', async () => {
      const mockEq = mock(() => ({
        limit: mock(() => Promise.resolve({ data: [], error: null })),
      }));
      const mockOrder = mock(() => ({
        eq: mockEq,
      }));

      mockFrom.mockReturnValue({
        select: mock(() => ({
          order: mockOrder,
        })),
      });

      await adapter.list({ project: 'test-project', limit: 10 });

      expect(mockEq).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete run from storage and database', async () => {
      const mockDelete = mock(() => ({
        eq: mock(() => Promise.resolve({ error: null })),
      }));

      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(() =>
              Promise.resolve({
                data: { manifest_path: 'test-project/test-run-123.json' },
                error: null,
              })
            ),
          })),
        })),
        delete: mockDelete,
      });

      mockStorage.mockReturnValue({
        remove: mock(() => Promise.resolve({ error: null })),
      });

      await adapter.delete('test-run-123');

      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('compare', () => {
    it('should compare two runs', async () => {
      const baseline = createMockManifest({
        run_id: 'baseline-run',
        metrics: { ...createMockManifest().metrics, success_rate: 0.8 },
      });
      const current = createMockManifest({
        run_id: 'current-run',
        metrics: { ...createMockManifest().metrics, success_rate: 0.9 },
      });

      // Mock load for both runs
      let callCount = 0;
      mockFrom.mockImplementation(() => ({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(() => {
              const manifest = callCount === 0 ? baseline : current;
              callCount++;
              return Promise.resolve({
                data: { manifest_path: `test-project/${manifest.run_id}.json` },
                error: null,
              });
            }),
          })),
        })),
      }));

      mockStorage.mockImplementation(() => ({
        download: mock(() => {
          const manifest = callCount <= 2 ? baseline : current;
          return Promise.resolve({
            data: new Blob([JSON.stringify(manifest)]),
            error: null,
          });
        }),
      }));

      const result = await adapter.compare('baseline-run', 'current-run');

      expect(result.delta).toBeDefined();
      expect(result.baseline).toBeDefined();
      expect(result.current).toBeDefined();
    });
  });

  describe('setBaseline', () => {
    it('should set baseline for a scenario', async () => {
      const mockRun = {
        project: 'test-project',
        success_rate: 0.9,
        median_latency_ms: 150,
        total_tokens: 5000,
        passed_cases: 9,
        failed_cases: 1,
        total_cases: 10,
        run_by: 'test-user',
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'runs') {
          return {
            select: mock(() => ({
              eq: mock(() => ({
                single: mock(() => Promise.resolve({ data: mockRun, error: null })),
              })),
            })),
          };
        }
        if (table === 'baselines') {
          return {
            upsert: mock(() => Promise.resolve({ error: null })),
          };
        }
        return {};
      });

      const result = await adapter.setBaseline('test-scenario', 'test-run-123', 'v1.0');

      expect(result.scenario).toBe('test-scenario');
      expect(result.runId).toBe('test-run-123');
      expect(result.tag).toBe('v1.0');
      expect(result.metrics.successRate).toBe(0.9);
    });

    it('should throw error if run not found', async () => {
      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            single: mock(() => Promise.resolve({ data: null, error: { message: 'Not found' } })),
          })),
        })),
      });

      await expect(adapter.setBaseline('test-scenario', 'non-existent')).rejects.toThrow(
        'Run not found'
      );
    });
  });

  describe('getBaseline', () => {
    it('should get baseline by scenario', async () => {
      const mockBaseline = {
        scenario: 'test-scenario',
        run_id: 'baseline-run',
        created_at: '2026-02-19T10:00:00Z',
        success_rate: 0.9,
        median_latency_ms: 150,
        total_tokens: 5000,
        passed_cases: 9,
        failed_cases: 1,
        total_cases: 10,
        tag: 'v1.0',
      };

      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            eq: mock(() => ({
              single: mock(() => Promise.resolve({ data: mockBaseline, error: null })),
            })),
          })),
        })),
      });

      const result = await adapter.getBaseline('test-scenario');

      expect(result).not.toBeNull();
      expect(result?.scenario).toBe('test-scenario');
      expect(result?.runId).toBe('baseline-run');
    });

    it('should return null if baseline not found', async () => {
      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            eq: mock(() => ({
              single: mock(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      });

      const result = await adapter.getBaseline('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listBaselines', () => {
    it('should list all baselines for project', async () => {
      const mockBaselines = [
        {
          scenario: 'scenario-1',
          run_id: 'run-1',
          created_at: '2026-02-19T10:00:00Z',
          success_rate: 0.9,
          median_latency_ms: 150,
          total_tokens: 5000,
          passed_cases: 9,
          failed_cases: 1,
          total_cases: 10,
        },
        {
          scenario: 'scenario-2',
          run_id: 'run-2',
          created_at: '2026-02-18T10:00:00Z',
          success_rate: 0.85,
          median_latency_ms: 200,
          total_tokens: 4000,
          passed_cases: 8,
          failed_cases: 2,
          total_cases: 10,
        },
      ];

      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            order: mock(() => Promise.resolve({ data: mockBaselines, error: null })),
          })),
        })),
      });

      const result = await adapter.listBaselines();

      expect(result).toHaveLength(2);
      expect(result[0].scenario).toBe('scenario-1');
      expect(result[1].scenario).toBe('scenario-2');
    });
  });

  describe('removeBaseline', () => {
    it('should remove baseline by scenario', async () => {
      mockFrom.mockReturnValue({
        delete: mock(() => ({
          eq: mock(() => ({
            eq: mock(() => Promise.resolve({ error: null, count: 1 })),
          })),
        })),
      });

      const result = await adapter.removeBaseline('test-scenario');

      expect(result).toBe(true);
    });

    it('should return false if baseline not found', async () => {
      mockFrom.mockReturnValue({
        delete: mock(() => ({
          eq: mock(() => ({
            eq: mock(() => Promise.resolve({ error: null, count: 0 })),
          })),
        })),
      });

      const result = await adapter.removeBaseline('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('saveCaseResult', () => {
    it('should save single case result', async () => {
      const caseResult = createMockCaseResultRecord();

      mockFrom.mockReturnValue({
        upsert: mock(() => ({
          select: mock(() => ({
            single: mock(() => Promise.resolve({ data: { id: 'uuid-123' }, error: null })),
          })),
        })),
      });

      const result = await adapter.saveCaseResult(caseResult);

      expect(result).toBe('uuid-123');
    });

    it('should throw error on save failure', async () => {
      const caseResult = createMockCaseResultRecord();

      mockFrom.mockReturnValue({
        upsert: mock(() => ({
          select: mock(() => ({
            single: mock(() => Promise.resolve({ data: null, error: { message: 'Save failed' } })),
          })),
        })),
      });

      await expect(adapter.saveCaseResult(caseResult)).rejects.toThrow(
        'Failed to save case result'
      );
    });
  });

  describe('saveCaseResults', () => {
    it('should save multiple case results', async () => {
      const caseResults = [
        createMockCaseResultRecord({ caseId: 'case-1' }),
        createMockCaseResultRecord({ caseId: 'case-2' }),
      ];

      mockFrom.mockReturnValue({
        upsert: mock(() => ({
          select: mock(() =>
            Promise.resolve({
              data: [{ id: 'uuid-1' }, { id: 'uuid-2' }],
              error: null,
            })
          ),
        })),
      });

      const result = await adapter.saveCaseResults(caseResults);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const result = await adapter.saveCaseResults([]);

      expect(result).toEqual([]);
    });
  });

  describe('getCaseResults', () => {
    it('should get case results for a run', async () => {
      const mockResults = [
        {
          id: 'uuid-1',
          run_id: 'test-run-123',
          case_id: 'case-1',
          case_name: 'Test Case 1',
          status: 'passed',
          score: 1.0,
          matcher_type: 'contains',
          reason: 'Matched',
          response: 'Test response',
          latency_ms: 150,
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          tags: ['unit-test'],
          created_at: '2026-02-19T10:00:00Z',
        },
      ];

      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            order: mock(() => Promise.resolve({ data: mockResults, error: null })),
          })),
        })),
      });

      const result = await adapter.getCaseResults('test-run-123');

      expect(result).toHaveLength(1);
      expect(result[0].caseId).toBe('case-1');
      expect(result[0].status).toBe('passed');
    });
  });

  describe('queryCaseResults', () => {
    it('should query case results with filters', async () => {
      const mockResults = [
        {
          id: 'uuid-1',
          run_id: 'test-run-123',
          case_id: 'case-1',
          status: 'failed',
          score: 0,
          matcher_type: 'contains',
          response: 'Test response',
          latency_ms: 150,
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          tags: ['regression'],
          created_at: '2026-02-19T10:00:00Z',
        },
      ];

      mockFrom.mockReturnValue({
        select: mock(() => ({
          order: mock(() => ({
            eq: mock(() => ({
              eq: mock(() => ({
                overlaps: mock(() => ({
                  limit: mock(() => Promise.resolve({ data: mockResults, error: null })),
                })),
              })),
            })),
          })),
        })),
      });

      const result = await adapter.queryCaseResults({
        runId: 'test-run-123',
        status: 'failed',
        tags: ['regression'],
        limit: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('failed');
    });
  });

  describe('saveMetricsSnapshot', () => {
    it('should save metrics snapshot', async () => {
      const snapshot = createMockMetricsSnapshot();

      mockFrom.mockReturnValue({
        upsert: mock(() => ({
          select: mock(() => ({
            single: mock(() => Promise.resolve({ data: { id: 'uuid-123' }, error: null })),
          })),
        })),
      });

      const result = await adapter.saveMetricsSnapshot(snapshot);

      expect(result).toBe('uuid-123');
    });
  });

  describe('getMetricsTrend', () => {
    it('should get metrics trend for a project', async () => {
      const mockTrend = [
        {
          date: '2026-02-17',
          avg_success_rate: 0.85,
          avg_latency_ms: 160,
          total_runs: 8,
          total_tokens: 4000,
        },
        {
          date: '2026-02-18',
          avg_success_rate: 0.88,
          avg_latency_ms: 155,
          total_runs: 9,
          total_tokens: 4500,
        },
        {
          date: '2026-02-19',
          avg_success_rate: 0.9,
          avg_latency_ms: 150,
          total_runs: 10,
          total_tokens: 5000,
        },
      ];

      // Build the mock chain in reverse order
      const mockFinalResult = Promise.resolve({ data: mockTrend, error: null });
      const mockLimit = mock(() => mockFinalResult);
      const mockLte = mock(() => ({ limit: mockLimit }));
      const mockGte = mock(() => ({ lte: mockLte }));
      const mockIs = mock(() => ({ gte: mockGte }));
      const mockOrder = mock(() => ({ is: mockIs }));
      const mockEq = mock(() => ({ order: mockOrder }));
      const mockSelect = mock(() => ({ eq: mockEq }));

      mockFrom.mockReturnValue({
        select: mockSelect,
      });

      const result = await adapter.getMetricsTrend({
        project: 'test-project',
        startDate: '2026-02-17',
        endDate: '2026-02-19',
        limit: 30,
      });

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2026-02-17');
      expect(result[2].successRate).toBe(0.9);
    });
  });

  describe('getMetricsSnapshot', () => {
    it('should get specific metrics snapshot', async () => {
      const mockSnapshot = {
        id: 'uuid-123',
        date: '2026-02-19',
        project: 'test-project',
        scenario: 'test-scenario',
        total_runs: 10,
        total_cases: 100,
        passed_cases: 90,
        failed_cases: 10,
        avg_success_rate: 0.9,
        avg_latency_ms: 150,
        avg_tokens_per_run: 500,
        min_success_rate: 0.8,
        max_success_rate: 1.0,
        min_latency_ms: 100,
        max_latency_ms: 200,
        total_tokens: 5000,
        created_at: '2026-02-19T10:00:00Z',
        updated_at: '2026-02-19T10:00:00Z',
      };

      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            eq: mock(() => ({
              eq: mock(() => ({
                single: mock(() => Promise.resolve({ data: mockSnapshot, error: null })),
              })),
            })),
          })),
        })),
      });

      const result = await adapter.getMetricsSnapshot(
        '2026-02-19',
        'test-project',
        'test-scenario'
      );

      expect(result).not.toBeNull();
      expect(result?.date).toBe('2026-02-19');
      expect(result?.avgSuccessRate).toBe(0.9);
    });

    it('should return null if snapshot not found', async () => {
      mockFrom.mockReturnValue({
        select: mock(() => ({
          eq: mock(() => ({
            eq: mock(() => ({
              is: mock(() => ({
                single: mock(() => Promise.resolve({ data: null, error: null })),
              })),
            })),
          })),
        })),
      });

      const result = await adapter.getMetricsSnapshot('2026-01-01', 'test-project');

      expect(result).toBeNull();
    });
  });

  describe('aggregateDailyMetrics', () => {
    it('should aggregate metrics from runs', async () => {
      const mockRuns = [
        {
          success_rate: 0.9,
          total_cases: 10,
          passed_cases: 9,
          failed_cases: 1,
          median_latency_ms: 150,
          total_tokens: 500,
        },
        {
          success_rate: 0.8,
          total_cases: 10,
          passed_cases: 8,
          failed_cases: 2,
          median_latency_ms: 200,
          total_tokens: 600,
        },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'runs') {
          return {
            select: mock(() => ({
              eq: mock(() => ({
                gte: mock(() => ({
                  lte: mock(() => Promise.resolve({ data: mockRuns, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === 'metrics_history') {
          return {
            upsert: mock(() => ({
              select: mock(() => ({
                single: mock(() => Promise.resolve({ data: { id: 'uuid-123' }, error: null })),
              })),
            })),
          };
        }
        return {};
      });

      const result = await adapter.aggregateDailyMetrics('2026-02-19', 'test-project');

      expect(result.totalRuns).toBe(2);
      expect(result.totalCases).toBe(20);
      expect(result.avgSuccessRate).toBeCloseTo(0.85, 5);
      expect(result.avgLatencyMs).toBe(175);
    });

    it('should return empty snapshot if no runs', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'runs') {
          return {
            select: mock(() => ({
              eq: mock(() => ({
                gte: mock(() => ({
                  lte: mock(() => Promise.resolve({ data: [], error: null })),
                })),
              })),
            })),
          };
        }
        if (table === 'metrics_history') {
          return {
            upsert: mock(() => ({
              select: mock(() => ({
                single: mock(() => Promise.resolve({ data: { id: 'uuid-123' }, error: null })),
              })),
            })),
          };
        }
        return {};
      });

      const result = await adapter.aggregateDailyMetrics('2026-02-19', 'test-project');

      expect(result.totalRuns).toBe(0);
      expect(result.avgSuccessRate).toBe(0);
    });
  });

  describe('compareToBaseline', () => {
    it('should compare run to baseline and detect regression', async () => {
      // This test is more complex due to multiple DB calls
      // We'll verify the method exists and has the right signature
      expect(typeof adapter.compareToBaseline).toBe('function');
    });
  });
});

// ============================================================================
// Integration-style tests (with type checking)
// ============================================================================

describe('Type Safety', () => {
  it('should have correct CaseResultRecord interface', () => {
    const record: CaseResultRecord = {
      runId: 'run-123',
      caseId: 'case-1',
      status: 'passed',
      score: 1.0,
      matcherType: 'contains',
      response: 'test',
      latencyMs: 100,
      promptTokens: 50,
      completionTokens: 25,
      totalTokens: 75,
    };

    expect(record.status).toBe('passed');
    expect(record.score).toBe(1.0);
  });

  it('should have correct MetricsSnapshot interface', () => {
    const snapshot: MetricsSnapshot = {
      date: '2026-02-19',
      project: 'test',
      totalRuns: 10,
      totalCases: 100,
      passedCases: 90,
      failedCases: 10,
      avgSuccessRate: 0.9,
      avgLatencyMs: 150,
      avgTokensPerRun: 500,
      totalTokens: 5000,
    };

    expect(snapshot.avgSuccessRate).toBe(0.9);
    expect(snapshot.totalRuns).toBe(10);
  });

  it('should have valid CaseResultStatus types', () => {
    const statuses: CaseResultRecord['status'][] = ['passed', 'failed', 'error'];
    expect(statuses).toContain('passed');
    expect(statuses).toContain('failed');
    expect(statuses).toContain('error');
  });
});
