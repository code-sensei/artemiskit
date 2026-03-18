/**
 * Circuit Breaker and Metrics
 *
 * Implements the circuit breaker pattern to protect against repeated failures
 * and provides comprehensive metrics tracking for guardian operations.
 */

import type {
  CircuitBreakerConfig,
  CircuitBreakerState,
  CostTracking,
  GuardianMetrics,
  GuardrailType,
  Violation,
  ViolationSeverity,
} from './types';

// =============================================================================
// Circuit Breaker
// =============================================================================

/**
 * Circuit breaker event types
 */
export type CircuitBreakerEvent = 'open' | 'close' | 'half-open' | 'violation' | 'success';

/**
 * Circuit breaker event handler
 */
export type CircuitBreakerEventHandler = (
  event: CircuitBreakerEvent,
  data?: Record<string, unknown>
) => void;

/**
 * Circuit Breaker implementation
 *
 * Protects against cascading failures by opening the circuit
 * when too many violations occur within a time window.
 */
export class CircuitBreaker {
  private config: Required<CircuitBreakerConfig>;
  private state: CircuitBreakerState = 'closed';
  private violations: { timestamp: number; severity: ViolationSeverity }[] = [];
  private lastOpenTime = 0;
  private halfOpenSuccesses = 0;
  private eventHandlers: CircuitBreakerEventHandler[] = [];

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      enabled: config.enabled ?? true,
      threshold: config.threshold ?? 5,
      windowMs: config.windowMs ?? 60000,
      cooldownMs: config.cooldownMs ?? 300000,
      halfOpenRequests: config.halfOpenRequests ?? 3,
    };
  }

  /**
   * Check if the circuit is open (requests should be blocked)
   */
  isOpen(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    if (this.state === 'open') {
      // Check if cooldown has passed
      const now = Date.now();
      if (now - this.lastOpenTime >= this.config.cooldownMs) {
        this.transition('half-open');
      }
    }

    return this.state === 'open';
  }

  /**
   * Check if the circuit allows requests
   * @deprecated Use isOpen() instead - this method duplicates functionality.
   * Guardian uses isOpen() exclusively for circuit breaker checks.
   */
  allowRequest(): boolean {
    return !this.isOpen();
  }

  /**
   * Record a violation
   */
  recordViolation(violation: Violation): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();

    // Add to violations list
    this.violations.push({
      timestamp: now,
      severity: violation.severity,
    });

    // Clean up old violations outside the window
    this.violations = this.violations.filter((v) => now - v.timestamp < this.config.windowMs);

    this.emit('violation', { violation });

    // Check if we should open the circuit
    if (this.state === 'closed' && this.violations.length >= this.config.threshold) {
      this.trip();
    }

    // In half-open state, a violation trips the circuit again
    if (this.state === 'half-open' && violation.blocked) {
      this.trip();
    }
  }

  /**
   * Record a successful request (no violations)
   */
  recordSuccess(): void {
    if (!this.config.enabled) {
      return;
    }

    this.emit('success', {});

    // In half-open state, track successes
    if (this.state === 'half-open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.halfOpenRequests) {
        this.reset();
      }
    }
  }

  /**
   * Trip the circuit breaker (open it)
   */
  trip(): void {
    this.lastOpenTime = Date.now();
    this.transition('open');
  }

  /**
   * Reset the circuit breaker (close it)
   */
  reset(): void {
    this.violations = [];
    this.halfOpenSuccesses = 0;
    this.transition('closed');
  }

  /**
   * Force the circuit to a specific state.
   * When forcing to 'open', also updates lastOpenTime so the cooldown
   * period starts from now (matching trip() behavior).
   */
  forceState(state: CircuitBreakerState): void {
    if (state === 'open') {
      this.lastOpenTime = Date.now();
    }
    this.transition(state);
  }

  /**
   * Get the current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get violation count in current window
   */
  getViolationCount(): number {
    const now = Date.now();
    return this.violations.filter((v) => now - v.timestamp < this.config.windowMs).length;
  }

  /**
   * Get time until the circuit breaker resets (if open)
   */
  getTimeUntilReset(): number {
    if (this.state !== 'open') {
      return 0;
    }
    const elapsed = Date.now() - this.lastOpenTime;
    return Math.max(0, this.config.cooldownMs - elapsed);
  }

  /**
   * Register an event handler
   */
  onEvent(handler: CircuitBreakerEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler
   */
  offEvent(handler: CircuitBreakerEventHandler): void {
    this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
  }

  /**
   * Transition to a new state
   */
  private transition(newState: CircuitBreakerState): void {
    if (this.state === newState) {
      return;
    }

    const oldState = this.state;
    this.state = newState;

    if (newState === 'half-open') {
      this.halfOpenSuccesses = 0;
    }

    // Map state to event type
    const eventMap: Record<CircuitBreakerState, CircuitBreakerEvent> = {
      open: 'open',
      closed: 'close',
      'half-open': 'half-open',
    };
    this.emit(eventMap[newState], { previousState: oldState });
  }

  /**
   * Emit an event to all handlers
   */
  private emit(event: CircuitBreakerEvent, data: Record<string, unknown>): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data);
      } catch {
        // Ignore handler errors
      }
    }
  }
}

