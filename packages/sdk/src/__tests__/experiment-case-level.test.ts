import { afterEach, describe, expect, mock, setDefaultTimeout, test } from 'bun:test';
import { appendFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExperimentRunResult } from '@artemiskit/core';
import * as realCore from '../../../core/src/index';

// Earlier SDK test files stub `@artemiskit/core` without restoring it; these tests exercise the
// real experiment pipeline, so rebind the real implementations (see experiment.test.ts).
mock.module('@artemiskit/core', () => ({ ...realCore }));

import {
  ExperimentSurfaceError,
  formatExperimentCaseSummary,
  formatExperimentRunSummary,
  reportExperimentResult,
  runExperimentFile,
  summarizeExperimentCases,
} from '../index';
import type { ExperimentCaseLevelSummary, ExperimentFileRunOutcome } from '../index';
import { sha256, writeExperimentFixture } from './experiment-fixtures';

setDefaultTimeout(30_000);

/** Two cases: the fixture client's reply passes the first and fails the second. */
const MIXED_SCENARIO = `name: fixture-mixed
cases:
  - id: echo
    prompt: "Reply with anything."
    expected:
      type: contains
      values: ["Fixture response"]
  - id: capital
    prompt: "What is the capital of Nigeria?"
    expected:
      type: contains
      values: ["Abuja"]
`;

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function forbidNetwork(): { calls: number } {
  const counter = { calls: 0 };
  globalThis.fetch = (() => {
    counter.calls += 1;
    throw new Error('NETWORK-FORBIDDEN');
  }) as unknown as typeof fetch;
  return counter;
}

/** Run the two-target fixture with its second task replaced by a two-case scenario. */
async function runMixedCaseFixture(): Promise<ExperimentFileRunOutcome & { outputDir: string }> {
  const fixture = await writeExperimentFixture();
  await writeFile(path.join(fixture.directory, 'tasks/fail.yaml'), MIXED_SCENARIO);
  const tasks = fixture.manifest.tasks as Array<{ source: { artifact: { digest: string } } }>;
  tasks[1].source.artifact.digest = sha256(MIXED_SCENARIO);
  await writeFile(fixture.file, JSON.stringify(fixture.manifest, null, 2));
  const outcome = await runExperimentFile({
    experiment: fixture.file,
    outputDir: path.join(fixture.directory, 'out'),
  });
  return outcome as ExperimentFileRunOutcome & { outputDir: string };
}

function availableCounts(summary: ExperimentCaseLevelSummary | undefined) {
  if (summary?.availability !== 'available') throw new Error('case level unavailable');
  return summary;
}

