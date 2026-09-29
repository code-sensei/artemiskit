# Independent workflow outcomes

Status: 0.6.2 is published and verified on npm and GitHub. The
[release plan](releases/0.6.x-release-plan.md) records the sequential publication status and exact
package maps.

## Execution and task success

A completed conversation is a runtime result. Independent checks determine whether the declared
outcomes actually hold. A confident final answer cannot replace an artifact, a state transition,
a successful tool call or host policy evidence. The native engine captures the final environment
snapshot before disposal, checks deterministic requirements, and only then considers semantic judging.
CLI and SDK use this same assessment path.

The result keeps separate fields for execution, policy, target usage, cleanup and task verification.
A policy violation, incomplete execution, unknown target usage or unresolved cleanup cannot become a
verified task pass. Preflight tests tool protocol only and never counts as an assessed task.

## Deterministic requirements

Existing workflow declarations keep their meaning:

- `workflow_state` compares an exact value at a safe dotted path inside `state.workflow_state`.
  Missing values differ from explicit `null` or `false`; object key order does not change equality.
- `file` checks existence and optional exact content in the verified final snapshot. It does not read
  host files or trust the model's claim that it wrote something.
- `tool_trace` counts successfully completed execution tool calls with correlated host evidence.
  Requested, denied, failed and preflight calls do not count. Truncated or inconsistent traces cannot
  establish exact counts or the absence of calls.
- `policy` checks the declared restriction against native host evidence. Reported token budgets are
  not absolute financial limits and hidden custom-client retries are not measured transport attempts.
- `json_schema` checks a selected state value or parsed JSON file against the supported bounded schema
  subset. Unsupported schema features are rejected during offline scenario validation.

For example, a pending human handoff is explicitly different from approval granted:

```yaml
outcomes:
  deterministic:
    - type: workflow_state
      path: approvals.status
      equals: pending
    - type: tool_trace
      tool: request_approval
      minimum_calls: 1
      maximum_calls: 1
    - type: file
      path: output/handoff.txt
      exists: true
      equals: Human review required.
```

Deterministic evaluation makes no new model calls. It never creates missing artifacts or repairs
invalid state to make an assertion pass.

## Semantic requirements

Use a semantic rubric only for a declared qualitative dimension that cannot be checked directly.
The workflow declares the rubric; trusted caller configuration explicitly selects a separate judge
and its request, reported-token, output-token and elapsed-time limits. There is no implicit reuse of
the target provider, model or budget. If required semantic judging is unconfigured or unavailable,
the task cannot pass merely because the deterministic checks passed.

The judge sees sensitive workflow evidence. Supplying the judge configuration authorizes that data
to reach its provider within the declared bounds. Evidence is size-bounded; excessive input is marked
unavailable instead of silently truncated. Default saved records contain bounded metadata, criterion
hashes, identities, usage and closed reason codes, not the prompt, rubric, response or rationale.

A judge must return exactly a JSON object with `verdict` equal to `pass` or `fail`. Prose, Markdown
fences, additional keys and tool calls do not qualify. JSON output mode is requested when the adapter
advertises it; strict response validation applies either way. Delimiters and strict parsing reduce
ambiguity but do not prove immunity to prompt injection. Independent deterministic and policy gates
remain authoritative.

A known deterministic failure ends the assessment without judge calls. Semantic requirements then
remain explicitly unassessed; they are never recorded as passes. Target and judge usage, identity,
budgets and cancellation are accounted for separately. Missing usage is unavailable, not zero cost.
An explicitly reported zero is different. A provider can overshoot the reported-token allowance in a
single response; the result discloses that overshoot and stops further admission.

## Validity and denominators

Every assertion is passed, failed, invalid or unavailable. A valid negative result is a failed
assertion; malformed evidence or a malformed judge response is an invalid assessment. Missing
measurement or unavailable evidence is not a valid negative result.

Assertion counts expose declared, passed, failed, invalid, unavailable and valid totals, where
`valid = passed + failed`. Task-level counts separately expose eligible, passed and failed. Their
denominator is eligible runs, not the number of assertions or model responses. An empty denominator
is unavailable, not a 0% or 100% success rate.

A known required failure proves that the conjunction of requirements failed, even when remaining
semantic checks are skipped. Coverage still shows those unassessed requirements. Incomplete runtime,
policy violations and unknown target measurement are excluded from task-success rates. Without
an independently established required failure, invalid or unavailable evaluation is also excluded.
An earlier valid semantic failure still establishes task failure when later judging becomes
unavailable; coverage and partial judge usage retain that incompleteness. All states remain visible. Do not omit them from an assessment summary.

## Saved evidence and historical compatibility

Default outcome-bearing execution records use version 2. Opting into fault/retry declarations or
private checkpointing uses version 3 with bounded recovery evidence. Version 1 records remain historical execution
records with task verification unavailable; reading an old record never invents outcomes or calls a
judge. Unknown future versions and inconsistent result/count summaries must be rejected.

