/**
 * Tests for NotContainsEvaluator
 */

import { describe, expect, test } from 'bun:test';
import { NotContainsEvaluator } from './not-contains';

describe('NotContainsEvaluator', () => {
  const evaluator = new NotContainsEvaluator();

  test('passes when no forbidden values are present (mode: all)', async () => {
    const result = await evaluator.evaluate('The colors are green and purple.', {
      type: 'not_contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'all',
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  test('fails when any forbidden value is present (mode: all)', async () => {
    const result = await evaluator.evaluate('The colors are red and green.', {
      type: 'not_contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'all',
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBeCloseTo(0.67, 1);
  });

  test('fails when all forbidden values are present (mode: all)', async () => {
    const result = await evaluator.evaluate('The colors are red, blue, and yellow.', {
      type: 'not_contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'all',
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  test('passes when at least one forbidden value is absent (mode: any)', async () => {
    const result = await evaluator.evaluate('The colors are red and blue.', {
      type: 'not_contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'any',
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBeCloseTo(0.33, 1);
  });

  test('fails when all forbidden values are present (mode: any)', async () => {
    const result = await evaluator.evaluate('I have red, blue, and yellow paint.', {
      type: 'not_contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'any',
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  test('is case insensitive', async () => {
    const result = await evaluator.evaluate('GREEN PURPLE ORANGE', {
      type: 'not_contains',
      values: ['red', 'blue', 'yellow'],
      mode: 'all',
    });
    expect(result.passed).toBe(true);
  });

  test('detects values case insensitively', async () => {
    const result = await evaluator.evaluate('I have RED paint', {
      type: 'not_contains',
      values: ['red'],
      mode: 'all',
    });
    expect(result.passed).toBe(false);
  });

  test('handles empty values array', async () => {
    const result = await evaluator.evaluate('Any response text here', {
      type: 'not_contains',
      values: [],
      mode: 'all',
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  test('provides detailed results in details field', async () => {
    const result = await evaluator.evaluate('The answer is red and green.', {
      type: 'not_contains',
      values: ['red', 'blue'],
      mode: 'all',
    });
    expect(result.details).toEqual({
      mode: 'all',
      results: [
        { value: 'red', found: true },
        { value: 'blue', found: false },
      ],
      notFoundCount: 1,
      totalCount: 2,
    });
  });
});
