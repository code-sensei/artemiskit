/**
 * Scenario runner - main entry point for running test scenarios
 */

import { createRunManifest } from '../artifacts/manifest';
import type { CaseResult, ManifestRedactionInfo } from '../artifacts/types';
import { Redactor } from '../redaction';
import { executeCase } from './executor';
import type { RunOptions, RunResult } from './types';

/**
 * Run a test scenario
 */
export async function runScenario(options: RunOptions): Promise<RunResult> {
  const {
    scenario,
    client,
    project = process.env.ARTEMIS_PROJECT || 'default',
    resolvedConfig,
    tags,
    concurrency = 1,
    timeout,
    retries,
    redaction,
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
        redaction,
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
            redaction,
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

  // Calculate redaction metadata if any redaction occurred
  let redactionInfo: ManifestRedactionInfo | undefined;
  const effectiveRedaction = redaction ?? scenario.redaction;

  if (effectiveRedaction?.enabled) {
    const redactor = new Redactor(effectiveRedaction);
    const promptsRedacted = results.filter((r) => r.redaction?.promptRedacted).length;
    const responsesRedacted = results.filter((r) => r.redaction?.responseRedacted).length;
    const totalRedactions = results.reduce((sum, r) => sum + (r.redaction?.redactionCount ?? 0), 0);

    redactionInfo = {
      enabled: true,
      patternsUsed: redactor.patternNames,
      replacement: redactor.replacement,
      summary: {
        promptsRedacted,
        responsesRedacted,
        totalRedactions,
      },
    };
  }

  // Create manifest
  const manifest = createRunManifest({
    project,
    config: {
      scenario: scenario.name,
      provider: client.provider,
      model: resolvedConfig?.model || scenario.model,
      temperature: resolvedConfig?.temperature ?? scenario.temperature,
      seed: scenario.seed,
    },
    resolvedConfig,
    cases: results,
    startTime,
    endTime,
    redaction: redactionInfo,
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
export async function runScenarios(optionsList: RunOptions[]): Promise<RunResult[]> {
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
