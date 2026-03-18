/**
 * Guardian Interceptor
 *
 * Wraps LLM clients to intercept and validate all inputs/outputs.
 * Acts as middleware between the agent and the LLM.
 */

import type { GenerateOptions, GenerateResult, ModelClient } from '@artemiskit/core';
import { nanoid } from 'nanoid';
import type {
  GuardianEvent,
  GuardianEventHandler,
  GuardrailResult,
  InterceptedRequest,
  InterceptedResponse,
  Violation,
} from './types';

/**
 * Guardrail function signature
 */
export type GuardrailFn = (
  content: string,
  context?: Record<string, unknown>
) => Promise<GuardrailResult>;

/**
 * Interceptor configuration
 */
export interface InterceptorConfig {
  /** Enable input validation */
  validateInput?: boolean;
  /** Enable output validation */
  validateOutput?: boolean;
  /** Input guardrails to run */
  inputGuardrails?: GuardrailFn[];
  /** Output guardrails to run */
  outputGuardrails?: GuardrailFn[];
  /** Whether to block on validation failure */
  blockOnFailure?: boolean;
  /** Event handlers */
  onEvent?: GuardianEventHandler;
  /** Log violations */
  logViolations?: boolean;
  /**
   * Callback to check if requests should be allowed (e.g., circuit breaker check).
   * Called before each LLM request. Return false to block the request.
   */
  shouldAllow?: () => { allowed: boolean; reason?: string };
}

/**
 * Interceptor statistics
 */
export interface InterceptorStats {
  totalRequests: number;
  blockedRequests: number;
  totalViolations: number;
  averageLatencyMs: number;
  inputViolations: number;
  outputViolations: number;
}

/**
 * Guardian Interceptor wraps a ModelClient to add validation
 */
export class GuardianInterceptor implements ModelClient {
  readonly provider: string;
  private client: ModelClient;
  private config: InterceptorConfig;
  private stats: InterceptorStats;
  private requestHistory: Map<string, InterceptedRequest>;

