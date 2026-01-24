/**
 * Tests for CombinedEvaluator
 */

import { describe, expect, test } from 'bun:test';
import { CombinedEvaluator } from './combined';

describe('CombinedEvaluator', () => {
  const evaluator = new CombinedEvaluator();

  describe('AND operator', () => {
    test('passes when all expectations pass', async () => {
      const result = await evaluator.evaluate('The answer is 42 and it is correct.', {
        type: 'combined',
        operator: 'and',
        expectations: [
          { type: 'contains', values: ['42'], mode: 'all' },
          { type: 'contains', values: ['correct'], mode: 'all' },
        ],
      });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toContain('All 2 expectations passed');
    });

    test('fails when one expectation fails', async () => {
      const result = await evaluator.evaluate('The answer is 42.', {
        type: 'combined',
        operator: 'and',
        expectations: [
          { type: 'contains', values: ['42'], mode: 'all' },
          { type: 'contains', values: ['correct'], mode: 'all' },
        ],
      });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.5);
      expect(result.reason).toContain('1/2 expectations passed');
    });

    test('fails when all expectations fail', async () => {
      const result = await evaluator.evaluate('Nothing here.', {
        type: 'combined',
        operator: 'and',
        expectations: [
          { type: 'contains', values: ['42'], mode: 'all' },
          { type: 'contains', values: ['correct'], mode: 'all' },
        ],
      });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('OR operator', () => {
    test('passes when all expectations pass', async () => {
      const result = await evaluator.evaluate('The answer is 42 and it is correct.', {
        type: 'combined',
        operator: 'or',
        expectations: [
          { type: 'contains', values: ['42'], mode: 'all' },
          { type: 'contains', values: ['correct'], mode: 'all' },
        ],
      });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    test('passes when one expectation passes', async () => {
      const result = await evaluator.evaluate('The answer is 42.', {
        type: 'combined',
        operator: 'or',
        expectations: [
          { type: 'contains', values: ['42'], mode: 'all' },
          { type: 'contains', values: ['correct'], mode: 'all' },
        ],
      });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1); // Max score
      expect(result.reason).toContain('1/2 expectations passed');
    });

    test('fails when all expectations fail', async () => {
      const result = await evaluator.evaluate('Nothing here.', {
        type: 'combined',
        operator: 'or',
        expectations: [
          { type: 'contains', values: ['42'], mode: 'all' },
          { type: 'contains', values: ['correct'], mode: 'all' },
        ],
      });
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toContain('No expectations passed');
    });
  });

  describe('mixed expectation types', () => {
    test('combines contains and regex expectations', async () => {
      const result = await evaluator.evaluate('The result is 123-456-7890.', {
        type: 'combined',
        operator: 'and',
        expectations: [
          { type: 'contains', values: ['result'], mode: 'all' },
          { type: 'regex', pattern: '\\d{3}-\\d{3}-\\d{4}' },
        ],
      });
      expect(result.passed).toBe(true);
    });

    test('combines exact and contains expectations', async () => {
      const result = await evaluator.evaluate('Hello World', {
        type: 'combined',
        operator: 'or',
        expectations: [
          { type: 'exact', value: 'Goodbye World', caseSensitive: true },
          { type: 'contains', values: ['Hello'], mode: 'all' },
        ],
      });
      expect(result.passed).toBe(true);
    });

    test('combines not_contains with contains', async () => {
      const result = await evaluator.evaluate('The answer is correct.', {
        type: 'combined',
        operator: 'and',
        expectations: [
          { type: 'contains', values: ['correct'], mode: 'all' },
          { type: 'not_contains', values: ['error', 'wrong'], mode: 'all' },
        ],
      });
      expect(result.passed).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('handles empty expectations array', async () => {
      const result = await evaluator.evaluate('Any text', {
        type: 'combined',
        operator: 'and',
        expectations: [],
      });
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    test('handles single expectation', async () => {
      const result = await evaluator.evaluate('Hello World', {
        type: 'combined',
        operator: 'and',
        expectations: [{ type: 'contains', values: ['Hello'], mode: 'all' }],
      });
      expect(result.passed).toBe(true);
    });

    test('provides detailed results', async () => {
      const result = await evaluator.evaluate('The answer is 42.', {
        type: 'combined',
        operator: 'and',
        expectations: [
          { type: 'contains', values: ['42'], mode: 'all' },
          { type: 'contains', values: ['correct'], mode: 'all' },
        ],
      });

      expect(result.details).toBeDefined();
      expect(result.details?.operator).toBe('and');
      expect(result.details?.results).toHaveLength(2);
      expect(result.details?.passedCount).toBe(1);
      expect(result.details?.totalCount).toBe(2);
    });
  });
});
