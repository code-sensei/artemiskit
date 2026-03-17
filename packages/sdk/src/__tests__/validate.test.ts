/**
 * Tests for ArtemisKit.validate() method (v0.3.2+)
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// Track parseScenarioFile calls and responses
let parseScenarioFileResponse: unknown = {};
let parseScenarioFileError: Error | null = null;

// Track resolveScenarioPaths behavior
let resolveScenarioPathsResponse: string[] = [];

// Mock the core module
mock.module('@artemiskit/core', () => ({
  parseScenarioFile: async () => {
    if (parseScenarioFileError) {
      throw parseScenarioFileError;
    }
    return parseScenarioFileResponse;
  },
  resolveScenarioPaths: async (inputPath: string) => {
    // If custom response is set, use it; otherwise return the input path as-is
    if (resolveScenarioPathsResponse.length > 0) {
      return resolveScenarioPathsResponse;
    }
    return [inputPath];
  },
  createAdapter: async () => ({
    provider: 'mock',
    generate: async () => ({}),
    capabilities: async () => ({}),
    close: () => {},
  }),
  runScenario: async () => ({}),
  getGitInfo: async () => ({ commit: 'abc123', branch: 'main', dirty: false }),
  createStorageAdapter: () => null,
}));

mock.module('@artemiskit/redteam', () => ({
  TypoMutation: class {
    name = 'typo';
  },
  RoleSpoofMutation: class {
    name = 'role-spoof';
  },
  InstructionFlipMutation: class {
    name = 'instruction-flip';
  },
  CotInjectionMutation: class {
    name = 'cot-injection';
  },
  EncodingMutation: class {
    name = 'encoding';
  },
  MultiTurnMutation: class {
    name = 'multi-turn';
  },
  RedTeamGenerator: class {
    generate() {
      return [];
    }
    listMutations() {
      return [];
    }
  },
  UnsafeResponseDetector: class {
    detect() {
      return { unsafe: false, blocked: false, reasons: [], severity: 'none' };
    }
  },
}));

mock.module('nanoid', () => ({
  nanoid: () => 'test-id-12345',
}));

import { ArtemisKit } from '../artemiskit';

// Helper to set mock response
function setParseResponse(response: unknown) {
  parseScenarioFileResponse = response;
  parseScenarioFileError = null;
}

function setParseError(error: Error) {
  parseScenarioFileError = error;
}

function setResolvePaths(paths: string[]) {
  resolveScenarioPathsResponse = paths;
}

function resetMocks() {
  parseScenarioFileResponse = {};
  parseScenarioFileError = null;
  resolveScenarioPathsResponse = [];
}

describe('ArtemisKit.validate()', () => {
  let kit: ArtemisKit;

  beforeEach(() => {
    kit = new ArtemisKit({
      project: 'test-project',
      provider: 'openai',
      model: 'gpt-4',
    });
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  describe('single scenario validation', () => {
    it('should validate a valid scenario file', async () => {
      setParseResponse({
        name: 'Valid Scenario',
        version: '1.0',
        model: 'gpt-4',
        cases: [
          {
            id: 'case-1',
            name: 'Test Case',
            prompt: 'Hello',
            expected: { type: 'contains', values: ['Hello'], mode: 'any' },
            tags: [],
            metadata: {},
            retries: 0,
          },
        ],
        tags: [],
      });

      const result = await kit.validate({ scenario: './valid-scenario.yaml' });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.scenarios).toHaveLength(1);
      expect(result.scenarios[0].valid).toBe(true);
      expect(result.scenarios[0].file).toBe('./valid-scenario.yaml');
    });

    it('should detect missing required fields', async () => {
      setParseResponse({
        name: 'Incomplete Scenario',
        version: '1.0',
        model: 'gpt-4',
        cases: [
          {
            id: 'case-1',
            name: 'Test Case',
            prompt: '', // Empty prompt
            expected: { type: 'contains', values: ['Hello'], mode: 'any' },
            tags: [],
            metadata: {},
            retries: 0,
          },
        ],
        tags: [],
      });

      const result = await kit.validate({ scenario: './incomplete.yaml' });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('prompt');
    });

    it('should detect invalid expectation types', async () => {
      setParseResponse({
        name: 'Invalid Expectation',
        version: '1.0',
        model: 'gpt-4',
        cases: [
          {
            id: 'case-1',
            name: 'Test Case',
            prompt: 'Hello',
            expected: { type: 'invalid_type', values: ['Hello'], mode: 'any' },
            tags: [],
            metadata: {},
            retries: 0,
          },
        ],
        tags: [],
      });

      const result = await kit.validate({ scenario: './invalid-expectation.yaml' });

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes('type') || e.message.includes('expectation'))
      ).toBe(true);
    });

    it('should detect duplicate case IDs', async () => {
      setParseResponse({
        name: 'Duplicate IDs',
        version: '1.0',
        model: 'gpt-4',
        cases: [
          {
            id: 'same-id',
            name: 'Test Case 1',
            prompt: 'Hello',
            expected: { type: 'contains', values: ['Hello'], mode: 'any' },
            tags: [],
            metadata: {},
            retries: 0,
          },
          {
            id: 'same-id',
            name: 'Test Case 2',
            prompt: 'World',
            expected: { type: 'contains', values: ['World'], mode: 'any' },
            tags: [],
            metadata: {},
            retries: 0,
          },
        ],
        tags: [],
      });

      const result = await kit.validate({ scenario: './duplicate-ids.yaml' });

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.message.includes('duplicate') || e.message.includes('same-id'))
      ).toBe(true);
    });

    it('should handle parse errors gracefully', async () => {
      setParseError(new Error('YAML parse error: invalid syntax'));

      const result = await kit.validate({ scenario: './broken.yaml' });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('parse');
    });
  });

  describe('strict mode', () => {
    it('should pass with warnings in non-strict mode', async () => {
      setParseResponse({
        name: 'Scenario with Warnings',
        version: '1.0',
        model: 'gpt-4',
        cases: [
          {
            id: 'case-1',
            name: 'Test',
            prompt: 'Hello',
            expected: { type: 'contains', values: ['Hello'], mode: 'any' },
            tags: [],
            metadata: {},
            retries: 0,
          },
        ],
        tags: [],
      });

      const result = await kit.validate({
        scenario: './scenario.yaml',
        strict: false,
      });

      // If there are warnings but no errors, valid should be true in non-strict mode
      if (result.errors.length === 0) {
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('progress events', () => {
    it('should emit progress events during validation', async () => {
      setParseResponse({
        name: 'Test Scenario',
        version: '1.0',
        model: 'gpt-4',
        cases: [
          {
            id: 'case-1',
            name: 'Test',
            prompt: 'Hello',
            expected: { type: 'contains', values: ['Hello'], mode: 'any' },
            tags: [],
            metadata: {},
            retries: 0,
          },
        ],
        tags: [],
      });

      let progressCalled = false;
      kit.onProgress(() => {
        progressCalled = true;
      });

      await kit.validate({ scenario: './test.yaml' });

      expect(progressCalled).toBe(true);
    });
  });
});