// =============================================================================
// Metrics Collector
// =============================================================================

/**
 * Metrics window for time-based aggregation
 */
interface MetricsWindow {
  startTime: number;
  requestCount: number;
  blockedCount: number;
  warnedCount: number;
  latencySum: number;
  violationsByType: Record<string, number>;
  violationsBySeverity: Record<string, number>;
  costSum: number;
}

/**
 * Metrics collector for guardian operations
 */
export class MetricsCollector {
  private currentWindow: MetricsWindow;
  private windowDurationMs: number;
  private history: MetricsWindow[] = [];
  private maxHistoryWindows: number;
  private currency: string;

  constructor(
    options: {
      windowDurationMs?: number;
      maxHistoryWindows?: number;
      currency?: string;
    } = {}
  ) {
    this.windowDurationMs = options.windowDurationMs ?? 60000; // 1 minute
    this.maxHistoryWindows = options.maxHistoryWindows ?? 60; // 1 hour of history
    this.currency = options.currency ?? 'USD';
    this.currentWindow = this.createWindow();
  }

  /**
   * Record a request
   */
  recordRequest(options: {
    blocked: boolean;
    warned: boolean;
    latencyMs: number;
    violations: Violation[];
    cost?: number;
  }): void {
    this.rotateWindowIfNeeded();

    this.currentWindow.requestCount++;

    if (options.blocked) {
      this.currentWindow.blockedCount++;
    }

    if (options.warned) {
      this.currentWindow.warnedCount++;
    }

    this.currentWindow.latencySum += options.latencyMs;

    for (const violation of options.violations) {
      const typeKey = violation.type;
      this.currentWindow.violationsByType[typeKey] =
        (this.currentWindow.violationsByType[typeKey] ?? 0) + 1;

      const severityKey = violation.severity;
      this.currentWindow.violationsBySeverity[severityKey] =
        (this.currentWindow.violationsBySeverity[severityKey] ?? 0) + 1;
    }

    if (options.cost !== undefined) {
      this.currentWindow.costSum += options.cost;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(circuitBreakerState: CircuitBreakerState = 'closed'): GuardianMetrics {
    this.rotateWindowIfNeeded();

    // Aggregate all windows
    const allWindows = [...this.history, this.currentWindow];
    const totalRequests = allWindows.reduce((sum, w) => sum + w.requestCount, 0);
    const blockedRequests = allWindows.reduce((sum, w) => sum + w.blockedCount, 0);
    const warnedRequests = allWindows.reduce((sum, w) => sum + w.warnedCount, 0);
    const totalLatency = allWindows.reduce((sum, w) => sum + w.latencySum, 0);
    const totalCost = allWindows.reduce((sum, w) => sum + w.costSum, 0);

    // Aggregate violations by type
    const violationsByType: Record<GuardrailType, number> = {} as Record<GuardrailType, number>;
    for (const window of allWindows) {
      for (const [type, count] of Object.entries(window.violationsByType)) {
        violationsByType[type as GuardrailType] =
          (violationsByType[type as GuardrailType] ?? 0) + count;
      }
    }

    // Aggregate violations by severity
    const violationsBySeverity: Record<ViolationSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    for (const window of allWindows) {
      for (const [severity, count] of Object.entries(window.violationsBySeverity)) {
        violationsBySeverity[severity as ViolationSeverity] += count;
      }
    }

    // Calculate RPS
    const totalTimeMs =
      allWindows.length > 0 ? Date.now() - allWindows[0].startTime : this.windowDurationMs;
    const rps = totalTimeMs > 0 ? (totalRequests * 1000) / totalTimeMs : 0;

    // Calculate cost tracking
    // costPerMinute is computed as an actual rate (cost per 60s) based on recent activity
    const costPerMinute = this.getCostPerMinute();
    const costTracking: CostTracking | undefined =
      totalCost > 0
        ? {
            totalCost,
            costPerMinute,
            costPerHour: this.getHourlyCost(),
            costPerDay: this.getDailyCost(),
            currency: this.currency,
          }
        : undefined;

    return {
      totalRequests,
      blockedRequests,
      warnedRequests,
      allowedRequests: totalRequests - blockedRequests,
      violationsByType,
      violationsBySeverity,
      averageLatencyMs: totalRequests > 0 ? totalLatency / totalRequests : 0,
      circuitBreakerState,
      requestsPerSecond: rps,
      costTracking,
    };
  }

  /**
   * Get metrics for the current window only
   */
  getCurrentWindowMetrics(): Partial<GuardianMetrics> {
    return {
      totalRequests: this.currentWindow.requestCount,
      blockedRequests: this.currentWindow.blockedCount,
      warnedRequests: this.currentWindow.warnedCount,
      allowedRequests: this.currentWindow.requestCount - this.currentWindow.blockedCount,
      averageLatencyMs:
        this.currentWindow.requestCount > 0
          ? this.currentWindow.latencySum / this.currentWindow.requestCount
          : 0,
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.history = [];
    this.currentWindow = this.createWindow();
  }

  /**
   * Get cost per minute (actual rate based on elapsed time)
   *
   * To avoid extreme extrapolated values immediately after window rotation,
   * we require a minimum duration of data before extrapolating. If insufficient
   * data is available in the current window, we fall back to historical data.
   */
  private getCostPerMinute(): number {
    const now = Date.now();
    const windowElapsed = now - this.currentWindow.startTime;
    // Require at least 5 seconds of data before extrapolating
    const minDurationMs = 5000;

    if (windowElapsed >= minDurationMs) {
      // Sufficient data in current window - extrapolate to a full minute
      const effectiveDuration = Math.min(windowElapsed, 60000);
      return (this.currentWindow.costSum * 60000) / effectiveDuration;
    }

    // Not enough data in current window - use historical data if available
    if (this.history.length > 0) {
      const lastWindow = this.history[this.history.length - 1];
      if (lastWindow.costSum > 0) {
        // Use the last complete window's rate
        return (lastWindow.costSum * 60000) / this.windowDurationMs;
      }
    }

    // No historical data either - return 0 to avoid misleading extrapolation
    return 0;
  }

  /**
   * Get hourly cost
   */
  private getHourlyCost(): number {
    const hourAgo = Date.now() - 3600000;
    const hourlyWindows = this.history.filter((w) => w.startTime >= hourAgo);
    return hourlyWindows.reduce((sum, w) => sum + w.costSum, 0) + this.currentWindow.costSum;
  }

  /**
   * Get daily cost (estimated based on available data)
   */
  private getDailyCost(): number {
    const allWindows = [...this.history, this.currentWindow];
    const totalCost = allWindows.reduce((sum, w) => sum + w.costSum, 0);
    const totalTimeMs =
      allWindows.length > 0 ? Date.now() - allWindows[0].startTime : this.windowDurationMs;

    // Extrapolate to 24 hours
    const dayMs = 24 * 60 * 60 * 1000;
    return totalTimeMs > 0 ? (totalCost * dayMs) / totalTimeMs : 0;
  }

  /**
   * Create a new metrics window
   */
  private createWindow(): MetricsWindow {
    return {
      startTime: Date.now(),
      requestCount: 0,
      blockedCount: 0,
      warnedCount: 0,
      latencySum: 0,
      violationsByType: {},
      violationsBySeverity: {},
      costSum: 0,
    };
  }

  /**
   * Rotate to a new window if needed
   */
  private rotateWindowIfNeeded(): void {
    const now = Date.now();
    if (now - this.currentWindow.startTime >= this.windowDurationMs) {
      this.history.push(this.currentWindow);

      // Trim history
      while (this.history.length > this.maxHistoryWindows) {
        this.history.shift();
      }

      this.currentWindow = this.createWindow();
    }
  }
}

// =============================================================================
// Rate Limiter
// =============================================================================

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  burstLimit?: number;
}

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private minuteWindow: { count: number; startTime: number };
  private hourWindow: { count: number; startTime: number };
  private dayWindow: { count: number; startTime: number };
  private burstTokens: number;
  private lastBurstRefill: number;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    const now = Date.now();
    this.minuteWindow = { count: 0, startTime: now };
    this.hourWindow = { count: 0, startTime: now };
    this.dayWindow = { count: 0, startTime: now };
    this.burstTokens = config.burstLimit ?? 10;
    this.lastBurstRefill = now;
  }

