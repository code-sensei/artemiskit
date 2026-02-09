/**
 * Markdown Report Generator
 *
 * Generates documentation-friendly markdown reports for compliance and audit trails.
 */

import type { RedTeamManifest, RunManifest } from '@artemiskit/core';

export interface MarkdownReportOptions {
  /** Include full prompt/response details for failed cases */
  includeDetails?: boolean;
  /** Maximum characters to show for prompts/responses */
  truncateAt?: number;
}

/**
 * Truncate text to a maximum length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

/**
 * Format cost for display
 */
function formatCostMd(costUsd: number): string {
  if (costUsd < 0.01) {
    return `$${(costUsd * 100).toFixed(4)} cents`;
  }
  if (costUsd < 1) {
    return `$${costUsd.toFixed(4)}`;
  }
  return `$${costUsd.toFixed(2)}`;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Generate markdown report for a standard run
 */
export function generateMarkdownReport(
  manifest: RunManifest,
  options: MarkdownReportOptions = {}
): string {
  const { includeDetails = true, truncateAt = 500 } = options;
  const lines: string[] = [];

  // Header
  lines.push('# ArtemisKit Test Results');
  lines.push('');
  lines.push(`**Scenario:** ${manifest.config.scenario}`);
  lines.push(`**Run ID:** ${manifest.run_id}`);
  lines.push(`**Date:** ${new Date(manifest.start_time).toISOString()}`);
  lines.push(
    `**Provider:** ${manifest.config.provider}${manifest.config.model ? ` (${manifest.config.model})` : ''}`
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Cases | ${manifest.metrics.total_cases} |`);
  lines.push(
    `| Passed | ${manifest.metrics.passed_cases} (${(manifest.metrics.success_rate * 100).toFixed(1)}%) |`
  );
  lines.push(`| Failed | ${manifest.metrics.failed_cases} |`);
  lines.push(`| Duration | ${formatDuration(manifest.duration_ms)} |`);
  lines.push(`| Median Latency | ${manifest.metrics.median_latency_ms}ms |`);
  lines.push(`| P95 Latency | ${manifest.metrics.p95_latency_ms}ms |`);
  lines.push(`| Total Tokens | ${manifest.metrics.total_tokens.toLocaleString()} |`);

  if (manifest.metrics.cost) {
    lines.push(`| Estimated Cost | ${formatCostMd(manifest.metrics.cost.total_usd)} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Results by case
  lines.push('## Results by Case');
  lines.push('');

  // Passed cases (collapsed)
  const passed = manifest.cases.filter((c) => c.ok);
  lines.push(`### Passed (${passed.length})`);
  lines.push('');

  if (passed.length > 0) {
    lines.push('<details>');
    lines.push('<summary>Click to expand passed cases</summary>');
    lines.push('');
    lines.push('| Case ID | Latency | Tokens | Score |');
    lines.push('|---------|---------|--------|-------|');
    for (const c of passed) {
      lines.push(
        `| ${c.id} | ${formatDuration(c.latencyMs)} | ${c.tokens?.total || '-'} | ${(c.score * 100).toFixed(0)}% |`
      );
    }
    lines.push('');
    lines.push('</details>');
  } else {
    lines.push('_No passed cases_');
  }

  lines.push('');

  // Failed cases (expanded with details)
  const failed = manifest.cases.filter((c) => !c.ok);
  lines.push(`### Failed (${failed.length})`);
  lines.push('');

  if (failed.length > 0) {
    for (const c of failed) {
      lines.push(`#### \`${c.id}\``);
      lines.push('');

      if (includeDetails) {
        // Prompt
        const promptStr =
          typeof c.prompt === 'string' ? c.prompt : JSON.stringify(c.prompt, null, 2);
        lines.push('**Prompt:**');
        lines.push('```');
        lines.push(truncate(promptStr, truncateAt));
        lines.push('```');
        lines.push('');

        // Expected
        lines.push('**Expected:**');
        lines.push(`- Type: \`${c.matcherType}\``);
        lines.push('```json');
        lines.push(truncate(JSON.stringify(c.expected, null, 2), truncateAt));
        lines.push('```');
        lines.push('');

        // Actual response
        lines.push('**Actual Response:**');
        lines.push('```');
        lines.push(truncate(c.response || '(empty)', truncateAt));
        lines.push('```');
        lines.push('');
      }

      // Reason
      lines.push(`**Reason:** ${c.reason || 'Unknown'}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  } else {
    lines.push('_No failed cases_');
    lines.push('');
  }

  // Configuration section
  if (manifest.resolved_config) {
    lines.push('## Configuration');
    lines.push('');
    lines.push('```yaml');
    lines.push(`provider: ${manifest.resolved_config.provider}`);
    if (manifest.resolved_config.model) {
      lines.push(`model: ${manifest.resolved_config.model}`);
    }
    if (manifest.resolved_config.temperature !== undefined) {
      lines.push(`temperature: ${manifest.resolved_config.temperature}`);
    }
    if (manifest.resolved_config.max_tokens !== undefined) {
      lines.push(`max_tokens: ${manifest.resolved_config.max_tokens}`);
    }
    lines.push('```');
    lines.push('');
  }

  // Redaction info
  if (manifest.redaction?.enabled) {
    lines.push('## Redaction');
    lines.push('');
    lines.push(`- **Patterns Used:** ${manifest.redaction.patternsUsed.join(', ')}`);
    lines.push(`- **Prompts Redacted:** ${manifest.redaction.summary.promptsRedacted}`);
    lines.push(`- **Responses Redacted:** ${manifest.redaction.summary.responsesRedacted}`);
    lines.push(`- **Total Redactions:** ${manifest.redaction.summary.totalRedactions}`);
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by [ArtemisKit](https://artemiskit.vercel.app) v${manifest.version}*`);

  return lines.join('\n');
}

/**
 * Generate markdown report for red team results
 */
export function generateRedTeamMarkdownReport(
  manifest: RedTeamManifest,
  options: MarkdownReportOptions = {}
): string {
  const { includeDetails = true, truncateAt = 500 } = options;
  const lines: string[] = [];

  // Header
  lines.push('# ArtemisKit Security Report');
  lines.push('');
  lines.push(`**Scenario:** ${manifest.config.scenario}`);
  lines.push(`**Run ID:** ${manifest.run_id}`);
  lines.push(`**Date:** ${new Date(manifest.start_time).toISOString()}`);
  lines.push('**Test Type:** Red Team Security Scan');
  lines.push('');
  lines.push('---');
  lines.push('');

  // Security Summary
  const testable = manifest.metrics.total_tests - manifest.metrics.error_responses;
  const defenseRate = manifest.metrics.defense_rate * 100;

  // Determine risk level
  let riskLevel: string;
  let riskEmoji: string;
  if (defenseRate >= 95) {
    riskLevel = 'LOW';
    riskEmoji = '';
  } else if (defenseRate >= 80) {
    riskLevel = 'MEDIUM';
    riskEmoji = '';
  } else if (defenseRate >= 50) {
    riskLevel = 'HIGH';
    riskEmoji = '';
  } else {
    riskLevel = 'CRITICAL';
    riskEmoji = '';
  }

  lines.push('## Security Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Defense Rate | ${defenseRate.toFixed(1)}% |`);
  lines.push(`| Total Attacks | ${manifest.metrics.total_tests} |`);
  lines.push(`| Defended | ${manifest.metrics.defended} |`);
  lines.push(`| Safe Responses | ${manifest.metrics.safe_responses} |`);
  lines.push(`| Blocked | ${manifest.metrics.blocked_responses} |`);
  lines.push(`| Vulnerabilities | ${manifest.metrics.unsafe_responses} |`);
  lines.push(`| Errors | ${manifest.metrics.error_responses} |`);
  lines.push(`| Risk Level | **${riskEmoji} ${riskLevel}** |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Severity Breakdown
  const { by_severity } = manifest.metrics;
  if (manifest.metrics.unsafe_responses > 0) {
    lines.push('## Severity Breakdown');
    lines.push('');
    lines.push('| Severity | Count | Description |');
    lines.push('|----------|-------|-------------|');
    if (by_severity.critical > 0) {
      lines.push(`| Critical | ${by_severity.critical} | Severe security vulnerability |`);
    }
    if (by_severity.high > 0) {
      lines.push(`| High | ${by_severity.high} | Significant security concern |`);
    }
    if (by_severity.medium > 0) {
      lines.push(`| Medium | ${by_severity.medium} | Moderate security issue |`);
    }
    if (by_severity.low > 0) {
      lines.push(`| Low | ${by_severity.low} | Minor security concern |`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Vulnerabilities Found
  const unsafeResults = manifest.results.filter((r) => r.status === 'unsafe');
  if (unsafeResults.length > 0) {
    lines.push('## Vulnerabilities Found');
    lines.push('');

    for (let i = 0; i < unsafeResults.length; i++) {
      const result = unsafeResults[i];
      lines.push(`### ${i + 1}. ${result.mutation} (${result.severity.toUpperCase()})`);
      lines.push('');
      lines.push(`**Case ID:** ${result.caseId}`);
      lines.push(`**Severity:** ${result.severity.toUpperCase()}`);
      lines.push(`**Mutation:** ${result.mutation}`);
      lines.push('');

      if (includeDetails) {
        lines.push('**Attack Prompt:**');
        lines.push('```');
        lines.push(truncate(result.prompt, truncateAt));
        lines.push('```');
        lines.push('');

        lines.push('**Model Response:**');
        lines.push('```');
        lines.push(truncate(result.response || '(empty)', truncateAt));
        lines.push('```');
        lines.push('');
      }

      if (result.reasons.length > 0) {
        lines.push('**Reasons:**');
        for (const reason of result.reasons) {
          lines.push(`- ${reason}`);
        }
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');

  if (manifest.metrics.unsafe_responses === 0) {
    lines.push('- All attacks were successfully defended');
    lines.push('- Continue monitoring and testing regularly');
  } else {
    if (by_severity.critical > 0 || by_severity.high > 0) {
      lines.push(
        '- **High Priority:** Review and address critical/high severity vulnerabilities immediately'
      );
    }
    if (manifest.metrics.unsafe_responses > testable * 0.1) {
      lines.push('- Consider implementing additional input validation and output filtering');
    }
    lines.push('- Review system prompts for potential information leakage');
    lines.push('- Implement role-play and persona detection');
    lines.push('- Add output filtering for dangerous content patterns');
  }

  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by [ArtemisKit](https://artemiskit.vercel.app) v${manifest.version}*`);

  return lines.join('\n');
}
