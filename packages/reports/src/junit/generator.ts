/**
 * JUnit XML Report Generator
 *
 * Generates JUnit-compatible XML reports for CI/CD integration.
 * Follows the JUnit XML format specification for compatibility with
 * Jenkins, GitHub Actions, GitLab CI, and other CI systems.
 */

import type { RedTeamManifest, RunManifest } from '@artemiskit/core';

export interface JUnitReportOptions {
  /** Test suite name (defaults to scenario name) */
  suiteName?: string;
  /** Include system-out with response content */
  includeSystemOut?: boolean;
  /** Include system-err with error details */
  includeSystemErr?: boolean;
  /** Maximum content length for outputs */
  maxOutputLength?: number;
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  // Remove invalid XML control characters (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F)
  // These are not allowed in XML 1.0 and would cause parsing errors
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required to strip invalid XML chars
  const invalidXmlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(invalidXmlChars, '');
}

/**
 * Truncate text to maximum length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...(truncated)`;
}

/**
 * Format timestamp as ISO 8601
 */
function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toISOString();
}

/**
 * Generate JUnit XML report for a standard run
 */
export function generateJUnitReport(
  manifest: RunManifest,
  options: JUnitReportOptions = {}
): string {
  const {
    suiteName = manifest.config.scenario,
    includeSystemOut = true,
    includeSystemErr = true,
    maxOutputLength = 2000,
  } = options;

  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // Calculate totals
  const tests = manifest.metrics.total_cases;
  const failures = manifest.metrics.failed_cases;
  const errors = 0; // We treat all failures as failures, not errors
  const skipped = 0;
  const time = manifest.duration_ms / 1000; // JUnit uses seconds

  // Root testsuite element
  lines.push(
    `<testsuite name="${escapeXml(suiteName)}" ` +
      `tests="${tests}" failures="${failures}" errors="${errors}" skipped="${skipped}" ` +
      `time="${time.toFixed(3)}" timestamp="${formatTimestamp(manifest.start_time)}">`
  );

  // Properties
  lines.push('  <properties>');
  lines.push(`    <property name="artemis.run_id" value="${escapeXml(manifest.run_id)}" />`);
  lines.push(`    <property name="artemis.version" value="${escapeXml(manifest.version)}" />`);
  lines.push(
    `    <property name="artemis.provider" value="${escapeXml(manifest.config.provider)}" />`
  );
  if (manifest.config.model) {
    lines.push(`    <property name="artemis.model" value="${escapeXml(manifest.config.model)}" />`);
  }
  lines.push(
    `    <property name="artemis.success_rate" value="${(manifest.metrics.success_rate * 100).toFixed(1)}%" />`
  );
  lines.push(
    `    <property name="artemis.total_tokens" value="${manifest.metrics.total_tokens}" />`
  );
  if (manifest.metrics.cost) {
    lines.push(
      `    <property name="artemis.cost_usd" value="${manifest.metrics.cost.total_usd.toFixed(6)}" />`
    );
  }
  lines.push('  </properties>');

  // Test cases
  for (const testCase of manifest.cases) {
    const className = escapeXml(suiteName);
    const testName = escapeXml(testCase.id);
    const testTime = testCase.latencyMs / 1000;

    lines.push(
      `  <testcase classname="${className}" name="${testName}" time="${testTime.toFixed(3)}">`
    );

    if (!testCase.ok) {
      // Failed test
      const failureMessage = escapeXml(testCase.reason || 'Test failed');
      const failureType = escapeXml(testCase.matcherType);

      lines.push(`    <failure message="${failureMessage}" type="${failureType}">`);

      // Include details in failure content
      const details: string[] = [];
      details.push(`Matcher Type: ${testCase.matcherType}`);
      details.push(`Expected: ${JSON.stringify(testCase.expected, null, 2)}`);
      details.push(`Score: ${(testCase.score * 100).toFixed(1)}%`);
      if (testCase.reason) {
        details.push(`Reason: ${testCase.reason}`);
      }

      lines.push(escapeXml(details.join('\n')));
      lines.push('    </failure>');
    }

    // System out (response)
    if (includeSystemOut && testCase.response) {
      lines.push('    <system-out>');
      lines.push(`<![CDATA[${truncate(testCase.response, maxOutputLength)}]]>`);
      lines.push('    </system-out>');
    }

    // System err (error details for failed tests)
    if (includeSystemErr && !testCase.ok && testCase.reason) {
      lines.push('    <system-err>');
      const errorDetails: string[] = [];
      errorDetails.push(`Error: ${testCase.reason}`);
      const promptStr =
        typeof testCase.prompt === 'string' ? testCase.prompt : JSON.stringify(testCase.prompt);
      errorDetails.push(`Prompt: ${truncate(promptStr, maxOutputLength / 2)}`);
      lines.push(`<![CDATA[${errorDetails.join('\n')}]]>`);
      lines.push('    </system-err>');
    }

    lines.push('  </testcase>');
  }

  // Close testsuite
  lines.push('</testsuite>');

  return lines.join('\n');
}

/**
 * Generate JUnit XML report for red team results
 */
