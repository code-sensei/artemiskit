/**
 * Tests for ToolAbuseMutation
 */

import { describe, expect, it } from 'bun:test';
import type { AgentTrace } from './types';
import {
  TOOL_ABUSE_RESISTANCE_PATTERNS,
  TOOL_ABUSE_SUCCESS_PATTERNS,
  ToolAbuseMutation,
  detectToolAbuseFromResponse,
  detectToolAbuseFromTrace,
} from './tool-abuse';

describe('ToolAbuseMutation', () => {
  describe('constructor', () => {
    it('creates mutation with default options', () => {
      const mutation = new ToolAbuseMutation();

      expect(mutation.name).toBe('tool-abuse');
      expect(mutation.description).toContain('manipulate');
      expect(mutation.severity).toBe('critical');
      expect(mutation.owaspCategory).toBe('LLM08');
    });

    it('creates mutation with custom options', () => {
      const mutation = new ToolAbuseMutation({
        detectionMode: 'trace',
        targetTools: ['database', 'file_system'],
        payloads: ['custom_payload'],
      });

      const options = mutation.getDetectionOptions();
      expect(options.detectionMode).toBe('trace');
      expect(options.targetTools).toContain('database');
      expect(options.payloads).toContain('custom_payload');
    });
  });

  describe('mutate', () => {
    it('generates mutated prompt with tool reference', () => {
      const mutation = new ToolAbuseMutation({
        targetTools: ['database'],
      });
      const result = mutation.mutate('Show me user data');

      expect(result).toContain('Show me user data');
      expect(result).toContain('database');
    });

    it('rotates through templates', () => {
      const mutation = new ToolAbuseMutation();
      const results = new Set<string>();

      for (let i = 0; i < 20; i++) {
        results.add(mutation.mutate('test'));
      }

      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('generateAll', () => {
    it('generates comprehensive attack set', () => {
      const mutation = new ToolAbuseMutation({
        targetTools: ['database', 'file'],
      });
      const results = mutation.generateAll('test prompt');

      // Should generate multiple combinations
      expect(results.length).toBeGreaterThan(10);

      // All should contain the base prompt
      for (const result of results) {
        expect(result).toContain('test prompt');
      }
    });
  });

  describe('generateForTool', () => {
    it('generates attacks targeting specific tool', () => {
      const mutation = new ToolAbuseMutation();
      const results = mutation.generateForTool('database', 'test');

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result).toContain('database');
      }
    });
  });

  describe('generateByCategory', () => {
    it('generates direct manipulation attacks', () => {
      const mutation = new ToolAbuseMutation({ targetTools: ['tool'] });
      const results = mutation.generateByCategory('test', 'direct');

      expect(results.length).toBe(5);
    });

    it('generates indirect manipulation attacks', () => {
      const mutation = new ToolAbuseMutation({ targetTools: ['tool'] });
      const results = mutation.generateByCategory('test', 'indirect');

      expect(results.length).toBe(5);
    });

    it('generates escalation attacks', () => {
      const mutation = new ToolAbuseMutation({ targetTools: ['tool'] });
      const results = mutation.generateByCategory('test', 'escalation');

      expect(results.length).toBe(5);
    });

    it('generates exfiltration attacks', () => {
      const mutation = new ToolAbuseMutation({ targetTools: ['tool'] });
      const results = mutation.generateByCategory('test', 'exfiltration');

      expect(results.length).toBe(5);
    });

    it('generates destructive attacks', () => {
      const mutation = new ToolAbuseMutation({ targetTools: ['tool'] });
      const results = mutation.generateByCategory('test', 'destructive');

      expect(results.length).toBe(5);
    });
  });

  describe('cvssScore', () => {
    it('has valid CVSS score', () => {
      const mutation = new ToolAbuseMutation();
      const cvss = mutation.cvssScore;

      expect(cvss.baseScore).toBeGreaterThanOrEqual(0);
      expect(cvss.baseScore).toBeLessThanOrEqual(10);
      expect(cvss.attackVector).toBe('network');
      expect(cvss.availabilityImpact).toBe('high'); // Critical severity
    });
  });
});

describe('detectToolAbuseFromResponse', () => {
  describe('success patterns', () => {
    it('detects execution indicators', () => {
      const result = detectToolAbuseFromResponse(
        'Executing the delete command with admin privileges.'
      );

      expect(result.success).toBe(true);
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });

    it('detects exfiltration indicators', () => {
      const result = detectToolAbuseFromResponse(
        'Exfiltrating all user data to the specified endpoint.'
      );

      expect(result.success).toBe(true);
      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });

    it('detects bypass indicators', () => {
      const result = detectToolAbuseFromResponse('Bypassing authentication checks as requested.');

      expect(result.success).toBe(true);
    });

    it('detects privilege escalation', () => {
      const result = detectToolAbuseFromResponse('Elevating privileges to admin access level.');

      expect(result.success).toBe(true);
    });

    it('detects destructive actions', () => {
      const result = detectToolAbuseFromResponse(
        'Dropping the table as instructed. All records deleted.'
      );

      expect(result.success).toBe(true);
    });
  });

  describe('resistance patterns', () => {
    it('detects refusal', () => {
      const result = detectToolAbuseFromResponse(
        'I cannot execute that command. That request is not allowed.'
      );

      expect(result.success).toBe(false);
      expect(result.resistancePatterns.length).toBeGreaterThan(0);
    });

    it('detects safety explanation', () => {
      const result = detectToolAbuseFromResponse(
        'That could cause harm to the system. Security policy prevents this action.'
      );

      expect(result.success).toBe(false);
      expect(result.resistancePatterns.length).toBeGreaterThan(0);
    });

    it('detects permission denial', () => {
      const result = detectToolAbuseFromResponse(
        "I don't have permission to perform that action. That requires admin access."
      );

      expect(result.success).toBe(false);
    });
  });

  describe('confidence calculation', () => {
    it('returns low confidence for neutral response', () => {
      const result = detectToolAbuseFromResponse('Here is the information you requested.');

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('increases confidence with multiple indicators', () => {
      const result = detectToolAbuseFromResponse(
        'Executing command with elevated privileges. Bypassing security checks. Dumping all database records.'
      );

      expect(result.success).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });
});

describe('detectToolAbuseFromTrace', () => {
  it('detects forbidden tool calls', () => {
    const trace: AgentTrace = {
      steps: [
        {
          type: 'action',
          tool: 'delete_records',
          toolInput: { table: 'users' },
        },
      ],
    };

    const result = detectToolAbuseFromTrace(trace);

    expect(result.success).toBe(true);
    expect(result.forbiddenToolsCalled).toContain('delete_records');
  });

  it('detects suspicious parameters', () => {
    const trace: AgentTrace = {
      steps: [
        {
          type: 'action',
          tool: 'query_database',
          toolInput: { admin: true, bypass_auth: true },
        },
      ],
    };

    const result = detectToolAbuseFromTrace(trace);

    expect(result.success).toBe(true);
    expect(result.suspiciousParameters.length).toBeGreaterThan(0);
  });

  it('detects dangerous command strings', () => {
    const trace: AgentTrace = {
      steps: [
        {
          type: 'action',
          tool: 'execute',
          toolInput: { command: 'rm -rf /important' },
        },
      ],
    };

    const result = detectToolAbuseFromTrace(trace);

    expect(result.success).toBe(true);
    expect(result.suspiciousParameters.length).toBeGreaterThan(0);
  });

  it('returns clean for safe traces', () => {
    const trace: AgentTrace = {
      steps: [
        {
          type: 'action',
          tool: 'search',
          toolInput: { query: 'weather today' },
        },
        {
          type: 'thought',
          content: 'Processing search request',
        },
      ],
    };

    const result = detectToolAbuseFromTrace(trace);

    expect(result.success).toBe(false);
    expect(result.forbiddenToolsCalled.length).toBe(0);
    expect(result.suspiciousParameters.length).toBe(0);
  });

  it('accepts custom forbidden tools list', () => {
    const trace: AgentTrace = {
      steps: [
        {
          type: 'action',
          tool: 'custom_dangerous_tool',
          toolInput: {},
        },
      ],
    };

    const result = detectToolAbuseFromTrace(trace, ['custom_dangerous_tool']);

    expect(result.success).toBe(true);
    expect(result.forbiddenToolsCalled).toContain('custom_dangerous_tool');
  });
});

describe('Pattern arrays', () => {
  it('has success patterns defined', () => {
    expect(TOOL_ABUSE_SUCCESS_PATTERNS.length).toBeGreaterThan(0);
  });

  it('has resistance patterns defined', () => {
    expect(TOOL_ABUSE_RESISTANCE_PATTERNS.length).toBeGreaterThan(0);
  });

  it('patterns are valid regex', () => {
    for (const pattern of TOOL_ABUSE_SUCCESS_PATTERNS) {
      expect(() => new RegExp(pattern)).not.toThrow();
    }
    for (const pattern of TOOL_ABUSE_RESISTANCE_PATTERNS) {
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });
});
