/**
 * HTML Comparison Report Generator
 * Generates a visual comparison between two runs
 */

import type { RunManifest, CaseResult } from '@artemiskit/core';
import Handlebars from 'handlebars';

/**
 * Case-level comparison data
 */
export interface CaseComparison {
  caseId: string;
  name?: string;
  baselineStatus: 'passed' | 'failed' | null;
  currentStatus: 'passed' | 'failed' | null;
  baselineScore: number | null;
  currentScore: number | null;
  scoreDelta: number;
  baselineLatency: number | null;
  currentLatency: number | null;
  latencyDelta: number;
  changeType: 'regressed' | 'improved' | 'unchanged' | 'new' | 'removed';
  baselineCase?: CaseResult;
  currentCase?: CaseResult;
}

/**
 * Comparison data structure
 */
export interface ComparisonData {
  baseline: RunManifest;
  current: RunManifest;
  metrics: {
    successRateDelta: number;
    medianLatencyDelta: number;
    totalTokensDelta: number;
  };
  caseComparisons: CaseComparison[];
  summary: {
    totalRegressions: number;
    totalImprovements: number;
    totalUnchanged: number;
    casesRemoved: number;
    casesAdded: number;
  };
}

const COMPARE_HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artemis Comparison - {{data.baseline.config.scenario}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 2rem;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { margin-bottom: 0.5rem; color: #1a1a1a; }
    h2 { margin: 2rem 0 1rem; color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.5rem; }
    h3 { margin: 1rem 0 0.5rem; color: #555; font-size: 1rem; }
    .meta { color: #666; margin-bottom: 2rem; }

    /* Summary Cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .card h3 { font-size: 0.875rem; color: #666; margin-bottom: 0.75rem; }
    .card .compare-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .card .label { color: #888; font-size: 0.875rem; }
    .card .value { font-size: 1.25rem; font-weight: 600; }
    .card .delta {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 600;
    }
    .delta.positive { background: #dcfce7; color: #166534; }
    .delta.negative { background: #fee2e2; color: #991b1b; }
    .delta.neutral { background: #f3f4f6; color: #6b7280; }

    /* Comparison Stats */
    .stats-row {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1.5rem;
    }
    .stat-badge {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.875rem;
    }
    .stat-badge.regressions { background: #fee2e2; color: #991b1b; }
    .stat-badge.improvements { background: #dcfce7; color: #166534; }
    .stat-badge.unchanged { background: #f3f4f6; color: #6b7280; }
    .stat-badge.added { background: #dbeafe; color: #1e40af; }
    .stat-badge.removed { background: #fef3c7; color: #92400e; }

    /* Table Styles */
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f9fafb; font-weight: 600; font-size: 0.875rem; }
    tr:last-child td { border-bottom: none; }

    /* Status indicators */
    .status { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
    .status.passed { background: #dcfce7; color: #166534; }
    .status.failed { background: #fee2e2; color: #991b1b; }
    .status.na { background: #f3f4f6; color: #9ca3af; }

    /* Change type badges */
    .change-type {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .change-type.regressed { background: #fee2e2; color: #991b1b; }
    .change-type.improved { background: #dcfce7; color: #166534; }
    .change-type.unchanged { background: #f3f4f6; color: #6b7280; }
    .change-type.new { background: #dbeafe; color: #1e40af; }
    .change-type.removed { background: #fef3c7; color: #92400e; }

    /* Arrow indicators */
    .arrow { font-size: 1rem; }
    .arrow.up { color: #22c55e; }
    .arrow.down { color: #ef4444; }
    .arrow.same { color: #9ca3af; }

    /* Score comparison */
    .score-compare {
      font-family: monospace;
      font-size: 0.875rem;
    }
    .score-compare .old { color: #9ca3af; text-decoration: line-through; margin-right: 0.25rem; }
    .score-compare .new { font-weight: 600; }

    /* Details section */
    .details { margin-top: 0.5rem; padding: 1rem; background: #f9fafb; border-radius: 4px; font-size: 0.875rem; }
    .details pre { white-space: pre-wrap; word-break: break-word; margin: 0.5rem 0; }
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .details-col { }
    .details-col h4 { font-size: 0.75rem; color: #666; margin-bottom: 0.5rem; text-transform: uppercase; }

    .expandable { cursor: pointer; }
    .expandable:hover { background: #f0f0f0; }
    .hidden { display: none; }

    /* Filter controls */
    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .filter-group { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .filter-btn {
      padding: 0.5rem 1rem;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.15s ease;
    }
    .filter-btn:hover { background: #f5f5f5; }
    .filter-btn.active { background: #1a1a1a; color: white; border-color: #1a1a1a; }
    .filter-btn.regressed.active { background: #991b1b; border-color: #991b1b; }
    .filter-btn.improved.active { background: #166534; border-color: #166534; }

    .search-box { flex: 1; min-width: 200px; max-width: 400px; }
    .search-input {
      width: 100%;
      padding: 0.5rem 1rem;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 0.875rem;
      outline: none;
    }
    .search-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

    .results-count { font-size: 0.875rem; color: #666; padding: 0.5rem 0; }

    /* No results message */
    .no-results {
      text-align: center;
      padding: 2rem;
      color: #666;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .no-results .icon { font-size: 2rem; margin-bottom: 0.5rem; }

    /* Run info */
    .run-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-bottom: 2rem;
    }
    .run-box {
      background: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .run-box h3 {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 0.5rem;
    }
    .run-box .run-id { font-family: monospace; font-size: 0.875rem; color: #333; }
    .run-box .run-meta { font-size: 0.875rem; color: #666; margin-top: 0.25rem; }

    footer { margin-top: 3rem; text-align: center; color: #666; font-size: 0.875rem; }

    @media (max-width: 768px) {
      .run-info, .details-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Run Comparison</h1>
    <p class="meta">{{data.baseline.config.scenario}} | Comparing two evaluation runs</p>

    <!-- Run Info -->
    <div class="run-info">
      <div class="run-box">
        <h3>&#x1F4C4; Baseline Run</h3>
        <div class="run-id">{{data.baseline.run_id}}</div>
        <div class="run-meta">{{formatDate data.baseline.start_time}}</div>
      </div>
      <div class="run-box">
        <h3>&#x1F4CB; Current Run</h3>
        <div class="run-id">{{data.current.run_id}}</div>
        <div class="run-meta">{{formatDate data.current.start_time}}</div>
      </div>
    </div>

    <!-- Metrics Comparison -->
    <h2>Metrics Overview</h2>
    <div class="summary-grid">
      <div class="card">
        <h3>Success Rate</h3>
        <div class="compare-row">
          <span class="label">Baseline</span>
          <span class="value">{{formatPercent data.baseline.metrics.success_rate}}</span>
        </div>
        <div class="compare-row">
          <span class="label">Current</span>
          <span class="value">{{formatPercent data.current.metrics.success_rate}}</span>
        </div>
        <div class="compare-row">
          <span class="label">Delta</span>
          <span class="delta {{deltaClass data.metrics.successRateDelta}}">
            {{formatDelta data.metrics.successRateDelta}}
          </span>
        </div>
      </div>

      <div class="card">
        <h3>Median Latency</h3>
        <div class="compare-row">
          <span class="label">Baseline</span>
          <span class="value">{{data.baseline.metrics.median_latency_ms}}ms</span>
        </div>
        <div class="compare-row">
          <span class="label">Current</span>
          <span class="value">{{data.current.metrics.median_latency_ms}}ms</span>
        </div>
        <div class="compare-row">
          <span class="label">Delta</span>
          <span class="delta {{latencyDeltaClass data.metrics.medianLatencyDelta}}">
            {{formatLatencyDelta data.metrics.medianLatencyDelta}}
          </span>
        </div>
      </div>

      <div class="card">
        <h3>Total Tokens</h3>
        <div class="compare-row">
          <span class="label">Baseline</span>
          <span class="value">{{formatNumber data.baseline.metrics.total_tokens}}</span>
        </div>
        <div class="compare-row">
          <span class="label">Current</span>
          <span class="value">{{formatNumber data.current.metrics.total_tokens}}</span>
        </div>
        <div class="compare-row">
          <span class="label">Delta</span>
          <span class="delta {{tokenDeltaClass data.metrics.totalTokensDelta}}">
            {{formatTokenDelta data.metrics.totalTokensDelta}}
          </span>
        </div>
      </div>

      <div class="card">
        <h3>Test Cases</h3>
        <div class="compare-row">
          <span class="label">Baseline</span>
          <span class="value">{{data.baseline.metrics.passed_cases}}/{{data.baseline.metrics.total_cases}}</span>
        </div>
        <div class="compare-row">
          <span class="label">Current</span>
          <span class="value">{{data.current.metrics.passed_cases}}/{{data.current.metrics.total_cases}}</span>
        </div>
        <div class="compare-row">
          <span class="label">Pass Delta</span>
          <span class="delta {{passedDeltaClass data.baseline.metrics.passed_cases data.current.metrics.passed_cases}}">
            {{formatPassedDelta data.baseline.metrics.passed_cases data.current.metrics.passed_cases}}
          </span>
        </div>
      </div>
    </div>

    <!-- Change Summary -->
    <h2>Change Summary</h2>
    <div class="stats-row">
      {{#if data.summary.totalRegressions}}
      <span class="stat-badge regressions">&#x26A0; {{data.summary.totalRegressions}} Regression{{#if (gt data.summary.totalRegressions 1)}}s{{/if}}</span>
      {{/if}}
      {{#if data.summary.totalImprovements}}
      <span class="stat-badge improvements">&#x2705; {{data.summary.totalImprovements}} Improvement{{#if (gt data.summary.totalImprovements 1)}}s{{/if}}</span>
      {{/if}}
      {{#if data.summary.totalUnchanged}}
      <span class="stat-badge unchanged">&#x2796; {{data.summary.totalUnchanged}} Unchanged</span>
      {{/if}}
      {{#if data.summary.casesAdded}}
      <span class="stat-badge added">&#x2795; {{data.summary.casesAdded}} New</span>
      {{/if}}
      {{#if data.summary.casesRemoved}}
      <span class="stat-badge removed">&#x2796; {{data.summary.casesRemoved}} Removed</span>
      {{/if}}
    </div>

    <!-- Case Comparison Table -->
    <h2>Case Comparison</h2>

    <div class="controls">
      <div class="filter-group">
        <button class="filter-btn active" data-filter="all" onclick="filterCases('all')">All ({{data.caseComparisons.length}})</button>
        <button class="filter-btn regressed" data-filter="regressed" onclick="filterCases('regressed')">Regressed ({{data.summary.totalRegressions}})</button>
        <button class="filter-btn improved" data-filter="improved" onclick="filterCases('improved')">Improved ({{data.summary.totalImprovements}})</button>
        <button class="filter-btn" data-filter="unchanged" onclick="filterCases('unchanged')">Unchanged ({{data.summary.totalUnchanged}})</button>
      </div>
      <div class="search-box">
        <input type="text" class="search-input" id="search-input" placeholder="Search by ID or name..." oninput="searchCases(this.value)">
      </div>
    </div>
    <div class="results-count" id="results-count">Showing all {{data.caseComparisons.length}} cases</div>

    <table id="cases-table">
      <thead>
        <tr>
          <th>Case</th>
          <th>Baseline</th>
          <th>Current</th>
          <th>Change</th>
          <th>Score</th>
          <th>Latency</th>
        </tr>
      </thead>
      <tbody>
        {{#each data.caseComparisons}}
        <tr class="expandable case-row" data-change="{{changeType}}" data-id="{{caseId}}" data-name="{{name}}" onclick="toggleDetails('{{caseId}}')">
          <td>
            <strong>{{caseId}}</strong>
            {{#if name}}<br><small>{{name}}</small>{{/if}}
          </td>
          <td>
            {{#if baselineStatus}}
            <span class="status {{baselineStatus}}">{{uppercase baselineStatus}}</span>
            {{else}}
            <span class="status na">N/A</span>
            {{/if}}
          </td>
          <td>
            {{#if currentStatus}}
            <span class="status {{currentStatus}}">{{uppercase currentStatus}}</span>
            {{else}}
            <span class="status na">N/A</span>
            {{/if}}
          </td>
          <td>
            <span class="change-type {{changeType}}">
              {{changeTypeIcon changeType}} {{changeTypeLabel changeType}}
            </span>
          </td>
          <td>
            <span class="score-compare">
              {{#if baselineScore}}<span class="old">{{formatPercent baselineScore}}</span>{{/if}}
              {{#if currentScore}}<span class="new">{{formatPercent currentScore}}</span>{{/if}}
              {{#unless currentScore}}{{#unless baselineScore}}<span class="new">-</span>{{/unless}}{{/unless}}
            </span>
          </td>
          <td>
            {{#if latencyDelta}}
            <span class="arrow {{latencyArrow latencyDelta}}">{{latencyArrowIcon latencyDelta}}</span>
            {{formatLatencyDelta latencyDelta}}
            {{else}}
            -
            {{/if}}
          </td>
        </tr>
        <tr id="details-{{caseId}}" class="hidden details-row" data-parent="{{caseId}}">
          <td colspan="6">
            <div class="details">
              <div class="details-grid">
                <div class="details-col">
                  <h4>Baseline Response</h4>
                  {{#if baselineCase}}
                  <pre>{{baselineCase.response}}</pre>
                  <p><strong>Reason:</strong> {{baselineCase.reason}}</p>
                  {{else}}
                  <p><em>No baseline data</em></p>
                  {{/if}}
                </div>
                <div class="details-col">
                  <h4>Current Response</h4>
                  {{#if currentCase}}
                  <pre>{{currentCase.response}}</pre>
                  <p><strong>Reason:</strong> {{currentCase.reason}}</p>
                  {{else}}
                  <p><em>No current data</em></p>
                  {{/if}}
                </div>
              </div>
            </div>
          </td>
        </tr>
        {{/each}}
      </tbody>
    </table>

    <div class="no-results hidden" id="no-results">
      <div class="icon">&#128269;</div>
      <p>No cases match your filter or search criteria.</p>
    </div>

    <footer>
      Generated by Artemis Agent Reliability Toolkit
    </footer>
  </div>

  <script>
    let currentFilter = 'all';
    let currentSearch = '';

    function toggleDetails(id) {
      const details = document.getElementById('details-' + id);
      details.classList.toggle('hidden');
    }

    function filterCases(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-filter') === filter) {
          btn.classList.add('active');
        }
      });
      applyFilters();
    }

    function searchCases(query) {
      currentSearch = query.toLowerCase().trim();
      applyFilters();
    }

    function applyFilters() {
      const rows = document.querySelectorAll('.case-row');
      const table = document.getElementById('cases-table');
      const noResults = document.getElementById('no-results');
      let visibleCount = 0;

      rows.forEach(row => {
        const change = row.getAttribute('data-change');
        const id = (row.getAttribute('data-id') || '').toLowerCase();
        const name = (row.getAttribute('data-name') || '').toLowerCase();
        const detailsRow = document.getElementById('details-' + row.getAttribute('data-id'));

        const passesFilter = currentFilter === 'all' || change === currentFilter;
        const passesSearch = !currentSearch || id.includes(currentSearch) || name.includes(currentSearch);

        const shouldShow = passesFilter && passesSearch;
        row.classList.toggle('hidden', !shouldShow);

        if (!shouldShow && detailsRow) {
          detailsRow.classList.add('hidden');
        }

        if (shouldShow) visibleCount++;
      });

      const totalCases = rows.length;
      const resultsText = document.getElementById('results-count');
      if (currentFilter === 'all' && !currentSearch) {
        resultsText.textContent = 'Showing all ' + totalCases + ' cases';
      } else {
        resultsText.textContent = 'Showing ' + visibleCount + ' of ' + totalCases + ' cases';
      }

      if (visibleCount === 0) {
        table.classList.add('hidden');
        noResults.classList.remove('hidden');
      } else {
        table.classList.remove('hidden');
        noResults.classList.add('hidden');
      }
    }
  </script>
</body>
</html>
`;

/**
 * Build comparison data from two manifests
 */
export function buildComparisonData(baseline: RunManifest, current: RunManifest): ComparisonData {
  // Build case lookup maps
  const baselineCases = new Map<string, CaseResult>();
  const currentCases = new Map<string, CaseResult>();

  for (const c of baseline.cases) {
    baselineCases.set(c.id, c);
  }
  for (const c of current.cases) {
    currentCases.set(c.id, c);
  }

  // Get all unique case IDs
  const allCaseIds = new Set([...baselineCases.keys(), ...currentCases.keys()]);

  // Build case comparisons
  const caseComparisons: CaseComparison[] = [];
  let totalRegressions = 0;
  let totalImprovements = 0;
  let totalUnchanged = 0;
  let casesRemoved = 0;
  let casesAdded = 0;

  for (const caseId of allCaseIds) {
    const baselineCase = baselineCases.get(caseId);
    const currentCase = currentCases.get(caseId);

    const baselineStatus = baselineCase ? (baselineCase.ok ? 'passed' : 'failed') : null;
    const currentStatus = currentCase ? (currentCase.ok ? 'passed' : 'failed') : null;
    const baselineScore = baselineCase?.score ?? null;
    const currentScore = currentCase?.score ?? null;
    const baselineLatency = baselineCase?.latencyMs ?? null;
    const currentLatency = currentCase?.latencyMs ?? null;

    // Calculate deltas
    const scoreDelta =
      baselineScore !== null && currentScore !== null ? currentScore - baselineScore : 0;
    const latencyDelta =
      baselineLatency !== null && currentLatency !== null ? currentLatency - baselineLatency : 0;

    // Determine change type
    let changeType: CaseComparison['changeType'];
    if (!baselineCase) {
      changeType = 'new';
      casesAdded++;
    } else if (!currentCase) {
      changeType = 'removed';
      casesRemoved++;
    } else if (baselineStatus === 'passed' && currentStatus === 'failed') {
      changeType = 'regressed';
      totalRegressions++;
    } else if (baselineStatus === 'failed' && currentStatus === 'passed') {
      changeType = 'improved';
      totalImprovements++;
    } else {
      changeType = 'unchanged';
      totalUnchanged++;
    }

    caseComparisons.push({
      caseId,
      name: currentCase?.name || baselineCase?.name,
      baselineStatus,
      currentStatus,
      baselineScore,
      currentScore,
      scoreDelta,
      baselineLatency,
      currentLatency,
      latencyDelta,
      changeType,
      baselineCase,
      currentCase,
    });
  }

  // Sort: regressions first, then improvements, then unchanged, then new/removed
  const changeOrder = { regressed: 0, improved: 1, new: 2, removed: 3, unchanged: 4 };
  caseComparisons.sort((a, b) => changeOrder[a.changeType] - changeOrder[b.changeType]);

  // Calculate metric deltas
  const successRateDelta = current.metrics.success_rate - baseline.metrics.success_rate;
  const medianLatencyDelta = current.metrics.median_latency_ms - baseline.metrics.median_latency_ms;
  const totalTokensDelta = current.metrics.total_tokens - baseline.metrics.total_tokens;

  return {
    baseline,
    current,
    metrics: {
      successRateDelta,
      medianLatencyDelta,
      totalTokensDelta,
    },
    caseComparisons,
    summary: {
      totalRegressions,
      totalImprovements,
      totalUnchanged,
      casesRemoved,
      casesAdded,
    },
  };
}

/**
 * Generate an HTML comparison report
 */
export function generateCompareHTMLReport(baseline: RunManifest, current: RunManifest): string {
  const data = buildComparisonData(baseline, current);

  // Register helpers
  Handlebars.registerHelper('formatPercent', (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return `${(value * 100).toFixed(1)}%`;
  });

  Handlebars.registerHelper('formatNumber', (value: number) => {
    return value?.toLocaleString() ?? '-';
  });

  Handlebars.registerHelper('formatDate', (value: string) => {
    return new Date(value).toLocaleString();
  });

  Handlebars.registerHelper('formatDelta', (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(1)}%`;
  });

  Handlebars.registerHelper('formatLatencyDelta', (value: number) => {
    if (value === 0) return '0ms';
    const sign = value > 0 ? '+' : '';
    return `${sign}${Math.round(value)}ms`;
  });

  Handlebars.registerHelper('formatTokenDelta', (value: number) => {
    if (value === 0) return '0';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toLocaleString()}`;
  });

  Handlebars.registerHelper('formatPassedDelta', (baseline: number, current: number) => {
    const delta = current - baseline;
    if (delta === 0) return '0';
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta}`;
  });

  Handlebars.registerHelper('deltaClass', (value: number) => {
    if (value > 0.001) return 'positive';
    if (value < -0.001) return 'negative';
    return 'neutral';
  });

  Handlebars.registerHelper('latencyDeltaClass', (value: number) => {
    // For latency, negative is good (faster)
    if (value < -5) return 'positive';
    if (value > 5) return 'negative';
    return 'neutral';
  });

  Handlebars.registerHelper('tokenDeltaClass', (value: number) => {
    // For tokens, negative is good (fewer tokens)
    if (value < -10) return 'positive';
    if (value > 10) return 'negative';
    return 'neutral';
  });

  Handlebars.registerHelper('passedDeltaClass', (baseline: number, current: number) => {
    const delta = current - baseline;
    if (delta > 0) return 'positive';
    if (delta < 0) return 'negative';
    return 'neutral';
  });

  Handlebars.registerHelper('uppercase', (value: string) => {
    return value?.toUpperCase() ?? '';
  });

  Handlebars.registerHelper('changeTypeIcon', (changeType: string) => {
    switch (changeType) {
      case 'regressed':
        return '↓';
      case 'improved':
        return '↑';
      case 'unchanged':
        return '→';
      case 'new':
        return '+';
      case 'removed':
        return '−';
      default:
        return '';
    }
  });

  Handlebars.registerHelper('changeTypeLabel', (changeType: string) => {
    switch (changeType) {
      case 'regressed':
        return 'Regressed';
      case 'improved':
        return 'Improved';
      case 'unchanged':
        return 'Unchanged';
      case 'new':
        return 'New';
      case 'removed':
        return 'Removed';
      default:
        return changeType;
    }
  });

  Handlebars.registerHelper('latencyArrow', (value: number) => {
    if (value < -5) return 'up';
    if (value > 5) return 'down';
    return 'same';
  });

  Handlebars.registerHelper('latencyArrowIcon', (value: number) => {
    if (value < -5) return '↑';
    if (value > 5) return '↓';
    return '→';
  });

  Handlebars.registerHelper('gt', (a: number, b: number) => a > b);

  const template = Handlebars.compile(COMPARE_HTML_TEMPLATE);
  return template({ data });
}
