import { beforeAll, describe, expect, test } from 'bun:test';
import type { ExperimentRunResult } from '@artemiskit/core';
import { generateExperimentReport } from './generator';
import { createExperimentReport } from './model';
import { mixedExperimentResult } from './model-fixtures';
import { renderExperimentReportHTML, renderExperimentReportMarkdown } from './render';
import type { ExperimentReport, ExperimentReportOptions, ExperimentReportView } from './types';

let result: ExperimentRunResult;
let report: ExperimentReport;
const views: ExperimentReportView[] = ['technical', 'executive', 'comprehensive'];

beforeAll(async () => {
  result = await mixedExperimentResult();
  report = createExperimentReport(result);
});

describe('experiment report renderers', () => {
  for (const view of views) {
    test(`${view} HTML is deterministic and retains required assurance context`, () => {
      const before = JSON.stringify(report);
      const first = renderExperimentReportHTML(report, { view });
      expect(renderExperimentReportHTML(report, { view })).toBe(first);
      expect(generateExperimentReport(result, { view, format: 'html' })).toBe(first);
      expect(JSON.stringify(report)).toBe(before);
      expect(first).toStartWith('<!DOCTYPE html>');
      expect(first).toContain('Valid outcome denominator');
      expect(first).toContain('Scope and exclusions');
      expect(first).toContain('Limitations and uncertainty');
      expect(first).toContain('Findings and next actions');
      expect(first).toContain('Technical appendix: evidence index');
      expect(first).toContain('No statistical independence');
      expect(first).not.toContain('<script');
      expect(first).not.toContain(' src=');
      expect(first).not.toContain('http://');
      expect(first).not.toContain('https://');
      expect(first.includes('id="technical"')).toBe(view !== 'executive');
    });

    test(`${view} Markdown is deterministic and retains required assurance context`, () => {
      const first = renderExperimentReportMarkdown(report, { view });
      expect(renderExperimentReportMarkdown(report, { view })).toBe(first);
      expect(generateExperimentReport(JSON.stringify(result), { view, format: 'markdown' })).toBe(
        first
      );
      expect(first).toContain('Valid outcome denominator');
      expect(first).toContain('Scope and exclusions');
      expect(first).toContain('Limitations and uncertainty');
      expect(first).toContain('Findings and next actions');
      expect(first).toContain('Technical appendix: evidence index');
      expect(first.includes('## Technical detail')).toBe(view !== 'executive');
    });
  }

  test('HTML is standalone, semantic, keyboard navigable, responsive, and printable', () => {
    const html = renderExperimentReportHTML(report);
    expect(html).toContain('<main id="main"');
    expect(html).toContain('Skip to report');
    expect(html).toContain('<nav aria-label="Report sections">');
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('<th scope="col">');
    expect(html).toContain('@media(max-width:700px)');
    expect(html).toContain('@media print');
    expect(html).toContain('<style>');
  });

  test('HTML and Markdown escape saved labels and injected report strings', () => {
    const hostile = structuredClone(report);
    hostile.title = '<script>alert("x")</script>';
    hostile.scope[0] = '[link](javascript:alert(1))\n| injected |';
    hostile.sections[0].rows[0].cells[0] = '<img src=x onerror=alert(1)>|cell';
    const html = renderExperimentReportHTML(hostile);
    const markdown = renderExperimentReportMarkdown(hostile);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&#60;script&#62;');
    expect(html).toContain('Fixture &#60;Alpha&#62;');
    expect(markdown).not.toContain('[link](javascript:alert(1))');
    expect(markdown).not.toContain('<img src=x');
    expect(markdown).toContain('&#124;cell');
    expect(markdown).toContain('alpha&#124;model');
  });

  test('all finding and row references resolve in every view and format', () => {
    for (const evidence of report.evidence) {
      for (const view of views) {
        expect(renderExperimentReportHTML(report, { view })).toContain(
          `id="evidence-${evidence.id}"`
        );
        expect(renderExperimentReportMarkdown(report, { view })).toContain(
          `<a id="evidence-${evidence.id}"></a>`
        );
      }
    }
    for (const item of report.findings) {
      for (const id of item.evidenceIds)
        for (const view of views) {
          expect(renderExperimentReportHTML(report, { view })).toContain(`href="#evidence-${id}"`);
          expect(renderExperimentReportMarkdown(report, { view })).toContain(`](#evidence-${id})`);
        }
    }
    for (const row of report.sections.flatMap((section) => section.rows))
      for (const id of row.evidenceIds)
        for (const view of ['technical', 'comprehensive'] as const) {
          expect(renderExperimentReportHTML(report, { view })).toContain(`href="#evidence-${id}"`);
          expect(renderExperimentReportMarkdown(report, { view })).toContain(`](#evidence-${id})`);
        }
  });

  test('rejects unknown views', () => {
    for (const render of [renderExperimentReportHTML, renderExperimentReportMarkdown])
      for (const view of ['unknown', '', null, 0])
        expect(() => render(report, { view } as ExperimentReportOptions)).toThrow(
          'Unknown experiment report view'
        );
  });

  const invalidModels: [string, (value: ExperimentReport) => void][] = [
    [
      'unsafe evidence identifier',
      (value) => {
        value.evidence[0].id = 'https://evil.test';
      },
    ],
    [
      'duplicate evidence identifier',
      (value) => {
        value.evidence.push(value.evidence[0]);
      },
    ],
    [
      'missing finding reference',
      (value) => {
        value.findings[0].evidenceIds = ['missing'];
      },
    ],
    [
      'duplicate finding identifier',
      (value) => {
        value.findings.push(value.findings[0]);
      },
    ],
    [
      'invalid finding level',
      (value) => {
        value.findings[0].level = 'winner' as 'risk';
      },
    ],
    [
      'duplicate section identifier',
      (value) => {
        value.sections.push(value.sections[0]);
      },
    ],
    [
      'duplicate row identifier',
      (value) => {
        value.sections[1].rows[0].id = value.sections[0].rows[0].id;
      },
    ],
    [
      'mismatched row cells',
      (value) => {
        value.sections[0].rows[0].cells = [];
      },
    ],
    [
      'missing row reference',
      (value) => {
        value.sections[0].rows[0].evidenceIds = ['missing'];
      },
    ],
  ];
  for (const [name, mutate] of invalidModels) {
    test(`rejects ${name} in both renderers`, () => {
      const value = structuredClone(report);
      mutate(value);
      expect(() => renderExperimentReportHTML(value)).toThrow();
      expect(() => renderExperimentReportMarkdown(value)).toThrow();
    });
  }
});

describe('experiment report generator options', () => {
  test('defaults to comprehensive HTML', () => {
    expect(generateExperimentReport(result)).toBe(renderExperimentReportHTML(report));
  });

  test('rejects hostile, accessor, exotic, symbol, and unknown options without invoking traps', () => {
    let called = 0;
    const hostile = () => {
      called += 1;
      throw new Error('PRIVATE-CREDENTIAL');
    };
    const proxy = new Proxy({}, { get: hostile, ownKeys: hostile, getPrototypeOf: hostile });
    const getter = Object.defineProperty({}, 'format', { enumerable: true, get: hostile });
    const symbol = { [Symbol('format')]: 'html' };
    const exotic = Object.create({ format: 'html' });
    for (const options of [null, proxy, getter, symbol, exotic, { format: 'pdf' }, { extra: true }])
      expect(() => generateExperimentReport(result, options as never)).toThrow(
        'Invalid experiment report options'
      );
    expect(called).toBe(0);
  });
});
