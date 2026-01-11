/**
 * Tests for ExactEvaluator
 */

import { describe, expect, test } from 'bun:test';
import { ExactEvaluator } from './exact';

describe('ExactEvaluator', () => {
  const evaluator = new ExactEvaluator();

  test('passes on exact match', async () => {
    const result = await evaluator.evaluate('hello world', {
      type: 'exact',
      value: 'hello world',
      caseSensitive: true,
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  test('fails on mismatch', async () => {
    const result = await evaluator.evaluate('hello world', {
      type: 'exact',
      value: 'goodbye world',
      caseSensitive: true,
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  test('handles case insensitive matching', async () => {
    const result = await evaluator.evaluate('Hello World', {
      type: 'exact',
      value: 'hello world',
      caseSensitive: false,
    });
    expect(result.passed).toBe(true);
  });

  test('trims whitespace', async () => {
    const result = await evaluator.evaluate('  hello world  ', {
      type: 'exact',
      value: 'hello world',
      caseSensitive: true,
    });
    expect(result.passed).toBe(true);
  });
});
