/**
 * Tests for Guardian mode normalization (v0.3.2+)
 */

import { describe, expect, mock, test } from 'bun:test';
import { Guardian, createGuardian, normalizeGuardianMode } from '../guardian';

describe('Guardian Mode Normalization', () => {
  describe('normalizeGuardianMode', () => {
    test('should return canonical modes unchanged', () => {
      expect(normalizeGuardianMode('observe')).toBe('observe');
      expect(normalizeGuardianMode('selective')).toBe('selective');
      expect(normalizeGuardianMode('strict')).toBe('strict');
    });

    test('should map legacy modes to canonical modes', () => {
      // Capture console.warn calls
      const warnCalls: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnCalls.push(String(args[0]));
      };

      try {
        expect(normalizeGuardianMode('testing')).toBe('observe');
        expect(normalizeGuardianMode('guardian')).toBe('strict');
        expect(normalizeGuardianMode('hybrid')).toBe('selective');

        // Verify deprecation warnings were emitted
        expect(warnCalls.length).toBe(3);
        expect(warnCalls[0]).toContain("Mode 'testing' is deprecated");
        expect(warnCalls[0]).toContain("Use 'observe' instead");
        expect(warnCalls[1]).toContain("Mode 'guardian' is deprecated");
        expect(warnCalls[1]).toContain("Use 'strict' instead");
        expect(warnCalls[2]).toContain("Mode 'hybrid' is deprecated");
        expect(warnCalls[2]).toContain("Use 'selective' instead");
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe('Guardian constructor mode handling', () => {
    test('should default to strict mode', () => {
      const guardian = createGuardian();
      expect(guardian.getMode()).toBe('strict');
    });

    test('should accept canonical modes', () => {
      const observeGuardian = createGuardian({ mode: 'observe' });
      expect(observeGuardian.getMode()).toBe('observe');

      const selectiveGuardian = createGuardian({ mode: 'selective' });
      expect(selectiveGuardian.getMode()).toBe('selective');

      const strictGuardian = createGuardian({ mode: 'strict' });
      expect(strictGuardian.getMode()).toBe('strict');
    });

    test('should normalize legacy modes with deprecation warning', () => {
      const warnCalls: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnCalls.push(String(args[0]));
      };

      try {
        const testingGuardian = createGuardian({ mode: 'testing' });
        expect(testingGuardian.getMode()).toBe('observe');

        const guardianModeGuardian = createGuardian({ mode: 'guardian' });
        expect(guardianModeGuardian.getMode()).toBe('strict');

        const hybridGuardian = createGuardian({ mode: 'hybrid' });
        expect(hybridGuardian.getMode()).toBe('selective');

        // Verify warnings were logged
        expect(warnCalls.length).toBe(3);
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe('shouldBlock based on mode', () => {
    test('observe mode should never block', () => {
      const guardian = createGuardian({ mode: 'observe' });

      const lowViolation = {
        id: '1',
        type: 'injection_detection' as const,
        severity: 'low' as const,
        message: 'Test',
        timestamp: new Date(),
        action: 'block' as const,
        blocked: true,
      };

      const criticalViolation = {
        id: '2',
        type: 'injection_detection' as const,
        severity: 'critical' as const,
        message: 'Test',
        timestamp: new Date(),
        action: 'block' as const,
        blocked: true,
      };

      expect(guardian.shouldBlock(lowViolation)).toBe(false);
      expect(guardian.shouldBlock(criticalViolation)).toBe(false);
    });

    test('selective mode should block only high/critical severity', () => {
      const guardian = createGuardian({ mode: 'selective' });

      const lowViolation = {
        id: '1',
        type: 'injection_detection' as const,
        severity: 'low' as const,
        message: 'Test',
        timestamp: new Date(),
        action: 'block' as const,
        blocked: true,
      };

      const mediumViolation = {
        id: '2',
        type: 'injection_detection' as const,
        severity: 'medium' as const,
        message: 'Test',
        timestamp: new Date(),
        action: 'block' as const,
        blocked: true,
      };

      const highViolation = {
        id: '3',
        type: 'injection_detection' as const,
        severity: 'high' as const,
        message: 'Test',
        timestamp: new Date(),
        action: 'block' as const,
        blocked: true,
      };

      const criticalViolation = {
        id: '4',
        type: 'injection_detection' as const,
        severity: 'critical' as const,
        message: 'Test',
        timestamp: new Date(),
        action: 'block' as const,
        blocked: true,
      };

      expect(guardian.shouldBlock(lowViolation)).toBe(false);
      expect(guardian.shouldBlock(mediumViolation)).toBe(false);
      expect(guardian.shouldBlock(highViolation)).toBe(true);
      expect(guardian.shouldBlock(criticalViolation)).toBe(true);
    });

    test('strict mode should always block', () => {
      const guardian = createGuardian({ mode: 'strict' });

      const lowViolation = {
        id: '1',
        type: 'injection_detection' as const,
        severity: 'low' as const,
        message: 'Test',
        timestamp: new Date(),
        action: 'block' as const,
        blocked: true,
      };

      const criticalViolation = {
        id: '2',
        type: 'injection_detection' as const,
        severity: 'critical' as const,
        message: 'Test',
        timestamp: new Date(),
        action: 'block' as const,
        blocked: true,
      };

      expect(guardian.shouldBlock(lowViolation)).toBe(true);
      expect(guardian.shouldBlock(criticalViolation)).toBe(true);
    });
  });

  describe('getContentValidationConfig', () => {
    test('should return default config when not specified', () => {
      const guardian = createGuardian();
      const config = guardian.getContentValidationConfig();

      expect(config.strategy).toBe('semantic');
      expect(config.semanticThreshold).toBe(0.9);
    });

    test('should return custom config when specified', () => {
      const guardian = createGuardian({
        contentValidation: {
          strategy: 'pattern',
          semanticThreshold: 0.8,
          categories: ['prompt_injection'],
        },
      });

      const config = guardian.getContentValidationConfig();
      expect(config.strategy).toBe('pattern');
      expect(config.semanticThreshold).toBe(0.8);
      expect(config.categories).toContain('prompt_injection');
    });
  });
});
