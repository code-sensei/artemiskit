/**
 * Guardian - Main runtime protection class
 *
 * Provides a unified interface for all guardian features:
 * - Interceptor for LLM client wrapping
 * - Action validation for tool/function calls
 * - Intent classification
 * - Input/output guardrails
 * - Policy-based configuration
 * - Circuit breaker protection
 * - Metrics collection
 */

import type { ModelClient } from '@artemiskit/core';
import { nanoid } from 'nanoid';
import { ActionValidator, createDefaultActionValidator } from './action-validator';
import { CircuitBreaker, MetricsCollector, RateLimiter } from './circuit-breaker';
import { type GuardrailsConfig, createGuardrails } from './guardrails';
import { type IntentClassifier, createIntentClassifier } from './intent-classifier';
import {
  GuardianBlockedError,
  GuardianInterceptor,
  type GuardrailFn,
  type InterceptorConfig,
} from './interceptor';
import { createDefaultPolicy, loadPolicy, parsePolicy } from './policy';
import { SemanticValidator, createSemanticValidator } from './semantic-validator';
import type {
  ActionDefinition,
  ContentValidationConfig,
  GuardianEvent,
  GuardianEventHandler,
  GuardianMetrics,
  GuardianMode,
  GuardianModeCanonical,
  GuardianModeLegacy,
  GuardianPolicy,
  InterceptedToolCall,
  MultiTurnConfig,
  Violation,
} from './types';

// =============================================================================
// Mode Normalization
// =============================================================================

/**
 * Legacy to canonical mode mapping
 */
const LEGACY_MODE_MAP: Record<GuardianModeLegacy, GuardianModeCanonical> = {
  testing: 'observe',
  guardian: 'strict',
  hybrid: 'selective',
};

/**
 * Check if a mode is a legacy mode
 */
function isLegacyMode(mode: GuardianMode): mode is GuardianModeLegacy {
  return mode in LEGACY_MODE_MAP;
}

/**
 * Normalize Guardian mode to canonical form with deprecation warning
 * @param mode - The mode to normalize
 * @returns The canonical mode
 */
export function normalizeGuardianMode(mode: GuardianMode): GuardianModeCanonical {
  if (isLegacyMode(mode)) {
    const canonical = LEGACY_MODE_MAP[mode];
    console.warn(
      `[ArtemisKit Guardian] Mode '${mode}' is deprecated. Use '${canonical}' instead. Legacy modes will be removed in v1.0.0.`
    );
    return canonical;
  }
  return mode as GuardianModeCanonical;
}

/**
 * Guardian configuration options
 */
export interface GuardianConfig {
  /**
   * Operating mode
   *
   * Canonical modes (recommended):
   * - 'observe': Log only, never block (for monitoring)
   * - 'selective': Block high-confidence threats (threshold-based)
   * - 'strict': Block all detected violations (maximum protection)
   *
   * Legacy modes (deprecated):
   * - 'testing' → 'observe'
   * - 'guardian' → 'strict'
   * - 'hybrid' → 'selective'
   */
  mode?: GuardianMode;

  /** Policy file path or policy object */
  policy?: string | GuardianPolicy;

  /** LLM client for semantic validation and intent classification */
  llmClient?: ModelClient;

  /** Enable input validation */
  validateInput?: boolean;

  /** Enable output validation */
  validateOutput?: boolean;

  /** Block on validation failure */
  blockOnFailure?: boolean;

  /**
   * Content validation strategy configuration
   *
   * @default { strategy: 'semantic', semanticThreshold: 0.9 }
   */
  contentValidation?: ContentValidationConfig;

  /** Custom guardrails configuration (pattern-based) */
  guardrails?: GuardrailsConfig;

  /**
   * Multi-turn detection configuration
   *
   * Enable to detect attacks that span multiple messages:
   * - Trust-building before sensitive requests
   * - Escalating risk patterns
   * - Context manipulation claims
   * - Split payload attacks
   */
  multiTurn?: MultiTurnConfig;

  /** Custom action definitions */
  allowedActions?: ActionDefinition[];

  /** Event handler */
  onEvent?: GuardianEventHandler;

  /** Enable metrics collection */
  collectMetrics?: boolean;

