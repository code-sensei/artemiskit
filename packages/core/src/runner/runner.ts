/**
 * Scenario runner - main entry point for running test scenarios
 */

import type { RunOptions, RunResult } from './types';
import type { CaseResult } from '../artifacts/types';
import { executeCase } from './executor';
import { createRunManifest } from '../artifacts/manifest';

/**
 * Run a test scenario
 */
export async function runScenario(options: RunOptions): Promise<RunResult> {
  const {
    scenario,
    client,
    project = process.env.ARTEMIS_PROJECT || 'default',
    tags,
    concurrency = 1,
    timeout,
    retries,
    onCaseComplete,
    onProgress,
  } = options;

  // Filter cases by tags if specified
  let cases = scenario.cases;
  if (tags && tags.length > 0) {
    cases = cases.filter((c) => tags.some((tag) => c.tags.includes(tag)));
    onProgress?.(`Filtered to ${cases.length} cases by tags: ${tags.join(', ')}`);
  }

  if (cases.length === 0) {
    throw new Error('No test cases to run after filtering');
  }

  onProgress?.(`Running ${cases.length} test cases...`);

  const startTime = new Date();
  const results: CaseResult[] = [];

  if (concurrency === 1) {
    // Sequential execution
    for (let i = 0; i < cases.length; i++) {
      const testCase = cases[i];
      const result = await executeCase(testCase, {
        client,
        scenario,
        timeout: testCase.timeout || timeout,
        retries: testCase.retries ?? retries,
      });
      results.push(result);
      onCaseComplete?.(result, i, cases.length);
    }
  } else {
    // Concurrent execution with limited parallelism
    const chunks = chunkArray(cases, concurrency);
    let completed = 0;

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (testCase) => {
          const result = await executeCase(testCase, {
            client,
            scenario,
            timeout: testCase.timeout || timeout,
            retries: testCase.retries ?? retries,
          });
          completed++;
          onCaseComplete?.(result, completed - 1, cases.length);
          return result;
        })
      );
      results.push(...chunkResults);
    }
  }

  const endTime = new Date();

  // Create manifest
  const manifest = createRunManifest({
    project,
    config: {
      scenario: scenario.name,
      provider: client.provider,
      model: scenario.model || 'unknown',
      temperature: scenario.temperature,
      seed: scenario.seed,
    },
    cases: results,
    startTime,
    endTime,
  });

  const success = manifest.metrics.failed_cases === 0;

  return {
    manifest,
    cases: results,
    success,
  };
}

/**
 * Run multiple scenarios
 */
export async function runScenarios(
  optionsList: RunOptions[]
): Promise<RunResult[]> {
  const results: RunResult[] = [];

  for (const options of optionsList) {
    const result = await runScenario(options);
    results.push(result);
  }

  return results;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
