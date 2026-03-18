/**
 * @artemiskit/sdk
 * Contract types for custom implementations
 *
 * These types define the contracts that custom adapters, evaluators,
 * and storage backends must implement to integrate with ArtemisKit.
 */

import type {
  Evaluator,
  EvaluatorContext,
  EvaluatorResult,
  Expected,
  GenerateOptions,
  GenerateResult,
  ModelCapabilities,
  ModelClient,
  StorageAdapter,
} from '@artemiskit/core';

// ============================================================================
// Adapter Contract
// ============================================================================

/**
 * Contract for implementing custom model adapters
 *
 * @example
 * ```typescript
 * import { defineAdapter, type AdapterContract } from '@artemiskit/sdk'
 *
 * const myAdapter = defineAdapter({
 *   provider: 'my-provider',
 *   async generate(options) {
 *     // Implementation
 *     return { id: '...', model: '...', text: '...', tokens: {...}, latencyMs: 0 }
 *   },
 *   async capabilities() {
 *     return { streaming: false, functionCalling: false, toolUse: false, maxContext: 4096 }
 *   }
 * })
 * ```
 */
export interface AdapterContract extends ModelClient {
  /**
   * Provider identifier - must be unique
   */
  readonly provider: string;

  /**
   * Generate a completion from the model
   */
  generate(options: GenerateOptions): Promise<GenerateResult>;

  /**
   * Get the capabilities of this adapter
   */
  capabilities(): Promise<ModelCapabilities>;

  /**
   * Optional: Stream a completion from the model
   */
  stream?(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string>;

  /**
   * Optional: Generate embeddings
   */
  embed?(text: string, model?: string): Promise<number[]>;

  /**
   * Optional: Close/cleanup resources
   */
  close?(): Promise<void>;
}

/**
 * Define a custom adapter with type checking
 *
 * @example
 * ```typescript
 * const myAdapter = defineAdapter({
 *   provider: 'my-llm',
 *   async generate(options) {
 *     const response = await myLLMClient.complete(options.prompt)
 *     return {
 *       id: response.id,
 *       model: 'my-model',
 *       text: response.text,
 *       tokens: { prompt: 0, completion: 0, total: 0 },
 *       latencyMs: response.duration
 *     }
 *   },
 *   async capabilities() {
 *     return { streaming: true, functionCalling: false, toolUse: false, maxContext: 8192 }
 *   }
 * })
 * ```
 */
export function defineAdapter<T extends AdapterContract>(adapter: T): T {
  // Validate required methods
  if (!adapter.provider) {
    throw new Error('Adapter must have a provider property');
  }
  if (typeof adapter.generate !== 'function') {
    throw new Error('Adapter must have a generate method');
  }
  if (typeof adapter.capabilities !== 'function') {
    throw new Error('Adapter must have a capabilities method');
  }
  return adapter;
}

// ============================================================================
// Evaluator Contract
// ============================================================================

/**
 * Contract for implementing custom evaluators
 *
 * @example
 * ```typescript
 * import { defineEvaluator, type EvaluatorContract } from '@artemiskit/sdk'
 *
 * const customEvaluator = defineEvaluator({
 *   type: 'custom-semantic',
 *   async evaluate(response, expected, context) {
 *     // Custom evaluation logic
 *     const score = calculateSemanticScore(response, expected.value)
 *     return { passed: score > 0.8, score, reason: `Semantic score: ${score}` }
 *   }
 * })
 * ```
 */
export interface EvaluatorContract extends Evaluator {
  /**
   * Unique type identifier for this evaluator
   */
  readonly type: string;