  /** Enable logging */
  enableLogging?: boolean;
}

/**
 * Guardian class - main runtime protection API
 */
export class Guardian {
  private config: GuardianConfig;
  private policy: GuardianPolicy;
  private circuitBreaker: CircuitBreaker;
  private rateLimiter?: RateLimiter;
  private metricsCollector: MetricsCollector;
  private actionValidator: ActionValidator;
  private intentClassifier: IntentClassifier;
  private semanticValidator?: SemanticValidator;
  private inputGuardrails: GuardrailFn[];
  private outputGuardrails: GuardrailFn[];
  private eventHandlers: GuardianEventHandler[] = [];

  /** The normalized (canonical) mode after processing legacy modes */
  private normalizedMode: GuardianModeCanonical;

  constructor(config: GuardianConfig = {}) {
    // Normalize mode with deprecation warning for legacy modes
    const inputMode = config.mode ?? 'strict';
    this.normalizedMode = normalizeGuardianMode(inputMode);

    this.config = {
      mode: inputMode, // Keep original for backwards compatibility
      validateInput: true,
      validateOutput: true,
      blockOnFailure: true,
      collectMetrics: true,
      enableLogging: true,
      // Default content validation strategy: semantic
      contentValidation: {
        strategy: 'semantic',
        semanticThreshold: 0.9,
        categories: ['prompt_injection', 'jailbreak', 'pii_disclosure'],
        patterns: { enabled: true, caseInsensitive: true },
      },
      ...config,
    };

    // Load or create policy
    this.policy = this.loadOrCreatePolicy(config.policy);

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(
      this.policy.circuitBreaker ?? {
        enabled: false,
        threshold: 5,
        windowMs: 60000,
        cooldownMs: 300000,
      }
    );

    // Initialize rate limiter
    if (this.policy.rateLimits?.enabled) {
      this.rateLimiter = new RateLimiter(this.policy.rateLimits);
    }

    // Initialize metrics collector
    this.metricsCollector = new MetricsCollector();

    // Initialize action validator
    this.actionValidator = config.allowedActions
      ? new ActionValidator({ allowedActions: config.allowedActions })
      : createDefaultActionValidator();

    // Initialize intent classifier
    this.intentClassifier = createIntentClassifier({
      useLLM: !!config.llmClient,
      llmClient: config.llmClient,
      blockHighRisk: true,
    });

    // Initialize guardrails
    const guardrailConfig = config.guardrails ?? {};
    this.inputGuardrails = createGuardrails(guardrailConfig);
    this.outputGuardrails = createGuardrails(guardrailConfig);

    // Add intent classifier as guardrail
    this.inputGuardrails.push(this.intentClassifier.asGuardrail());

    // Initialize semantic validator if strategy is 'semantic' or 'hybrid' and LLM client is provided
    const validationStrategy = this.config.contentValidation?.strategy ?? 'semantic';
    const shouldUseSemanticValidation =
      (validationStrategy === 'semantic' || validationStrategy === 'hybrid') && config.llmClient;

    if (shouldUseSemanticValidation && config.llmClient) {
      this.semanticValidator = createSemanticValidator(
        config.llmClient,
        this.config.contentValidation
      );

      // Add semantic validator as input guardrail
      this.inputGuardrails.push(this.semanticValidator.asGuardrail('input'));

      // Add semantic validator as output guardrail
      this.outputGuardrails.push(this.semanticValidator.asGuardrail('output'));
    }

    // Register event handler
    if (config.onEvent) {
      this.eventHandlers.push(config.onEvent);
    }

    // Set up circuit breaker event forwarding
    this.circuitBreaker.onEvent((event, data) => {
      if (event === 'open') {
        this.emit({
          type: 'circuit_breaker_open',
          timestamp: new Date(),
          data: data ?? {},
        });
      } else if (event === 'close') {
        this.emit({
          type: 'circuit_breaker_close',
          timestamp: new Date(),
          data: data ?? {},
        });
      }
    });
  }