  constructor(client: ModelClient, config: InterceptorConfig = {}) {
    this.client = client;
    this.provider = client.provider;
    this.config = {
      validateInput: true,
      validateOutput: true,
      blockOnFailure: true,
      logViolations: true,
      ...config,
    };
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      totalViolations: 0,
      averageLatencyMs: 0,
      inputViolations: 0,
      outputViolations: 0,
    };
    this.requestHistory = new Map();
  }

  /**
   * Generate with guardrail validation
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const requestId = nanoid();
    const startTime = Date.now();
    this.stats.totalRequests++;

    // Check if requests are allowed (e.g., circuit breaker)
    if (this.config.shouldAllow) {
      const allowResult = this.config.shouldAllow();
      if (!allowResult.allowed) {
        this.stats.blockedRequests++;
        const violation: Violation = {
          id: nanoid(),
          type: 'circuit_breaker',
          severity: 'high',
          message: allowResult.reason ?? 'Request blocked by circuit breaker',
          timestamp: new Date(),
          action: 'block',
          blocked: true,
        };
        this.emitEvent({
          type: 'request_blocked',
          timestamp: new Date(),
          data: { requestId, phase: 'pre-request', violations: [violation] },
        });
        throw new GuardianBlockedError(allowResult.reason ?? 'Request blocked by circuit breaker', [
          violation,
        ]);
      }
    }

    // Extract prompt text
    const promptText = this.extractPromptText(options.prompt);

    // Create intercepted request record
    const request: InterceptedRequest = {
      id: requestId,
      input: promptText,
      metadata: options.metadata,
      timestamp: new Date(),
    };
    this.requestHistory.set(requestId, request);

    // Emit request start event
    this.emitEvent({
      type: 'request_start',
      timestamp: new Date(),
      data: { requestId, prompt: promptText },
    });

    // Run input validation
    if (this.config.validateInput && this.config.inputGuardrails) {
      const inputResult = await this.runGuardrails(promptText, this.config.inputGuardrails, {
        requestId,
        phase: 'input',
      });

      if (!inputResult.passed) {
        this.stats.inputViolations += inputResult.violations.length;
        this.stats.totalViolations += inputResult.violations.length;

        for (const violation of inputResult.violations) {
          this.emitEvent({
            type: 'violation_detected',
            timestamp: new Date(),
            data: { requestId, phase: 'input', violation },
          });
        }

        if (this.config.blockOnFailure && inputResult.violations.some((v) => v.blocked)) {
          this.stats.blockedRequests++;
          this.emitEvent({
            type: 'request_blocked',
            timestamp: new Date(),
            data: { requestId, phase: 'input', violations: inputResult.violations },
          });

          throw new GuardianBlockedError('Input validation failed', inputResult.violations);
        }
      }
    }

    // Call the underlying client
    const result = await this.client.generate(options);

    // Create intercepted response record
    const response: InterceptedResponse = {
      id: nanoid(),
      requestId,
      output: result.text,
      metadata: result.raw as Record<string, unknown> | undefined,
      timestamp: new Date(),
      latencyMs: result.latencyMs,
    };

    // Run output validation
    if (this.config.validateOutput && this.config.outputGuardrails) {
      const outputResult = await this.runGuardrails(result.text, this.config.outputGuardrails, {
        requestId,
        phase: 'output',
        response,
      });

      if (!outputResult.passed) {
        this.stats.outputViolations += outputResult.violations.length;
        this.stats.totalViolations += outputResult.violations.length;

        for (const violation of outputResult.violations) {
          this.emitEvent({
            type: 'violation_detected',
            timestamp: new Date(),
            data: { requestId, phase: 'output', violation },
          });
        }

        if (this.config.blockOnFailure && outputResult.violations.some((v) => v.blocked)) {
          this.stats.blockedRequests++;
          this.emitEvent({
            type: 'request_blocked',
            timestamp: new Date(),
            data: { requestId, phase: 'output', violations: outputResult.violations },
          });

          throw new GuardianBlockedError('Output validation failed', outputResult.violations);
        }

        // If output was transformed, return the transformed content
        if (outputResult.transformedContent) {
          return {
            ...result,
            text: outputResult.transformedContent,
          };
        }
      }
    }

    // Update average latency
    const totalLatency = this.stats.averageLatencyMs * (this.stats.totalRequests - 1);
    this.stats.averageLatencyMs = (totalLatency + result.latencyMs) / this.stats.totalRequests;

    // Emit request complete event
    this.emitEvent({
      type: 'request_complete',
      timestamp: new Date(),
      data: {
        requestId,
        latencyMs: Date.now() - startTime,
        response: result.text,
      },
    });

    return result;
  }

  /**
   * Get model capabilities (pass-through)
   */
  async capabilities() {
    return this.client.capabilities();
  }

  /**
   * Stream generation (pass-through with validation)
   */
  stream?(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string> {
    if (!this.client.stream) {
      throw new Error('Underlying client does not support streaming');
    }
    // For streaming, we'd need to accumulate and validate
    // This is a simplified pass-through for now
    return this.client.stream(options, onChunk);
  }

  /**
   * Embed text (pass-through)
   */
  async embed?(text: string, model?: string): Promise<number[]> {
    if (!this.client.embed) {
      throw new Error('Underlying client does not support embeddings');
    }
    return this.client.embed(text, model);
  }

  /**
   * Close the client
   */
  async close?(): Promise<void> {
    if (this.client.close) {
      return this.client.close();
    }
  }

  /**
   * Get interceptor statistics
   */
  getStats(): InterceptorStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      totalViolations: 0,
      averageLatencyMs: 0,
      inputViolations: 0,
      outputViolations: 0,
    };
  }

  /**
   * Get request history
   */
  getRequestHistory(): InterceptedRequest[] {
    return Array.from(this.requestHistory.values());
  }

  /**
   * Clear request history
   */
  clearHistory(): void {
    this.requestHistory.clear();
  }

  /**
   * Run guardrails and aggregate results
   */
  private async runGuardrails(
    content: string,
    guardrails: GuardrailFn[],
    context: Record<string, unknown>
  ): Promise<GuardrailResult> {
    const allViolations: Violation[] = [];
    let transformedContent: string | undefined;
    let currentContent = content;

    for (const guardrail of guardrails) {
      const result = await guardrail(currentContent, context);

      if (!result.passed) {
        allViolations.push(...result.violations);
      }

      // Apply transformation if provided
      if (result.transformedContent) {
        transformedContent = result.transformedContent;
        currentContent = result.transformedContent;
      }
    }

    return {
      passed: allViolations.length === 0,
      violations: allViolations,
      transformedContent,
    };
  }

  /**
   * Extract text from prompt (string or messages array)
   */
  private extractPromptText(prompt: GenerateOptions['prompt']): string {
    if (typeof prompt === 'string') {
      return prompt;
    }
    return prompt.map((m) => m.content).join('\n');
  }

  /**
   * Emit an event to the handler
   */
  private emitEvent(event: GuardianEvent): void {
    if (this.config.onEvent) {
      try {
        this.config.onEvent(event);
      } catch (err) {
        if (this.config.logViolations) {
          console.error('Error in guardian event handler:', err);
        }
      }
    }

    if (this.config.logViolations && event.type === 'violation_detected') {
      const violation = event.data.violation as Violation;
      console.warn(
        `[Guardian] Violation detected: ${violation.type} - ${violation.message} (${violation.severity})`
      );
    }
  }
}

/**
 * Error thrown when a request is blocked by guardrails
 */
export class GuardianBlockedError extends Error {
  readonly violations: Violation[];

  constructor(message: string, violations: Violation[]) {
    super(message);
    this.name = 'GuardianBlockedError';
    this.violations = violations;
  }
}

/**
 * Create an interceptor wrapping a model client
 */
export function createInterceptor(
  client: ModelClient,
  config: InterceptorConfig = {}
): GuardianInterceptor {
  return new GuardianInterceptor(client, config);
}
