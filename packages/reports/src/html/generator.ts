/**
 * HTML Report Generator
 */

import type { RunManifest } from '@artemiskit/core';
import Handlebars from 'handlebars';

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artemis Report - {{manifest.config.scenario}}</title>
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
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f9fafb; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .status { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; }
    .status.passed { background: #dcfce7; color: #166534; }
    .status.failed { background: #fee2e2; color: #991b1b; }
    .score { font-family: monospace; }
    .details { margin-top: 0.5rem; padding: 1rem; background: #f9fafb; border-radius: 4px; font-size: 0.875rem; }
    .details pre { white-space: pre-wrap; word-break: break-word; }
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
    footer { margin-top: 3rem; text-align: center; color: #666; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{manifest.config.scenario}}</h1>
    <p class="meta">
      Run ID: {{manifest.run_id}} |
      Provider: {{manifest.config.provider}} |
      Model: {{manifest.config.model}} |
      {{formatDate manifest.start_time}}
    </p>

    {{#if manifest.redaction.enabled}}
    <div class="redaction-banner">
      <div class="icon">🔒</div>
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

    <div class="summary">
      <div class="card">
        <h3>Success Rate</h3>
        <div class="value {{successRateClass manifest.metrics.success_rate}}">
          {{formatPercent manifest.metrics.success_rate}}
        </div>
      </div>
      <div class="card">
        <h3>Passed / Total</h3>
        <div class="value">{{manifest.metrics.passed_cases}} / {{manifest.metrics.total_cases}}</div>
      </div>
      <div class="card">
        <h3>Median Latency</h3>
        <div class="value">{{manifest.metrics.median_latency_ms}}ms</div>
      </div>
      <div class="card">
        <h3>Total Tokens</h3>
        <div class="value">{{formatNumber manifest.metrics.total_tokens}}</div>
      </div>
    </div>

    <h2>Test Cases</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Status</th>
          <th>Score</th>
          <th>Matcher</th>
          <th>Latency</th>
          <th>Tokens</th>
        </tr>
      </thead>
      <tbody>
        {{#each manifest.cases}}
        <tr class="expandable" onclick="toggleDetails('{{id}}')">
          <td><strong>{{id}}</strong>{{#if name}}<br><small>{{name}}</small>{{/if}}{{#if redaction.redacted}}<span class="redacted-badge">redacted</span>{{/if}}</td>
          <td><span class="status {{#if ok}}passed{{else}}failed{{/if}}">{{#if ok}}PASSED{{else}}FAILED{{/if}}</span></td>
          <td class="score">{{formatPercent score}}</td>
          <td>{{matcherType}}</td>
          <td>{{latencyMs}}ms</td>
          <td>{{tokens.total}}</td>
        </tr>
        <tr id="details-{{id}}" class="hidden">
          <td colspan="6">
            <div class="details">
              <p><strong>Reason:</strong> {{reason}}</p>
              <p><strong>Prompt:</strong>{{#if redaction.promptRedacted}} <span class="redacted-badge">redacted</span>{{/if}}</p>
              <pre>{{formatPrompt prompt}}</pre>
              <p><strong>Response:</strong>{{#if redaction.responseRedacted}} <span class="redacted-badge">redacted</span>{{/if}}</p>
              <pre>{{response}}</pre>
            </div>
          </td>
        </tr>
        {{/each}}
      </tbody>
    </table>

    {{#if manifest.resolved_config}}
    <h2>Resolved Configuration</h2>
    <div class="card">
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
      {{#if manifest.resolved_config.underlying_provider}}
      <p><strong>Underlying Provider:</strong> {{manifest.resolved_config.underlying_provider}} <span class="source-badge">{{manifest.resolved_config.source.underlying_provider}}</span></p>
      {{/if}}
      {{#if manifest.resolved_config.temperature}}
      <p><strong>Temperature:</strong> {{manifest.resolved_config.temperature}} <span class="source-badge">{{manifest.resolved_config.source.temperature}}</span></p>
      {{/if}}
      {{#if manifest.resolved_config.max_tokens}}
      <p><strong>Max Tokens:</strong> {{manifest.resolved_config.max_tokens}} <span class="source-badge">{{manifest.resolved_config.source.max_tokens}}</span></p>
      {{/if}}
    </div>
    {{/if}}

    <h2>Provenance</h2>
    <div class="card">
      <p><strong>Git Commit:</strong> {{manifest.git.commit}}</p>
      <p><strong>Git Branch:</strong> {{manifest.git.branch}}</p>
      <p><strong>Run By:</strong> {{manifest.provenance.run_by}}</p>
      <p><strong>Duration:</strong> {{manifest.duration_ms}}ms</p>
    </div>

    <footer>
      Generated by Artemis Agent Reliability Toolkit
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

export function generateHTMLReport(manifest: RunManifest): string {
  // Register helpers
  Handlebars.registerHelper('formatPercent', (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  });

  Handlebars.registerHelper('formatNumber', (value: number) => {
    return value.toLocaleString();
  });

  Handlebars.registerHelper('formatDate', (value: string) => {
    return new Date(value).toLocaleString();
  });

  Handlebars.registerHelper('successRateClass', (value: number) => {
    if (value >= 0.9) return 'success';
    if (value >= 0.7) return 'warning';
    return 'error';
  });

  Handlebars.registerHelper('formatPrompt', (prompt: string | object) => {
    if (typeof prompt === 'string') return prompt;
    return JSON.stringify(prompt, null, 2);
  });

  const template = Handlebars.compile(HTML_TEMPLATE);
  return template({ manifest });
}
