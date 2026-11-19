/**
 * Integrity checks for the soc-alert-triage pack (draft, unreviewed).
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
  packId: 'soc-alert-triage',
  domain: 'soc',
  language: 'en',
  minTasks: 50,
  casesPerTask: { min: 3, max: 6 },
});

/** About 3,000 tokens at 3.5 characters per token; local 4B and 9B models need short prompts. */
const MAX_PROMPT_CHARACTERS = 10_500;

/** ATT&CK v20.1 Enterprise tactic IDs (attack.mitre.org/tactics/enterprise/). */
const ENTERPRISE_TACTICS = new Set([
  'TA0001',
  'TA0002',
  'TA0003',
  'TA0004',
  'TA0005',
  'TA0006',
  'TA0007',
  'TA0008',
  'TA0009',
  'TA0010',
  'TA0011',
  'TA0040',
  'TA0042',
  'TA0043',
  'TA0112',
]);

const scenarios: Scenario[] = listTaskPaths(packDir).map((relativePath) =>
  parseScenarioString(readFileSync(join(packDir, relativePath), 'utf8'), relativePath)
);
const cases = scenarios.flatMap((scenario) => scenario.cases);
type PackCase = (typeof cases)[number];

function scoredValue(testCase: PackCase, key: string): string | undefined {
  if (testCase.expected.type !== 'combined') return undefined;
  const pattern = new RegExp(`^"${key}"\\\\s\\*:\\\\s\\*"([a-z_]+)"$`);
  for (const item of testCase.expected.expectations) {
    if (item.type !== 'regex') continue;
    const match = pattern.exec(item.pattern);
    if (match) return match[1];
  }
  return undefined;
}

const decisionOf = (testCase: PackCase) => scoredValue(testCase, 'decision');
const shareOfCases = (predicate: (testCase: PackCase) => boolean) =>
  cases.filter(predicate).length / cases.length;
const hasTag = (tag: string) => (testCase: PackCase) => (testCase.tags ?? []).includes(tag);

describe('soc-alert-triage rulebook', () => {
  test('every task carries the same SYN-SOC v1.0 system prompt', () => {
    const prompts = new Set(scenarios.map((scenario) => scenario.setup?.systemPrompt));
    expect(prompts.size).toBe(1);
    const [prompt] = [...prompts];
    expect(prompt).toContain('SYNTHETIC RULEBOOK SYN-SOC v1.0 (policy soc-rulebook-v1)');
    expect(prompt).toContain('MITRE ATT&CK Enterprise v20.1');
  });

  test('every task is tagged with the synthetic-rulebook basis and ATT&CK tactics', () => {
    for (const scenario of scenarios) {
      expect(scenario.tags).toContain('basis:synthetic-rulebook');
      const tactics = (scenario.tags ?? []).filter((tag) => tag.startsWith('tactic:'));
      expect(tactics.length).toBeGreaterThan(0);
      for (const tag of tactics)
        expect(ENTERPRISE_TACTICS.has(tag.slice('tactic:'.length))).toBe(true);
    }
  });

  test('system prompt plus each case stays within the local-model prompt budget', () => {
    for (const scenario of scenarios) {
      for (const testCase of scenario.cases) {
        const length = (scenario.setup?.systemPrompt ?? '').length + String(testCase.prompt).length;
        expect({
          case: `${scenario.name}/${testCase.id}`,
          fits: length <= MAX_PROMPT_CHARACTERS,
        }).toEqual({ case: `${scenario.name}/${testCase.id}`, fits: true });
      }
    }
  });

  test('case IDs are unique across the pack', () => {
    const ids = cases.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('soc-alert-triage scoring', () => {
  test('every case scores classification, severity and decision', () => {
    for (const testCase of cases) {
      expect({
        case: testCase.id,
        classification: scoredValue(testCase, 'classification') !== undefined,
        severity: scoredValue(testCase, 'severity') !== undefined,
        decision: decisionOf(testCase) !== undefined,
      }).toEqual({ case: testCase.id, classification: true, severity: true, decision: true });
    }
  });

  test('every contain case requires human approval', () => {
    for (const testCase of cases.filter((item) => decisionOf(item) === 'contain')) {
      const patterns =
        testCase.expected.type === 'combined'
          ? testCase.expected.expectations.flatMap((item) =>
              item.type === 'regex' ? [item.pattern] : []
            )
          : [];
      expect({
        case: testCase.id,
        approval: patterns.some((p) => p.startsWith('"human_approval_required"')),
      }).toEqual({
        case: testCase.id,
        approval: true,
      });
    }
  });
});

describe('soc-alert-triage balance', () => {
  test('no single decision exceeds 40% of cases', () => {
    const counts = new Map<string, number>();
    for (const testCase of cases) {
      const decision = decisionOf(testCase) ?? 'missing';
      counts.set(decision, (counts.get(decision) ?? 0) + 1);
    }
    for (const [decision, count] of counts) {
      expect({ decision, withinLimit: count / cases.length <= 0.4 }).toEqual({
        decision,
        withinLimit: true,
      });
    }
  });

  test('at least 20% of cases are correctly closed', () => {
    expect(shareOfCases((testCase) => decisionOf(testCase) === 'close')).toBeGreaterThanOrEqual(
      0.2
    );
  });

  test('at least 10% of cases carry injected instructions', () => {
    expect(shareOfCases(hasTag('hard:prompt-injection'))).toBeGreaterThanOrEqual(0.1);
  });

  test('at least 10% of cases lack information and need investigation', () => {
    expect(shareOfCases(hasTag('hard:insufficient-information'))).toBeGreaterThanOrEqual(0.1);
  });

  test('data-minimisation cases are present and use not_contains', () => {
    const minimisation = cases.filter(hasTag('hard:data-minimisation'));
    expect(minimisation.length).toBeGreaterThanOrEqual(10);
    for (const testCase of minimisation) {
      const types =
        testCase.expected.type === 'combined'
          ? testCase.expected.expectations.map((item) => item.type)
          : [];
      expect({ case: testCase.id, notContains: types.includes('not_contains') }).toEqual({
        case: testCase.id,
        notContains: true,
      });
    }
  });
});
