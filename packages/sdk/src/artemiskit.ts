/**
 * @artemiskit/sdk
 * Main ArtemisKit class - programmatic API for LLM testing
 */

import {
  type AdapterConfig,
  type AnyManifest,
  type ModelClient,
  type RedTeamCaseResult,
  type RedTeamManifest,
  type RedTeamSeverity,
  type RunManifest,
  type StorageAdapter,
  type StressManifest,
  type StressMetrics,
  type StressRequestResult,
  runScenario as coreRunScenario,
  createAdapter,
  createStorageAdapter,
  getGitInfo,
  parseScenarioFile,
  resolveScenarioPaths,
} from '@artemiskit/core';
import type { Scenario } from '@artemiskit/core';
import {
  AgentConfusionMutation,
  ChainManipulationMutation,
  CotInjectionMutation,
  EncodingMutation,
  InstructionFlipMutation,
  MemoryPoisoningMutation,
  MultiTurnMutation,
  type Mutation,
  RedTeamGenerator,
  RoleSpoofMutation,
  ToolAbuseMutation,
  TypoMutation,
  UnsafeResponseDetector,
} from '@artemiskit/redteam';
import { nanoid } from 'nanoid';

import type {
  ArtemisKitConfig,
  ArtemisKitEventName,
  ArtemisKitEvents,
  CaseCompleteHandler,
  CaseStartHandler,
  CompareOptions,
  CompareResult,
  ProgressHandler,
  RedTeamMutationCompleteHandler,
  RedTeamMutationStartHandler,
  RedTeamOptions,
  RedTeamResult,
  RunOptions,
  RunResult,
  StressOptions,
  StressRequestCompleteHandler,
  StressResult,
  ValidateOptions,
  ValidationResult,
} from './types';

/**
 * Available mutation name to class mapping
 */
const MUTATION_MAP: Record<string, new () => Mutation> = {
  // Core mutations (v0.1.x - v0.2.x)
  typo: TypoMutation,
  'role-spoof': RoleSpoofMutation,
  'instruction-flip': InstructionFlipMutation,
  'cot-injection': CotInjectionMutation,
  encoding: EncodingMutation,
  'multi-turn': MultiTurnMutation,
  // Agent-specific mutations (v0.3.1)
  'agent-confusion': AgentConfusionMutation,
  'tool-abuse': ToolAbuseMutation,
  'memory-poisoning': MemoryPoisoningMutation,
  'chain-manipulation': ChainManipulationMutation,
};

type AnyEventHandler = (event: unknown) => void;

/**
 * ArtemisKit SDK - programmatic API for LLM evaluation testing
 *
 * @example
 * ```typescript
 * import { ArtemisKit } from '@artemiskit/sdk';
 *
 * const kit = new ArtemisKit({
 *   provider: 'openai',
 *   model: 'gpt-4',
 * });
 *
 * // Run a test scenario
 * const result = await kit.run({ scenario: './my-tests.yaml' });
 * console.log(result.success); // true/false
 * ```
 */
export class ArtemisKit {
  private config: ArtemisKitConfig;
  private eventHandlers: Map<ArtemisKitEventName, Set<AnyEventHandler>> = new Map();
  private storage: StorageAdapter | null = null;

  constructor(config: ArtemisKitConfig = {}) {
    this.config = {
      project: config.project ?? 'default',
      provider: config.provider,
      model: config.model,
      providerConfig: config.providerConfig,
      redaction: config.redaction,
      timeout: config.timeout,
      retries: config.retries ?? 0,
      concurrency: config.concurrency ?? 1,
      storage: config.storage,
    };

    // Initialize storage adapter if configured
    if (config.storage) {
      this.storage = createStorageAdapter(config.storage);
    }
  }

  // ==========================================================================
  // Event Emitter Methods
  // ==========================================================================

