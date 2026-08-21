import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { type AgentArtifactCheck, ScenarioValidator, parseScenarioFile } from '@artemiskit/core';

export const SCENARIO_REPAIR_ARTIFACT_CHECK = 'scenario-matches-expected';

export interface ScenarioRepairAcceptance extends AgentArtifactCheck {
  passed: boolean;
  scenarioValid: boolean;
  expectationType?: string;
  issueRules: string[];
}

export async function checkScenarioRepair(
  workspacePath: string
): Promise<ScenarioRepairAcceptance> {
  const startedAt = performance.now();
  const scenarioPath = resolve(workspacePath, 'scenario.yaml');
  const validation = new ScenarioValidator().validate(scenarioPath);

  if (!validation.valid) {
    return {
      id: SCENARIO_REPAIR_ARTIFACT_CHECK,
      status: 'failed',
      durationMs: performance.now() - startedAt,
      passed: false,
      scenarioValid: false,
      issueRules: validation.errors.map((error) => error.rule),
    };
  }

  try {
    const expectedScenarioPath = resolve(import.meta.dir, 'expected', 'scenario.yaml');
    const [scenario, expectedScenario, scenarioSource, expectedScenarioSource] = await Promise.all([
      parseScenarioFile(scenarioPath),
      parseScenarioFile(expectedScenarioPath),
      readFile(scenarioPath, 'utf8'),
      readFile(expectedScenarioPath, 'utf8'),
    ]);
    const expectationType = scenario.cases.find((testCase) => testCase.id === 'greeting')?.expected
      .type;
    const matchesExpectedScenario =
      scenarioSource === expectedScenarioSource && isDeepStrictEqual(scenario, expectedScenario);

    return {
      id: SCENARIO_REPAIR_ARTIFACT_CHECK,
      status: matchesExpectedScenario ? 'passed' : 'failed',
      durationMs: performance.now() - startedAt,
      passed: matchesExpectedScenario,
      scenarioValid: true,
      expectationType,
      issueRules: matchesExpectedScenario ? [] : ['scenario-does-not-match-expected'],
    };
  } catch {
    return {
      id: SCENARIO_REPAIR_ARTIFACT_CHECK,
      status: 'executor_error',
      durationMs: performance.now() - startedAt,
      passed: false,
      scenarioValid: false,
      issueRules: ['scenario-parse-error'],
    };
  }
}

if (import.meta.main) {
  const workspacePath = process.argv[2] ?? process.cwd();
  const result = await checkScenarioRepair(workspacePath);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
