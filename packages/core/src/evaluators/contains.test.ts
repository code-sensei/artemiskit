/**
 * Tests for ContainsEvaluator
 */

import { describe, expect, test } from 'bun:test';
import { ContainsEvaluator } from './contains';

describe('ContainsEvaluator', () => {
  const evaluator = new ContainsEvaluator();

  test('passes when all values present (mode: all)', async () => {
    const result = await evaluator.evaluate('The colors are red, blue, and yellow.', {
      type: 'contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'all',
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  test('fails when not all values present (mode: all)', async () => {
    const result = await evaluator.evaluate('The colors are red and blue.', {
      type: 'contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'all',
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBeCloseTo(0.67, 1);
  });

  test('passes when any value present (mode: any)', async () => {
    const result = await evaluator.evaluate('I like red.', {
      type: 'contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'any',
    });
    expect(result.passed).toBe(true);
  });

  test('fails when no values present (mode: any)', async () => {
    const result = await evaluator.evaluate('I like green.', {
      type: 'contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'any',
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  test('is case insensitive', async () => {
    const result = await evaluator.evaluate('RED BLUE YELLOW', {
      type: 'contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'all',
    });
    expect(result.passed).toBe(true);
  });
});
