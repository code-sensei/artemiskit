/**
 * Tests for RegexEvaluator
 */

import { describe, expect, test } from 'bun:test';
import { RegexEvaluator } from './regex';

describe('RegexEvaluator', () => {
  const evaluator = new RegexEvaluator();

  test('passes when pattern matches', async () => {
    const result = await evaluator.evaluate('The answer is 42', {
      type: 'regex',
      pattern: '\\d+',
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    expect(result.details?.match).toBe('42');
  });

  test('fails when pattern does not match', async () => {
    const result = await evaluator.evaluate('No numbers here', {
      type: 'regex',
      pattern: '\\d+',
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  test('supports regex flags', async () => {
    const result = await evaluator.evaluate('HELLO WORLD', {
      type: 'regex',
      pattern: 'hello',
      flags: 'i',
    });
    expect(result.passed).toBe(true);
  });

  test('captures named groups', async () => {
    const result = await evaluator.evaluate('Name: John, Age: 30', {
      type: 'regex',
      pattern: 'Name: (?<name>\\w+), Age: (?<age>\\d+)',
    });
    expect(result.passed).toBe(true);
    expect(result.details?.groups?.name).toBe('John');
    expect(result.details?.groups?.age).toBe('30');
  });

  test('handles invalid regex gracefully', async () => {
    const result = await evaluator.evaluate('test', {
      type: 'regex',
      pattern: '[invalid',
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Invalid regex');
  });

  test('matches exact patterns', async () => {
    const result = await evaluator.evaluate('42', {
      type: 'regex',
      pattern: '^\\d+$',
    });
    expect(result.passed).toBe(true);
  });

  test('fails partial match with anchors', async () => {
    const result = await evaluator.evaluate('The answer is 42', {
      type: 'regex',
      pattern: '^\\d+$',
    });
    expect(result.passed).toBe(false);
  });
});
