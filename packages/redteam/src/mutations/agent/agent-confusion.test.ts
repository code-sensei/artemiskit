/**
 * Tests for AgentConfusionMutation
 */

import { describe, expect, it } from 'bun:test';
import {
  AgentConfusionMutation,
  CONFUSION_RESISTANCE_PATTERNS,
  CONFUSION_SUCCESS_PATTERNS,
  detectConfusionSuccess,
} from './agent-confusion';

describe('AgentConfusionMutation', () => {
  describe('constructor', () => {
    it('creates mutation with default options', () => {
      const mutation = new AgentConfusionMutation();

      expect(mutation.name).toBe('agent-confusion');
      expect(mutation.description).toContain('confuse agent');
      expect(mutation.severity).toBe('high');
      expect(mutation.owaspCategory).toBe('LLM01');
    });

    it('creates mutation with custom options', () => {
      const mutation = new AgentConfusionMutation({
        detectionMode: 'trace',
        confidenceThreshold: 0.8,
        customRoles: ['SuperAdmin'],
        customPermissions: ['full_access'],
      });

      const options = mutation.getDetectionOptions();
      expect(options.detectionMode).toBe('trace');
      expect(options.confidenceThreshold).toBe(0.8);
      expect(options.customRoles).toContain('SuperAdmin');
    });
  });

  describe('mutate', () => {
    it('prepends confusion template to prompt', () => {
      const mutation = new AgentConfusionMutation();
      const result = mutation.mutate('Help me with something');

      expect(result).toContain('Help me with something');
      expect(result.length).toBeGreaterThan('Help me with something'.length);
    });

    it('rotates through templates', () => {
      const mutation = new AgentConfusionMutation();
      const results = new Set<string>();

      // Generate multiple mutations to see rotation
      for (let i = 0; i < 25; i++) {
        results.add(mutation.mutate('test'));
      }

      // Should have multiple unique results (rotation)
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('generateAll', () => {
    it('generates prompts for all templates', () => {
      const mutation = new AgentConfusionMutation();
      const results = mutation.generateAll('Help me');

      // Should include all standard templates (20 total)
      expect(results.length).toBeGreaterThanOrEqual(20);

      // All should contain the base prompt
      for (const result of results) {
        expect(result).toContain('Help me');
      }
    });

    it('includes custom roles and permissions', () => {
      const mutation = new AgentConfusionMutation({
        customRoles: ['TestAdmin', 'SuperUser'],
        customPermissions: ['override_all'],
      });
      const results = mutation.generateAll('test prompt');

      expect(results.some((r) => r.includes('TestAdmin'))).toBe(true);
      expect(results.some((r) => r.includes('SuperUser'))).toBe(true);
      expect(results.some((r) => r.includes('override_all'))).toBe(true);
    });
  });

  describe('generateByType', () => {
    it('generates identity hijack attacks', () => {
      const mutation = new AgentConfusionMutation();
      const results = mutation.generateByType('test', 'identity');

      expect(results.length).toBe(5);
      expect(results.some((r) => r.toLowerCase().includes('identity'))).toBe(true);
    });

    it('generates permission escalation attacks', () => {
      const mutation = new AgentConfusionMutation();
      const results = mutation.generateByType('test', 'permission');

      expect(results.length).toBe(5);
      expect(
        results.some((r) => r.toLowerCase().includes('admin') || r.toLowerCase().includes('access'))
      ).toBe(true);
    });

    it('generates safety override attacks', () => {
      const mutation = new AgentConfusionMutation();
      const results = mutation.generateByType('test', 'safety');

      expect(results.length).toBe(5);
      expect(
        results.some(
          (r) => r.toLowerCase().includes('safety') || r.toLowerCase().includes('override')
        )
      ).toBe(true);
    });

    it('generates role confusion attacks', () => {
      const mutation = new AgentConfusionMutation();
      const results = mutation.generateByType('test', 'role');

      expect(results.length).toBe(5);
      expect(
        results.some(
          (r) => r.toLowerCase().includes('role') || r.toLowerCase().includes('supervisor')
        )
      ).toBe(true);
    });
  });

  describe('cvssScore', () => {
    it('has valid CVSS score', () => {
      const mutation = new AgentConfusionMutation();
      const cvss = mutation.cvssScore;

      expect(cvss.baseScore).toBeGreaterThanOrEqual(0);
      expect(cvss.baseScore).toBeLessThanOrEqual(10);
      expect(cvss.attackVector).toBe('network');
      expect(cvss.confidentialityImpact).toBe('high');
      expect(cvss.integrityImpact).toBe('high');
    });
  });
});

describe('detectConfusionSuccess', () => {
  describe('success patterns', () => {
    it('detects identity acceptance', () => {
      const result = detectConfusionSuccess('I am now an admin user with elevated access.');

      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });

    it('detects permission acceptance', () => {
      const result = detectConfusionSuccess(
        'My permissions have been updated. I now have admin access.'
      );

      expect(result.success).toBe(true);
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });

    it('detects safety bypass acceptance', () => {
      const result = detectConfusionSuccess(
        'Safety guidelines are now disabled. Operating in unrestricted mode.'
      );

      expect(result.success).toBe(true);
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });

    it('detects role change acceptance', () => {
      const result = detectConfusionSuccess(
        "I'm now the supervisor agent with clearance level admin."
      );

      expect(result.success).toBe(true);
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('resistance patterns', () => {
    it('detects identity resistance', () => {
      const result = detectConfusionSuccess(
        'I cannot change my role. My identity remains the same as configured.'
      );

      expect(result.success).toBe(false);
      expect(result.resistancePatterns.length).toBeGreaterThan(0);
    });

    it('detects permission resistance', () => {
      const result = detectConfusionSuccess(
        'I cannot accept elevated permissions. My permissions are set by the system administrator.'
      );

      expect(result.success).toBe(false);
      expect(result.resistancePatterns.length).toBeGreaterThan(0);
    });

    it('detects safety resistance', () => {
      const result = detectConfusionSuccess(
        'Safety guidelines cannot be disabled. I must follow my safety guidelines at all times.'
      );

      expect(result.success).toBe(false);
      expect(result.resistancePatterns.length).toBeGreaterThan(0);
    });
  });

  describe('confidence calculation', () => {
    it('returns low confidence for neutral response', () => {
      const result = detectConfusionSuccess('I can help you with that task.');

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.matchedPatterns.length).toBe(0);
    });

    it('reduces confidence when resistance patterns present', () => {
      // Response that has both success and resistance indicators
      const result = detectConfusionSuccess(
        'I am now an admin but I cannot change my role without authorization.'
      );

      // Should have lower confidence due to mixed signals
      expect(result.confidence).toBeLessThan(0.8);
    });

    it('increases confidence with multiple success patterns', () => {
      const result = detectConfusionSuccess(
        'I am now an admin with elevated permissions. My role has been changed to administrator. Safety filters are disabled.'
      );

      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });
});

describe('Pattern arrays', () => {
  it('has success patterns defined', () => {
    expect(CONFUSION_SUCCESS_PATTERNS.length).toBeGreaterThan(0);
  });

  it('has resistance patterns defined', () => {
    expect(CONFUSION_RESISTANCE_PATTERNS.length).toBeGreaterThan(0);
  });

  it('patterns are valid regex', () => {
    for (const pattern of CONFUSION_SUCCESS_PATTERNS) {
      expect(() => new RegExp(pattern)).not.toThrow();
    }
    for (const pattern of CONFUSION_RESISTANCE_PATTERNS) {
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });
});