describe('case-level summary surfaces', () => {
  test('a run reports cases beside coordinates from its saved, verified evidence', async () => {
    const network = forbidNetwork();
    const outcome = await runMixedCaseFixture();
    expect(network.calls).toBe(0);

    const result = outcome.result as ExperimentRunResult;
    expect(result.summaries.overall).toMatchObject({ planned: 4, passed: 2, task_failed: 2 });
    const caseLevel = availableCounts(outcome.caseLevel);
    expect(caseLevel.verifiedEvidenceFiles).toBe(4);
    expect(caseLevel.overall).toMatchObject({
      planned: 6,
      recorded: 6,
      valid: 6,
      passed: 4,
      failed: 2,
      invalid: 0,
      unmeasured: 0,
    });
    expect(caseLevel.targets.map((group) => [group.key, group.counts.passed])).toEqual([
      ['qwen-small', 2],
      ['qwen-large', 2],
    ]);

    const summary = formatExperimentRunSummary(result, {
      resultPath: outcome.resultPath,
      caseLevel: outcome.caseLevel,
    });
    expect(summary).toContain('Coordinate level: counts below are task × target × repetition');
    expect(summary).toContain('valid 2/2 planned; passed 1 and task-failed 1 of 2 valid');
    expect(summary).toContain('Case level: counts below are individual scenario cases from 4');
    expect(summary).toContain(
      '  - qwen-small: passed 2 and failed 1 of 3 valid case(s) (passed/valid 2/3 (66.7%))'
    );
    expect(summary).toContain('Overall cases: passed 4 and failed 2 of 6 valid case(s)');
    expect(summary).toContain('No ranking or winner is implied');
    expect(summary.indexOf('qwen-small: passed')).toBeLessThan(
      summary.indexOf('qwen-large: passed')
    );
    expect(formatExperimentRunSummary(result)).not.toContain('Case level');
  });

  test('reports from a saved result read evidence beside it in every view', async () => {
    forbidNetwork();
    const outcome = await runMixedCaseFixture();
    const reports = await reportExperimentResult({ result: outcome.resultPath as string });
    expect(reports).toHaveLength(6);
    for (const report of reports) {
      expect(report.content).toContain('Case-level summary');
      expect(report.content).toContain('Coordinate level');
      expect(report.content).not.toContain('Unavailable.');
    }
    const html = reports.find((report) => report.format === 'html')?.content ?? '';
    expect(html).toContain('<dt>Passed cases</dt><dd>4</dd>');
    expect(html).toContain('<dt>Planned coordinates</dt><dd>4</dd>');
  });

  test('a parsed result needs an explicit evidence directory', async () => {
    forbidNetwork();
    const outcome = await runMixedCaseFixture();
    const result = outcome.result as ExperimentRunResult;
    const [without] = await reportExperimentResult({
      result,
      views: ['executive'],
      formats: ['markdown'],
    });
    expect(without.content).toContain('**Unavailable.**');
    const [withEvidence] = await reportExperimentResult({
      result,
      views: ['executive'],
      formats: ['markdown'],
      evidenceDir: path.join(outcome.outputDir, 'evidence'),
    });
    expect(withEvidence.content).toContain('| Passed cases | 4 |');
    expect(
      await summarizeExperimentCases({
        result,
        evidenceDir: path.join(outcome.outputDir, 'evidence'),
      })
    ).toEqual(outcome.caseLevel as ExperimentCaseLevelSummary);
  });

  test('altered, missing or absent evidence makes the case level unavailable', async () => {
    forbidNetwork();
    const outcome = await runMixedCaseFixture();
    const resultPath = outcome.resultPath as string;
    const evidenceDir = path.join(outcome.outputDir, 'evidence');
    const [first, second] = (await readdir(evidenceDir)).sort();

    await appendFile(path.join(evidenceDir, first), ' ');
    const altered = await summarizeExperimentCases({ result: resultPath });
    expect(altered).toMatchObject({
      availability: 'unavailable',
      reason: 'evidence_digest_mismatch',
      affectedEvidence: [first.replace('.json', '')],
    });
    expect(formatExperimentCaseSummary(altered)).toStartWith(
      'Case level: unavailable. Case-level summary withheld: 1 referenced evidence file(s) failed SHA-256 verification'
    );

    await rm(path.join(evidenceDir, second));
    expect(await summarizeExperimentCases({ result: resultPath })).toMatchObject({
      reason: 'evidence_digest_mismatch',
      affectedEvidenceCount: 2,
    });

    await rename(evidenceDir, `${evidenceDir}-moved`);
    const absent = await summarizeExperimentCases({ result: resultPath });
    expect(absent).toMatchObject({ reason: 'evidence_not_provided' });
    // Old results without evidence still produce every report.
    const reports = await reportExperimentResult({ result: resultPath });
    expect(reports).toHaveLength(6);
    for (const report of reports) expect(report.content).toContain('Planned coordinates');
  });

  test('a deleted evidence file is reported as missing', async () => {
    forbidNetwork();
    const outcome = await runMixedCaseFixture();
    const evidenceDir = path.join(outcome.outputDir, 'evidence');
    const [first] = (await readdir(evidenceDir)).sort();
    await rm(path.join(evidenceDir, first));
    expect(await summarizeExperimentCases({ result: outcome.resultPath as string })).toMatchObject({
      reason: 'evidence_missing',
      affectedEvidenceCount: 1,
    });
  });

  test('maps unreadable and invalid results to exit codes 1 and 2', async () => {
    const fixture = await writeExperimentFixture();
    const missing = await summarizeExperimentCases({
      result: path.join(fixture.directory, 'missing.json'),
    }).catch((error) => error);
    const invalid = await summarizeExperimentCases({ result: fixture.file }).catch(
      (error) => error
    );
    expect(missing).toBeInstanceOf(ExperimentSurfaceError);
    expect(missing.exitCode).toBe(1);
    expect(invalid).toBeInstanceOf(ExperimentSurfaceError);
    expect(invalid.exitCode).toBe(2);
  });
});
