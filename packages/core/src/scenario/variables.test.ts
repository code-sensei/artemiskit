/**
 * Tests for variable substitution
 */

import { describe, expect, test } from 'bun:test';
import { mergeVariables, substituteString, substituteVariables } from './variables';

describe('substituteString', () => {
  test('substitutes single variable', () => {
    const result = substituteString('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  test('substitutes multiple variables', () => {
    const result = substituteString('{{greeting}} {{name}}!', {
      greeting: 'Hello',
      name: 'World',
    });
    expect(result).toBe('Hello World!');
  });

  test('substitutes same variable multiple times', () => {
    const result = substituteString('{{x}} + {{x}} = 2{{x}}', { x: '1' });
    expect(result).toBe('1 + 1 = 21');
  });

  test('leaves unmatched variables as-is', () => {
    const result = substituteString('Hello {{name}} and {{unknown}}!', { name: 'World' });
    expect(result).toBe('Hello World and {{unknown}}!');
  });

  test('handles number values', () => {
    const result = substituteString('Count: {{count}}', { count: 42 });
    expect(result).toBe('Count: 42');
  });

  test('handles boolean values', () => {
    const result = substituteString('Enabled: {{enabled}}', { enabled: true });
    expect(result).toBe('Enabled: true');
  });

  test('handles empty variables object', () => {
    const result = substituteString('Hello {{name}}!', {});
    expect(result).toBe('Hello {{name}}!');
  });

  test('handles string without variables', () => {
    const result = substituteString('Hello World!', { name: 'Test' });
    expect(result).toBe('Hello World!');
  });
});

describe('substituteVariables', () => {
  test('substitutes in simple object', () => {
    const result = substituteVariables({ message: 'Hello {{name}}!' }, { name: 'World' });
    expect(result).toEqual({ message: 'Hello World!' });
  });

  test('substitutes in nested object', () => {
    const result = substituteVariables(
      {
        outer: {
          inner: 'Value is {{value}}',
        },
      },
      { value: '42' }
    );
    expect(result).toEqual({
      outer: {
        inner: 'Value is 42',
      },
    });
  });

  test('substitutes in arrays', () => {
    const result = substituteVariables(['Hello {{name}}', 'Goodbye {{name}}'], { name: 'World' });
    expect(result).toEqual(['Hello World', 'Goodbye World']);
  });

  test('substitutes in array of objects', () => {
    const result = substituteVariables(
      [
        { role: 'user', content: 'My name is {{name}}' },
        { role: 'assistant', content: 'Hello {{name}}!' },
      ],
      { name: 'Alice' }
    );
    expect(result).toEqual([
      { role: 'user', content: 'My name is Alice' },
      { role: 'assistant', content: 'Hello Alice!' },
    ]);
  });

  test('preserves non-string values', () => {
    const result = substituteVariables(
      {
        name: '{{product}}',
        count: 42,
        enabled: true,
        items: [1, 2, 3],
      },
      { product: 'Widget' }
    );
    expect(result).toEqual({
      name: 'Widget',
      count: 42,
      enabled: true,
      items: [1, 2, 3],
    });
  });

  test('handles empty variables', () => {
    const obj = { message: 'Hello {{name}}!' };
    const result = substituteVariables(obj, {});
    expect(result).toEqual({ message: 'Hello {{name}}!' });
  });

  test('returns primitive values unchanged', () => {
    expect(substituteVariables(42, { x: '1' })).toBe(42);
    expect(substituteVariables(true, { x: '1' })).toBe(true);
    expect(substituteVariables(null, { x: '1' })).toBe(null);
  });
});

describe('mergeVariables', () => {
  test('merges scenario and case variables', () => {
    const result = mergeVariables({ a: '1', b: '2' }, { c: '3' });
    expect(result).toEqual({ a: '1', b: '2', c: '3' });
  });

  test('case variables override scenario variables', () => {
    const result = mergeVariables({ name: 'Scenario', value: 'original' }, { name: 'Case' });
    expect(result).toEqual({ name: 'Case', value: 'original' });
  });

  test('handles undefined scenario variables', () => {
    const result = mergeVariables(undefined, { name: 'Case' });
    expect(result).toEqual({ name: 'Case' });
  });

  test('handles undefined case variables', () => {
    const result = mergeVariables({ name: 'Scenario' }, undefined);
    expect(result).toEqual({ name: 'Scenario' });
  });

  test('handles both undefined', () => {
    const result = mergeVariables(undefined, undefined);
    expect(result).toEqual({});
  });
});
