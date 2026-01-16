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
- Latency percentiles (p50, p95, p99)
- Success/error rates
- Concurrent request metrics

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
