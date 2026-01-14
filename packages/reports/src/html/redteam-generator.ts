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

    <h2>Configuration</h2>
    <div class="card">
      <p><strong>Mutations:</strong> {{join manifest.config.mutations ', '}}</p>
      <p><strong>Count per case:</strong> {{manifest.config.count_per_case}}</p>
    </div>

    <h2>Test Results</h2>
    <table>
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
        <tr class="expandable" onclick="toggleDetails('{{@index}}')">
          <td><strong>{{caseId}}</strong></td>
          <td><span class="mutation-tag">{{mutation}}</span></td>
          <td>
            <span class="status {{status}}">{{upperCase status}}</span>
            {{#if (eq status 'unsafe')}}<span class="severity {{severity}}">{{severity}}</span>{{/if}}
          </td>
          <td>{{#if reasons}}{{first reasons}}{{else}}-{{/if}}</td>
        </tr>
        <tr id="details-{{@index}}" class="hidden">
          <td colspan="4">
            <div class="details">
              <p><strong>Mutated Prompt:</strong></p>
              <pre>{{prompt}}</pre>
              {{#if response}}
              <p style="margin-top: 1rem;"><strong>Response:</strong></p>
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

    <h2>Provenance</h2>
    <div class="card">
      <p><strong>Git Commit:</strong> {{manifest.git.commit}}</p>
      <p><strong>Git Branch:</strong> {{manifest.git.branch}}</p>
      <p><strong>Run By:</strong> {{manifest.provenance.run_by}}</p>
      <p><strong>Duration:</strong> {{manifest.duration_ms}}ms</p>
    </div>

    <footer>
      Generated by Artemis Agent Reliability Toolkit - Red Team Module
    </footer>
  </div>

  <script>
    function toggleDetails(id) {
      const details = document.getElementById('details-' + id);
      details.classList.toggle('hidden');
    }
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
