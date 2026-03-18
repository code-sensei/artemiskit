/**
 * Tests for SDK contract types and define* functions
 */

import { describe, expect, it } from 'bun:test';
import type { GenerateResult, ModelCapabilities } from '@artemiskit/core';
import { defineAdapter, defineEvaluator, definePlugin, defineStorage } from '../contracts';

describe('Contracts - defineAdapter', () => {
  it('should validate and return a valid adapter', () => {
    const adapter = defineAdapter({
      provider: 'test-provider',
      async generate(_options) {
        return {
          id: 'test-id',
          model: 'test-model',
          text: 'test response',
          tokens: { prompt: 10, completion: 20, total: 30 },
          latencyMs: 100,
        } as GenerateResult;
      },
      async capabilities() {
        return {
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 4096,
        } as ModelCapabilities;
      },
    });

    expect(adapter.provider).toBe('test-provider');
    expect(typeof adapter.generate).toBe('function');
    expect(typeof adapter.capabilities).toBe('function');
  });

  it('should throw if provider is missing', () => {
    expect(() =>
      defineAdapter({
        provider: '',
        async generate() {
          return {} as GenerateResult;
        },
        async capabilities() {
          return {} as ModelCapabilities;
        },
      })
    ).toThrow('Adapter must have a provider property');
  });

  it('should throw if generate is not a function', () => {
    expect(() =>
      defineAdapter({
        provider: 'test',
        generate: 'not a function' as unknown as () => Promise<GenerateResult>,
        async capabilities() {
          return {} as ModelCapabilities;
        },
      })
    ).toThrow('Adapter must have a generate method');
  });

  it('should throw if capabilities is not a function', () => {
    expect(() =>
      defineAdapter({
        provider: 'test',
        async generate() {
          return {} as GenerateResult;
        },
        capabilities: 'not a function' as unknown as () => Promise<ModelCapabilities>,
      })
    ).toThrow('Adapter must have a capabilities method');
  });

  it('should accept optional methods', () => {
    const adapter = defineAdapter({
      provider: 'full-adapter',
      async generate() {
        return {} as GenerateResult;
      },
      async capabilities() {
        return {} as ModelCapabilities;
      },
      async *stream(_options, _onChunk) {
        yield 'chunk1';
        yield 'chunk2';
      },
      async embed(_text) {
        return [0.1, 0.2, 0.3];
      },
      async close() {
        // Cleanup
      },
    });

    expect(adapter.stream).toBeDefined();
    expect(adapter.embed).toBeDefined();
    expect(adapter.close).toBeDefined();
  });
});

describe('Contracts - defineEvaluator', () => {
  it('should validate and return a valid evaluator', () => {
    const evaluator = defineEvaluator({
      type: 'custom-evaluator',
      async evaluate(_response, _expected, _context) {
        return {
          passed: true,
          score: 1.0,
          reason: 'Test passed',
        };
      },
    });

    expect(evaluator.type).toBe('custom-evaluator');
    expect(typeof evaluator.evaluate).toBe('function');
  });

  it('should throw if type is missing', () => {
    expect(() =>
      defineEvaluator({
        type: '',
        async evaluate() {
          return { passed: true, score: 1 };
        },
      })
    ).toThrow('Evaluator must have a type property');
  });

  it('should throw if evaluate is not a function', () => {
    expect(() =>
      defineEvaluator({
        type: 'test',
        evaluate: 'not a function' as unknown as () => Promise<{ passed: boolean; score: number }>,
      })
    ).toThrow('Evaluator must have an evaluate method');
  });

  it('should work with details in result', async () => {
    const evaluator = defineEvaluator({
      type: 'detailed-evaluator',
      async evaluate(response) {
        const wordCount = response.split(/\s+/).length;
        return {
          passed: wordCount > 5,
          score: Math.min(wordCount / 10, 1),
          reason: `Word count: ${wordCount}`,
          details: { wordCount, threshold: 5 },
        };
      },
    });

    const result = await evaluator.evaluate('This is a test response with many words', {} as any);
    expect(result.passed).toBe(true);
    expect(result.details).toBeDefined();
    expect(result.details?.wordCount).toBe(8); // "This is a test response with many words" = 8 words
  });
});

