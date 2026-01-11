/**
 * Tests for FuzzyEvaluator
 */

import { describe, expect, test } from 'bun:test';
import { FuzzyEvaluator } from './fuzzy';

describe('FuzzyEvaluator', () => {
  const evaluator = new FuzzyEvaluator();

  test('passes on exact match', async () => {
    const result = await evaluator.evaluate('hello world', {
      type: 'fuzzy',
      value: 'hello world',
      threshold: 0.8,
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  test('passes on similar text above threshold', async () => {
    const result = await evaluator.evaluate('helo world', {
      type: 'fuzzy',
      value: 'hello world',
      threshold: 0.8,
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThan(0.8);
  });

  test('fails on dissimilar text below threshold', async () => {
    const result = await evaluator.evaluate('goodbye universe', {
      type: 'fuzzy',
      value: 'hello world',
      threshold: 0.8,
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(0.8);
  });

  test('is case insensitive', async () => {
    const result = await evaluator.evaluate('HELLO WORLD', {
      type: 'fuzzy',
      value: 'hello world',
      threshold: 0.8,
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });
});
