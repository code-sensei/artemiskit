import type { WorkflowReport, WorkflowReportOptions, WorkflowReportView } from './types';

const VIEWS: readonly WorkflowReportView[] = ['technical', 'executive', 'comprehensive'];
const LEVELS = ['strength', 'risk', 'limitation', 'information'] as const;
const escapeHTML = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
// Character references cannot open Markdown blocks, links, raw HTML, or GFM autolinks.
// Normalize line breaks so a saved string cannot introduce another table row or heading.
const escapeMarkdown = (value: string): string =>
  value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[&<>"'\\`*_{}\[\]()#+!|~\-.:@]/g, (character) => `&#${character.charCodeAt(0)};`);

function checkedView(report: WorkflowReport, options: WorkflowReportOptions): WorkflowReportView {
  const view = options.view === undefined ? 'comprehensive' : options.view;
  if (!VIEWS.includes(view)) throw new TypeError('Unknown workflow report view');
  const checkId = (id: string): void => {
    if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(id)) {
      throw new TypeError('Invalid workflow report anchor identifier');
    }
  };
  const evidenceIds = new Set<string>();
  for (const evidence of report.evidence) {
    checkId(evidence.id);
    if (evidenceIds.has(evidence.id)) throw new TypeError('Duplicate workflow evidence identifier');
    evidenceIds.add(evidence.id);
  }
  const references = (ids: string[]): void => {
    for (const id of ids) {
      checkId(id);
      if (!evidenceIds.has(id)) throw new TypeError('Unknown workflow evidence reference');
    }
  };
  const findingIds = new Set<string>();
  for (const finding of report.findings) {
    checkId(finding.id);
    if (findingIds.has(finding.id)) throw new TypeError('Duplicate workflow finding identifier');
    findingIds.add(finding.id);
    if (!LEVELS.includes(finding.level)) throw new TypeError('Unknown workflow finding level');
    references(finding.evidenceIds);
  }
  const sectionIds = new Set<string>();
  for (const section of report.sections) {
    checkId(section.id);
    if (sectionIds.has(section.id)) throw new TypeError('Duplicate workflow section identifier');
    sectionIds.add(section.id);
    const rowIds = new Set<string>();
    for (const row of section.rows) {
      checkId(row.id);
      if (rowIds.has(row.id)) throw new TypeError('Duplicate workflow row identifier');
      rowIds.add(row.id);
      if (row.cells.length !== section.columns.length) {
        throw new TypeError('Workflow report row does not match its columns');
      }
      references(row.evidenceIds);
    }
  }
  return view;
}

function metrics(report: WorkflowReport): [string, string][] {
  const summary = report.summary;
  return [
    ['Saved records', String(summary.records)],
    ['Logical runs', String(summary.logicalRuns)],
    ['Eligible tasks', String(summary.eligible)],
    ['Passed tasks', String(summary.passed)],
    ['Failed tasks', String(summary.failed)],
    ['Invalid measurements', String(summary.invalid)],
    ['Unavailable measurements', String(summary.unavailable)],
    ['Preflight records', String(summary.preflight)],
    ['Historical records', String(summary.historical)],
    ['Duplicate records', String(summary.duplicateRecords)],
    ['Superseded attempts', String(summary.supersededAttempts)],
    [
      'Task success rate',
      summary.taskSuccessRate === null
        ? 'Unavailable'
        : `${Math.round(summary.taskSuccessRate * 1000) / 10}%`,
    ],
    ['Success denominator (passed / eligible)', `${summary.passed} / ${summary.eligible}`],
  ];
}

