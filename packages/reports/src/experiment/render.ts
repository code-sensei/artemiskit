import type { ExperimentReport, ExperimentReportOptions, ExperimentReportView } from './types';

const VIEWS: readonly ExperimentReportView[] = ['technical', 'executive', 'comprehensive'];
const LEVELS = ['strength', 'risk', 'limitation', 'information'] as const;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const escapeHTML = (value: string) =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
const escapeMarkdown = (value: string) =>
  value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[&<>"'\\`*_{}\[\]()#+!|~\-.:@]/g, (character) => `&#${character.charCodeAt(0)};`);

function checkedView(report: ExperimentReport, options: ExperimentReportOptions) {
  const view = options.view === undefined ? 'comprehensive' : options.view;
  if (!VIEWS.includes(view)) throw new TypeError('Unknown experiment report view');
  const checkId = (id: string) => {
    if (typeof id !== 'string' || !ID.test(id))
      throw new TypeError('Invalid experiment report anchor identifier');
  };
  const evidenceIds = new Set<string>();
  for (const item of report.evidence) {
    checkId(item.id);
    if (evidenceIds.has(item.id)) throw new TypeError('Duplicate experiment evidence identifier');
    evidenceIds.add(item.id);
  }
  const references = (ids: string[]) => {
    for (const id of ids) {
      checkId(id);
      if (!evidenceIds.has(id)) throw new TypeError('Unknown experiment evidence reference');
    }
  };
  const findingIds = new Set<string>();
  for (const finding of report.findings) {
    checkId(finding.id);
    if (findingIds.has(finding.id)) throw new TypeError('Duplicate experiment finding identifier');
    findingIds.add(finding.id);
    if (!LEVELS.includes(finding.level)) throw new TypeError('Unknown experiment finding level');
    references(finding.evidenceIds);
  }
  const sectionIds = new Set<string>();
  const rowIds = new Set<string>();
  for (const section of report.sections) {
    checkId(section.id);
    if (sectionIds.has(section.id)) throw new TypeError('Duplicate experiment section identifier');
    sectionIds.add(section.id);
    for (const row of section.rows) {
      checkId(row.id);
      if (rowIds.has(row.id)) throw new TypeError('Duplicate experiment row identifier');
      rowIds.add(row.id);
      if (row.cells.length !== section.columns.length)
        throw new TypeError('Experiment report row does not match its columns');
      references(row.evidenceIds);
    }
  }
  return view;
}

function metrics(report: ExperimentReport): [string, string][] {
  const summary = report.summary;
  const cost = summary.cost ? `${summary.cost.amount} ${summary.cost.currency}` : 'Unavailable';
  return [
    ['Planned coordinates', String(summary.planned)],
    ['Attempted coordinates', String(summary.attempted)],
    ['Unattempted coordinates', String(summary.unattempted)],
    ['Valid outcomes', String(summary.valid)],
    ['Passed', String(summary.passed)],
    ['Task failed', String(summary.task_failed)],
    ['Policy failed', String(summary.policy_failed)],
    ['Invalid', String(summary.invalid)],
    ['Unsupported', String(summary.unsupported)],
    ['Excluded', String(summary.excluded)],
    ['Incomplete', String(summary.incomplete)],
    ['Infrastructure failed', String(summary.infrastructure_failed)],
    ['Executor invocations', String(summary.executorInvocations)],
    ['Attempts', String(summary.attempts)],
    ['Retries', String(summary.retries)],
    ['Reported requests', String(summary.requests)],
    ['Reserved live requests', String(summary.reservedLiveRequests)],
    ['Reported tokens', String(summary.tokens)],
    ['Reported cost', cost],
    ['Matrix complete', String(summary.completion.matrix_complete)],
    ['Execution complete', String(summary.completion.execution_complete)],
    [
      'Valid measurement coverage complete',
      String(summary.completion.valid_measurement_coverage_complete),
    ],
    [
      'Valid outcome rate',
      summary.validOutcomeRate === null
        ? 'Unavailable'
        : `${Math.round(summary.validOutcomeRate * 1000) / 10}%`,
    ],
    ['Valid outcome denominator (passed / valid)', `${summary.passed} / ${summary.valid}`],
  ];
}

const CSS = `
:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#162235;background:#f3f5f7;line-height:1.55}*{box-sizing:border-box}body{margin:0}.page{max-width:1200px;margin:auto;padding:3rem 2rem}a{color:#174f8e;text-decoration:underline;text-underline-offset:.16em;overflow-wrap:anywhere}:focus-visible{outline:3px solid #174f8e;outline-offset:3px}.skip{position:absolute;top:-10rem;left:1rem;background:#fff;padding:.75rem;z-index:2}.skip:focus{top:1rem}header{border-top:5px solid #174f8e;margin-bottom:2rem;padding-top:1.5rem}h1{font-size:clamp(1.8rem,4vw,3rem);line-height:1.15;margin:.4rem 0}h2{font-size:1.4rem;margin:0 0 1rem}h3{font-size:1.05rem;margin:0 0 .5rem}h1,h2,h3,p,li,dt,dd,th,td{overflow-wrap:anywhere}.eyebrow{color:#42556b;font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.meta,.muted{color:#42556b}.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.84em}nav{display:flex;flex-wrap:wrap;gap:.6rem 1rem;margin-top:1rem}section{margin:2rem 0;scroll-margin-top:1rem}.panel{background:#fff;border:1px solid #cbd5df;border-radius:.5rem;padding:1.4rem}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:#cbd5df;border:1px solid #cbd5df;border-radius:.5rem;overflow:hidden}.metric{background:#fff;padding:1rem}.metric dt{color:#42556b;font-size:.78rem;font-weight:600}.metric dd{font-size:1.35rem;font-weight:700;margin:.2rem 0 0}.findings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.finding{background:#fff;border:1px solid #cbd5df;border-left:4px solid #64748b;border-radius:.4rem;padding:1.2rem}.finding.risk{border-left-color:#9f2626}.finding.strength{border-left-color:#21633b}.finding.limitation{border-left-color:#845100}.badge{display:inline-block;background:#edf1f5;border-radius:.25rem;font-size:.75rem;font-weight:700;padding:.15rem .5rem}.table-scroll{background:#fff;border:1px solid #cbd5df;border-radius:.4rem;overflow-x:auto}table{border-collapse:collapse;min-width:700px;table-layout:fixed;width:100%}caption{text-align:left;padding:1rem;font-weight:700}th,td{border-top:1px solid #dce3ea;padding:.75rem;text-align:left;vertical-align:top}th{background:#edf1f5;font-size:.8rem}.evidence-list{list-style:none;margin:0;padding:0}.evidence-list li{border-top:1px solid #dce3ea;padding:1rem 0;scroll-margin-top:1rem}.evidence-list dl{display:grid;grid-template-columns:7rem minmax(0,1fr);gap:.3rem .7rem}.evidence-list dd{margin:0}.empty{color:#42556b}footer{border-top:1px solid #cbd5df;color:#42556b;font-size:.85rem;margin-top:2rem;padding-top:1rem}@media(max-width:700px){.page{padding:1.5rem 1rem}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.findings{grid-template-columns:1fr}.panel{padding:1rem}.evidence-list dl{grid-template-columns:1fr}}@media print{body,:root{background:#fff;color:#000}.page{max-width:none;padding:0}nav,.skip{display:none}.panel,.finding{border-color:#999}h2,h3{break-after:avoid}.metric,.finding{break-inside:avoid}.table-scroll{overflow:visible}table{font-size:8pt;min-width:0}thead{display:table-header-group}a{color:#000}}
`;

function labels(report: ExperimentReport) {
  return new Map(report.evidence.map((item, index) => [item.id, `Evidence ${index + 1}`]));
}

function htmlRefs(ids: string[], names: ReadonlyMap<string, string>) {
  return ids.length
    ? ids
        .map((id) => `<a href="#evidence-${escapeHTML(id)}">${escapeHTML(names.get(id) ?? id)}</a>`)
        .join(' ')
    : '<span class="muted">No linked evidence</span>';
}

function htmlList(title: string, id: string, items: string[]) {
  return `<section id="${id}" class="panel"><h2>${title}</h2>${items.length ? `<ul>${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '<p class="empty">None recorded.</p>'}</section>`;
}

function htmlFindings(report: ExperimentReport, names: ReadonlyMap<string, string>) {
  return `<section id="findings"><h2>Findings and next actions</h2><div class="findings">${report.findings.length ? report.findings.map((finding) => `<article class="finding ${finding.level}" id="finding-${finding.id}"><span class="badge">${finding.level}</span><h3>${escapeHTML(finding.title)}</h3><p>${escapeHTML(finding.detail)}</p><p><strong>Next action:</strong> ${escapeHTML(finding.recommendation)}</p><p><strong>Evidence:</strong> ${htmlRefs(finding.evidenceIds, names)}</p></article>`).join('') : '<p class="empty">No findings recorded.</p>'}</div></section>`;
}

function htmlSections(report: ExperimentReport, names: ReadonlyMap<string, string>) {
  return `<section id="technical"><h2>Technical detail</h2>${report.sections.map((section) => `<section id="section-${section.id}"><h3>${escapeHTML(section.title)}</h3><p>${escapeHTML(section.description)}</p><div class="table-scroll" role="region" aria-label="${escapeHTML(section.title)} table" tabindex="0"><table><caption>${escapeHTML(section.title)} — saved evidence</caption><thead><tr>${section.columns.map((column) => `<th scope="col">${escapeHTML(column)}</th>`).join('')}<th scope="col">Evidence</th></tr></thead><tbody>${section.rows.length ? section.rows.map((row) => `<tr>${row.cells.map((cell) => `<td>${escapeHTML(cell)}</td>`).join('')}<td>${htmlRefs(row.evidenceIds, names)}</td></tr>`).join('') : `<tr><td colspan="${section.columns.length + 1}" class="empty">No rows recorded.</td></tr>`}</tbody></table></div></section>`).join('')}</section>`;
}

function htmlEvidence(report: ExperimentReport) {
  return `<section id="evidence" class="panel"><h2>Technical appendix: evidence index</h2><p class="muted">Local references identify saved evidence. Digests identify content; they do not authenticate its source.</p><ol class="evidence-list">${report.evidence.map((item, index) => `<li id="evidence-${item.id}"><h3>Evidence ${index + 1}</h3><p>${escapeHTML(item.description)}</p><dl><dt>Evidence ID</dt><dd class="mono">${escapeHTML(item.id)}</dd><dt>Evidence path</dt><dd class="mono">${escapeHTML(item.path || 'root')}</dd><dt>SHA-256</dt><dd class="mono">${escapeHTML(item.sha256)}</dd></dl></li>`).join('')}</ol></section>`;
}

/** Render canonical experiment facts as standalone, script-free HTML. */
export function renderExperimentReportHTML(
  report: ExperimentReport,
  options: ExperimentReportOptions = {}
): string {
  const view = checkedView(report, options);
  const names = labels(report);
  const summary = `<section id="summary"><h2>Experiment summary</h2><dl class="metrics">${metrics(
    report
  )
    .map(
      ([label, value]) =>
        `<div class="metric"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`
    )
    .join(
      ''
    )}</dl><p>The valid outcome rate is passed / valid, where valid is passed + task failed + policy failed. Every other status is excluded from that denominator.</p></section>`;
  const context =
    htmlList('Scope and exclusions', 'scope', report.scope) +
    htmlList('Methodology', 'methodology', report.methodology);
  const findings = htmlFindings(report, names);
  const technical = view === 'executive' ? '' : htmlSections(report, names);
  const body =
    view === 'technical'
      ? context + summary + technical + findings
      : summary + findings + context + technical;
  return `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHTML(report.title)} — ArtemisKit</title><style>${CSS}</style></head><body><a class="skip" href="#main">Skip to report</a><main id="main" class="page"><header><p class="eyebrow">ArtemisKit / comparative experiment</p><h1>${escapeHTML(report.title)}</h1><p class="meta">${view} view · Report schema ${report.schemaVersion}</p><p class="meta mono">Report ID: ${escapeHTML(report.reportId)}</p><nav aria-label="Report sections"><a href="#summary">Summary</a><a href="#findings">Findings</a><a href="#scope">Scope</a><a href="#methodology">Methodology</a>${view === 'executive' ? '' : '<a href="#technical">Technical detail</a>'}<a href="#limitations">Limitations</a><a href="#evidence">Evidence index</a></nav></header>${body}${htmlList('Limitations and uncertainty', 'limitations', report.limitations)}${htmlEvidence(report)}<footer>Generated from one validated saved experiment result. No new execution, ranking, certification, deployment decision, or pricing claim is implied.</footer></main></body></html>\n`;
}

function mdRefs(ids: string[], names: ReadonlyMap<string, string>) {
  return ids.length
    ? ids.map((id) => `[${escapeMarkdown(names.get(id) ?? id)}](#evidence-${id})`).join(', ')
    : 'No linked evidence';
}

function mdList(title: string, items: string[]) {
  return `## ${title}\n\n${items.length ? items.map((item) => `- ${escapeMarkdown(item)}`).join('\n') : 'None recorded.'}\n\n`;
}

function mdFindings(report: ExperimentReport, names: ReadonlyMap<string, string>) {
  return `## Findings and next actions\n\n${report.findings.length ? report.findings.map((finding) => `### ${escapeMarkdown(finding.title)}\n\n**${finding.level}** — ${escapeMarkdown(finding.detail)}\n\n**Next action:** ${escapeMarkdown(finding.recommendation)}\n\n**Evidence:** ${mdRefs(finding.evidenceIds, names)}\n`).join('\n') : 'No findings recorded.\n'}\n`;
}

function mdSections(report: ExperimentReport, names: ReadonlyMap<string, string>) {
  return `## Technical detail\n\n${report.sections.map((section) => `### ${escapeMarkdown(section.title)}\n\n${escapeMarkdown(section.description)}\n\n| ${[...section.columns.map(escapeMarkdown), 'Evidence'].join(' | ')} |\n| ${[...section.columns, 'Evidence'].map(() => '---').join(' | ')} |\n${section.rows.map((row) => `| ${[...row.cells.map(escapeMarkdown), mdRefs(row.evidenceIds, names)].join(' | ')} |`).join('\n')}${section.rows.length ? '' : '\nNo rows recorded.'}\n\n`).join('')}`;
}

/** Render the same canonical experiment facts as escaped Markdown. */
export function renderExperimentReportMarkdown(
  report: ExperimentReport,
  options: ExperimentReportOptions = {}
): string {
  const view = checkedView(report, options);
  const names = labels(report);
  const summary = `## Experiment summary\n\n| Measure | Value |\n| --- | --- |\n${metrics(report)
    .map(([label, value]) => `| ${escapeMarkdown(label)} | ${escapeMarkdown(value)} |`)
    .join(
      '\n'
    )}\n\nThe valid outcome rate is passed / valid, where valid is passed + task failed + policy failed. Every other status is excluded from that denominator.\n\n`;
  const context =
    mdList('Scope and exclusions', report.scope) + mdList('Methodology', report.methodology);
  const findings = mdFindings(report, names);
  const technical = view === 'executive' ? '' : mdSections(report, names);
  const body =
    view === 'technical'
      ? context + summary + technical + findings
      : summary + findings + context + technical;
  const appendix = `## Technical appendix: evidence index\n\nLocal references identify saved evidence. Digests identify content; they do not authenticate its source.\n\n${report.evidence.map((item, index) => `<a id="evidence-${item.id}"></a>\n\n### Evidence ${index + 1}\n\n${escapeMarkdown(item.description)}\n\n- Evidence ID: ${escapeMarkdown(item.id)}\n- Evidence path: ${escapeMarkdown(item.path || 'root')}\n- SHA-256: ${escapeMarkdown(item.sha256)}\n`).join('\n')}`;
  return `# ${escapeMarkdown(report.title)}\n\nArtemisKit / comparative experiment · ${view} view\n\nReport schema: ${report.schemaVersion}\n\nReport ID: ${escapeMarkdown(report.reportId)}\n\n${body}${mdList('Limitations and uncertainty', report.limitations)}${appendix}\n---\n\nGenerated from one validated saved experiment result. No new execution, ranking, certification, deployment decision, or pricing claim is implied.\n`;
}
