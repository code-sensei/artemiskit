import { beforeAll, describe, expect, test } from 'bun:test';
import {
  type ExperimentCaseLevelAvailable,
  type ExperimentCaseLevelSummary,
  listExperimentCaseEvidenceDigests,
} from './case-level';
import {
  type CaseLevelFixture,
  canonicalBytes,
  caseLevelFixture,
  mixedCasePlan,
  sha256,
} from './case-level-fixtures';
import { generateExperimentReport } from './generator';
import { createExperimentCaseSummary, createExperimentReport } from './model';
import { mixedExperimentResult } from './model-fixtures';
import { renderExperimentReportHTML, renderExperimentReportMarkdown } from './render';

let fixture: CaseLevelFixture;

beforeAll(async () => {
  fixture = await caseLevelFixture();
});

function available(summary: ExperimentCaseLevelSummary): ExperimentCaseLevelAvailable {
  if (summary.availability !== 'available') throw new Error(`unavailable: ${summary.detail}`);
  return summary;
}

const counts = (values: Partial<Record<string, number | null>>): Record<string, number | null> => ({
  coordinates: 0,
  coordinatesWithCaseEvidence: 0,
  coordinatesWithoutCaseEvidence: 0,
  coordinatesNotApplicable: 0,
  planned: 0,
  recorded: 0,
  valid: 0,
  passed: 0,
  failed: 0,
  invalid: 0,
  unmeasured: 0,
  ...values,
});

