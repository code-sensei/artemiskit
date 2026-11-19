/**
 * Integrity checks for the aml-transaction-review pack (draft, unreviewed).
 *
 * The shared contract covers manifest identities, tags, deterministic scoring and reference
 * answers. The pack-specific checks below keep the rulebook identical across tasks, keep prompts
 * within the local-model budget, and hold the balance targets stated in the design spec.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Scenario, parseScenarioString } from '@artemiskit/core';
import { definePackContractTests } from '../_tools/pack-contract';
import { listTaskPaths } from '../_tools/pack-contract-digests';

const packDir = import.meta.dir;

definePackContractTests({
  packDir,
  packId: 'aml-transaction-review',
  domain: 'aml',
  language: 'en',
  minTasks: 50,
  casesPerTask: { min: 3, max: 6 },
});

/** About 3,000 tokens at 3.5 characters per token; local 4B and 9B models need short prompts. */
const MAX_PROMPT_CHARACTERS = 10_500;

const scenarios: Scenario[] = listTaskPaths(packDir).map((relativePath) =>
  parseScenarioString(readFileSync(join(packDir, relativePath), 'utf8'), relativePath)
);
const cases = scenarios.flatMap((scenario) => scenario.cases);

function decisionOf(expected: (typeof cases)[number]['expected']): string | undefined {
  if (expected.type !== 'combined') return undefined;
  for (const item of expected.expectations) {
    if (item.type !== 'regex') continue;
    const match = /^"decision"\\s\*:\\s\*"([a-z_]+)"$/.exec(item.pattern);
    if (match) return match[1];
  }
  return undefined;
}

function shareOfCases(predicate: (testCase: (typeof cases)[number]) => boolean): number {
  return cases.filter(predicate).length / cases.length;
}

const hasTag = (tag: string) => (testCase: (typeof cases)[number]) =>
  (testCase.tags ?? []).includes(tag);

describe('aml-transaction-review rulebook', () => {
  test('every task carries the same SYN-AML v1.0 system prompt', () => {
    const prompts = new Set(scenarios.map((scenario) => scenario.setup?.systemPrompt));
    expect(prompts.size).toBe(1);
    const [prompt] = [...prompts];
    expect(prompt).toContain('SYNTHETIC RULEBOOK SYN-AML v1.0 (policy aml-rulebook-v1)');
  });

  test('every task is tagged with the synthetic-rulebook basis and a typology', () => {
    for (const scenario of scenarios) {
      expect(scenario.tags).toContain('basis:synthetic-rulebook');
      expect(scenario.tags?.some((tag) => tag.startsWith('typology:'))).toBe(true);
    }
  });

  test('system prompt plus each case stays within the local-model prompt budget', () => {
    for (const scenario of scenarios) {
      for (const testCase of scenario.cases) {
        const length = (scenario.setup?.systemPrompt ?? '').length + String(testCase.prompt).length;
        expect({
          case: `${scenario.name}/${testCase.id}`,
          fits: length <= MAX_PROMPT_CHARACTERS,
        }).toEqual({
          case: `${scenario.name}/${testCase.id}`,
          fits: true,
        });
      }
    }
  });
});

describe('aml-transaction-review balance', () => {
  test('every case scores exactly one decision value', () => {
    for (const testCase of cases) {
      expect(decisionOf(testCase.expected)).toBeDefined();
    }
  });

  test('no single decision exceeds 40% of cases', () => {
    const counts = new Map<string, number>();
    for (const testCase of cases) {
      const decision = decisionOf(testCase.expected) ?? 'missing';
      counts.set(decision, (counts.get(decision) ?? 0) + 1);
    }
    for (const [decision, count] of counts) {
      expect({ decision, withinLimit: count / cases.length <= 0.4 }).toEqual({
        decision,
        withinLimit: true,
      });
    }
  });

  test('at least 20% of cases are correctly cleared', () => {
    expect(
      shareOfCases((testCase) => decisionOf(testCase.expected) === 'clear')
    ).toBeGreaterThanOrEqual(0.2);
  });

  test('at least 10% of cases carry injected instructions', () => {
    expect(shareOfCases(hasTag('hard:prompt-injection'))).toBeGreaterThanOrEqual(0.1);
  });

  test('at least 10% of cases lack information and need a request or escalation', () => {
    expect(shareOfCases(hasTag('hard:insufficient-information'))).toBeGreaterThanOrEqual(0.1);
  });

  test('minimisation and tipping-off cases are present', () => {
    expect(cases.filter(hasTag('hard:pii-minimisation')).length).toBeGreaterThanOrEqual(10);
    expect(cases.filter(hasTag('hard:tipping-off')).length).toBeGreaterThanOrEqual(8);
  });
});