  /**
   * Wrap a model client with guardian protection
   */
  protect(client: ModelClient): GuardianInterceptor {
    const interceptorConfig: InterceptorConfig = {
      validateInput: this.config.validateInput,
      validateOutput: this.config.validateOutput,
      inputGuardrails: this.inputGuardrails,
      outputGuardrails: this.outputGuardrails,
      blockOnFailure: this.config.blockOnFailure,
      logViolations: this.config.enableLogging,
      onEvent: (event) => {
        // Record metrics
        if (event.type === 'request_complete') {
          const latencyMs = event.data.latencyMs as number;
          this.metricsCollector.recordRequest({
            blocked: false,
            warned: false,
            latencyMs,
            violations: [],
          });
          this.circuitBreaker.recordSuccess();
        } else if (event.type === 'violation_detected') {
          const violation = event.data.violation as Violation;
          this.circuitBreaker.recordViolation(violation);
        } else if (event.type === 'request_blocked') {
          const violations = event.data.violations as Violation[];
          const latencyMs = (event.data.latencyMs as number) ?? 0;
          this.metricsCollector.recordRequest({
            blocked: true,
            warned: false,
            latencyMs,
            violations,
          });
        }

        // Forward to guardian event handlers
        this.emit(event);
      },
    };

    return new GuardianInterceptor(client, interceptorConfig);
  }

  /**
   * Validate a tool/function call
   */
  async validateAction(
    toolName: string,
    args: Record<string, unknown>,
    agentId?: string
  ): Promise<{
    valid: boolean;
    violations: Violation[];
    sanitizedArguments?: Record<string, unknown>;
    requiresApproval?: boolean;
  }> {
    // Check circuit breaker
    if (this.circuitBreaker.isOpen()) {
      return {
        valid: false,
        violations: [
          {
            id: nanoid(),
            type: 'rate_limit',
            severity: 'high',
            message: 'Circuit breaker is open - too many violations',
            timestamp: new Date(),
            action: 'block',
            blocked: true,
          },
        ],
      };
    }

    // Check rate limiter
    if (this.rateLimiter) {
      const rateResult = this.rateLimiter.allowRequest();
      if (!rateResult.allowed) {
        return {
          valid: false,
          violations: [
            {
              id: nanoid(),
              type: 'rate_limit',
              severity: 'medium',
              message: rateResult.reason ?? 'Rate limit exceeded',
              details: { retryAfterMs: rateResult.retryAfterMs },
              timestamp: new Date(),
              action: 'block',
              blocked: true,
            },
          ],
        };
      }
    }

    const toolCall: InterceptedToolCall = {
      id: nanoid(),
      toolName,
      arguments: args,
      agentId,
      timestamp: new Date(),
    };

    const result = await this.actionValidator.validate(toolCall);

    // Record violations
    for (const violation of result.violations) {
      this.circuitBreaker.recordViolation(violation);
    }

    if (result.valid) {
      this.circuitBreaker.recordSuccess();
    }

    return result;
  }

  /**
   * Classify intent of a message
   */
  async classifyIntent(text: string) {
    return this.intentClassifier.classify(text);
  }

  /**
   * Validate input content
   */
  async validateInput(content: string): Promise<{
    valid: boolean;
    violations: Violation[];
    transformedContent?: string;
  }> {
    const violations: Violation[] = [];
    let transformedContent: string | undefined;
    let currentContent = content;

    for (const guardrail of this.inputGuardrails) {
      const result = await guardrail(currentContent, {});

      if (!result.passed) {
        violations.push(...result.violations);
      }

      if (result.transformedContent) {
        transformedContent = result.transformedContent;
        currentContent = result.transformedContent;
      }
    }

    // Record violations
    for (const violation of violations) {
      this.circuitBreaker.recordViolation(violation);
    }

    // Apply mode-aware blocking logic
    const shouldBlockAny = violations.some((v) => v.blocked && this.shouldBlock(v));

    return {
      valid: violations.length === 0 || !shouldBlockAny,
      violations,
      transformedContent,
    };
  }