describe('case-level summary from verified evidence', () => {
  test('counts individual cases beside harsher coordinate outcomes', () => {
    const summary = available(
      createExperimentCaseSummary(fixture.result, { caseEvidence: fixture.files })
    );
    expect(summary.verifiedEvidenceFiles).toBe(6);
    expect(summary.overall).toEqual(
      counts({
        coordinates: 12,
        coordinatesWithCaseEvidence: 6,
        coordinatesWithoutCaseEvidence: 2,
        coordinatesNotApplicable: 4,
        planned: 20,
        recorded: 16,
        valid: 12,
        passed: 9,
        failed: 3,
        invalid: 4,
        unmeasured: 4,
      })
    );
    // Coordinate level for the same evidence: only 2 of 8 scenario coordinates passed.
    expect(fixture.result.summaries.overall.passed).toBe(4);
  });

  test('groups by target, task, language and policy in result order', () => {
    const summary = available(
      createExperimentCaseSummary(fixture.result, { caseEvidence: fixture.files })
    );
    expect(summary.targets.map((group) => group.key)).toEqual(['alpha', 'beta']);
    expect(summary.targets[0].counts).toEqual(
      counts({
        coordinates: 6,
        coordinatesWithCaseEvidence: 4,
        coordinatesNotApplicable: 2,
        planned: 10,
        recorded: 10,
        valid: 9,
        passed: 8,
        failed: 1,
        invalid: 1,
        unmeasured: 0,
      })
    );
    expect(summary.targets[1].counts).toEqual(
      counts({
        coordinates: 6,
        coordinatesWithCaseEvidence: 2,
        coordinatesWithoutCaseEvidence: 2,
        coordinatesNotApplicable: 2,
        planned: 10,
        recorded: 6,
        valid: 3,
        passed: 1,
        failed: 2,
        invalid: 3,
        unmeasured: 4,
      })
    );
    expect(summary.tasks.map((group) => [group.key, group.counts.planned])).toEqual([
      ['s1', 12],
      ['s2', 8],
      ['w', 0],
    ]);
    expect(summary.languages.map((group) => [group.key, group.counts.passed])).toEqual([
      ['en', 6],
      ['fr', 3],
    ]);
    expect(summary.policies.map((group) => [group.key, group.counts.recorded])).toEqual([
      ['p1', 12],
      ['unclassified', 4],
    ]);
  });

  test('counts every case of an attempt invalidated as a whole as invalid', () => {
    const summary = available(
      createExperimentCaseSummary(fixture.result, { caseEvidence: fixture.files })
    );
    const s1 = summary.tasks.find((group) => group.key === 's1');
    // s1 beta repetition 2 recorded passed, passed, failed but its response was truncated.
    expect(s1?.counts).toMatchObject({ passed: 6, failed: 3, invalid: 3 });
  });

  test('reads only terminal attempt evidence, never earlier retries', () => {
    const retry = fixture.digests['s1:alpha:2:1'];
    const terminal = fixture.digests['s1:alpha:2:2'];
    const required = listExperimentCaseEvidenceDigests(fixture.result);
    expect(required).not.toContain(retry);
    expect(required).toContain(terminal);
    expect(required).not.toContain(fixture.digests['w:alpha:1:1']);
    expect(required).toEqual([...required].sort());
    const files = new Map(fixture.files);
    files.delete(retry);
    expect(createExperimentCaseSummary(fixture.result, { caseEvidence: files })).toEqual(
      createExperimentCaseSummary(fixture.result, { caseEvidence: fixture.files })
    );
  });

  test('is deterministic regardless of evidence map order', () => {
    const reversed = new Map([...fixture.files].reverse());
    expect(createExperimentReport(fixture.result, { caseEvidence: reversed })).toEqual(
      createExperimentReport(fixture.result, { caseEvidence: fixture.files })
    );
  });

  test('withholds the summary when evidence bytes were altered', () => {
    const digest = fixture.digests['s1:beta:1:1'];
    const files = new Map(fixture.files);
    const altered = new Uint8Array(files.get(digest) as Uint8Array);
    altered[altered.length - 2] ^= 1;
    files.set(digest, altered);
    const summary = createExperimentCaseSummary(fixture.result, { caseEvidence: files });
    expect(summary).toMatchObject({
      availability: 'unavailable',
      reason: 'evidence_digest_mismatch',
      affectedEvidence: [digest],
      affectedEvidenceCount: 1,
    });
  });

  test('withholds the summary when a referenced file is missing', () => {
    const digest = fixture.digests['s2:alpha:2:1'];
    const files = new Map<string, Uint8Array | null>(fixture.files);
    files.set(digest, null);
    const summary = createExperimentCaseSummary(fixture.result, { caseEvidence: files });
    expect(summary).toMatchObject({ reason: 'evidence_missing', affectedEvidence: [digest] });
    if (summary.availability === 'unavailable')
      expect(summary.detail).toContain('1 were missing or unreadable');
  });

  test('reports digest mismatches ahead of missing files', () => {
    const files = new Map<string, Uint8Array | null>(fixture.files);
    files.set(fixture.digests['s2:alpha:2:1'], null);
    files.set(fixture.digests['s1:beta:1:1'], new TextEncoder().encode('{}'));
    const summary = createExperimentCaseSummary(fixture.result, { caseEvidence: files });
    expect(summary).toMatchObject({ reason: 'evidence_digest_mismatch', affectedEvidenceCount: 2 });
  });

  test('withholds the summary when verified evidence is not a run manifest', async () => {
    const plan = mixedCasePlan();
    plan['s2:alpha:2:1'] = { status: 'passed', evidence: { cases: 'not-a-list' } };
    const broken = await caseLevelFixture(plan);
    expect(
      createExperimentCaseSummary(broken.result, { caseEvidence: broken.files })
    ).toMatchObject({ reason: 'evidence_invalid' });
  });

  test('withholds the summary when cases contradict the saved coordinate status', async () => {
    const plan = mixedCasePlan();
    plan['s1:alpha:1:1'] = { status: 'passed', cases: ['passed', 'failed', 'passed'] };
    const contradicted = await caseLevelFixture(plan);
    expect(
      createExperimentCaseSummary(contradicted.result, { caseEvidence: contradicted.files })
    ).toMatchObject({
      reason: 'evidence_inconsistent',
      affectedEvidence: [contradicted.digests['s1:alpha:1:1']],
    });
  });

  test('withholds the summary when one task records different case sets', async () => {
    const plan = mixedCasePlan();
    plan['s1:beta:1:1'] = {
      status: 'task_failed',
      cases: ['failed', 'failed', 'passed'],
      caseIds: ['s1-c1', 's1-c2', 'other'],
    };
    const mixed = await caseLevelFixture(plan);
    expect(createExperimentCaseSummary(mixed.result, { caseEvidence: mixed.files })).toMatchObject({
      reason: 'case_set_inconsistent',
    });
  });

  test('marks old results without evidence unavailable but still reports coordinates', async () => {
    const old = await mixedExperimentResult();
    const report = createExperimentReport(old);
    expect(report.caseLevel).toMatchObject({
      availability: 'unavailable',
      reason: 'evidence_not_provided',
    });
    expect(report.summary.planned).toBe(8);
    expect(report.findings.map((finding) => finding.title)).toContain(
      'Case-level summary unavailable'
    );
    expect(createExperimentReport(old, { caseEvidence: new Map() }).caseLevel).toMatchObject({
      reason: 'evidence_missing',
      affectedEvidence: ['a'.repeat(64)],
    });
  });

  test('needs no evidence when no coordinate has scenario evidence', async () => {
    const plan = mixedCasePlan();
    for (const key of Object.keys(plan))
      if (key.startsWith('s')) plan[key] = { status: 'invalid', error_code: 'fixture_invalid' };
    const none = await caseLevelFixture(plan);
    const summary = available(createExperimentCaseSummary(none.result));
    expect(summary.overall).toMatchObject({
      coordinatesWithoutCaseEvidence: 8,
      coordinatesNotApplicable: 4,
      planned: null,
      unmeasured: null,
      recorded: 0,
    });
  });

  test('rejects an invalid result and invalid evidence options', () => {
    expect(() => createExperimentCaseSummary({})).toThrow(
      'Invalid, unsupported or ambiguous experiment report evidence'
    );
    expect(() =>
      createExperimentCaseSummary(fixture.result, {
        caseEvidence: { not: 'a map' } as never,
      })
    ).toThrow();
    expect(() => generateExperimentReport(fixture.result, { caseEvidence: [] as never })).toThrow();
  });

  test('canonical fixture bytes hash to their recorded digest', () => {
    for (const [digest, bytes] of fixture.files) expect(sha256(bytes)).toBe(digest);
    expect(sha256(canonicalBytes({ b: 1, a: 2 }))).toBe(sha256(canonicalBytes({ a: 2, b: 1 })));
  });
});