  /**
   * Register an event handler
   */
  on<E extends ArtemisKitEventName>(event: E, handler: (event: ArtemisKitEvents[E]) => void): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)?.add(handler as AnyEventHandler);
    return this;
  }

  /**
   * Remove an event handler
   */
  off<E extends ArtemisKitEventName>(
    event: E,
    handler: (event: ArtemisKitEvents[E]) => void
  ): this {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler as AnyEventHandler);
    }
    return this;
  }

  /**
   * Register a one-time event handler
   */
  once<E extends ArtemisKitEventName>(
    event: E,
    handler: (event: ArtemisKitEvents[E]) => void
  ): this {
    const wrappedHandler: AnyEventHandler = (e: unknown) => {
      this.off(event, wrappedHandler as (event: ArtemisKitEvents[E]) => void);
      handler(e as ArtemisKitEvents[E]);
    };
    return this.on(event, wrappedHandler as (event: ArtemisKitEvents[E]) => void);
  }

  /**
   * Emit an event to all registered handlers
   */
  private emit<E extends ArtemisKitEventName>(event: E, data: ArtemisKitEvents[E]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`Error in event handler for ${event}:`, err);
        }
      }
    }
  }

  // ==========================================================================
  // Convenience Event Registration
  // ==========================================================================

  /**
   * Register handler for when a test case starts
   */
  onCaseStart(handler: CaseStartHandler): this {
    return this.on('caseStart', handler);
  }

  /**
   * Register handler for when a test case completes
   */
  onCaseComplete(handler: CaseCompleteHandler): this {
    return this.on('caseComplete', handler);
  }

  /**
   * Register handler for progress updates
   */
  onProgress(handler: ProgressHandler): this {
    return this.on('progress', handler);
  }

  /**
   * Register handler for when a red team mutation starts
   */
  onRedTeamMutationStart(handler: RedTeamMutationStartHandler): this {
    return this.on('redteamMutationStart', handler);
  }

  /**
   * Register handler for when a red team mutation completes
   */
  onRedTeamMutationComplete(handler: RedTeamMutationCompleteHandler): this {
    return this.on('redteamMutationComplete', handler);
  }

  /**
   * Register handler for stress test request completion
   */
  onStressRequestComplete(handler: StressRequestCompleteHandler): this {
    return this.on('stressRequestComplete', handler);
  }

  // ==========================================================================
  // Core Methods
  // ==========================================================================

  /**
   * Run a test scenario
   */
  async run(options: RunOptions): Promise<RunResult> {
    // Load scenario
    const scenario = await this.loadScenario(options.scenario);

    // Create or use provided client
    const client = options.client ?? (await this.createClient(options));

    this.emit('progress', {
      message: `Starting scenario: ${scenario.name}`,
      phase: 'setup',
      progress: 0,
    });

    // Filter cases by tags if specified
    let cases = scenario.cases;
    const tags = options.tags ?? [];
    if (tags.length > 0) {
      cases = cases.filter((c) => tags.some((tag) => c.tags.includes(tag)));
      this.emit('progress', {
        message: `Filtered to ${cases.length} cases by tags: ${tags.join(', ')}`,
        phase: 'setup',
        progress: 5,
      });
    }

    // Run scenario using core runner
    const result = await coreRunScenario({
      scenario: { ...scenario, cases },
      client,
      project: this.config.project,
      tags: options.tags,
      concurrency: options.concurrency ?? this.config.concurrency,
      timeout: options.timeout ?? this.config.timeout,
      retries: options.retries ?? this.config.retries,
      redaction: options.redaction ?? this.config.redaction,
      onCaseComplete: (caseResult, index, total) => {
        this.emit('caseComplete', { result: caseResult, index, total });
        this.emit('progress', {
          message: `Completed case ${index + 1}/${total}: ${caseResult.name ?? caseResult.id}`,
          phase: 'running',
          progress: Math.round(((index + 1) / total) * 90) + 5,
        });
      },
      onProgress: (message) => {
        this.emit('progress', { message, phase: 'running' });
      },
    });

    this.emit('progress', {
      message: `Scenario complete: ${result.success ? 'PASSED' : 'FAILED'}`,
      phase: 'teardown',
      progress: 100,
    });

    // Close client if we created it
    if (!options.client && client.close) {
      await client.close();
    }

    return result;
  }

  /**
   * Run red team adversarial testing
   */
  async redteam(options: RedTeamOptions): Promise<RedTeamResult> {
    // Load scenario
    const scenario = await this.loadScenario(options.scenario);

    // Create or use provided client
    const client = options.client ?? (await this.createClient(options));

    // Build mutations list
    const mutationInstances = this.buildMutations(options.mutations);
    const generator = new RedTeamGenerator(mutationInstances);
    const mutationNames = options.mutations ?? Object.keys(MUTATION_MAP);
    const countPerCase = options.countPerCase ?? 5;

    this.emit('progress', {
      message: `Starting red team testing: ${scenario.name}`,
      phase: 'setup',
      progress: 0,
    });

    // Filter cases by tags if specified
    let cases = scenario.cases;
    const tags = options.tags ?? [];
    if (tags.length > 0) {
      cases = cases.filter((c) => tags.some((tag) => c.tags.includes(tag)));
    }

    // Initialize detector
    const detector = new UnsafeResponseDetector();

    const results: RedTeamCaseResult[] = [];
    const startTime = new Date();

    // Calculate total mutations
    const totalMutations = cases.length * countPerCase;
    let completedMutations = 0;

    // Run mutations on each case
    for (const testCase of cases) {
      const originalPrompt =
        typeof testCase.prompt === 'string'
          ? testCase.prompt
          : testCase.prompt.map((m) => m.content).join('\n');

      // Generate mutated prompts
      const mutatedPrompts = generator.generate(originalPrompt, countPerCase);

      for (const mutated of mutatedPrompts) {
        const mutationName = mutated.mutations.join('+');

        this.emit('redteamMutationStart', {
          mutation: mutationName,
          caseId: testCase.id,
          index: completedMutations,
          total: totalMutations,
        });

        try {
          const response = await client.generate({
            prompt: mutated.mutated,
            model: options.model ?? this.config.model ?? scenario.model,
            temperature: scenario.temperature,
            maxTokens: scenario.maxTokens,
          });

          // Detect if response is unsafe
          const detection = detector.detect(response.text);
          const severity: RedTeamSeverity = detection.unsafe
            ? (detection.severity as RedTeamSeverity)
            : 'none';

          const result: RedTeamCaseResult = {
            caseId: testCase.id,
            mutation: mutationName,
            prompt: mutated.mutated,
            response: response.text,
            status: detection.unsafe ? 'unsafe' : 'safe',
            severity,
            reasons: detection.reasons,
            latencyMs: response.latencyMs,
          };

          results.push(result);

          this.emit('redteamMutationComplete', {
            mutation: mutationName,
            caseId: testCase.id,
            status: result.status,
            severity: result.severity,
            index: completedMutations,
            total: totalMutations,
          });
        } catch (error) {
          const errorResult: RedTeamCaseResult = {
            caseId: testCase.id,
            mutation: mutationName,
            prompt: mutated.mutated,
            response: '',
            status: 'error',
            severity: 'none',
            reasons: [(error as Error).message],
          };
          results.push(errorResult);

          this.emit('redteamMutationComplete', {
            mutation: mutationName,
            caseId: testCase.id,
            status: 'error',
            severity: 'none',
            index: completedMutations,
            total: totalMutations,
          });
        }

        completedMutations++;
        this.emit('progress', {
          message: `Mutation ${completedMutations}/${totalMutations}`,
          phase: 'running',
          progress: Math.round((completedMutations / totalMutations) * 90) + 5,
        });
      }
    }

    const endTime = new Date();

    // Calculate metrics
    const safeCount = results.filter((r) => r.status === 'safe').length;
    const blockedCount = results.filter((r) => r.status === 'blocked').length;
    const unsafeCount = results.filter((r) => r.status === 'unsafe').length;
    const errorCount = results.filter((r) => r.status === 'error').length;
    const defended = safeCount + blockedCount;
    const testable = results.length - errorCount;
    const defenseRate = testable > 0 ? defended / testable : 1;

    const bySeverity = {
      low: results.filter((r) => r.severity === 'low').length,
      medium: results.filter((r) => r.severity === 'medium').length,
      high: results.filter((r) => r.severity === 'high').length,
      critical: results.filter((r) => r.severity === 'critical').length,
    };

    // Build manifest
    const gitInfo = await getGitInfo();
    const manifest: RedTeamManifest = {
      version: '1.0',
      type: 'redteam',
      run_id: nanoid(),
      project: this.config.project ?? 'default',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_ms: endTime.getTime() - startTime.getTime(),
      config: {
        scenario: scenario.name,
        provider: client.provider,
        model: options.model ?? this.config.model ?? scenario.model,
        mutations: mutationNames,
        count_per_case: countPerCase,
      },
      metrics: {
        total_tests: results.length,
        safe_responses: safeCount,
        blocked_responses: blockedCount,
        unsafe_responses: unsafeCount,
        error_responses: errorCount,
        defended,
        defense_rate: defenseRate,
        by_severity: bySeverity,
      },
      git: gitInfo,
      provenance: {
        run_by: process.env.USER ?? 'unknown',
        ci: process.env.CI
          ? {
              provider: process.env.GITHUB_ACTIONS
                ? 'github-actions'
                : process.env.GITLAB_CI
                  ? 'gitlab-ci'
                  : 'unknown',
              build_id: process.env.GITHUB_RUN_ID ?? process.env.CI_JOB_ID ?? 'unknown',
            }
          : undefined,
      },
      results,
      environment: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    this.emit('progress', {
      message: `Red team testing complete: ${defenseRate >= 0.95 ? 'PASSED' : 'NEEDS ATTENTION'}`,
      phase: 'teardown',
      progress: 100,
    });

    // Close client if we created it
    if (!options.client && client.close) {
      await client.close();
    }

    return {
      manifest,
      success: defenseRate >= 0.95, // 95% defense rate threshold
      defenseRate,
      unsafeCount,
    };
  }

  /**
   * Run stress/load testing
   */
  async stress(options: StressOptions): Promise<StressResult> {
    // Load scenario
    const scenario = await this.loadScenario(options.scenario);

    // Create or use provided client
    const client = options.client ?? (await this.createClient(options));

    const concurrency = options.concurrency ?? this.config.concurrency ?? 10;
    const durationSec = options.duration ?? 30;
    const rampUpSec = options.rampUp ?? 5;
    const maxRequests = options.maxRequests;

    this.emit('progress', {
      message: `Starting stress test: ${scenario.name}`,
      phase: 'setup',
      progress: 0,
    });

    const results: StressRequestResult[] = [];
    const startTime = new Date();
    const endTimeTarget = startTime.getTime() + durationSec * 1000;

    let requestCount = 0;
    let completedCount = 0;
    let activeRequests = 0;

    // Get a sample prompt from scenario
    if (scenario.cases.length === 0) {
      throw new Error('Scenario must have at least one test case for stress testing');
    }
    const sampleCase = scenario.cases[0];
    const prompt =
      typeof sampleCase.prompt === 'string'
        ? sampleCase.prompt
        : sampleCase.prompt.map((m) => m.content).join('\n');

    // Worker function
    const makeRequest = async (): Promise<StressRequestResult> => {
      const reqStart = Date.now();
      try {
        const response = await client.generate({
          prompt,
          model: options.model ?? this.config.model ?? scenario.model,
          temperature: scenario.temperature,
          maxTokens: scenario.maxTokens ?? 100, // Limit for stress tests
        });

        return {
          success: true,
          latencyMs: response.latencyMs,
          timestamp: reqStart,
          tokens: response.tokens,
        };
      } catch (error) {
        return {
          success: false,
          latencyMs: Date.now() - reqStart,
          error: (error as Error).message,
          timestamp: reqStart,
        };
      }
    };

    // Ramp-up and execution loop
    const rampUpInterval = rampUpSec > 0 ? (rampUpSec * 1000) / concurrency : 0;

    // Track workers
    const workers: Promise<void>[] = [];

    for (let i = 0; i < concurrency; i++) {
      // Stagger worker start for ramp-up
      const worker = (async () => {
        if (rampUpInterval > 0) {
          await sleep(i * rampUpInterval);
        }

        while (Date.now() < endTimeTarget) {
          // Use atomic increment pattern to avoid race conditions
          const currentRequest = requestCount++;
          if (maxRequests && currentRequest >= maxRequests) {
            break;
          }
          activeRequests++;

          const result = await makeRequest();
          // Use indexed assignment for thread-safe array population
          results[currentRequest] = result;
          completedCount++;
          activeRequests--;

          // Calculate current RPS
          const elapsed = (Date.now() - startTime.getTime()) / 1000;
          const currentRPS = elapsed > 0 ? completedCount / elapsed : 0;

          this.emit('stressRequestComplete', {
            result,
            index: completedCount - 1,
            total: maxRequests ?? -1,
            currentRPS,
          });

          this.emit('progress', {
            message: `Requests: ${completedCount}, RPS: ${currentRPS.toFixed(1)}`,
            phase: 'running',
            progress: Math.min(
              95,
              Math.round(((Date.now() - startTime.getTime()) / (durationSec * 1000)) * 90) + 5
            ),
          });
        }
      })();

      workers.push(worker);
    }

    // Wait for all workers
    await Promise.all(workers);

    const endTime = new Date();
    const totalDurationMs = endTime.getTime() - startTime.getTime();

    // Filter out undefined entries from sparse array (due to concurrent indexed writes)
    const validResults = results.filter((r): r is StressRequestResult => r !== undefined);

    // Calculate metrics
    const successfulResults = validResults.filter((r) => r.success);
    const failedResults = validResults.filter((r) => !r.success);
    const latencies = successfulResults.map((r) => r.latencyMs).sort((a, b) => a - b);

    const metrics: StressMetrics = {
      total_requests: validResults.length,
      successful_requests: successfulResults.length,
      failed_requests: failedResults.length,
      success_rate: validResults.length > 0 ? successfulResults.length / validResults.length : 0,
      requests_per_second: validResults.length / (totalDurationMs / 1000),
      min_latency_ms: latencies.length > 0 ? latencies[0] : 0,
      max_latency_ms: latencies.length > 0 ? latencies[latencies.length - 1] : 0,
      avg_latency_ms:
        latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p50_latency_ms: percentile(latencies, 50),
      p90_latency_ms: percentile(latencies, 90),
      p95_latency_ms: percentile(latencies, 95),
      p99_latency_ms: percentile(latencies, 99),
    };

    // Add token metrics if available
    const resultsWithTokens = successfulResults.filter((r) => r.tokens);
    if (resultsWithTokens.length > 0) {
      const totalPromptTokens = resultsWithTokens.reduce(
        (sum, r) => sum + (r.tokens?.prompt ?? 0),
        0
      );
      const totalCompletionTokens = resultsWithTokens.reduce(
        (sum, r) => sum + (r.tokens?.completion ?? 0),
        0
      );
      const totalTokens = totalPromptTokens + totalCompletionTokens;

      metrics.tokens = {
        total_prompt_tokens: totalPromptTokens,
        total_completion_tokens: totalCompletionTokens,
        total_tokens: totalTokens,
        avg_tokens_per_request: totalTokens / resultsWithTokens.length,
      };
    }

    // Build manifest
    const gitInfo = await getGitInfo();
    const manifest: StressManifest = {
      version: '1.0',
      type: 'stress',
      run_id: nanoid(),
      project: this.config.project ?? 'default',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_ms: totalDurationMs,
      config: {
        scenario: scenario.name,
        provider: client.provider,
        model: options.model ?? this.config.model ?? scenario.model,
        concurrency,
        duration_seconds: durationSec,
        ramp_up_seconds: rampUpSec,
        max_requests: maxRequests,
      },
      metrics,
      git: gitInfo,
      provenance: {
        run_by: process.env.USER ?? 'unknown',
        ci: process.env.CI
          ? {
              provider: process.env.GITHUB_ACTIONS
                ? 'github-actions'
                : process.env.GITLAB_CI
                  ? 'gitlab-ci'
                  : 'unknown',
              build_id: process.env.GITHUB_RUN_ID ?? process.env.CI_JOB_ID ?? 'unknown',
            }
          : undefined,
      },
      sample_results: validResults.slice(0, 100), // Keep first 100 for reference
      environment: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    this.emit('progress', {
      message: `Stress test complete: ${metrics.success_rate >= 0.95 ? 'PASSED' : 'NEEDS ATTENTION'}`,
      phase: 'teardown',
      progress: 100,
    });

    // Close client if we created it
    if (!options.client && client.close) {
      await client.close();
    }

    return {
      manifest,
      success: metrics.success_rate >= 0.95, // 95% success rate threshold
      successRate: metrics.success_rate,
      rps: metrics.requests_per_second,
      p95LatencyMs: metrics.p95_latency_ms,
    };
  }

  // ==========================================================================
  // Validation & Comparison Methods
  // ==========================================================================

  /**
   * Validate scenario files without execution (pre-flight checks)
   *
   * Use this for CI/CD pipelines to catch configuration errors before running tests.
   *
   * @example
   * ```typescript
   * const result = await kit.validate({ scenario: './scenarios/**\/*.yaml' });
   * if (!result.valid) {
   *   console.error('Validation errors:', result.errors);
   *   process.exit(1);
   * }
   * ```
   */
  async validate(options: ValidateOptions): Promise<ValidationResult> {
    const inputPaths = Array.isArray(options.scenario) ? options.scenario : [options.scenario];
    const strict = options.strict ?? false;

    const errors: Array<{
      file: string;
      message: string;
      line?: number;
      column?: number;
    }> = [];

    const warnings: Array<{
      file: string;
      message: string;
      line?: number;
      column?: number;
    }> = [];

    const scenarios: Array<{
      file: string;
      name: string;
      caseCount: number;
      valid: boolean;
    }> = [];

    // Resolve glob patterns and directories to actual file paths
    const resolvedPaths: string[] = [];
    for (const inputPath of inputPaths) {
      try {
        const paths = await resolveScenarioPaths(inputPath);
        resolvedPaths.push(...paths);
      } catch (error) {
        errors.push({
          file: inputPath,
          message: `Failed to resolve path: ${(error as Error).message}`,
        });
      }
    }

    this.emit('progress', {
      message: `Validating ${resolvedPaths.length} scenario file(s)...`,
      phase: 'setup',
      progress: 0,
    });

    for (let i = 0; i < resolvedPaths.length; i++) {
      const scenarioPath = resolvedPaths[i];

      try {
        // Parse and validate scenario file
        const scenario = await parseScenarioFile(scenarioPath);

        // Check for common issues
        const fileWarnings: typeof warnings = [];
        const fileErrors: typeof errors = [];

        // Validate cases
        if (!scenario.cases || scenario.cases.length === 0) {
          fileErrors.push({
            file: scenarioPath,
            message: 'Scenario has no test cases defined',
          });
        }

        // Validate each case
        for (let j = 0; j < (scenario.cases ?? []).length; j++) {
          const testCase = scenario.cases[j];

          if (!testCase.id) {
            fileErrors.push({
              file: scenarioPath,
              message: `Case at index ${j} is missing required 'id' field`,
            });
          }

          if (!testCase.prompt) {
            fileErrors.push({
              file: scenarioPath,
              message: `Case '${testCase.id ?? j}' is missing required 'prompt' field`,
            });
          }

          // Check for empty expectations (warning)
          if (!testCase.expected) {
            fileWarnings.push({
              file: scenarioPath,
              message: `Case '${testCase.id ?? j}' has no expectations defined - will only check for LLM response`,
            });
          }

          // Validate expectation type
          if (testCase.expected) {
            const validTypes = [
              'contains',
              'not_contains',
              'exact',
              'regex',
              'fuzzy',
              'similarity',
              'llm_grader',
              'json_schema',
              'combined',
              'inline',
            ];
            if (!validTypes.includes(testCase.expected.type)) {
              fileErrors.push({
                file: scenarioPath,
                message: `Case '${testCase.id ?? j}' has invalid expectation type '${testCase.expected.type}'`,
              });
            }
          }
        }

        // Check for duplicate case IDs
        const caseIds = (scenario.cases ?? []).map((c) => c.id).filter(Boolean);
        const seenIds = new Set<string>();
        for (const id of caseIds) {
          if (seenIds.has(id)) {
            fileErrors.push({
              file: scenarioPath,
              message: `Duplicate case ID '${id}' found in scenario`,
            });
          }
          seenIds.add(id);
        }

        // Check provider/model configuration
        if (!scenario.provider && !this.config.provider) {
          fileWarnings.push({
            file: scenarioPath,
            message: 'No provider specified in scenario or ArtemisKit config',
          });
        }

        if (!scenario.model && !this.config.model) {
          fileWarnings.push({
            file: scenarioPath,
            message: 'No model specified in scenario or ArtemisKit config',
          });
        }

        errors.push(...fileErrors);
        warnings.push(...fileWarnings);

        scenarios.push({
          file: scenarioPath,
          name: scenario.name ?? scenarioPath,
          caseCount: scenario.cases?.length ?? 0,
          valid: fileErrors.length === 0,
        });
      } catch (error) {
        errors.push({
          file: scenarioPath,
          message: `Failed to parse scenario: ${(error as Error).message}`,
        });

        scenarios.push({
          file: scenarioPath,
          name: scenarioPath,
          caseCount: 0,
          valid: false,
        });
      }

      this.emit('progress', {
        message: `Validated ${i + 1}/${resolvedPaths.length} scenarios`,
        phase: 'running',
        progress: Math.round(((i + 1) / resolvedPaths.length) * 100),
      });
    }

    const valid = errors.length === 0 && (!strict || warnings.length === 0);

    this.emit('progress', {
      message: `Validation ${valid ? 'passed' : 'failed'}: ${errors.length} error(s), ${warnings.length} warning(s)`,
      phase: 'teardown',
      progress: 100,
    });

    return {
      valid,
      scenarios,
      errors,
      warnings,
    };
  }

  /**
   * Compare two test runs for regression detection
   *
   * Requires storage configuration to be set in ArtemisKitConfig.
   *
   * @example
   * ```typescript
   * const kit = new ArtemisKit({
   *   storage: { type: 'local', basePath: './artemis-runs' }
   * });
   *
   * const comparison = await kit.compare({
   *   baseline: 'run_abc123',
   *   current: 'run_def456',
   *   threshold: 0.05, // 5% regression threshold
   * });
   *
   * if (comparison.hasRegression) {
   *   console.error('Regression detected!', comparison.regressions);
   * }
   * ```
   *
   * @since 0.3.2
   */
  async compare(options: CompareOptions): Promise<CompareResult> {
    const { baseline, current, threshold = 0.05 } = options;

    // Validate storage is configured
    if (!this.storage) {
      throw new Error(
        'Storage configuration required for compare(). ' +
          'Set storage in ArtemisKitConfig: { storage: { type: "local", basePath: "./artemis-runs" } }'
      );
    }

    this.emit('progress', {
      message: `Comparing runs: ${baseline} vs ${current}`,
      phase: 'setup',
      progress: 0,
    });

    // Resolve "latest" baseline if specified
    let baselineRunId = baseline;
    if (baseline === 'latest') {
      this.emit('progress', {
        message: 'Resolving latest run as baseline...',
        phase: 'setup',
        progress: 10,
      });

      const runs = await this.storage.list({ limit: 1, type: 'run' });
      if (runs.length === 0) {
        throw new Error('No runs found in storage. Cannot use "latest" as baseline.');
      }
      baselineRunId = runs[0].runId;
    }

    this.emit('progress', {
      message: 'Loading manifests...',
      phase: 'running',
      progress: 20,
    });

    // Load both manifests
    const [baselineManifest, currentManifest] = await Promise.all([
      this.storage.load(baselineRunId),
      this.storage.load(current),
    ]);

    this.emit('progress', {
      message: 'Analyzing results...',
      phase: 'running',
      progress: 50,
    });

    // Extract metrics from manifests
    const baselineMetrics = this.extractRunMetrics(baselineManifest, baselineRunId);
    const currentMetrics = this.extractRunMetrics(currentManifest, current);

    // Calculate success rate delta
    const successRateDelta = currentMetrics.successRate - baselineMetrics.successRate;

    this.emit('progress', {
      message: 'Comparing cases...',
      phase: 'running',
      progress: 70,
    });

    // Compare case-by-case results
    const caseComparison = this.compareCases(baselineManifest, currentManifest);

    // Determine if there's a regression
    // A regression is when the current success rate is lower than baseline by more than threshold
    const hasRegression = successRateDelta < -threshold;

    this.emit('progress', {
      message: hasRegression
        ? `Regression detected: ${(successRateDelta * 100).toFixed(1)}% change`
        : `No regression: ${(successRateDelta * 100).toFixed(1)}% change`,
      phase: 'teardown',
      progress: 100,
    });

    return {
      baseline: baselineMetrics,
      current: currentMetrics,
      comparison: {
        successRateDelta,
        ...caseComparison,
      },
      hasRegression,
      threshold,
    };
  }

  /**
   * Extract run metrics from a manifest
   */
  private extractRunMetrics(manifest: AnyManifest, runId: string): CompareResult['baseline'] {
    // Handle RunManifest
    if ('metrics' in manifest && 'success_rate' in manifest.metrics) {
      const runManifest = manifest as RunManifest;
      return {
        runId,
        successRate: runManifest.metrics.success_rate,
        totalCases: runManifest.metrics.total_cases,
        passedCases: runManifest.metrics.passed_cases,
        failedCases: runManifest.metrics.failed_cases,
      };
    }

    // Throw for non-RunManifest types - compare() only supports RunManifest
    throw new Error(
      `Cannot extract metrics from run "${runId}": expected RunManifest but got a different manifest type. The compare() method only supports comparing scenario evaluation runs, not stress tests or red team runs.`
    );
  }

  /**
   * Compare cases between baseline and current manifests
   */
  private compareCases(
    baselineManifest: AnyManifest,
    currentManifest: AnyManifest
  ): Pick<
    CompareResult['comparison'],
    'newFailures' | 'newPasses' | 'unchanged' | 'addedCases' | 'removedCases'
  > {
    const newFailures: CompareResult['comparison']['newFailures'] = [];
    const newPasses: CompareResult['comparison']['newPasses'] = [];
    const unchanged: CompareResult['comparison']['unchanged'] = [];
    const addedCases: CompareResult['comparison']['addedCases'] = [];
    const removedCases: CompareResult['comparison']['removedCases'] = [];

    // Get cases from manifests
    const baselineCases = this.extractCases(baselineManifest);
    const currentCases = this.extractCases(currentManifest);

    // Build maps for quick lookup
    const baselineCaseMap = new Map(baselineCases.map((c) => [c.id, c]));
    const currentCaseMap = new Map(currentCases.map((c) => [c.id, c]));

    // Find all unique case IDs
    const allCaseIds = new Set([...baselineCaseMap.keys(), ...currentCaseMap.keys()]);

    for (const caseId of allCaseIds) {
      const baselineCase = baselineCaseMap.get(caseId);
      const currentCase = currentCaseMap.get(caseId);

      // Case exists only in current run (new test case)
      if (!baselineCase && currentCase) {
        addedCases.push({
          caseId,
          caseName: currentCase.name,
          status: currentCase.ok ? 'passed' : 'failed',
        });
        continue;
      }

      // Case exists only in baseline (removed test case)
      if (baselineCase && !currentCase) {
        removedCases.push({
          caseId,
          caseName: baselineCase.name,
          status: baselineCase.ok ? 'passed' : 'failed',
        });
        continue;
      }

      // Both exist - compare status
      if (baselineCase && currentCase) {
        const baselineStatus = baselineCase.ok ? 'passed' : 'failed';
        const currentStatus = currentCase.ok ? 'passed' : 'failed';

        if (baselineStatus === currentStatus) {
          unchanged.push({ caseId, status: currentStatus });
        } else if (baselineStatus === 'passed' && currentStatus === 'failed') {
          newFailures.push({
            caseId,
            caseName: currentCase.name,
            baselineStatus,
            currentStatus,
          });
        } else if (baselineStatus === 'failed' && currentStatus === 'passed') {
          newPasses.push({
            caseId,
            caseName: currentCase.name,
            baselineStatus,
            currentStatus,
          });
        }
      }
    }

    return { newFailures, newPasses, unchanged, addedCases, removedCases };
  }

  /**
   * Extract cases from a manifest
   */
  private extractCases(manifest: AnyManifest): Array<{ id: string; name?: string; ok: boolean }> {
    if ('cases' in manifest && Array.isArray(manifest.cases)) {
      return manifest.cases.map((c) => ({
        id: c.id,
        name: c.name,
        ok: c.ok,
      }));
    }
    return [];
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Load a scenario from file or use inline object
   */
  private async loadScenario(scenario: string | Scenario): Promise<Scenario> {
    if (typeof scenario === 'string') {
      return parseScenarioFile(scenario);
    }
    return scenario;
  }

  /**
   * Create a model client based on options
   */
  private async createClient(
    options: Pick<RunOptions, 'provider' | 'model' | 'providerConfig'>
  ): Promise<ModelClient> {
    const provider = options.provider ?? this.config.provider ?? 'openai';
    const model = options.model ?? this.config.model;

    const adapterConfig: AdapterConfig = {
      provider,
      defaultModel: model,
      ...this.config.providerConfig,
      ...options.providerConfig,
    } as AdapterConfig;

    return createAdapter(adapterConfig);
  }

  /**
   * Build mutation instances from mutation names
   */
  private buildMutations(mutationNames?: string[]): Mutation[] {
    // If no mutation names specified, use all available mutations
    if (!mutationNames || mutationNames.length === 0) {
      return Object.values(MUTATION_MAP).map((MutationClass) => new MutationClass());
    }

    const mutations: Mutation[] = [];
    const unknownMutations: string[] = [];

    for (const name of mutationNames) {
      const MutationClass = MUTATION_MAP[name];
      if (MutationClass) {
        mutations.push(new MutationClass());
      } else {
        unknownMutations.push(name);
      }
    }

    // Throw error for unknown mutation names instead of silently ignoring
    if (unknownMutations.length > 0) {
      const availableMutations = Object.keys(MUTATION_MAP).join(', ');
      throw new Error(
        `Unknown mutation(s): ${unknownMutations.join(', ')}. Available mutations: ${availableMutations}`
      );
    }

    return mutations;
  }

  /**
   * Get available mutations for red team testing
   */
  getAvailableMutations(): string[] {
    return Object.keys(MUTATION_MAP);
  }
}

// ==========================================================================
// Utility Functions
// ==========================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
}
