/**
 * Tests for scenario parser
 */

import { describe, expect, test } from 'bun:test';
import { parseScenarioString, validateScenario } from './parser';

describe('parseScenarioString', () => {
  test('parses valid YAML scenario', () => {
    const yaml = `
name: Test Scenario
description: A test scenario
version: "1.0"
provider: openai
model: gpt-4
cases:
  - id: test1
    prompt: "Hello"
    expected:
      type: exact
      value: "Hi"
`;
    const scenario = parseScenarioString(yaml);
    expect(scenario.name).toBe('Test Scenario');
    expect(scenario.cases.length).toBe(1);
    expect(scenario.cases[0].id).toBe('test1');
  });

  test('throws on invalid YAML', () => {
    const yaml = `
name: Test
cases: not an array
`;
    expect(() => parseScenarioString(yaml)).toThrow();
  });

  test('throws on missing required fields', () => {
    const yaml = `
description: Missing name and cases
`;
    expect(() => parseScenarioString(yaml)).toThrow();
  });

  test('parses different expected types', () => {
    const yaml = `
name: Multi-matcher Test
cases:
  - id: regex-test
    prompt: "Test"
    expected:
      type: regex
      pattern: "^\\\\w+$"
  - id: fuzzy-test
    prompt: "Test"
    expected:
      type: fuzzy
      value: "test"
      threshold: 0.8
  - id: contains-test
    prompt: "Test"
    expected:
      type: contains
      values:
        - foo
        - bar
      mode: all
`;
    const scenario = parseScenarioString(yaml);
    expect(scenario.cases.length).toBe(3);
    expect(scenario.cases[0].expected.type).toBe('regex');
    expect(scenario.cases[1].expected.type).toBe('fuzzy');
    expect(scenario.cases[2].expected.type).toBe('contains');
  });
});

describe('validateScenario', () => {
  test('validates correct scenario object', () => {
    const scenario = {
      name: 'Test',
      cases: [
        {
          id: 'test1',
          prompt: 'Hello',
          expected: { type: 'exact', value: 'Hi' },
        },
      ],
    };
    const validated = validateScenario(scenario);
    expect(validated.name).toBe('Test');
  });

  test('throws on invalid scenario', () => {
    const scenario = {
      name: 'Test',
      cases: [],
    };
    expect(() => validateScenario(scenario)).toThrow();
  });
});
