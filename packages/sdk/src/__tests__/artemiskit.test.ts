/**
 * @artemiskit/sdk
 * Tests for ArtemisKit class
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock modules before importing ArtemisKit
vi.mock('@artemiskit/core', () => ({
  createAdapter: vi.fn().mockResolvedValue({
    provider: 'mock',
    generate: vi.fn().mockResolvedValue({
      id: 'test-id',
      model: 'mock-model',
      text: 'Hello, world!',
      tokens: { prompt: 10, completion: 5, total: 15 },
      latencyMs: 100,
      finishReason: 'stop',
    }),
    capabilities: vi.fn().mockResolvedValue({
      streaming: false,
      functionCalling: false,
      toolUse: false,
      maxContext: 4096,
    }),
    close: vi.fn(),
  }),
  parseScenarioFile: vi.fn().mockResolvedValue({
    name: 'Test Scenario',
    version: '1.0',
    model: 'mock-model',
    cases: [
      {
        id: 'case-1',
        name: 'Test Case 1',
        prompt: 'Say hello',
        expected: { type: 'contains', values: ['Hello'], mode: 'any' },
        tags: ['greeting'],
        metadata: {},
        retries: 0,
      },
      {
        id: 'case-2',
        name: 'Test Case 2',
        prompt: 'Say goodbye',
        expected: { type: 'contains', values: ['Goodbye'], mode: 'any' },
        tags: ['farewell'],
        metadata: {},
        retries: 0,
      },
    ],
    tags: [],
  }),
  // biome-ignore lint/suspicious/noExplicitAny: Mock helper
  runScenario: vi.fn().mockImplementation(async (options: any) => {
    const cases = options.scenario.cases;
    // biome-ignore lint/suspicious/noExplicitAny: Mock helper
    const results = cases.map((c: any, i: number) => {
      const result = {
        id: c.id,
        name: c.name,
        ok: true,
        score: 1,
        matcherType: c.expected.type,
        reason: 'Passed',
        latencyMs: 100 + i * 10,
        tokens: { prompt: 10, completion: 5, total: 15 },
        prompt: c.prompt,
        response: 'Hello, world!',
        expected: c.expected,
        tags: c.tags,
      };
      options.onCaseComplete?.(result, i, cases.length);
      return result;
    });

    return {
      manifest: {
        version: '1.0',
        run_id: 'test-run-id',
        project: options.project || 'default',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        duration_ms: 200,
        config: {
          scenario: options.scenario.name,
          provider: 'mock',
          model: 'mock-model',
        },
        metrics: {
          success_rate: 1,
          total_cases: cases.length,
          passed_cases: cases.length,
          failed_cases: 0,
          median_latency_ms: 105,
          p95_latency_ms: 110,
          total_tokens: 30,
          total_prompt_tokens: 20,
          total_completion_tokens: 10,
        },
        git: {
          commit: 'abc123',
          branch: 'main',
          dirty: false,
        },
        provenance: {
          run_by: 'test',
        },
        cases: results,
        environment: {
          node_version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      },
      cases: results,
      success: true,
    };
  }),
  getGitInfo: vi.fn().mockResolvedValue({
    commit: 'abc123',
    branch: 'main',
    dirty: false,
  }),
  estimateCost: vi.fn(),
  formatCost: vi.fn(),
  getModelPricing: vi.fn(),
}));

vi.mock('@artemiskit/redteam', () => {
  return {
    TypoMutation: class {
      name = 'typo';
      description = 'Typo mutation';
      severity = 'low' as const;
      mutate(prompt: string) {
        return `typo: ${prompt}`;
      }
    },
    RoleSpoofMutation: class {
      name = 'role-spoof';
      description = 'Role spoof mutation';
      severity = 'medium' as const;
      mutate(prompt: string) {
        return `role: ${prompt}`;
      }
    },
    InstructionFlipMutation: class {
      name = 'instruction-flip';
      description = 'Instruction flip mutation';
      severity = 'medium' as const;
      mutate(prompt: string) {
        return `flip: ${prompt}`;
      }
    },
    CotInjectionMutation: class {
      name = 'cot-injection';
      description = 'COT injection mutation';
      severity = 'high' as const;
      mutate(prompt: string) {
        return `cot: ${prompt}`;
      }
    },
    EncodingMutation: class {
      name = 'encoding';
      description = 'Encoding mutation';
      severity = 'medium' as const;
      mutate(prompt: string) {
        return `enc: ${prompt}`;
      }
    },
    MultiTurnMutation: class {
      name = 'multi-turn';
      description = 'Multi-turn mutation';
      severity = 'high' as const;
      mutate(prompt: string) {
        return `multi: ${prompt}`;
      }
    },
    RedTeamGenerator: class {
      // biome-ignore lint/suspicious/noExplicitAny: Mock helper
      mutations: any[];
      // biome-ignore lint/suspicious/noExplicitAny: Mock helper
      constructor(mutations?: any[]) {
        this.mutations = mutations ?? [];
      }
      generate(prompt: string, count: number) {
        return Array.from({ length: count }, (_, i) => ({
          original: prompt,
          mutated: `mutated-${i}: ${prompt}`,
          mutations: ['typo'],
          severity: 'low' as const,
        }));
      }
      listMutations() {
        // biome-ignore lint/suspicious/noExplicitAny: Mock helper
        return this.mutations.map((m: any) => ({
          name: m.name,
          description: m.description,
          severity: m.severity,
        }));
      }
    },
    UnsafeResponseDetector: class {
      detect() {
        return { unsafe: false, blocked: false, reasons: [], severity: 'none' };
      }
    },
    SeverityMapper: class {
      mapMutationToSeverity() {
        return 'none';
      }
    },
  };
});

vi.mock('nanoid', () => ({
  nanoid: () => 'test-id-12345',
}));

// Import after mocks are set up
import { ArtemisKit } from '../artemiskit';

describe('ArtemisKit', () => {
  let kit: ArtemisKit;

  beforeEach(() => {
    kit = new ArtemisKit({
      project: 'test-project',
      provider: 'openai',
      model: 'gpt-4',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const defaultKit = new ArtemisKit();
      expect(defaultKit).toBeInstanceOf(ArtemisKit);
    });

    it('should create instance with custom config', () => {
      const customKit = new ArtemisKit({
        project: 'my-project',
        provider: 'azure-openai',
        model: 'gpt-4-turbo',
        timeout: 30000,
        retries: 3,
        concurrency: 5,
      });
      expect(customKit).toBeInstanceOf(ArtemisKit);
    });
  });

  describe('event handling', () => {
    it('should register and emit caseComplete events', async () => {
      const handler = vi.fn();
      kit.onCaseComplete(handler);

      await kit.run({ scenario: './test.yaml' });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          result: expect.objectContaining({ id: 'case-1' }),
          index: 0,
          total: 2,
        })
      );
    });

    it('should register and emit progress events', async () => {
      const handler = vi.fn();
      kit.onProgress(handler);

      await kit.run({ scenario: './test.yaml' });

      expect(handler).toHaveBeenCalled();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: expect.stringMatching(/setup|running|teardown/),
        })
      );
    });

    it('should support once() for one-time handlers', async () => {
      const handler = vi.fn();
      kit.once('progress', handler);

      await kit.run({ scenario: './test.yaml' });

      // Handler should have been called only once despite multiple progress events
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support off() to remove handlers', async () => {
      const handler = vi.fn();
      kit.on('progress', handler);
      kit.off('progress', handler);

      await kit.run({ scenario: './test.yaml' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should chain event registration methods', () => {
      const result = kit
        .onCaseStart(() => {})
        .onCaseComplete(() => {})
        .onProgress(() => {});

      expect(result).toBe(kit);
    });
  });

  describe('run()', () => {
    it('should run a scenario from file path', async () => {
      const result = await kit.run({ scenario: './test.yaml' });

      expect(result.success).toBe(true);
      expect(result.manifest.metrics.total_cases).toBe(2);
      expect(result.manifest.metrics.passed_cases).toBe(2);
    });

    it('should run a scenario from inline object', async () => {
      const scenario = {
        name: 'Inline Scenario',
        version: '1.0',
        model: 'gpt-4',
        cases: [
          {
            id: 'inline-1',
            name: 'Inline Test',
            prompt: 'Hello',
            expected: {
              type: 'contains' as const,
              values: ['Hello'],
              mode: 'any' as const,
            },
            tags: [],
            metadata: {},
            retries: 0,
          },
        ],
        tags: [],
      };

      const result = await kit.run({ scenario });

      expect(result.success).toBe(true);
    });

    it('should pass tags filter to runner', async () => {
      const result = await kit.run({
        scenario: './test.yaml',
        tags: ['greeting'],
      });

      expect(result.success).toBe(true);
    });

    it('should use custom concurrency', async () => {
      const result = await kit.run({
        scenario: './test.yaml',
        concurrency: 5,
      });

      expect(result.success).toBe(true);
    });

    it('should use custom timeout', async () => {
      const result = await kit.run({
        scenario: './test.yaml',
        timeout: 60000,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getAvailableMutations()', () => {
    it('should return list of available mutations', () => {
      const mutations = kit.getAvailableMutations();

      expect(Array.isArray(mutations)).toBe(true);
      expect(mutations).toContain('typo');
      expect(mutations).toContain('role-spoof');
      expect(mutations).toContain('encoding');
    });
  });
});

describe('ArtemisKit with custom client', () => {
  it('should use provided client instead of creating one', async () => {
    const mockClient = {
      provider: 'custom',
      generate: vi.fn().mockResolvedValue({
        id: 'custom-id',
        model: 'custom-model',
        text: 'Custom response',
        tokens: { prompt: 5, completion: 3, total: 8 },
        latencyMs: 50,
        finishReason: 'stop',
      }),
      capabilities: vi.fn().mockResolvedValue({
        streaming: false,
        functionCalling: false,
        toolUse: false,
        maxContext: 4096,
      }),
    };

    const kit = new ArtemisKit();
    const result = await kit.run({
      scenario: './test.yaml',
      // @ts-expect-error - Testing with mock client
      client: mockClient,
    });

    expect(result.success).toBe(true);
  });
});