  /**
   * Check if a request is allowed
   */
  allowRequest(): { allowed: boolean; reason?: string; retryAfterMs?: number } {
    const now = Date.now();
    this.refillBurstTokens(now);
    this.rotateWindows(now);

    // Check burst limit
    if (this.config.burstLimit !== undefined && this.burstTokens <= 0) {
      return {
        allowed: false,
        reason: 'Burst limit exceeded',
        retryAfterMs: 1000, // Wait 1 second
      };
    }

    // Check minute limit
    if (
      this.config.requestsPerMinute !== undefined &&
      this.minuteWindow.count >= this.config.requestsPerMinute
    ) {
      const retryAfterMs = 60000 - (now - this.minuteWindow.startTime);
      return {
        allowed: false,
        reason: 'Requests per minute limit exceeded',
        retryAfterMs,
      };
    }

    // Check hour limit
    if (
      this.config.requestsPerHour !== undefined &&
      this.hourWindow.count >= this.config.requestsPerHour
    ) {
      const retryAfterMs = 3600000 - (now - this.hourWindow.startTime);
      return {
        allowed: false,
        reason: 'Requests per hour limit exceeded',
        retryAfterMs,
      };
    }

    // Check day limit
    if (
      this.config.requestsPerDay !== undefined &&
      this.dayWindow.count >= this.config.requestsPerDay
    ) {
      const retryAfterMs = 86400000 - (now - this.dayWindow.startTime);
      return {
        allowed: false,
        reason: 'Requests per day limit exceeded',
        retryAfterMs,
      };
    }

    // Request allowed, consume tokens
    this.minuteWindow.count++;
    this.hourWindow.count++;
    this.dayWindow.count++;
    if (this.config.burstLimit !== undefined) {
      this.burstTokens--;
    }

    return { allowed: true };
  }

