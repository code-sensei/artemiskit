/**
 * Stress Test HTML Report Generator
 */

import type { StressManifest } from '@artemiskit/core';
import Handlebars from 'handlebars';

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artemis Stress Test Report - {{manifest.config.scenario}}</title>
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
    .badge.stress { background: #dbeafe; color: #1e40af; }
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
    .card .unit { font-size: 1rem; font-weight: normal; color: #666; }
    .latency-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .latency-item {
      text-align: center;
      padding: 1rem;
      background: #f9fafb;
      border-radius: 8px;
    }
    .latency-item .label { font-size: 0.75rem; color: #666; text-transform: uppercase; }
    .latency-item .value { font-size: 1.5rem; font-weight: bold; color: #333; }
    .histogram {
      margin-top: 1rem;
      padding: 1rem;
      background: #f9fafb;
      border-radius: 8px;
    }
    .histogram-bar {
      display: flex;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .histogram-label {
      width: 100px;
      font-size: 0.75rem;
      color: #666;
      text-align: right;
      padding-right: 1rem;
    }
    .histogram-track {
      flex: 1;
      height: 20px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }
    .histogram-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #1d4ed8);
      border-radius: 4px;
    }
    .histogram-count {
      width: 60px;
      font-size: 0.75rem;
      color: #666;
      padding-left: 0.5rem;
    }
    .success-meter {
      width: 100%;
      height: 24px;
      background: #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      margin-top: 1rem;
    }
    .success-meter-fill {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 0.5rem;
      color: white;
      font-weight: 600;
      font-size: 0.875rem;
    }
    .success-meter-fill.high { background: linear-gradient(90deg, #22c55e, #16a34a); }
    .success-meter-fill.medium { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .success-meter-fill.low { background: linear-gradient(90deg, #ef4444, #dc2626); }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f9fafb; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
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
  </style>
</head>
<body>
  <div class="container">
    <h1>
      <span class="badge stress">STRESS TEST</span>
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
        <div class="title">Data Redaction Configured</div>
        <div class="details">
          Redaction was enabled for this stress test run.
          Patterns: {{join manifest.redaction.patternsUsed ', '}}
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
            <h3>Success Rate</h3>
            <div class="value {{successRateClass manifest.metrics.success_rate}}">
              {{formatPercent manifest.metrics.success_rate}}
            </div>
            <div class="success-meter">
              <div class="success-meter-fill {{successRateClass manifest.metrics.success_rate}}" style="width: {{formatPercentRaw manifest.metrics.success_rate}}">
                {{manifest.metrics.successful_requests}}/{{manifest.metrics.total_requests}}
              </div>
            </div>
          </div>
          <div class="card">
            <h3>Requests/Second</h3>
            <div class="value info">{{formatDecimal manifest.metrics.requests_per_second}}</div>
          </div>
          <div class="card">
            <h3>Total Requests</h3>
            <div class="value">{{formatNumber manifest.metrics.total_requests}}</div>
          </div>
          <div class="card">
            <h3>Duration</h3>
            <div class="value">{{formatDuration manifest.duration_ms}}<span class="unit">s</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Latency Percentiles Section (Collapsible) -->
    <div class="collapsible-section" data-section="latency">
      <div class="collapsible-header" onclick="toggleSection('latency')">
        <h2>Latency Percentiles</h2>
        <span class="collapse-icon">&#9660;</span>
      </div>
      <div class="collapsible-content" id="section-latency">
        <div class="card">
          <div class="latency-grid">
            <div class="latency-item">
              <div class="label">Min</div>
              <div class="value">{{manifest.metrics.min_latency_ms}}ms</div>
            </div>
            <div class="latency-item">
              <div class="label">P50</div>
              <div class="value">{{manifest.metrics.p50_latency_ms}}ms</div>
            </div>
            <div class="latency-item">
              <div class="label">P90</div>
              <div class="value">{{manifest.metrics.p90_latency_ms}}ms</div>
            </div>
            <div class="latency-item">
              <div class="label">P95</div>
              <div class="value">{{manifest.metrics.p95_latency_ms}}ms</div>
            </div>
            <div class="latency-item">
              <div class="label">P99</div>
              <div class="value">{{manifest.metrics.p99_latency_ms}}ms</div>
            </div>
            <div class="latency-item">
              <div class="label">Max</div>
              <div class="value">{{manifest.metrics.max_latency_ms}}ms</div>
            </div>
          </div>
        </div>
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
          <table>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>Concurrency</td>
              <td>{{manifest.config.concurrency}}</td>
            </tr>
            <tr>
              <td>Duration</td>
              <td>{{manifest.config.duration_seconds}} seconds</td>
            </tr>
            <tr>
              <td>Ramp-up Time</td>
              <td>{{manifest.config.ramp_up_seconds}} seconds</td>
            </tr>
            {{#if manifest.config.max_requests}}
            <tr>
              <td>Max Requests</td>
              <td>{{manifest.config.max_requests}}</td>
            </tr>
            {{/if}}
          </table>
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

    <!-- Results Summary Section (Collapsible) -->
    <div class="collapsible-section" data-section="results">
      <div class="collapsible-header" onclick="toggleSection('results')">
        <h2>Results Summary</h2>
        <span class="collapse-icon">&#9660;</span>
      </div>
      <div class="collapsible-content" id="section-results">
        <div class="card">
          <table>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>Total Requests</td>
              <td>{{formatNumber manifest.metrics.total_requests}}</td>
            </tr>
            <tr>
              <td>Successful</td>
              <td style="color: #22c55e;">{{formatNumber manifest.metrics.successful_requests}}</td>
            </tr>
            <tr>
              <td>Failed</td>
              <td style="color: {{#if manifest.metrics.failed_requests}}#ef4444{{else}}inherit{{/if}};">{{formatNumber manifest.metrics.failed_requests}}</td>
            </tr>
            <tr>
              <td>Average Latency</td>
              <td>{{formatDecimal manifest.metrics.avg_latency_ms}}ms</td>
            </tr>
          </table>
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
          <p><strong>Platform:</strong> {{manifest.environment.platform}} ({{manifest.environment.arch}})</p>
        </div>
      </div>
    </div>

    <footer>
      Generated by Artemis Agent Reliability Toolkit - Stress Test Module
    </footer>
  </div>

  <script>
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
  </script>
</body>
</html>
`;

export function generateStressHTMLReport(manifest: StressManifest): string {
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

  Handlebars.registerHelper('formatNumber', (value: number) => {
    return value.toLocaleString();
  });

  Handlebars.registerHelper('formatDecimal', (value: number) => {
    return value.toFixed(2);
  });

  Handlebars.registerHelper('formatDuration', (ms: number) => {
    return (ms / 1000).toFixed(1);
  });

  Handlebars.registerHelper('successRateClass', (value: number) => {
    if (value >= 0.99) return 'high';
    if (value >= 0.95) return 'medium';
    return 'low';
  });

  Handlebars.registerHelper('join', (arr: string[], separator: string) => {
    return arr?.join(separator) || '';
  });

  const template = Handlebars.compile(HTML_TEMPLATE);
  return template({ manifest });
}