describe('case-level rendering', () => {
  const RANKING = /\b(winner|best|worst|leaderboard|top-ranked|outperform\w*|beats?)\b/i;

  for (const view of ['technical', 'executive', 'comprehensive'] as const) {
    test(`${view} HTML and Markdown show both labelled levels without ranking`, () => {
      const report = createExperimentReport(fixture.result, { caseEvidence: fixture.files });
      const html = renderExperimentReportHTML(report, { view });
      const markdown = renderExperimentReportMarkdown(report, { view });
      expect(generateExperimentReport(fixture.result, { view, caseEvidence: fixture.files })).toBe(
        html
      );
      for (const output of [html, markdown]) {
        expect(output).toContain('Case-level summary');
        expect(output).toContain('Coordinate level');
        expect(output).toContain('Case level');
        // The pre-existing disclaimer "No universal winner" is the only permitted mention.
        expect(output.replaceAll('No universal winner', '')).not.toMatch(RANKING);
      }
      expect(html).toContain('<dt>Passed cases</dt><dd>9</dd>');
      expect(html).toContain('<dt>Planned cases</dt><dd>20</dd>');
      expect(html).toContain(
        '<td>beta</td><td>10</td><td>3</td><td>1</td><td>2</td><td>3</td><td>4</td>'
      );
      expect(html).toContain('9/12 (75%)');
      expect(markdown).toContain('| Passed cases | 9 |');
      expect(markdown).toContain('| alpha | 10 | 9 | 8 | 1 | 1 | 0 | 8/9 &#40;88&#46;9%&#41; |');
      expect(html.includes('id="section-case-level"')).toBe(view !== 'executive');
    });
  }

  test('unavailable case level is explicit in every view', async () => {
    const report = createExperimentReport(await mixedExperimentResult());
    for (const view of ['technical', 'executive', 'comprehensive'] as const) {
      const html = renderExperimentReportHTML(report, { view });
      const markdown = renderExperimentReportMarkdown(report, { view });
      expect(html).toContain(
        '<h2>Case-level summary</h2><p class="panel"><strong>Unavailable.</strong>'
      );
      expect(markdown).toContain('**Unavailable.**');
      expect(html).toContain('Planned coordinates');
    }
  });
});
