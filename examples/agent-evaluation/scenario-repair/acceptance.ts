import { resolve } from 'node:path';
import { parseScenarioFile, ScenarioValidator } from '@artemiskit/core';

export interface ScenarioRepairAcceptance {
  passed: boolean;
  scenarioValid: boolean;
  expectationType?: string;
  issueRules: string[];
}

export async function checkScenarioRepair(
  workspacePath: string
): Promise<ScenarioRepairAcceptance> {
  const scenarioPath = resolve(workspacePath, 'scenario.yaml');
  const validation = new ScenarioValidator().validate(scenarioPath);

  if (!validation.valid) {
    return {
      passed: false,
      scenarioValid: false,
      issueRules: validation.errors.map((error) => error.rule),
    };
  }

  try {
    const scenario = await parseScenarioFile(scenarioPath);
    const expectationType = scenario.cases.find((testCase) => testCase.id === 'greeting')?.expected
      .type;

    return {
      passed: expectationType === 'contains',
      scenarioValid: true,
      expectationType,
      issueRules: expectationType === 'contains' ? [] : ['unexpected-expectation-type'],
    };
  } catch {
    return {
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