const CSS = `
:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#182536;background:#f2f5f8;line-height:1.6}
*{box-sizing:border-box}body{margin:0}a{color:#174f8e;text-decoration:underline;text-underline-offset:.18em;overflow-wrap:anywhere}a:hover{color:#0c3159}
:focus-visible{outline:3px solid #174f8e;outline-offset:4px}.skip{position:absolute;left:1rem;top:-10rem;background:#fff;padding:.75rem;z-index:1}.skip:focus{top:1rem}
.page{max-width:1200px;margin:auto;padding:3rem 2rem}header{border-top:5px solid #174f8e;padding-top:1.5rem;margin-bottom:2rem}.eyebrow{font-size:.8rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#42556b}
h1{font-size:clamp(1.8rem,4vw,3rem);line-height:1.15;letter-spacing:-.025em;margin:.5rem 0 1rem}h2{font-size:1.45rem;line-height:1.3;margin:0 0 1rem}h3{font-size:1.08rem;line-height:1.4;margin:0 0 .6rem}p{margin:.6rem 0}h1,h2,h3,p,li,dd,dt,td,th{overflow-wrap:anywhere}
.meta,.muted{color:#42556b}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.85em;overflow-wrap:anywhere}.meta{margin:.4rem 0}nav{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;margin-top:1.2rem;font-size:.9rem}
section{margin:2rem 0;scroll-margin-top:1rem}.panel{background:#fff;border:1px solid #cbd5df;border-radius:.6rem;padding:1.5rem}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:#cbd5df;border:1px solid #cbd5df;border-radius:.6rem;overflow:hidden;margin:0}
.metric{background:#fff;padding:1rem}.metric dt{font-size:.8rem;color:#42556b;font-weight:600}.metric dd{font-size:1.6rem;font-weight:700;margin:.25rem 0 0;line-height:1.3}.summary-note{font-size:.9rem;margin-top:1rem}
ul{padding-left:1.4rem}li+li{margin-top:.5rem}.findings-technical{display:grid;gap:1rem}.findings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.finding{border:1px solid #cbd5df;border-left:4px solid #64748b;border-radius:.4rem;padding:1.25rem;background:#fff}.finding.risk{border-left-color:#9f2626}.finding.strength{border-left-color:#21633b}.finding.limitation{border-left-color:#845100}
.badge{display:inline-block;font-size:.75rem;font-weight:700;border-radius:.25rem;padding:.15rem .5rem;background:#edf1f5;color:#273d54;margin-bottom:.65rem}.risk .badge{background:#fff0f0;color:#8b1f1f}.strength .badge{background:#eaf6ee;color:#1e6038}.limitation .badge{background:#fff4dd;color:#754700}.action{border-top:1px solid #dce3ea;padding-top:.65rem;margin-top:.8rem}.refs{font-size:.85rem}.refs a{display:inline-block;margin-right:.6rem}
.table-scroll{overflow-x:auto;border:1px solid #cbd5df;border-radius:.4rem;background:#fff}table{border-collapse:collapse;width:100%;font-size:.9rem;table-layout:fixed;min-width:640px}caption{text-align:left;padding:1rem;font-weight:700;background:#fff}th,td{text-align:left;vertical-align:top;border-top:1px solid #dce3ea;padding:.85rem}th{background:#edf1f5;font-size:.8rem}tbody tr:nth-child(even){background:#f8fafc}.empty{color:#42556b}.evidence-list{margin:0;padding:0;list-style:none}.evidence-list li{padding:1rem 0;border-top:1px solid #dce3ea;scroll-margin-top:1rem}.evidence-list dl{display:grid;grid-template-columns:7rem minmax(0,1fr);gap:.3rem .75rem;margin:.7rem 0 0}.evidence-list dt{font-size:.85rem;color:#42556b}.evidence-list dd{margin:0}footer{border-top:1px solid #cbd5df;padding-top:1rem;font-size:.85rem;color:#42556b}
@media(max-width:700px){.page{padding:1.5rem 1rem}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.findings{grid-template-columns:minmax(0,1fr)}.panel{padding:1rem}.evidence-list dl{grid-template-columns:minmax(0,1fr)}.evidence-list dd{margin-bottom:.5rem}}
@media print{body,:root{background:#fff;color:#000}.page{max-width:none;padding:0}nav,.skip{display:none}.panel,.finding{box-shadow:none;border-color:#999}h2,h3{break-after:avoid}.finding,.metric{break-inside:avoid}.table-scroll{overflow:visible}table{min-width:0;font-size:8pt}thead{display:table-header-group}a{color:#000}.metrics{grid-template-columns:repeat(4,minmax(0,1fr))}footer{margin-top:1rem}}
`;

function htmlReferences(ids: string[]): string {
  if (ids.length === 0) return '<span class="muted">No linked evidence</span>';
  return ids.map((id) => `<a href="#evidence-${escapeHTML(id)}">${escapeHTML(id)}</a>`).join(' ');
}

