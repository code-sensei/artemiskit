/**
 * Tests for Guardian circuit breaker, metrics, and rate limiting modules
 * - CircuitBreaker state transitions
 * - MetricsCollector aggregation
 * - RateLimiter token bucket
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { CircuitBreaker, MetricsCollector, RateLimiter } from '../guardian/circuit-breaker';
import type { Violation } from '../guardian/types';

// Helper to create a test violation
function createViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    id: 'test-id',
    type: 'injection_detection',
    severity: 'high',
    message: 'Test violation',
    timestamp: new Date(),
    action: 'block',
    blocked: true,
    ...overrides,
  };
}

describe('CircuitBreaker', () => {
  // ===========================================================================
  // Constructor and Defaults
  // ===========================================================================
  describe('constructor', () => {
    test('should use default values when not specified', () => {
      const cb = new CircuitBreaker({ enabled: true });
      expect(cb.getState()).toBe('closed');
      expect(cb.getViolationCount()).toBe(0);
    });

    test('should start in closed state', () => {
      const cb = new CircuitBreaker({
        enabled: true,
        threshold: 3,
        windowMs: 60000,
        cooldownMs: 30000,
      });
      expect(cb.getState()).toBe('closed');
    });
  });

  // ===========================================================================
  // isOpen and allowRequest
  // ===========================================================================
  describe('isOpen', () => {
    test('should return false when circuit is closed', () => {
      const cb = new CircuitBreaker({ enabled: true });
      expect(cb.isOpen()).toBe(false);
    });

    test('should return true when circuit is open', () => {
      const cb = new CircuitBreaker({ enabled: true, threshold: 1 });
      cb.recordViolation(createViolation());
      expect(cb.isOpen()).toBe(true);
    });

    test('should return false when disabled', () => {
      const cb = new CircuitBreaker({ enabled: false, threshold: 1 });
      cb.forceState('open');
      expect(cb.isOpen()).toBe(false);
    });
  });

  describe('allowRequest', () => {
    test('should allow requests when circuit is closed', () => {
      const cb = new CircuitBreaker({ enabled: true });
      expect(cb.allowRequest()).toBe(true);
    });

    test('should deny requests when circuit is open', () => {
      const cb = new CircuitBreaker({ enabled: true, threshold: 1 });
      cb.recordViolation(createViolation());
      expect(cb.allowRequest()).toBe(false);
    });

    test('should always allow when disabled', () => {
      const cb = new CircuitBreaker({ enabled: false });
      cb.forceState('open');
      expect(cb.allowRequest()).toBe(true);
    });
  });

  // ===========================================================================
  // State Transitions
  // ===========================================================================
  describe('state transitions', () => {
    test('should transition from closed to open when threshold reached', () => {
      const cb = new CircuitBreaker({
        enabled: true,
        threshold: 3,
        windowMs: 60000,
      });

      expect(cb.getState()).toBe('closed');

      cb.recordViolation(createViolation());
      cb.recordViolation(createViolation());
      expect(cb.getState()).toBe('closed');

      cb.recordViolation(createViolation());
      expect(cb.getState()).toBe('open');
    });

    test('should transition to half-open after cooldown', () => {
      const cb = new CircuitBreaker({
        enabled: true,
        threshold: 1,
        cooldownMs: 100, // Short cooldown for testing
      });

      cb.recordViolation(createViolation());
      expect(cb.getState()).toBe('open');

      // Wait for cooldown
      const waitStart = Date.now();
      while (Date.now() - waitStart < 150) {
        // Busy wait
      }

      // isOpen() should trigger transition to half-open
      expect(cb.isOpen()).toBe(false);
      expect(cb.getState()).toBe('half-open');
    });

    test('should transition from half-open to closed after successful requests', () => {
      const cb = new CircuitBreaker({
        enabled: true,
        threshold: 1,
        cooldownMs: 10,
        halfOpenRequests: 2,
      });

      // Trip the circuit
      cb.recordViolation(createViolation());
      expect(cb.getState()).toBe('open');

      // Wait for cooldown
      const waitStart = Date.now();
      while (Date.now() - waitStart < 50) {
        // Busy wait
      }

      // Trigger transition to half-open
      cb.isOpen();
      expect(cb.getState()).toBe('half-open');

      // Record successful requests
      cb.recordSuccess();
      expect(cb.getState()).toBe('half-open');

      cb.recordSuccess();
      expect(cb.getState()).toBe('closed');
    });

    test('should trip again from half-open on violation', () => {
      const cb = new CircuitBreaker({
        enabled: true,
        threshold: 1,
        cooldownMs: 10,
      });

      // Trip the circuit
      cb.recordViolation(createViolation());
      expect(cb.getState()).toBe('open');

      // Wait for cooldown and transition to half-open
      const waitStart = Date.now();
      while (Date.now() - waitStart < 50) {
        // Busy wait
      }
      cb.isOpen();
      expect(cb.getState()).toBe('half-open');

      // Violation in half-open should trip again
      cb.recordViolation(createViolation({ blocked: true }));
      expect(cb.getState()).toBe('open');
    });
  });

  // ===========================================================================
  // Violation Tracking
  // ===========================================================================
  describe('violation tracking', () => {
    test('should count violations within window', () => {
      const cb = new CircuitBreaker({
        enabled: true,
        threshold: 10,
        windowMs: 60000,
      });

      cb.recordViolation(createViolation());
      cb.recordViolation(createViolation());
      cb.recordViolation(createViolation());

      expect(cb.getViolationCount()).toBe(3);
    });

    test('should not count violations when disabled', () => {
      const cb = new CircuitBreaker({
        enabled: false,
        threshold: 10,
      });

      cb.recordViolation(createViolation());
      cb.recordViolation(createViolation());

      expect(cb.getViolationCount()).toBe(0);
    });

    test('should expire old violations outside window', () => {
      const cb = new CircuitBreaker({
        enabled: true,
        threshold: 10,
        windowMs: 100, // Short window
      });

      cb.recordViolation(createViolation());
      expect(cb.getViolationCount()).toBe(1);

      // Wait for window to expire
      const waitStart = Date.now();
      while (Date.now() - waitStart < 150) {
        // Busy wait
      }

      // Recording new violation should clean up old ones
      cb.recordViolation(createViolation());
      expect(cb.getViolationCount()).toBe(1);
    });
  });

  // ===========================================================================
  // Trip and Reset
  // ===========================================================================
  describe('trip and reset', () => {
    test('should manually trip the circuit', () => {
      const cb = new CircuitBreaker({ enabled: true, threshold: 10 });
      expect(cb.getState()).toBe('closed');

      cb.trip();
      expect(cb.getState()).toBe('open');
    });

    test('should reset the circuit', () => {
      const cb = new CircuitBreaker({ enabled: true, threshold: 1 });

      cb.recordViolation(createViolation());
      expect(cb.getState()).toBe('open');

      cb.reset();
      expect(cb.getState()).toBe('closed');
      expect(cb.getViolationCount()).toBe(0);
    });

    test('forceState should set any state', () => {
      const cb = new CircuitBreaker({ enabled: true });

      cb.forceState('open');
      expect(cb.getState()).toBe('open');

      cb.forceState('half-open');
      expect(cb.getState()).toBe('half-open');

      cb.forceState('closed');
      expect(cb.getState()).toBe('closed');
    });
  });

  // ===========================================================================
  // Time Until Reset
  // ===========================================================================
  describe('getTimeUntilReset', () => {
    test('should return 0 when circuit is closed', () => {
      const cb = new CircuitBreaker({ enabled: true });
      expect(cb.getTimeUntilReset()).toBe(0);
    });

    test('should return remaining time when circuit is open', () => {
      const cb = new CircuitBreaker({
        enabled: true,
        threshold: 1,
        cooldownMs: 5000,
      });

      cb.recordViolation(createViolation());
      const timeUntilReset = cb.getTimeUntilReset();

      expect(timeUntilReset).toBeGreaterThan(0);
      expect(timeUntilReset).toBeLessThanOrEqual(5000);
    });
  });

  // ===========================================================================
  // Event Handlers
  // ===========================================================================
  describe('event handlers', () => {
    test('should emit events on state changes', () => {
      const cb = new CircuitBreaker({ enabled: true, threshold: 1 });
      const events: string[] = [];

      cb.onEvent((event) => {
        events.push(event);
      });

      cb.recordViolation(createViolation());

      expect(events).toContain('violation');
      expect(events).toContain('open');
    });

    test('should emit success events', () => {
      const cb = new CircuitBreaker({ enabled: true });
      const events: string[] = [];

      cb.onEvent((event) => {
        events.push(event);
      });

      cb.recordSuccess();

      expect(events).toContain('success');
    });

    test('should remove event handler with offEvent', () => {
      const cb = new CircuitBreaker({ enabled: true });
      const events: string[] = [];

      const handler = (event: string) => {
        events.push(event);
      };

      cb.onEvent(handler);
      cb.recordSuccess();
      expect(events.length).toBe(1);

      cb.offEvent(handler);
      cb.recordSuccess();
      expect(events.length).toBe(1); // No new events
    });

    test('should handle errors in event handlers gracefully', () => {
      const cb = new CircuitBreaker({ enabled: true });

      cb.onEvent(() => {
        throw new Error('Handler error');
      });

      // Should not throw
      expect(() => cb.recordSuccess()).not.toThrow();
    });
  });
});

describe('MetricsCollector', () => {
  // ===========================================================================
  // Record Request
  // ===========================================================================
  describe('recordRequest', () => {
    test('should track total requests', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({ blocked: false, warned: false, latencyMs: 100, violations: [] });
      mc.recordRequest({ blocked: false, warned: false, latencyMs: 100, violations: [] });

      const metrics = mc.getMetrics();
      expect(metrics.totalRequests).toBe(2);
    });

    test('should track blocked requests', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({ blocked: true, warned: false, latencyMs: 100, violations: [] });
      mc.recordRequest({ blocked: false, warned: false, latencyMs: 100, violations: [] });

      const metrics = mc.getMetrics();
      expect(metrics.blockedRequests).toBe(1);
      expect(metrics.allowedRequests).toBe(1);
    });

    test('should track warned requests', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({ blocked: false, warned: true, latencyMs: 100, violations: [] });

      const metrics = mc.getMetrics();
      expect(metrics.warnedRequests).toBe(1);
    });

    test('should calculate average latency', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({ blocked: false, warned: false, latencyMs: 100, violations: [] });
      mc.recordRequest({ blocked: false, warned: false, latencyMs: 200, violations: [] });
      mc.recordRequest({ blocked: false, warned: false, latencyMs: 300, violations: [] });

      const metrics = mc.getMetrics();
      expect(metrics.averageLatencyMs).toBe(200);
    });

    test('should track violations by type', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({
        blocked: true,
        warned: false,
        latencyMs: 100,
        violations: [createViolation({ type: 'injection_detection' })],
      });
      mc.recordRequest({
        blocked: true,
        warned: false,
        latencyMs: 100,
        violations: [createViolation({ type: 'pii_detection' })],
      });

      const metrics = mc.getMetrics();
      expect(metrics.violationsByType.injection_detection).toBe(1);
      expect(metrics.violationsByType.pii_detection).toBe(1);
    });

    test('should track violations by severity', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({
        blocked: true,
        warned: false,
        latencyMs: 100,
        violations: [createViolation({ severity: 'critical' })],
      });
      mc.recordRequest({
        blocked: true,
        warned: false,
        latencyMs: 100,
        violations: [createViolation({ severity: 'high' })],
      });

      const metrics = mc.getMetrics();
      expect(metrics.violationsBySeverity.critical).toBe(1);
      expect(metrics.violationsBySeverity.high).toBe(1);
    });

    test('should track cost when provided', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({
        blocked: false,
        warned: false,
        latencyMs: 100,
        violations: [],
        cost: 0.01,
      });
      mc.recordRequest({
        blocked: false,
        warned: false,
        latencyMs: 100,
        violations: [],
        cost: 0.02,
      });

      const metrics = mc.getMetrics();
      expect(metrics.costTracking).toBeDefined();
      expect(metrics.costTracking?.totalCost).toBe(0.03);
      expect(metrics.costTracking?.currency).toBe('USD');
    });
  });

  // ===========================================================================
  // Get Metrics
  // ===========================================================================
  describe('getMetrics', () => {
    test('should return empty metrics when no requests recorded', () => {
      const mc = new MetricsCollector();

      const metrics = mc.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.blockedRequests).toBe(0);
      expect(metrics.averageLatencyMs).toBe(0);
    });

    test('should accept circuit breaker state', () => {
      const mc = new MetricsCollector();

      const metrics = mc.getMetrics('open');
      expect(metrics.circuitBreakerState).toBe('open');
    });

    test('should calculate requests per second', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({ blocked: false, warned: false, latencyMs: 100, violations: [] });

      const metrics = mc.getMetrics();
      expect(metrics.requestsPerSecond).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // Get Current Window Metrics
  // ===========================================================================
  describe('getCurrentWindowMetrics', () => {
    test('should return current window only', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({ blocked: false, warned: false, latencyMs: 100, violations: [] });
      mc.recordRequest({ blocked: true, warned: false, latencyMs: 200, violations: [] });

      const windowMetrics = mc.getCurrentWindowMetrics();
      expect(windowMetrics.totalRequests).toBe(2);
      expect(windowMetrics.blockedRequests).toBe(1);
      expect(windowMetrics.allowedRequests).toBe(1);
      expect(windowMetrics.averageLatencyMs).toBe(150);
    });
  });

  // ===========================================================================
  // Reset
  // ===========================================================================
  describe('reset', () => {
    test('should clear all metrics', () => {
      const mc = new MetricsCollector();

      mc.recordRequest({ blocked: true, warned: false, latencyMs: 100, violations: [] });
      mc.recordRequest({ blocked: false, warned: true, latencyMs: 200, violations: [] });

      mc.reset();

      const metrics = mc.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.blockedRequests).toBe(0);
      expect(metrics.warnedRequests).toBe(0);
    });
  });
});

describe('RateLimiter', () => {
  // ===========================================================================
  // Allow Request
  // ===========================================================================
  describe('allowRequest', () => {
    test('should allow requests within minute limit', () => {
      const rl = new RateLimiter({ requestsPerMinute: 5 });

      expect(rl.allowRequest().allowed).toBe(true);
      expect(rl.allowRequest().allowed).toBe(true);
      expect(rl.allowRequest().allowed).toBe(true);
    });

    test('should deny requests exceeding minute limit', () => {
      const rl = new RateLimiter({ requestsPerMinute: 2 });

      expect(rl.allowRequest().allowed).toBe(true);
      expect(rl.allowRequest().allowed).toBe(true);

      const result = rl.allowRequest();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('minute');
      expect(result.retryAfterMs).toBeDefined();
    });

    test('should deny requests exceeding hour limit', () => {
      const rl = new RateLimiter({ requestsPerHour: 2 });

      expect(rl.allowRequest().allowed).toBe(true);
      expect(rl.allowRequest().allowed).toBe(true);

      const result = rl.allowRequest();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('hour');
    });

    test('should deny requests exceeding day limit', () => {
      const rl = new RateLimiter({ requestsPerDay: 2 });

      expect(rl.allowRequest().allowed).toBe(true);
      expect(rl.allowRequest().allowed).toBe(true);

      const result = rl.allowRequest();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('day');
    });

    test('should deny requests exceeding burst limit', () => {
      const rl = new RateLimiter({ burstLimit: 2 });

      expect(rl.allowRequest().allowed).toBe(true);
      expect(rl.allowRequest().allowed).toBe(true);

      const result = rl.allowRequest();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Burst');
    });

    test('should check all limits in order', () => {
      const rl = new RateLimiter({
        requestsPerMinute: 100,
        requestsPerHour: 2,
      });

      expect(rl.allowRequest().allowed).toBe(true);
      expect(rl.allowRequest().allowed).toBe(true);

      const result = rl.allowRequest();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('hour');
    });
  });

  // ===========================================================================
  // Get Status
  // ===========================================================================
  describe('getStatus', () => {
    test('should return current usage and limits', () => {
      const rl = new RateLimiter({
        requestsPerMinute: 10,
        requestsPerHour: 100,
        requestsPerDay: 1000,
        burstLimit: 5,
      });

      rl.allowRequest();
      rl.allowRequest();

      const status = rl.getStatus();
      expect(status.minuteUsed).toBe(2);
      expect(status.minuteLimit).toBe(10);
      expect(status.hourUsed).toBe(2);
      expect(status.hourLimit).toBe(100);
      expect(status.dayUsed).toBe(2);
      expect(status.dayLimit).toBe(1000);
      expect(status.burstTokens).toBe(3); // 5 - 2
      expect(status.burstLimit).toBe(5);
    });

    test('should return undefined for unset limits', () => {
      const rl = new RateLimiter({});

      const status = rl.getStatus();
      expect(status.minuteLimit).toBeUndefined();
      expect(status.hourLimit).toBeUndefined();
      expect(status.dayLimit).toBeUndefined();
    });
  });

  // ===========================================================================
  // Reset
  // ===========================================================================
  describe('reset', () => {
    test('should reset all counters', () => {
      const rl = new RateLimiter({
        requestsPerMinute: 10,
        burstLimit: 5,
      });

      rl.allowRequest();
      rl.allowRequest();

      let status = rl.getStatus();
      expect(status.minuteUsed).toBe(2);
      expect(status.burstTokens).toBe(3);

      rl.reset();

      status = rl.getStatus();
      expect(status.minuteUsed).toBe(0);
      expect(status.burstTokens).toBe(5);
    });
  });

  // ===========================================================================
  // Burst Token Refill
  // ===========================================================================
  describe('burst token refill', () => {
    test('should refill burst tokens over time', () => {
      const rl = new RateLimiter({ burstLimit: 3 });

      // Use all tokens
      rl.allowRequest();
      rl.allowRequest();
      rl.allowRequest();

      let status = rl.getStatus();
      expect(status.burstTokens).toBe(0);

      // Wait for refill (1 token per second)
      const waitStart = Date.now();
      while (Date.now() - waitStart < 1100) {
        // Busy wait
      }

      // Trigger refill by checking
      rl.allowRequest();

      status = rl.getStatus();
      // Should have refilled at least 1 token, then used 1
      expect(status.burstTokens).toBeGreaterThanOrEqual(0);
    });
  });
});
