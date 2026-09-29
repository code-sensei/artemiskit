import { describe, expect, test } from 'bun:test';
import { renderWorkflowReportHTML, renderWorkflowReportMarkdown } from './render';
import { rendererFixture } from './render-fixtures';
import type { WorkflowReport, WorkflowReportOptions, WorkflowReportView } from './types';

const views: WorkflowReportView[] = ['technical', 'executive', 'comprehensive'];
const renderers = [renderWorkflowReportHTML, renderWorkflowReportMarkdown];
function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Synthetic fixture is missing expected data');
  return item;
}

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const entry of Object.values(value)) freeze(entry);
  }
}

describe('workflow report renderers', () => {
  for (const view of views) {
    for (const render of renderers) {
      test(`${render.name} ${view} is deterministic, immutable and preserves canonical facts`, () => {
        const report = rendererFixture();
        const original = JSON.stringify(report);
        freeze(report);
        const output = render(report, { view });
        expect(output).toBe(render(report, { view }));
        expect(JSON.stringify(report)).toBe(original);
        expect(output).toContain('50%');
        expect(output).toContain('1 / 2');
        for (const label of [
          'Saved records',
          'Logical runs',
          'Eligible tasks',
          'Passed tasks',
          'Failed tasks',
          'Invalid measurements',
          'Unavailable measurements',
          'Preflight records',
          'Historical records',
          'Duplicate records',
          'Superseded attempts',
        ])
          expect(output).toContain(label);
        for (const finding of report.findings) expect(output).toContain(finding.title);
        expect(output).toContain('Scope and exclusions');
        expect(output).toContain('Methodology');
        expect(output).toContain('Limitations and uncertainty');
        expect(output).toContain('Next action');
        for (const item of report.evidence) expect(output).toContain(item.sha256);
        expect(output).toContain(
          'Two eligible tasks are not evidence of broad deployment readiness'
        );
      });
      test(`${render.name} ${view} preserves evidence references`, () => {
        const output = render(rendererFixture(), { view });
        const ids = [...output.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
        const refs = [...output.matchAll(/(?:href="#|\]\(#)([^"\)]+)/g)].map((match) => match[1]);
        expect(new Set(ids).size).toBe(ids.length);
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) expect(ids).toContain(ref);
      });
    }
  }

  test('short evidence labels follow canonical order while preserving full targets and digests', () => {
    const report = rendererFixture();
    const replacements = new Map(
      report.evidence.map((item, index) => [item.id, `e-${String(index + 1).repeat(64)}`])
    );
    for (const item of report.evidence) item.id = replacements.get(item.id) ?? item.id;
    for (const finding of report.findings)
      finding.evidenceIds = finding.evidenceIds.map((id) => replacements.get(id) ?? id);
    for (const section of report.sections)
      for (const row of section.rows)
        row.evidenceIds = row.evidenceIds.map((id) => replacements.get(id) ?? id);
    report.evidence.reverse();
    for (const view of views) {
      const html = renderWorkflowReportHTML(report, { view });
      const markdown = renderWorkflowReportMarkdown(report, { view });
      for (const [index, item] of report.evidence.entries()) {
        const label = `Evidence ${index + 1}`;
        expect(html).toContain(`<a href="#evidence-${item.id}">${label}</a>`);
        expect(markdown).toContain(`[${label}](#evidence-${item.id})`);
        expect(html).toContain(`<h3>${label}</h3>`);
        expect(markdown).toContain(`### ${label}`);
        expect(html).toContain(`<dd class="mono">${item.id}</dd>`);
        expect(html).toContain(item.sha256);
        expect(markdown).toContain(item.sha256);
        expect(html).not.toContain(`>${item.id}</a>`);
      }
      expect(html).toContain('.metric:last-child{grid-column:1/-1}');
      expect(html).toContain(
        '<dt>Success denominator (passed / eligible)</dt><dd>1 / 2</dd></div></dl>'
      );
    }
  });

  test('defaults to comprehensive and makes view emphasis explicit', () => {
    for (const render of renderers) {
      const report = rendererFixture();
      expect(render(report)).toBe(render(report, { view: 'comprehensive' }));
      expect(render(report, { view: 'executive' })).not.toContain(
        'Runtime and task outcomes are independent'
      );
      expect(render(report, { view: 'technical' })).toContain(
        'Runtime and task outcomes are independent'
      );
      expect(render(report, { view: 'technical' })).not.toBe(
        render(report, { view: 'comprehensive' })
      );
    }
  });

  test('HTML is self-contained and provides semantic accessible navigation and tables', () => {
    const html = renderWorkflowReportHTML(rendererFixture());
    expect(html).toContain('lang="en"');
    expect(html).toContain('class="skip" href="#main"');
    expect(html).toContain('aria-label="Report sections"');
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('<caption>');
    expect(html).toContain('scope="col"');
    expect(html).toContain(':focus-visible');
    expect(html).toContain('@media(max-width:700px)');
    expect(html).toContain('@media print');
    expect(html).toContain('overflow-wrap:anywhere');
    expect(html).not.toMatch(/<(script|img|iframe|link)\b/i);
    expect(html).not.toMatch(/(?:src=|url\(|@import)/i);
    for (const link of html.matchAll(/href="([^"]+)"/g))
      expect(link[1]?.startsWith('#')).toBe(true);
  });

  test('escapes HTML text and attributes without embedding raw JSON', () => {
    const report = rendererFixture();
    const attack =
      '</style><script>alert("x")</script><img src=x onerror=alert(1)> & " onclick="evil';
    report.title = attack;
    report.reportId = attack;
    report.scope = [attack];
    report.methodology = [attack];
    report.limitations = [attack];
    for (const finding of report.findings)
      Object.assign(finding, { title: attack, detail: attack, recommendation: attack });
    for (const section of report.sections) {
      section.title = attack;
      section.description = attack;
      section.columns = section.columns.map(() => attack);
      for (const row of section.rows) row.cells = row.cells.map(() => attack);
    }
    for (const evidence of report.evidence)
      Object.assign(evidence, {
        recordId: attack,
        path: attack,
        sha256: attack,
        description: attack,
      });
    for (const view of views) {
      const html = renderWorkflowReportHTML(report, { view });
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img ');
      expect(html).not.toContain('" onclick="');
      expect(html).toContain('&#60;/style&#62;&#60;script&#62;');
      expect(html.match(/<style>/g)?.length).toBe(1);
      expect(html.match(/<\/style>/g)?.length).toBe(1);
    }
  });

  test('Markdown neutralizes links, images, autolinks, blocks and table injection', () => {
    const report = rendererFixture();
    const attack =
      '\n# forged\n[x](javascript:alert(1)) ![img](https://evil.test/image) <https://evil.test> www.evil.test a@evil.test\n| hacked |\n```html\n<script>x</script>\n> quote\n- item\n';
    report.title = attack;
    report.scope = [attack];
    first(first(report.sections).rows).cells[0] = attack;
    first(report.evidence).description = attack;
    for (const view of views) {
      const markdown = renderWorkflowReportMarkdown(report, { view });
      expect(markdown).not.toContain('\n# forged');
      expect(markdown).not.toContain('[x](');
      expect(markdown).not.toContain('![img]');
      expect(markdown).not.toContain('https://');
      expect(markdown).not.toContain('www.evil.test');
      expect(markdown).not.toContain('a@evil.test');
      expect(markdown).not.toContain('| hacked |');
      expect(markdown).not.toContain('```html');
      expect(markdown).not.toContain('<script>');
      expect(markdown).toContain('&#35; forged');
      for (const link of markdown.matchAll(/\]\(([^)]+)\)/g))
        expect(link[1]?.startsWith('#evidence-')).toBe(true);
    }
  });

  test('empty evidence, findings and rows remain explicit and zero eligible is not a pass', () => {
    const report = rendererFixture();
    report.evidence = [];
    report.findings = [];
    report.scope = [];
    report.methodology = [];
    report.limitations = [];
    report.summary.eligible = 0;
    report.summary.passed = 0;
    report.summary.taskSuccessRate = null;
    for (const section of report.sections) section.rows = [];
    for (const render of renderers)
      for (const view of views) {
        const output = render(report, { view });
        expect(output).toContain('No evidence recorded.');
        expect(output).toContain('No findings recorded.');
        expect(output).toContain('Unavailable');
        expect(output).toContain('0 / 0');
        expect(output).not.toContain('NaN');
        expect(output).not.toContain('<dd>100%</dd>');
        expect(output).not.toContain('| Task success rate | 100% |');
        if (view !== 'executive') expect(output).toContain('No rows recorded.');
      }
    report.sections = [];
    for (const render of renderers)
      expect(render(report)).toContain('No detail sections recorded.');
  });

  test('long digests and text are retained without truncating evidence', () => {
    const report = rendererFixture();
    first(report.evidence).description = `Long word: ${'z'.repeat(4096)}`;
    for (const render of renderers) expect(render(report)).toContain('z'.repeat(4096));
  });

  test('refuses invalid views rather than silently defaulting', () => {
    for (const render of renderers)
      for (const view of ['unknown', null, '', 0])
        expect(() => render(rendererFixture(), { view } as WorkflowReportOptions)).toThrow(
          'Unknown workflow report view'
        );
  });

  const invalidModels: [string, (report: WorkflowReport) => void][] = [
    [
      'unsafe evidence ID',
      (report) => {
        first(report.evidence).id = 'x" onclick="evil';
      },
    ],
    [
      'unsafe finding ID',
      (report) => {
        first(report.findings).id = '../evil';
      },
    ],
    [
      'unsafe section ID',
      (report) => {
        first(report.sections).id = 'https://evil';
      },
    ],
    [
      'unsafe row ID',
      (report) => {
        first(first(report.sections).rows).id = '';
      },
    ],
    [
      'missing evidence',
      (report) => {
        first(report.findings).evidenceIds = ['missing'];
      },
    ],
    [
      'external reference',
      (report) => {
        first(report.findings).evidenceIds = ['https://evil.test'];
      },
    ],
    [
      'missing row evidence',
      (report) => {
        first(first(report.sections).rows).evidenceIds = ['missing'];
      },
    ],
    [
      'duplicate evidence',
      (report) => {
        report.evidence.push(first(report.evidence));
      },
    ],
    [
      'duplicate finding',
      (report) => {
        report.findings.push(first(report.findings));
      },
    ],
    [
      'duplicate section',
      (report) => {
        report.sections.push(first(report.sections));
      },
    ],
    [
      'duplicate row',
      (report) => {
        first(report.sections).rows.push(first(first(report.sections).rows));
      },
    ],
    [
      'invalid finding level',
      (report) => {
        first(report.findings).level = 'evil' as 'risk';
      },
    ],
    [
      'mismatched cells',
      (report) => {
        first(first(report.sections).rows).cells = [];
      },
    ],
  ];
  for (const [name, mutate] of invalidModels)
    test(`rejects ${name} in every view and format`, () => {
      const report = rendererFixture();
      mutate(report);
      for (const render of renderers)
        for (const view of views) expect(() => render(report, { view })).toThrow();
    });
});