function htmlList(title: string, id: string, items: string[]): string {
  return `<section id="${id}" class="panel"><h2>${title}</h2>${items.length ? `<ul>${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '<p class="empty">None recorded.</p>'}</section>`;
}

function htmlFindings(report: WorkflowReport, compact: boolean): string {
  const findings = report.findings
    .map(
      (finding) =>
        `<article class="finding ${finding.level}" id="finding-${finding.id}"><span class="badge">${finding.level}</span><h3>${escapeHTML(finding.title)}</h3><p>${escapeHTML(finding.detail)}</p><p class="action"><strong>Next action:</strong> ${escapeHTML(finding.recommendation)}</p><p class="refs"><strong>Evidence:</strong> ${htmlReferences(finding.evidenceIds)}</p></article>`
    )
    .join('');
  return `<section id="findings"><h2>Findings and next actions</h2><div${compact ? ' class="findings-technical"' : ' class="findings"'}>${findings || '<p class="empty">No findings recorded.</p>'}</div></section>`;
}

function htmlSections(report: WorkflowReport): string {
  return `<section id="technical"><h2>Technical detail</h2>${report.sections.map((section) => `<section id="section-${section.id}"><h3>${escapeHTML(section.title)}</h3><p>${escapeHTML(section.description)}</p><div class="table-scroll" role="region" aria-label="${escapeHTML(section.title)} table" tabindex="0"><table><caption>${escapeHTML(section.title)} — saved evidence</caption><thead><tr>${section.columns.map((column) => `<th scope="col">${escapeHTML(column)}</th>`).join('')}<th scope="col">Evidence</th></tr></thead><tbody>${section.rows.length ? section.rows.map((row) => `<tr>${row.cells.map((cell) => `<td>${escapeHTML(cell)}</td>`).join('')}<td class="refs">${htmlReferences(row.evidenceIds)}</td></tr>`).join('') : `<tr><td colspan="${section.columns.length + 1}" class="empty">No rows recorded.</td></tr>`}</tbody></table></div></section>`).join('') || '<p class="empty">No detail sections recorded.</p>'}</section>`;
}

function htmlEvidence(report: WorkflowReport): string {
  return `<section id="evidence" class="panel"><h2>Technical appendix: evidence index</h2><p class="muted">Local references identify saved evidence. Digests identify content; they do not authenticate its source.</p><ol class="evidence-list">${report.evidence.map((evidence) => `<li id="evidence-${evidence.id}"><h3 class="mono">${escapeHTML(evidence.id)}</h3><p>${escapeHTML(evidence.description)}</p><dl><dt>Record</dt><dd class="mono">${escapeHTML(evidence.recordId)}</dd><dt>Evidence path</dt><dd class="mono">${escapeHTML(evidence.path)}</dd><dt>SHA-256</dt><dd class="mono">${escapeHTML(evidence.sha256)}</dd></dl></li>`).join('')}</ol>${report.evidence.length ? '' : '<p class="empty">No evidence recorded.</p>'}</section>`;
}

/** Render the supplied canonical facts only; this performs no model, clock, or network operations. */
export function renderWorkflowReportHTML(
  report: WorkflowReport,
  options: WorkflowReportOptions = {}
): string {
  const view = checkedView(report, options);
  const summary = `<section id="summary"><h2>Assessment summary</h2><dl class="metrics">${metrics(
    report
  )
    .map(
      ([label, value]) =>
        `<div class="metric"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`
    )
    .join(
      ''
    )}</dl><p class="summary-note">The task success rate uses eligible tasks as its denominator. Invalid, unavailable, historical and preflight evidence is not a passed task. See scope and methodology for inclusion rules.</p></section>`;
  const context =
    htmlList('Scope and exclusions', 'scope', report.scope) +
    htmlList('Methodology', 'methodology', report.methodology);
  const findings = htmlFindings(report, view === 'technical');
  const technical = view === 'executive' ? '' : htmlSections(report);
  const body =
    view === 'technical'
      ? context + summary + technical + findings
      : summary + findings + context + technical;
  return `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHTML(report.title)} — ArtemisKit</title><style>${CSS}</style></head><body><a class="skip" href="#main">Skip to report</a><main id="main" class="page"><header><p class="eyebrow">ArtemisKit / workflow assessment</p><h1>${escapeHTML(report.title)}</h1><p class="meta">${view} view · Report schema ${escapeHTML(report.schemaVersion)}</p><p class="meta mono">Report ID: ${escapeHTML(report.reportId)}</p><nav aria-label="Report sections"><a href="#summary">Summary</a><a href="#findings">Findings</a><a href="#scope">Scope</a><a href="#methodology">Methodology</a>${view === 'executive' ? '' : '<a href="#technical">Technical detail</a>'}<a href="#limitations">Limitations</a><a href="#evidence">Evidence index</a></nav></header>${body}${htmlList('Limitations and uncertainty', 'limitations', report.limitations)}${htmlEvidence(report)}<footer>Generated from the supplied saved-evidence report model. No new model evaluation or certification is implied.</footer></main></body></html>\n`;
}

function markdownReferences(ids: string[]): string {
  return ids.length
    ? ids.map((id) => `[${escapeMarkdown(id)}](#evidence-${id})`).join(', ')
    : 'No linked evidence';
}

