# Offline workflow assessment reports

Milestone 0.6.4 turns saved workflow evidence into a deterministic assessment. Publication and
qualification status are recorded in the [release plan](releases/0.6.x-release-plan.md). Reports
have technical, executive and comprehensive views, exported as self-contained HTML or Markdown.
The comprehensive view is the default.

## CLI

Save a workflow's ordinary record with `akit workflow run ... --output evidence.json`, then generate
a report without provider credentials, configuration, Docker or a model call:

```sh
akit workflow report evidence.json --output assessment.html
akit workflow report evidence.json --view executive --format markdown --output executive.md
akit workflow report first.json second.json --view technical --output technical.html
```

Each input file contains one saved V1, V2 or V3 workflow record. Input files must be regular files,
not symbolic links. At most 50 files, 1 MiB per file and 8 MiB in total are accepted. Output must be a
new file; existing inputs/reports are never overwritten. New output uses mode 0600. Without
`--output`, only the report is written to stdout, making shell pipelines possible.

Exit `0` means the report was generated successfully, including reports documenting failed tasks.
It does not mean the assessed system passed. Invalid/unsupported/conflicting evidence exits `2`;
input-file and output errors exit `1`. The command does not discover or load provider configuration.
Legacy prompt-response manifests continue to use `akit report`; private checkpoints, state exports,
transcripts and unknown future workflow schemas are rejected here.

## SDK and report package

The SDK and `@artemiskit/reports` expose the same synchronous functions. Inputs are a saved record
object or JSON string, or an array of those records:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import {
  createWorkflowReport,
  generateWorkflowReport,
  renderWorkflowReportHTML,
  renderWorkflowReportMarkdown,
} from '@artemiskit/sdk';

const saved = await readFile('./evidence.json', 'utf8');
const assessment = createWorkflowReport(saved);
const html = renderWorkflowReportHTML(assessment, { view: 'comprehensive' });
const markdown = renderWorkflowReportMarkdown(assessment, { view: 'executive' });
await writeFile('./assessment.html', html, { flag: 'wx', mode: 0o600 });
await writeFile('./executive.md', markdown, { flag: 'wx', mode: 0o600 });

// Convenience function performs the same validation, projection and rendering.
const technical = generateWorkflowReport(saved, { view: 'technical', format: 'markdown' });
console.log(assessment.summary, technical);
```

`new ArtemisKit().createWorkflowReport(saved)` and `.generateWorkflowReport(saved, options)` provide
the same behavior. No provider or storage configuration is needed. Public types are available from
`@artemiskit/sdk/types`; the report model's `schemaVersion` is independent of the saved-record version.
Rendering a manually constructed report model is a presentation API, not a new verification of the
underlying assessment. Use `createWorkflowReport` or `generateWorkflowReport` for untrusted saved records.

## What the assessment says

All views share the same facts, denominators, evidence and limits. The executive view emphasizes
findings and next actions. Technical and comprehensive views add detailed outcome, configuration,
assertion, usage, cleanup and recovery tables. Stable finding-to-evidence links resolve to a technical
appendix containing record digests, JSON pointers and evidence digests.

A normally completed conversation is distinct from a verified task pass. Passed and failed eligible
tasks make up the success denominator; invalid and unavailable evaluations are shown separately.
Historical V1 records remain unscored and preflight-only records are not task successes. Empty
eligible coverage produces an unavailable rate, never 100% or an invented zero measurement.

Identical records are counted once. Compatible V3 pause/resume attempts belong to one logical run;
selected final cumulative usage and budgets are not added to earlier cumulative snapshots. Earlier
attempts remain evidence. Conflicting records refuse aggregation. Records without a durable run
identity cannot establish independent statistical repetitions. These reports do not rank models or
establish cross-configuration comparison eligibility.

Target and judge usage remain separate. Preflight target tokens are identified as a subset, not an
extra charge. Partial/missing usage, unknown in-flight work, transport-attempt attribution, omitted
artifacts/events, unresolved cleanup and checkpoint limits remain visible. Cost is unavailable when
saved evidence does not attest pricing; no price or financial cap is inferred from token counts.

## Privacy, provenance and limits

Saved records are read through the strict workflow reader. Reports project known statuses, bounded
counts and digests; they do not rescore, restore environments, read private files, or accept model
prose as evidence. Free-form identity labels are omitted in favor of hashes because a saved display
label cannot be proven nonsensitive. Raw model text, file contents, checkpoint paths and operational
identifiers are not report content. HTML and Markdown escape untrusted text and use local evidence
anchors without external assets, scripts or model-generated narrative.

The record may omit scenario names, full workload definitions, policy declarations, exact harness
version, pricing or wider coverage. The report states those limits instead of substituting the
current installed package's metadata or inventing a human-readable scenario. Findings are limited to
the retained assertion criteria and observed execution. A valid record is a host-provided statement,
not a cryptographic attestation that an external system behaved as claimed.

The same supplied evidence regenerates the same report without a timestamp or network access.
Determinism does not prove reproducible model behavior, resistance to prompt injection, production
readiness or compliance certification. Private checkpoint retention and external-system recovery
limits remain in the [recovery guide](workflow-recovery.md). Comparative orchestration, assisted
narrative, public leaderboards and Loki/SaaS integration are later, separately scoped work.