describe('Contracts - defineStorage', () => {
  it('should validate and return a valid storage adapter', () => {
    const storage = defineStorage({
      async save(manifest) {
        return manifest.run_id;
      },
      async load(_runId) {
        return {} as any;
      },
      async list(_options) {
        return [];
      },
      async delete(_runId) {
        // Delete implementation
      },
    });

    expect(typeof storage.save).toBe('function');
    expect(typeof storage.load).toBe('function');
    expect(typeof storage.list).toBe('function');
    expect(typeof storage.delete).toBe('function');
  });

  it('should throw if save is missing', () => {
    expect(() =>
      defineStorage({
        save: 'not a function' as any,
        async load() {
          return {} as any;
        },
        async list() {
          return [];
        },
        async delete() {},
      })
    ).toThrow('Storage must have a save method');
  });

  it('should throw if load is missing', () => {
    expect(() =>
      defineStorage({
        async save() {
          return 'id';
        },
        load: 'not a function' as any,
        async list() {
          return [];
        },
        async delete() {},
      })
    ).toThrow('Storage must have a load method');
  });

  it('should throw if list is missing', () => {
    expect(() =>
      defineStorage({
        async save() {
          return 'id';
        },
        async load() {
          return {} as any;
        },
        list: 'not a function' as any,
        async delete() {},
      })
    ).toThrow('Storage must have a list method');
  });

  it('should throw if delete is missing', () => {
    expect(() =>
      defineStorage({
        async save() {
          return 'id';
        },
        async load() {
          return {} as any;
        },
        async list() {
          return [];
        },
        delete: 'not a function' as any,
      })
    ).toThrow('Storage must have a delete method');
  });

  it('should accept optional compare method', () => {
    const storage = defineStorage({
      async save(manifest) {
        return manifest.run_id;
      },
      async load() {
        return {} as any;
      },
      async list() {
        return [];
      },
      async delete() {},
      async compare(_baselineId, _currentId) {
        return {} as any;
      },
    });

    expect(storage.compare).toBeDefined();
  });
});

describe('Contracts - definePlugin', () => {
  it('should validate and return a valid plugin', () => {
    const plugin = definePlugin({
      name: 'my-plugin',
      version: '1.0.0',
    });

    expect(plugin.name).toBe('my-plugin');
    expect(plugin.version).toBe('1.0.0');
  });

  it('should throw if name is missing', () => {
    expect(() =>
      definePlugin({
        name: '',
        version: '1.0.0',
      })
    ).toThrow('Plugin must have a name');
  });

  it('should throw if version is missing', () => {
    expect(() =>
      definePlugin({
        name: 'test-plugin',
        version: '',
      })
    ).toThrow('Plugin must have a version');
  });

  it('should accept optional lifecycle methods', () => {
    const plugin = definePlugin({
      name: 'full-plugin',
      version: '1.0.0',
      async init() {
        // Initialize
      },
      async cleanup() {
        // Cleanup
      },
    });

    expect(plugin.init).toBeDefined();
    expect(plugin.cleanup).toBeDefined();
  });

  it('should accept adapters, evaluators, and storage factories', () => {
    const plugin = definePlugin({
      name: 'extended-plugin',
      version: '1.0.0',
      adapters: {
        custom: async (_config) => ({
          provider: 'custom',
          async generate() {
            return {} as GenerateResult;
          },
          async capabilities() {
            return {} as ModelCapabilities;
          },
        }),
      },
      evaluators: {
        custom: (_config) => ({
          type: 'custom',
          async evaluate() {
            return { passed: true, score: 1 };
          },
        }),
      },
      storage: {
        custom: async (_config) => ({
          async save() {
            return 'id';
          },
          async load() {
            return {} as any;
          },
          async list() {
            return [];
          },
          async delete() {},
        }),
      },
    });

    expect(plugin.adapters).toBeDefined();
    expect(plugin.evaluators).toBeDefined();
    expect(plugin.storage).toBeDefined();
  });
});