function markdownList(title: string, items: string[]): string {
  return `## ${title}\n\n${items.length ? items.map((item) => `- ${escapeMarkdown(item)}`).join('\n') : 'None recorded.'}\n\n`;
}

function markdownFindings(report: WorkflowReport): string {
  return `## Findings and next actions\n\n${report.findings.length ? report.findings.map((finding) => `### ${escapeMarkdown(finding.title)}\n\n**${finding.level}** — ${escapeMarkdown(finding.detail)}\n\n**Next action:** ${escapeMarkdown(finding.recommendation)}\n\n**Evidence:** ${markdownReferences(finding.evidenceIds)}\n`).join('\n') : 'No findings recorded.\n'}\n`;
}

function markdownSections(report: WorkflowReport): string {
  return `## Technical detail\n\n${report.sections.length ? report.sections.map((section) => `### ${escapeMarkdown(section.title)}\n\n${escapeMarkdown(section.description)}\n\n| ${[...section.columns.map(escapeMarkdown), 'Evidence'].join(' | ')} |\n| ${[...section.columns, 'Evidence'].map(() => '---').join(' | ')} |\n${section.rows.map((row) => `| ${[...row.cells.map(escapeMarkdown), markdownReferences(row.evidenceIds)].join(' | ')} |`).join('\n')}${section.rows.length ? '' : '\nNo rows recorded.'}\n\n`).join('') : 'No detail sections recorded.\n\n'}`;
}

/** Markdown shares the same canonical facts and validated local evidence targets as HTML. */
export function renderWorkflowReportMarkdown(
  report: WorkflowReport,
  options: WorkflowReportOptions = {}
): string {
  const view = checkedView(report, options);
  const summary = `## Assessment summary\n\n| Measure | Value |\n| --- | --- |\n${metrics(report)
    .map(([label, value]) => `| ${escapeMarkdown(label)} | ${escapeMarkdown(value)} |`)
    .join(
      '\n'
    )}\n\nThe task success rate uses eligible tasks as its denominator. Invalid, unavailable, historical and preflight evidence is not a passed task. See scope and methodology for inclusion rules.\n\n`;
  const context =
    markdownList('Scope and exclusions', report.scope) +
    markdownList('Methodology', report.methodology);
  const findings = markdownFindings(report);
  const technical = view === 'executive' ? '' : markdownSections(report);
  const body =
    view === 'technical'
      ? context + summary + technical + findings
      : summary + findings + context + technical;
  const evidence = `## Technical appendix: evidence index\n\nLocal references identify saved evidence. Digests identify content; they do not authenticate its source.\n\n${report.evidence.length ? report.evidence.map((item) => `<a id="evidence-${item.id}"></a>\n\n### ${escapeMarkdown(item.id)}\n\n${escapeMarkdown(item.description)}\n\n- Record: ${escapeMarkdown(item.recordId)}\n- Evidence path: ${escapeMarkdown(item.path)}\n- SHA-256: ${escapeMarkdown(item.sha256)}\n`).join('\n') : 'No evidence recorded.\n'}`;
  return `# ${escapeMarkdown(report.title)}\n\nArtemisKit / workflow assessment · ${view} view\n\nReport schema: ${escapeMarkdown(report.schemaVersion)}\n\nReport ID: ${escapeMarkdown(report.reportId)}\n\n${body}${markdownList('Limitations and uncertainty', report.limitations)}${evidence}\n---\n\nGenerated from the supplied saved-evidence report model. No new model evaluation or certification is implied.\n`;
}