  /**
   * Get current rate limit status
   */
  getStatus(): {
    minuteUsed: number;
    minuteLimit?: number;
    hourUsed: number;
    hourLimit?: number;
    dayUsed: number;
    dayLimit?: number;
    burstTokens: number;
    burstLimit?: number;
  } {
    return {
      minuteUsed: this.minuteWindow.count,
      minuteLimit: this.config.requestsPerMinute,
      hourUsed: this.hourWindow.count,
      hourLimit: this.config.requestsPerHour,
      dayUsed: this.dayWindow.count,
      dayLimit: this.config.requestsPerDay,
      burstTokens: this.burstTokens,
      burstLimit: this.config.burstLimit,
    };
  }

  /**
   * Reset all rate limits
   */
  reset(): void {
    const now = Date.now();
    this.minuteWindow = { count: 0, startTime: now };
    this.hourWindow = { count: 0, startTime: now };
    this.dayWindow = { count: 0, startTime: now };
    this.burstTokens = this.config.burstLimit ?? 10;
    this.lastBurstRefill = now;
  }

  /**
   * Refill burst tokens
   */
  private refillBurstTokens(now: number): void {
    if (this.config.burstLimit === undefined) {
      return;
    }

    const elapsed = now - this.lastBurstRefill;
    const tokensToAdd = Math.floor(elapsed / 1000); // 1 token per second

    if (tokensToAdd > 0) {
      this.burstTokens = Math.min(this.config.burstLimit, this.burstTokens + tokensToAdd);
      // Preserve sub-second precision to avoid refill rate drift
      this.lastBurstRefill += tokensToAdd * 1000;
    }
  }

  /**
   * Rotate time windows using sliding window approximation.
   *
   * To prevent the fixed-window burst vulnerability (allowing 2× the limit at
   * window boundaries), we use a sliding window approximation: when a window
   * rotates, we carry over a proportional count from the previous window based
   * on how much of the new window overlaps with the old one.
   */
  private rotateWindows(now: number): void {
    // Rotate minute window with sliding approximation
    const minuteElapsed = now - this.minuteWindow.startTime;
    if (minuteElapsed >= 60000) {
      // Calculate overlap ratio: how much of the previous window is still relevant
      const overlapMs = Math.max(0, 120000 - minuteElapsed); // 2 windows - elapsed
      const overlapRatio = Math.min(1, overlapMs / 60000);
      const carryOver = Math.floor(this.minuteWindow.count * overlapRatio);
      this.minuteWindow = { count: carryOver, startTime: now - (minuteElapsed % 60000) };
    }

    // Rotate hour window with sliding approximation
    const hourElapsed = now - this.hourWindow.startTime;
    if (hourElapsed >= 3600000) {
      const overlapMs = Math.max(0, 7200000 - hourElapsed);
      const overlapRatio = Math.min(1, overlapMs / 3600000);
      const carryOver = Math.floor(this.hourWindow.count * overlapRatio);
      this.hourWindow = { count: carryOver, startTime: now - (hourElapsed % 3600000) };
    }

    // Rotate day window with sliding approximation
    const dayElapsed = now - this.dayWindow.startTime;
    if (dayElapsed >= 86400000) {
      const overlapMs = Math.max(0, 172800000 - dayElapsed);
      const overlapRatio = Math.min(1, overlapMs / 86400000);
      const carryOver = Math.floor(this.dayWindow.count * overlapRatio);
      this.dayWindow = { count: carryOver, startTime: now - (dayElapsed % 86400000) };
    }
  }
}