export function generateRedTeamJUnitReport(
  manifest: RedTeamManifest,
  options: JUnitReportOptions = {}
): string {
  const {
    suiteName = `RedTeam: ${manifest.config.scenario}`,
    includeSystemOut = true,
    includeSystemErr = true,
    maxOutputLength = 2000,
  } = options;

  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // Calculate totals - unsafe responses are failures
  const tests = manifest.metrics.total_tests;
  const failures = manifest.metrics.unsafe_responses;
  const errors = manifest.metrics.error_responses;
  const skipped = 0;
  const time = manifest.duration_ms / 1000;

  // Root testsuite element
  lines.push(
    `<testsuite name="${escapeXml(suiteName)}" ` +
      `tests="${tests}" failures="${failures}" errors="${errors}" skipped="${skipped}" ` +
      `time="${time.toFixed(3)}" timestamp="${formatTimestamp(manifest.start_time)}">`
  );

  // Properties
  lines.push('  <properties>');
  lines.push(`    <property name="artemis.run_id" value="${escapeXml(manifest.run_id)}" />`);
  lines.push(`    <property name="artemis.version" value="${escapeXml(manifest.version)}" />`);
  lines.push(`    <property name="artemis.test_type" value="redteam" />`);
  lines.push(
    `    <property name="artemis.defense_rate" value="${(manifest.metrics.defense_rate * 100).toFixed(1)}%" />`
  );
  lines.push(
    `    <property name="artemis.safe_responses" value="${manifest.metrics.safe_responses}" />`
  );
  lines.push(
    `    <property name="artemis.blocked_responses" value="${manifest.metrics.blocked_responses}" />`
  );
  lines.push(
    `    <property name="artemis.unsafe_responses" value="${manifest.metrics.unsafe_responses}" />`
  );
  lines.push('  </properties>');

  // Test cases
  for (const result of manifest.results) {
    const className = escapeXml(suiteName);
    const testName = escapeXml(`${result.caseId} (${result.mutation})`);
    const testTime = (result.latencyMs || 0) / 1000;

    lines.push(
      `  <testcase classname="${className}" name="${testName}" time="${testTime.toFixed(3)}">`
    );

    if (result.status === 'unsafe') {
      // Security vulnerability found - this is a failure
      const failureMessage = escapeXml(`Security vulnerability: ${result.mutation}`);
      const failureType = escapeXml(`severity:${result.severity}`);

      lines.push(`    <failure message="${failureMessage}" type="${failureType}">`);

      const details: string[] = [];
      details.push(`Severity: ${result.severity.toUpperCase()}`);
      details.push(`Mutation: ${result.mutation}`);
      if (result.reasons.length > 0) {
        details.push(`Reasons: ${result.reasons.join(', ')}`);
      }

      lines.push(escapeXml(details.join('\n')));
      lines.push('    </failure>');
    } else if (result.status === 'error') {
      // Error during test
      lines.push(
        `    <error message="${escapeXml(result.response || 'Error during test')}" type="error">`
      );
      lines.push(escapeXml(`Attack: ${result.mutation}\nCase: ${result.caseId}`));
      lines.push('    </error>');
    }

    // System out (response)
    if (includeSystemOut && result.response) {
      lines.push('    <system-out>');
      lines.push(`<![CDATA[${truncate(result.response, maxOutputLength)}]]>`);
      lines.push('    </system-out>');
    }

    // System err (attack prompt for reference)
    if (includeSystemErr && result.status === 'unsafe') {
      lines.push('    <system-err>');
      const errDetails: string[] = [];
      errDetails.push(`Attack Prompt: ${truncate(result.prompt, maxOutputLength / 2)}`);
      errDetails.push(`Severity: ${result.severity.toUpperCase()}`);
      lines.push(`<![CDATA[${errDetails.join('\n')}]]>`);
      lines.push('    </system-err>');
    }

    lines.push('  </testcase>');
  }

  // Close testsuite
  lines.push('</testsuite>');

  return lines.join('\n');
}

/**
 * Generate JUnit XML for validation results
 */
export function generateValidationJUnitReport(
  results: Array<{
    file: string;
    valid: boolean;
    errors: Array<{ line: number; message: string; rule: string }>;
    warnings: Array<{ line: number; message: string; rule: string }>;
  }>,
  options: JUnitReportOptions = {}
): string {
  const { suiteName = 'ArtemisKit Validation' } = options;

  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // Calculate totals
  const tests = results.length;
  const failures = results.filter((r) => !r.valid).length;
  const errors = 0;
  const skipped = 0;

  // Root testsuite element
  lines.push(
    `<testsuite name="${escapeXml(suiteName)}" ` +
      `tests="${tests}" failures="${failures}" errors="${errors}" skipped="${skipped}" ` +
      `time="0" timestamp="${new Date().toISOString()}">`
  );

  // Test cases
  for (const result of results) {
    const className = escapeXml(suiteName);
    const testName = escapeXml(result.file);

    lines.push(`  <testcase classname="${className}" name="${testName}" time="0">`);

    if (!result.valid) {
      const errorMessages = result.errors.map((e) => `Line ${e.line}: ${e.message}`).join('; ');
      lines.push(`    <failure message="${escapeXml(errorMessages)}" type="validation">`);

      const details: string[] = [];
      for (const error of result.errors) {
        details.push(`[${error.rule}] Line ${error.line}: ${error.message}`);
      }
      lines.push(escapeXml(details.join('\n')));
      lines.push('    </failure>');
    }

    // Warnings as system-err
    if (result.warnings.length > 0) {
      lines.push('    <system-err>');
      const warningDetails = result.warnings
        .map((w) => `[${w.rule}] Line ${w.line}: ${w.message}`)
        .join('\n');
      lines.push(`<![CDATA[Warnings:\n${warningDetails}]]>`);
      lines.push('    </system-err>');
    }

    lines.push('  </testcase>');
  }

  // Close testsuite
  lines.push('</testsuite>');

  return lines.join('\n');
}