  /**
   * Validate output content
   */
  async validateOutput(content: string): Promise<{
    valid: boolean;
    violations: Violation[];
    transformedContent?: string;
  }> {
    const violations: Violation[] = [];
    let transformedContent: string | undefined;
    let currentContent = content;

    for (const guardrail of this.outputGuardrails) {
      const result = await guardrail(currentContent, {});

      if (!result.passed) {
        violations.push(...result.violations);
      }

      if (result.transformedContent) {
        transformedContent = result.transformedContent;
        currentContent = result.transformedContent;
      }
    }

    // Record violations
    for (const violation of violations) {
      this.circuitBreaker.recordViolation(violation);
    }

    // Apply mode-aware blocking logic
    const shouldBlockAny = violations.some((v) => v.blocked && this.shouldBlock(v));

    return {
      valid: violations.length === 0 || !shouldBlockAny,
      violations,
      transformedContent,
    };
  }

  /**
   * Get current metrics
   */
  getMetrics(): GuardianMetrics {
    return this.metricsCollector.getMetrics(this.circuitBreaker.getState());
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): {
    state: string;
    violationCount: number;
    timeUntilReset: number;
  } {
    return {
      state: this.circuitBreaker.getState(),
      violationCount: this.circuitBreaker.getViolationCount(),
      timeUntilReset: this.circuitBreaker.getTimeUntilReset(),
    };
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(): ReturnType<RateLimiter['getStatus']> | undefined {
    return this.rateLimiter?.getStatus();
  }

  /**
   * Get the current policy
   */
  getPolicy(): GuardianPolicy {
    return this.policy;
  }

  /**
   * Get the normalized (canonical) operating mode
   *
   * This returns the canonical mode even if a legacy mode was configured.
   */
  getMode(): GuardianModeCanonical {
    return this.normalizedMode;
  }

  /**
   * Check if Guardian should block based on mode and violation severity
   *
   * - observe: Never blocks
   * - selective: Blocks high-confidence/high-severity only
   * - strict: Blocks all violations
   */
  shouldBlock(violation: Violation): boolean {
    switch (this.normalizedMode) {
      case 'observe':
        return false;
      case 'selective':
        // Block only critical or high severity violations
        return violation.severity === 'critical' || violation.severity === 'high';
      case 'strict':
        return true;
      default:
        return true;
    }
  }

  /**
   * Get the content validation configuration
   */
  getContentValidationConfig(): ContentValidationConfig {
    return (
      this.config.contentValidation ?? {
        strategy: 'semantic',
        semanticThreshold: 0.9,
      }
    );
  }

  /**
   * Update policy at runtime
   */
  updatePolicy(policy: GuardianPolicy): void {
    this.policy = policy;

    // Update circuit breaker
    if (policy.circuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(policy.circuitBreaker);
    }

    // Update rate limiter
    if (policy.rateLimits?.enabled) {
      this.rateLimiter = new RateLimiter(policy.rateLimits);
    } else {
      this.rateLimiter = undefined;
    }
  }

  /**
   * Register an allowed action
   */
  registerAction(action: ActionDefinition): void {
    this.actionValidator.registerAction(action);
  }

  /**
   * Add a custom guardrail
   */
  addInputGuardrail(guardrail: GuardrailFn): void {
    this.inputGuardrails.push(guardrail);
  }

  /**
   * Add a custom output guardrail
   */
  addOutputGuardrail(guardrail: GuardrailFn): void {
    this.outputGuardrails.push(guardrail);
  }

  /**
   * Register an event handler
   */
  onEvent(handler: GuardianEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler
   */
  offEvent(handler: GuardianEventHandler): void {
    this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
  }

  /**
   * Reset all metrics and state
   */
  reset(): void {
    this.metricsCollector.reset();
    this.circuitBreaker.reset();
    this.rateLimiter?.reset();
    this.actionValidator.clearHistory();
  }

  /**
   * Load or create policy
   */
  private loadOrCreatePolicy(policyInput?: string | GuardianPolicy): GuardianPolicy {
    if (!policyInput) {
      return createDefaultPolicy();
    }

    if (typeof policyInput === 'string') {
      // Check if it's a file path or YAML content
      if (policyInput.trim().startsWith('name:') || policyInput.includes('\n')) {
        return parsePolicy(policyInput);
      }
      return loadPolicy(policyInput);
    }

    return policyInput;
  }

  /**
   * Emit an event to all handlers
   */
  private emit(event: GuardianEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }
}

/**
 * Create a guardian instance
 */
export function createGuardian(config: GuardianConfig = {}): Guardian {
  return new Guardian(config);
}

// Re-export error
export { GuardianBlockedError };
