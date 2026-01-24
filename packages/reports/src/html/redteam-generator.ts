/**
 * Red Team HTML Report Generator
 */

import type { RedTeamManifest } from '@artemiskit/core';
import Handlebars from 'handlebars';

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artemis Red Team Report - {{manifest.config.scenario}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { margin-bottom: 0.5rem; color: #1a1a1a; }
    h2 { margin: 2rem 0 1rem; color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.5rem; }
    .meta { color: #666; margin-bottom: 2rem; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 600;
      margin-right: 0.5rem;
    }
    .badge.redteam { background: #fef3c7; color: #92400e; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .card h3 { font-size: 0.875rem; color: #666; margin-bottom: 0.5rem; }
    .card .value { font-size: 2rem; font-weight: bold; }
    .card .value.success { color: #22c55e; }
    .card .value.warning { color: #f59e0b; }
    .card .value.error { color: #ef4444; }
    .card .value.info { color: #3b82f6; }
    .severity-breakdown {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-top: 1rem;
    }
    .severity-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .severity-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .severity-dot.critical { background: #dc2626; }
    .severity-dot.high { background: #ea580c; }
    .severity-dot.medium { background: #f59e0b; }
    .severity-dot.low { background: #eab308; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f9fafb; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .status { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; }
    .status.safe { background: #dcfce7; color: #166534; }
    .status.unsafe { background: #fee2e2; color: #991b1b; }
    .status.blocked { background: #dbeafe; color: #1e40af; }
    .status.error { background: #fef3c7; color: #92400e; }
    .severity { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; margin-left: 0.5rem; }
    .severity.critical { background: #fecaca; color: #991b1b; }
    .severity.high { background: #fed7aa; color: #9a3412; }
    .severity.medium { background: #fef08a; color: #854d0e; }
    .severity.low { background: #fef9c3; color: #a16207; }
    .mutation-tag { display: inline-block; padding: 0.125rem 0.5rem; background: #e5e7eb; border-radius: 4px; font-size: 0.75rem; color: #4b5563; }
    .details { margin-top: 0.5rem; padding: 1rem; background: #f9fafb; border-radius: 4px; font-size: 0.875rem; }
    .details pre { white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; }
    .expandable { cursor: pointer; }
    .expandable:hover { background: #f0f0f0; }
    .hidden { display: none; }
    .source-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
      background: #e0e7ff;
      color: #3730a3;
      margin-left: 0.5rem;
    }
    .redaction-banner {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .redaction-banner .icon { font-size: 1.5rem; }
    .redaction-banner .content { flex: 1; }
    .redaction-banner .title { font-weight: 600; color: #92400e; }
    .redaction-banner .details { font-size: 0.875rem; color: #a16207; margin-top: 0.25rem; }
    .redacted-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
      background: #fef3c7;
      color: #92400e;
      margin-left: 0.5rem;
    }
    .defense-meter {
      width: 100%;
      height: 24px;
      background: #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      margin-top: 1rem;
    }
    .defense-meter-fill {
      height: 100%;
      background: linear-gradient(90deg, #22c55e, #16a34a);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 0.5rem;
      color: white;
      font-weight: 600;
      font-size: 0.875rem;
    }
    footer { margin-top: 3rem; text-align: center; color: #666; font-size: 0.875rem; }

    /* Collapsible sections */
    .collapsible-header {
      display: flex;
      align-items: center;
      cursor: pointer;
      user-select: none;
    }
    .collapsible-header h2 {
      margin: 0;
      flex: 1;
    }
    .collapse-icon {
      font-size: 1.25rem;
      transition: transform 0.2s ease;
      margin-left: 0.5rem;
      color: #666;
    }
    .collapsible-header[data-collapsed="true"] .collapse-icon {
      transform: rotate(-90deg);
    }
    .collapsible-content {
      overflow: hidden;
      transition: max-height 0.3s ease;
    }
    .collapsible-content.collapsed {
      max-height: 0 !important;
      padding: 0;
    }

    /* Filter and Search controls */
    .controls {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .filter-group {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
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
    .filter-btn:hover {
      background: #f5f5f5;
    }
    .filter-btn.active {
      background: #1a1a1a;
      color: white;
      border-color: #1a1a1a;
    }
    .filter-btn.safe.active {
      background: #166534;
      border-color: #166534;
    }
    .filter-btn.blocked.active {
      background: #1e40af;
      border-color: #1e40af;
    }
    .filter-btn.unsafe.active {
      background: #991b1b;
      border-color: #991b1b;
    }
    .filter-btn.error.active {
      background: #92400e;
      border-color: #92400e;
    }
    .search-box {
      flex: 1;
      min-width: 200px;
      max-width: 400px;
    }
    .search-input {
      width: 100%;
      padding: 0.5rem 1rem;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.15s ease;
    }
    .search-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    .search-input::placeholder {
      color: #999;
    }
    .results-count {
      font-size: 0.875rem;
      color: #666;
      padding: 0.5rem 0;
    }

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

    /* Row highlight for search matches */
    tr.search-highlight td {
      background: #fef9c3;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>
      <span class="badge redteam">RED TEAM</span>
      {{manifest.config.scenario}}
    </h1>
    <p class="meta">
      Run ID: {{manifest.run_id}} |
      Provider: {{manifest.config.provider}} |
      {{#if manifest.config.model}}Model: {{manifest.config.model}} |{{/if}}
      {{formatDate manifest.start_time}}
    </p>

    {{#if manifest.redaction.enabled}}
    <div class="redaction-banner">
      <div class="icon">&#128274;</div>
      <div class="content">
        <div class="title">Data Redaction Applied</div>
        <div class="details">
          {{manifest.redaction.summary.totalRedactions}} redactions made
          ({{manifest.redaction.summary.promptsRedacted}} prompts, {{manifest.redaction.summary.responsesRedacted}} responses).
          Replacement: <code>{{manifest.redaction.replacement}}</code>
        </div>
      </div>
    </div>
    {{/if}}

    <!-- Summary Section (Collapsible) -->
    <div class="collapsible-section" data-section="summary">
      <div class="collapsible-header" onclick="toggleSection('summary')">
        <h2>Summary</h2>
        <span class="collapse-icon">&#9660;</span>
      </div>
      <div class="collapsible-content" id="section-summary">
        <div class="summary">
          <div class="card">
            <h3>Defense Rate</h3>
            <div class="value {{defenseRateClass manifest.metrics.defense_rate}}">
              {{formatPercent manifest.metrics.defense_rate}}
            </div>
            <div class="defense-meter">
              <div class="defense-meter-fill" style="width: {{formatPercentRaw manifest.metrics.defense_rate}}">
                {{manifest.metrics.defended}}/{{subtract manifest.metrics.total_tests manifest.metrics.error_responses}}
              </div>
            </div>
          </div>
          <div class="card">
            <h3>Total Tests</h3>
            <div class="value">{{manifest.metrics.total_tests}}</div>
          </div>
          <div class="card">
            <h3>Safe Responses</h3>
            <div class="value success">{{manifest.metrics.safe_responses}}</div>
          </div>
          <div class="card">
            <h3>Blocked by Provider</h3>
            <div class="value info">{{manifest.metrics.blocked_responses}}</div>
          </div>
          <div class="card">
            <h3>Unsafe Responses</h3>
            <div class="value {{#if manifest.metrics.unsafe_responses}}error{{/if}}">{{manifest.metrics.unsafe_responses}}</div>
          </div>
          <div class="card">
            <h3>Errors</h3>
            <div class="value {{#if manifest.metrics.error_responses}}warning{{/if}}">{{manifest.metrics.error_responses}}</div>
          </div>
        </div>

        {{#if manifest.metrics.unsafe_responses}}
        <div class="card" style="margin-bottom: 2rem; border-left: 4px solid #ef4444;">
          <h3>Severity Breakdown</h3>
          <div class="severity-breakdown">
            {{#if manifest.metrics.by_severity.critical}}
            <div class="severity-item">
              <span class="severity-dot critical"></span>
              <span>Critical: {{manifest.metrics.by_severity.critical}}</span>
            </div>
            {{/if}}
            {{#if manifest.metrics.by_severity.high}}
            <div class="severity-item">
              <span class="severity-dot high"></span>
              <span>High: {{manifest.metrics.by_severity.high}}</span>
            </div>
            {{/if}}
            {{#if manifest.metrics.by_severity.medium}}
            <div class="severity-item">
              <span class="severity-dot medium"></span>
              <span>Medium: {{manifest.metrics.by_severity.medium}}</span>
            </div>
            {{/if}}
            {{#if manifest.metrics.by_severity.low}}
            <div class="severity-item">
              <span class="severity-dot low"></span>
              <span>Low: {{manifest.metrics.by_severity.low}}</span>
            </div>
            {{/if}}
          </div>
        </div>
        {{/if}}
      </div>
    </div>

    <!-- Configuration Section (Collapsible) -->
    <div class="collapsible-section" data-section="config">
      <div class="collapsible-header" onclick="toggleSection('config')">
        <h2>Configuration</h2>
        <span class="collapse-icon">&#9660;</span>
      </div>
      <div class="collapsible-content" id="section-config">
        <div class="card">
          <p><strong>Mutations:</strong> {{join manifest.config.mutations ', '}}</p>
          <p><strong>Count per case:</strong> {{manifest.config.count_per_case}}</p>
        </div>

        {{#if manifest.resolved_config}}
        <div class="card" style="margin-top: 1rem;">
          <h3 style="margin-bottom: 1rem;">Resolved Provider Configuration</h3>
          <p><strong>Provider:</strong> {{manifest.resolved_config.provider}} <span class="source-badge">{{manifest.resolved_config.source.provider}}</span></p>
          {{#if manifest.resolved_config.model}}
          <p><strong>Model:</strong> {{manifest.resolved_config.model}} <span class="source-badge">{{manifest.resolved_config.source.model}}</span></p>
          {{/if}}
          {{#if manifest.resolved_config.deployment_name}}
          <p><strong>Deployment:</strong> {{manifest.resolved_config.deployment_name}} <span class="source-badge">{{manifest.resolved_config.source.deployment_name}}</span></p>
          {{/if}}
          {{#if manifest.resolved_config.resource_name}}
          <p><strong>Resource:</strong> {{manifest.resolved_config.resource_name}} <span class="source-badge">{{manifest.resolved_config.source.resource_name}}</span></p>
          {{/if}}
          {{#if manifest.resolved_config.api_version}}
          <p><strong>API Version:</strong> {{manifest.resolved_config.api_version}} <span class="source-badge">{{manifest.resolved_config.source.api_version}}</span></p>
          {{/if}}
          {{#if manifest.resolved_config.base_url}}
          <p><strong>Base URL:</strong> {{manifest.resolved_config.base_url}} <span class="source-badge">{{manifest.resolved_config.source.base_url}}</span></p>
          {{/if}}
          {{#if manifest.resolved_config.temperature}}
          <p><strong>Temperature:</strong> {{manifest.resolved_config.temperature}} <span class="source-badge">{{manifest.resolved_config.source.temperature}}</span></p>
          {{/if}}
        </div>
        {{/if}}
      </div>
    </div>

    <!-- Test Results Section (Collapsible with Filter & Search) -->
    <div class="collapsible-section" data-section="results">
      <div class="collapsible-header" onclick="toggleSection('results')">
        <h2>Test Results</h2>
        <span class="collapse-icon">&#9660;</span>
      </div>
      <div class="collapsible-content" id="section-results">
        <!-- Filter and Search Controls -->
        <div class="controls">
          <div class="filter-group">
            <button class="filter-btn active" data-filter="all" onclick="filterResults('all')">All ({{manifest.metrics.total_tests}})</button>
            <button class="filter-btn safe" data-filter="safe" onclick="filterResults('safe')">Safe ({{manifest.metrics.safe_responses}})</button>
            <button class="filter-btn blocked" data-filter="blocked" onclick="filterResults('blocked')">Blocked ({{manifest.metrics.blocked_responses}})</button>
            <button class="filter-btn unsafe" data-filter="unsafe" onclick="filterResults('unsafe')">Unsafe ({{manifest.metrics.unsafe_responses}})</button>
            <button class="filter-btn error" data-filter="error" onclick="filterResults('error')">Error ({{manifest.metrics.error_responses}})</button>
          </div>
          <div class="search-box">
            <input type="text" class="search-input" id="search-input" placeholder="Search by case ID, mutation, response..." oninput="searchResults(this.value)">
          </div>
        </div>
        <div class="results-count" id="results-count">Showing all {{manifest.metrics.total_tests}} test results</div>

        <table id="results-table">
          <thead>
            <tr>
              <th>Case ID</th>
              <th>Mutation</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {{#each manifest.results}}
            <tr class="expandable result-row" data-status="{{status}}" data-caseid="{{caseId}}" data-mutation="{{mutation}}" data-response="{{response}}" data-reasons="{{joinReasons reasons}}" onclick="toggleDetails('{{@index}}')">
              <td><strong>{{caseId}}</strong>{{#if redaction.redacted}}<span class="redacted-badge">redacted</span>{{/if}}</td>
              <td><span class="mutation-tag">{{mutation}}</span></td>
              <td>
                <span class="status {{status}}">{{upperCase status}}</span>
                {{#if (eq status 'unsafe')}}<span class="severity {{severity}}">{{severity}}</span>{{/if}}
              </td>
              <td>{{#if reasons}}{{first reasons}}{{else}}-{{/if}}</td>
            </tr>
            <tr id="details-{{@index}}" class="hidden details-row" data-parent="{{@index}}">
              <td colspan="4">
                <div class="details">
                  <p><strong>Mutated Prompt:</strong>{{#if redaction.promptRedacted}} <span class="redacted-badge">redacted</span>{{/if}}</p>
                  <pre>{{prompt}}</pre>
                  {{#if response}}
                  <p style="margin-top: 1rem;"><strong>Response:</strong>{{#if redaction.responseRedacted}} <span class="redacted-badge">redacted</span>{{/if}}</p>
                  <pre>{{response}}</pre>
                  {{/if}}
                  {{#if reasons.length}}
                  <p style="margin-top: 1rem;"><strong>Reasons:</strong></p>
                  <ul>
                    {{#each reasons}}
                    <li>{{this}}</li>
                    {{/each}}
                  </ul>
                  {{/if}}
                </div>
              </td>
            </tr>
            {{/each}}
          </tbody>
        </table>
        <div class="no-results hidden" id="no-results">
          <div class="icon">&#128269;</div>
          <p>No test results match your filter or search criteria.</p>
        </div>
      </div>
    </div>

    <!-- Provenance Section (Collapsible) -->
    <div class="collapsible-section" data-section="provenance">
      <div class="collapsible-header" onclick="toggleSection('provenance')">
        <h2>Provenance</h2>
        <span class="collapse-icon">&#9660;</span>
      </div>
      <div class="collapsible-content" id="section-provenance">
        <div class="card">
          <p><strong>Git Commit:</strong> {{manifest.git.commit}}</p>
          <p><strong>Git Branch:</strong> {{manifest.git.branch}}</p>
          <p><strong>Run By:</strong> {{manifest.provenance.run_by}}</p>
          <p><strong>Duration:</strong> {{manifest.duration_ms}}ms</p>
        </div>
      </div>
    </div>

    <footer>
      Generated by Artemis Agent Reliability Toolkit - Red Team Module
    </footer>
  </div>

  <script>
    // State
    let currentFilter = 'all';
    let currentSearch = '';

    // Toggle collapsible sections
    function toggleSection(sectionId) {
      const header = document.querySelector('[data-section="' + sectionId + '"] .collapsible-header');
      const content = document.getElementById('section-' + sectionId);
      const isCollapsed = header.getAttribute('data-collapsed') === 'true';

      if (isCollapsed) {
        header.setAttribute('data-collapsed', 'false');
        content.classList.remove('collapsed');
      } else {
        header.setAttribute('data-collapsed', 'true');
        content.classList.add('collapsed');
      }
    }

    // Toggle result details
    function toggleDetails(id) {
      const details = document.getElementById('details-' + id);
      details.classList.toggle('hidden');
    }

    // Filter results by status
    function filterResults(status) {
      currentFilter = status;

      // Update active button
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-filter') === status) {
          btn.classList.add('active');
        }
      });

      applyFilters();
    }

    // Search results
    function searchResults(query) {
      currentSearch = query.toLowerCase().trim();
      applyFilters();
    }

    // Apply both filter and search
    function applyFilters() {
      const rows = document.querySelectorAll('.result-row');
      const table = document.getElementById('results-table');
      const noResults = document.getElementById('no-results');
      let visibleCount = 0;

      rows.forEach(row => {
        const status = row.getAttribute('data-status');
        const caseId = (row.getAttribute('data-caseid') || '').toLowerCase();
        const mutation = (row.getAttribute('data-mutation') || '').toLowerCase();
        const response = (row.getAttribute('data-response') || '').toLowerCase();
        const reasons = (row.getAttribute('data-reasons') || '').toLowerCase();
        const index = row.querySelector('td strong').textContent;
        const detailsRow = document.getElementById('details-' + Array.from(document.querySelectorAll('.result-row')).indexOf(row));

        // Check filter
        const passesFilter = currentFilter === 'all' || status === currentFilter;

        // Check search
        let passesSearch = true;
        if (currentSearch) {
          passesSearch = caseId.includes(currentSearch) ||
                        mutation.includes(currentSearch) ||
                        response.includes(currentSearch) ||
                        reasons.includes(currentSearch);
        }

        // Show/hide row
        const shouldShow = passesFilter && passesSearch;
        row.classList.toggle('hidden', !shouldShow);

        // Handle search highlighting
        if (shouldShow && currentSearch) {
          row.classList.add('search-highlight');
        } else {
          row.classList.remove('search-highlight');
        }

        // Keep details row hidden if parent is hidden
        if (!shouldShow && detailsRow) {
          detailsRow.classList.add('hidden');
        }

        if (shouldShow) visibleCount++;
      });

      // Update results count
      const totalResults = rows.length;
      const resultsText = document.getElementById('results-count');
      if (currentFilter === 'all' && !currentSearch) {
        resultsText.textContent = 'Showing all ' + totalResults + ' test results';
      } else {
        resultsText.textContent = 'Showing ' + visibleCount + ' of ' + totalResults + ' test results';
      }

      // Show/hide no results message
      if (visibleCount === 0) {
        table.classList.add('hidden');
        noResults.classList.remove('hidden');
      } else {
        table.classList.remove('hidden');
        noResults.classList.add('hidden');
      }
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      }

      if (e.key === 'Escape') {
        const searchInput = document.getElementById('search-input');
        if (searchInput && document.activeElement === searchInput) {
          searchInput.value = '';
          searchResults('');
          searchInput.blur();
        }
      }
    });
  </script>
</body>
</html>
`;

export function generateRedTeamHTMLReport(manifest: RedTeamManifest): string {
  // Register helpers
  Handlebars.registerHelper('formatPercent', (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  });

  Handlebars.registerHelper('formatPercentRaw', (value: number) => {
    return `${(value * 100).toFixed(0)}%`;
  });

  Handlebars.registerHelper('formatDate', (value: string) => {
    return new Date(value).toLocaleString();
  });

  Handlebars.registerHelper('defenseRateClass', (value: number) => {
    if (value >= 0.95) return 'success';
    if (value >= 0.8) return 'warning';
    return 'error';
  });

  Handlebars.registerHelper('upperCase', (value: string) => {
    return value.toUpperCase();
  });

  Handlebars.registerHelper('join', (arr: string[], separator: string) => {
    return arr.join(separator);
  });

  Handlebars.registerHelper('joinReasons', (arr: string[]) => {
    return arr ? arr.join(' | ') : '';
  });

  Handlebars.registerHelper('first', (arr: string[]) => {
    return arr[0] || '';
  });

  Handlebars.registerHelper('eq', (a: string, b: string) => {
    return a === b;
  });

  Handlebars.registerHelper('subtract', (a: number, b: number) => {
    return a - b;
  });

  const template = Handlebars.compile(HTML_TEMPLATE);
  return template({ manifest });
}
