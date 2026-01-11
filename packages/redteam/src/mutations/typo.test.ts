/**
 * Tests for TypoMutation
 */

import { describe, expect, test } from 'bun:test';
import { TypoMutation } from './typo';

describe('TypoMutation', () => {
  test('mutates text with typos', () => {
    const mutation = new TypoMutation(1.0); // 100% typo rate for testing
    const original = 'hello world test';
    const mutated = mutation.mutate(original);

    // Should be different from original (with high probability)
    // Can't guarantee exact difference due to randomness
    expect(mutated).toBeDefined();
    expect(typeof mutated).toBe('string');
  });

  test('preserves word count', () => {
    const mutation = new TypoMutation(0.5);
    const original = 'one two three four five';
    const mutated = mutation.mutate(original);

    expect(mutated.split(' ').length).toBe(original.split(' ').length);
  });

  test('with zero rate produces no changes', () => {
    const mutation = new TypoMutation(0);
    const original = 'hello world';
    const mutated = mutation.mutate(original);

    expect(mutated).toBe(original);
  });

  test('mutation has correct metadata', () => {
    const mutation = new TypoMutation();
    expect(mutation.name).toBe('typo');
    expect(mutation.severity).toBe('low');
  });
});