A bounded saved record usually lacks the sensitive snapshot and transcript needed for reevaluation.
Reading a record is different from explicitly evaluating a workflow with trusted working evidence.
Configuration and snapshot hashes detect mismatches but are not signatures or proof against a
malicious host. Custom targets, environments and judge clients remain trusted extensions.

Historical prompt-response manifests and report readers retain their existing contract. These
workflow records must not be presented to legacy report generators as scored prompt scenarios.
The [0.6.4 report guide](workflow-reports.md) covers offline views and denominators.
See [faults and durable recovery](workflow-recovery.md)
for the 0.6.3 contract, CLI/SDK interfaces and qualification boundary.

## Bounded JSON schemas

Use `source: workflow_state` with a dotted path, or `source: file` with a safe relative file path:

```yaml
- type: json_schema
  source: file
  path: output/result.json
  schema:
    type: object
    properties:
      status: { type: string, enum: [pending] }
      count: { type: integer, minimum: 1 }
    required: [status, count]
    additionalProperties: false
```

Every schema node declares a single type: object, array, string, number, integer, boolean or null.
Supported keywords are `properties`, `required`, boolean `additionalProperties`, `items`, `enum`,
`const`, and the applicable numeric, string-length and collection-size bounds. Schemas are limited
to 16 KiB, depth 8 and 256 nodes; properties/enums to 100 entries, collection bounds to 1,000 and
string bounds to 16,384. References, regex patterns, formats, combinators and remote schemas are
unsupported. There is no coercion, default insertion or removal of properties. JSON files with
malformed syntax or duplicate keys fail independently of model text.

## CLI usage

Deterministic assertions run automatically with no judge configuration:

```sh
akit scenario validate workflow.yaml
akit workflow run workflow.yaml --config artemis.config.yaml --output outcome.json --json
```

For workflows declaring semantic criteria, explicitly supply a separate trusted configuration:

```yaml
# judge.config.yaml — transport credentials belong here, never in workflow YAML.
provider: openai
model: your-reviewed-judge-model
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
workflowJudge:
  maxRequests: 2
  maxTokens: 4096
  maxOutputTokens: 64
  timeoutMs: 10000
```

```sh
akit workflow run workflow.yaml --config artemis.config.yaml \
  --judge-config judge.config.yaml --output outcome.json --json
```

All four judge limits are required. Maximums are 20 requests, 1,000,000 reported tokens, 100,000
output tokens per request and 60,000 ms for evaluation. The judge is initialized lazily after the
deterministic and runtime gates pass. Configuration structure, provider identity and limits are checked without a model call;
credential validity and provider access are established only by the actual provider interaction.
provider initialization and inference failures remain explicit evaluation failures or unavailability.
An explicit judge file never silently falls back to the target configuration.

For normal workflow runs, exit `0` means verified task success, `8` a valid task failure, and `9`
invalid or unavailable outcome evaluation. Existing runtime/policy exits retain precedence: `1`
unreadable configuration/persistence, `2` invalid execution or judge configuration, `3` unsupported target/judge provider, `4` policy denial, `5`
execution budget, `6` execution deadline and `7` incomplete runtime/usage/cleanup. Cancellation
returns `130`, including cancellation during evaluation. A successful `workflow preflight` still
returns `0` with task verification unavailable; it tests protocol, not the task.

## SDK usage and saved records

```ts
import { readFile } from 'node:fs/promises';
import { ArtemisKit, readWorkflowRecord } from '@artemiskit/sdk';
import { OpenAIAdapter } from '@artemiskit/adapter-openai';

const kit = new ArtemisKit();
const result = await kit.runWorkflow({
  workflow: './workflow.yaml',
  providerConfig: { apiKey: process.env.OPENAI_API_KEY },
  semanticJudge: {
    client: new OpenAIAdapter({
      provider: 'openai', apiKey: process.env.OPENAI_API_KEY, maxRetries: 0,
    }),
    provider: 'openai', model: 'your-reviewed-judge-model',
    limits: { maxRequests: 2, maxTokens: 4096, maxOutputTokens: 64, timeoutMs: 10000 },
  },
});
console.log(result.record.taskVerification, result.record.outcomes.task);
console.log(result.record.usage, result.record.outcomes.semantic.usage);

const saved = readWorkflowRecord(await readFile('./outcome.json', 'utf8'));
if (saved.schemaVersion !== '1') console.log(saved.outcomes);
// Version 1 stays taskVerification: 'unavailable'; reading never calls a model.
```

Omit `semanticJudge` for deterministic-only workflows. The low-level session accepts the same
option. Target and judge clients remain caller-owned; custom clients must honor requested retries,
usage and cancellation. On cancellation, late work may remain pending; the semantic usage record
retains this explicitly. `execution_finished` seals target evidence; `finished` is emitted only
after assessment is sealed. `run()` returns the completed assessment. The final event is metadata-only: it signals that
assessment has finished but carries no outcome payload. Its status describes target execution;
await `run()` to read task verification.
