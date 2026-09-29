# @artemiskit/reports

HTML report generation for ArtemisKit LLM evaluation toolkit.

## Installation

```bash
npm install @artemiskit/reports
# or
bun add @artemiskit/reports
```

## Overview

This package generates interactive HTML reports from ArtemisKit test runs:

- **Run Reports** - Scenario evaluation results with pass/fail status
- **Red Team Reports** - Security test results with vulnerability scoring
- **Stress Test Reports** - Load test metrics with latency percentiles

## Usage

Most users should use the [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) which automatically generates reports. This package is for programmatic report generation.

```typescript
import { generateHTMLReport } from '@artemiskit/reports';
import type { RunManifest } from '@artemiskit/core';

// Generate report from a manifest
const manifest: RunManifest = { /* ... */ };
const html = await generateHTMLReport(manifest);

// Write to file
await writeFile('report.html', html);
```

## Workflow assessments

Milestone 0.6.4 adds offline HTML and Markdown assessments from saved workflow records. Legacy
prompt-response report functions keep their existing contract.

```ts
import {
  createWorkflowReport, generateWorkflowReport,
  renderWorkflowReportHTML, renderWorkflowReportMarkdown,
} from '@artemiskit/reports';

const model = createWorkflowReport(savedRecords);
const html = renderWorkflowReportHTML(model, { view: 'technical' });
const markdown = renderWorkflowReportMarkdown(model, { view: 'executive' });
const complete = generateWorkflowReport(savedRecords); // comprehensive HTML by default
```

Inputs are saved V1/V2/V3 records or JSON strings, singly or as an array (maximum 50 records / 8 MiB).
Malformed, private and unsupported evidence is refused. The canonical model includes scope,
methodology, valid/invalid coverage, findings/actions, target/judge usage, recovery limits and stable
JSON-pointer/digest references. All views disclose uncertainty. Digests identify evidence; they
are not authenticity signatures or certification. See the [guide](../../docs/workflow-reports.md).

## Report Types

### Run Reports

Generated from scenario evaluation results:

```typescript
import { generateHTMLReport } from '@artemiskit/reports';

const html = await generateHTMLReport(runManifest);
```

Features:
- Pass/fail status for each test case
- Latency metrics
- Token usage
- Redaction indicators (when enabled)
- Expandable prompt/response details

### Red Team Reports

Generated from security test results:

```typescript
import { generateRedTeamHTMLReport } from '@artemiskit/reports';

const html = await generateRedTeamHTMLReport(redteamManifest);
```

Features:
- Vulnerability categories (injection, jailbreak, extraction, etc.)
- Severity ratings
- Defense success rate
- Attack mutation details

### Stress Test Reports

Generated from load test results:

```typescript
import { generateStressHTMLReport } from '@artemiskit/reports';

const html = await generateStressHTMLReport(stressManifest);
```

Features:
- Requests per second
- Latency percentiles (p50, p90, p95, p99)
- Success/error rates
- Concurrent request metrics
- Token usage tracking
- Cost estimation

### Run Comparison Reports

Generate visual diffs between two runs:

```typescript
import { generateComparisonHTMLReport } from '@artemiskit/reports';

const html = await generateComparisonHTMLReport(baselineManifest, currentManifest);
```

Features:
- Metrics overview with baseline vs current
- Change summary (regressions, improvements, unchanged)
- Case-by-case comparison with filtering
- Side-by-side response comparison

## Export Formats

Beyond HTML, ArtemisKit supports additional export formats:

- **JUnit XML** - CI/CD integration with Jenkins, GitHub Actions, GitLab CI
- **Markdown** - Compliance-ready documentation

```bash
# JUnit XML export
akit run scenarios/ --export junit

# Markdown export
akit run scenarios/ --export markdown
```

## Regenerating Reports

Reports can be regenerated from saved manifests:

```bash
artemiskit report artemis-runs/my-project/abc123.json
```

## Related Packages

- [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) - Command-line interface
- [`@artemiskit/core`](https://www.npmjs.com/package/@artemiskit/core) - Core runtime and evaluators
- [`@artemiskit/redteam`](https://www.npmjs.com/package/@artemiskit/redteam) - Security testing

## License

Apache-2.0