  /**
   * Evaluate a response against expected criteria
   *
   * @param response - The model's response text
   * @param expected - The expected result configuration
   * @param context - Optional context including model client and test case
   * @returns Evaluation result with pass/fail, score, and reason
   */
  evaluate(
    response: string,
    expected: Expected,
    context?: EvaluatorContext
  ): Promise<EvaluatorResult>;
}

/**
 * Define a custom evaluator with type checking
 *
 * @example
 * ```typescript
 * const wordCountEvaluator = defineEvaluator({
 *   type: 'word-count',
 *   async evaluate(response, expected, _context) {
 *     const wordCount = response.split(/\s+/).length
 *     const targetCount = (expected as any).wordCount ?? 100
 *     const tolerance = (expected as any).tolerance ?? 10
 *
 *     const diff = Math.abs(wordCount - targetCount)
 *     const passed = diff <= tolerance
 *     const score = passed ? 1 : Math.max(0, 1 - diff / targetCount)
 *
 *     return {
 *       passed,
 *       score,
 *       reason: `Word count: ${wordCount}, target: ${targetCount} (±${tolerance})`,
 *       details: { wordCount, targetCount, tolerance, diff }
 *     }
 *   }
 * })
 * ```
 */
export function defineEvaluator<T extends EvaluatorContract>(evaluator: T): T {
  // Validate required properties
  if (!evaluator.type) {
    throw new Error('Evaluator must have a type property');
  }
  if (typeof evaluator.evaluate !== 'function') {
    throw new Error('Evaluator must have an evaluate method');
  }
  return evaluator;
}

// ============================================================================
// Storage Contract
// ============================================================================

/**
 * Contract for implementing custom storage adapters
 *
 * **IMPORTANT: Sort Order Requirement**
 *
 * The `list()` method MUST return results sorted by `startTime` in descending order
 * (most recent first). This is required by `ArtemisKit.compare()` when using
 * `baseline: 'latest'` - it relies on `list({ limit: 1 })[0]` being the most recent run.
 *
 * If your storage backend doesn't natively support this sort order, you must
 * implement sorting in the adapter's `list()` method.
 *
 * @example
 * ```typescript
 * import { defineStorage, type StorageContract } from '@artemiskit/sdk'
 *
 * const redisStorage = defineStorage({
 *   async save(manifest) {
 *     await redis.set(`run:${manifest.run_id}`, JSON.stringify(manifest))
 *     return manifest.run_id
 *   },
 *   async load(runId) {
 *     const data = await redis.get(`run:${runId}`)
 *     return JSON.parse(data)
 *   },
 *   async list(options) {
 *     // IMPORTANT: Results must be sorted by startTime descending (most recent first)
 *     const runs = await this.getAllRuns()
 *     runs.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
 *     return runs.slice(0, options?.limit ?? runs.length)
 *   },
 *   async delete(runId) {
 *     await redis.del(`run:${runId}`)
 *   }
 * })
 * ```
 */
export interface StorageContract extends StorageAdapter {}

/**
 * Define a custom storage adapter with type checking
 *
 * @example
 * ```typescript
 * const s3Storage = defineStorage({
 *   async save(manifest) {
 *     const key = `runs/${manifest.run_id}.json`
 *     await s3.putObject({ Bucket: 'my-bucket', Key: key, Body: JSON.stringify(manifest) })
 *     return manifest.run_id
 *   },
 *   async load(runId) {
 *     const key = `runs/${runId}.json`
 *     const { Body } = await s3.getObject({ Bucket: 'my-bucket', Key: key })
 *     return JSON.parse(Body)
 *   },
 *   async list(options) {
 *     // List objects from S3
 *     return []
 *   },
 *   async delete(runId) {
 *     const key = `runs/${runId}.json`
 *     await s3.deleteObject({ Bucket: 'my-bucket', Key: key })
 *   }
 * })
 * ```
 */
export function defineStorage<T extends StorageContract>(storage: T): T {
  // Validate required methods
  if (typeof storage.save !== 'function') {
    throw new Error('Storage must have a save method');
  }
  if (typeof storage.load !== 'function') {
    throw new Error('Storage must have a load method');
  }
  if (typeof storage.list !== 'function') {
    throw new Error('Storage must have a list method');
  }
  if (typeof storage.delete !== 'function') {
    throw new Error('Storage must have a delete method');
  }
  return storage;
}

// ============================================================================
// Factory Types
// ============================================================================

/**
 * Factory function type for creating adapters
 */
export type AdapterFactory<TConfig = unknown> = (
  config: TConfig
) => AdapterContract | Promise<AdapterContract>;

/**
 * Factory function type for creating evaluators
 */
export type EvaluatorFactory<TConfig = unknown> = (config: TConfig) => EvaluatorContract;

/**
 * Factory function type for creating storage adapters
 */
export type StorageFactory<TConfig = unknown> = (
  config: TConfig
) => StorageContract | Promise<StorageContract>;

// ============================================================================
// Plugin System Types
// ============================================================================

/**
 * Plugin interface for extending ArtemisKit
 */
export interface ArtemisKitPlugin {
  /**
   * Plugin name (unique identifier)
   */
  name: string;

  /**
   * Plugin version
   */
  version: string;

  /**
   * Optional: Custom adapters to register
   */
  adapters?: Record<string, AdapterFactory>;

  /**
   * Optional: Custom evaluators to register
   */
  evaluators?: Record<string, EvaluatorFactory>;

  /**
   * Optional: Custom storage adapters to register
   */
  storage?: Record<string, StorageFactory>;

  /**
   * Optional: Initialize the plugin
   */
  init?(): Promise<void>;

  /**
   * Optional: Cleanup the plugin
   */
  cleanup?(): Promise<void>;
}

/**
 * Define a plugin with type checking
 */
export function definePlugin(plugin: ArtemisKitPlugin): ArtemisKitPlugin {
  if (!plugin.name) {
    throw new Error('Plugin must have a name');
  }
  if (!plugin.version) {
    throw new Error('Plugin must have a version');
  }
  return plugin;
}
