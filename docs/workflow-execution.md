# Controlled workflow execution

This guide covers controlled execution introduced in 0.6.1 and task-aware exits in 0.6.2. Publication status and exact package versions
are recorded in [the release plan](releases/0.6.x-release-plan.md). The
[workflow design guide](agent-workflow.md) explains the YAML contract and longer-term roadmap.

## What an execution result means

ArtemisKit runs the declared conversation, admits only declared tools, and checks their original
arguments and resource permissions before executing them. It starts a fresh environment for each
run. CLI and SDK execution use the same native session engine.

A completed conversation is **not a verified task pass**. Historical 0.6.1 records keep
`taskVerification: unavailable`. The 0.6.2 engine independently evaluates declared requirements;
see [workflow outcomes](workflow-outcomes.md) for scoring, judge configuration and saved-record compatibility.
Check execution, policy, budget, measurement, and cleanup fields separately. A pending approval
request remains pending; a draft message is never sent; a delegated task is a local pending record,
not another running agent.

## Choose the environment

| Environment | File tools | Other catalog tools | Requirements |
| --- | --- | --- | --- |
| `simulated` | Detached in-memory file map | Detached local state | Node or Bun for the SDK; Bun for the CLI |
| `sandbox` | Real files inside a fresh disposable Docker container | Detached local state | A running Docker daemon and `oven/bun:1.3.10-alpine` already installed |

Both environments accept the same declared tools and resource permissions. Sandbox execution does
not grant arbitrary commands, network access, external messaging, or access to the host repository.
There is no automatic fallback to host execution when Docker or a required isolation control is
unavailable. The model's provider connection is made by the trusted host; `network: denied` governs
workflow tools and the sandbox, not the host's explicitly configured model connection.

The initial Docker implementation fixes the image and executable rather than accepting commands,
mounts, environment variables, or image overrides from a scenario. It runs without network access,
with a read-only root filesystem, bounded writable temporary space, dropped capabilities, and
CPU, memory, and process limits. Docker is a trusted host dependency. ArtemisKit does not pull the
image automatically; install it deliberately before a sandbox run.

Use controlled fixture data. An initial-state object is copied for the session. A referenced JSON
or YAML fixture is resolved relative to the explicitly selected fixture root, with traversal and
symlink restrictions; scenario text is not an environment-variable template. Provider credentials
belong in trusted provider configuration outside the workflow.

## Budget semantics

`max_actions` covers model invocations and attempted tool calls. `max_model_requests` and
`max_tool_calls` constrain these independently. `timeout_ms` bounds the workflow, including
initialization and an optional preflight. Cancellation and cleanup have a separate bounded drain
period so the saved result can disclose unresolved work.

`max_tokens` applies to cumulative provider-reported input and output tokens. Requested output is
bounded by the remaining allowance, but a provider response can exceed it because input tokens and
provider behavior are not fully controlled. The result discloses overshoot and stops new admission.
Missing usage is unavailable, never free; a required token budget cannot continue on unmeasured
usage. These limits are not an absolute spend guarantee.

Model-request counters count calls admitted to the target interface. A custom target is trusted
host code and can hide its own retries or subprocesses; its internal transport attempts cannot be
inferred from a single callback. The controlled OpenAI and Ling workflow paths disable automatic
transport retries. Arbitrary custom targets must meet the same accounting and cancellation contract
before claiming equivalent guarantees.

## Preflight and validation

Offline scenario validation parses the contract without loading referenced fixtures, creating an
environment, resolving provider credentials, or calling a model.

An explicit preflight calls the configured target. It tests a structured tool invocation and a
correlated tool-result continuation. The bounded probe's model requests, tool action and tokens
are included in the total budget and also reported separately. Preflight-only mode stops after the
probe; probe-then-run mode proceeds to workflow turns only when it succeeds. Advertised tool support
alone does not establish a working provider/model round trip.

A failed local-model probe is useful evidence about that exact configuration. It does not establish
that every model behind the provider is unsupported, or that an agent failed a scored task.

## Run through the CLI

Keep credentials in your existing trusted Artemis configuration. The workflow's `target.provider`
and `target.model` select the target; provider configuration supplies its credentials and transport
settings. The CLI does not expand environment variables inside workflow YAML.

```sh
# Offline: no provider or Docker calls.
akit scenario validate workflow.yaml

# Paid providers incur bounded probe calls here; use an authorized configuration.
akit workflow preflight workflow.yaml --config artemis.config.yaml \
  --output preflight-record.json

# Probe and then execute, with metadata-only evidence saved separately.
akit workflow run workflow.yaml --config artemis.config.yaml --preflight \
  --output execution-record.json

# Explicitly retain sensitive final state/file contents from a disposable environment.
akit workflow run examples/07-agentic/sandbox-workflow.yaml \
  --config artemis.config.yaml --cleanup-timeout 10000 \
  --output sandbox-record.json --state-output sandbox-state.json
```

Review the example target and budgets before executing it. Fixture references default to the
workflow file's directory; use `--fixture-root` to select another explicit root. `--json` prints the
safe record to stdout. Output paths must be distinct and unused, and are checked before model
calls. The state export is opt-in, written with mode `0600`, and contains sensitive working data.
If no snapshot is available, the CLI reports that the requested state export failed.

SIGINT or SIGTERM cancels the session, waits for bounded cleanup, and writes the interrupted record
when `--output` was supplied. `--cleanup-timeout` bounds cleanup separately from the workflow deadline
(default 1,000 ms for simulation or 6,000 ms for sandbox; maximum 10,000 ms).
Interrupted evidence is not a resumable checkpoint.

| Exit | Meaning |
| --- | --- |
| `0` | Verified task pass; or a successful capability-only preflight |
| `1` | File, configuration, output preparation, or persistence error |
| `2` | Invalid workflow, options, fixture, or target response |
| `3` | Unsupported target or environment |
| `4` | Policy denial |
| `5` | Budget exhausted |
| `6` | Workflow deadline exceeded |
| `7` | Runtime failure, unavailable/partial measurement, or unresolved cleanup |
| `8` | Valid task failure (0.6.2) |
| `9` | Invalid or unavailable outcome evaluation (0.6.2) |
| `130` | Cancelled execution or evaluation |

Use `akit workflow run --help` for supported controls. `akit run` continues to execute historical
prompt-response scenarios. Workflow records have a separate schema.

## Sessions through the SDK

The `ArtemisKit` wrapper creates the adapter from trusted configuration while the workflow retains
authority over its provider and model. A file-backed workflow uses its parent as the fixture root;
an inline workflow with a fixture reference requires an explicit `fixtureRoot`.

```ts
import { ArtemisKit } from '@artemiskit/sdk';

const kit = new ArtemisKit();
const session = await kit.createWorkflowSession({
  workflow: './workflow.yaml',
  providerConfig: { apiKey: process.env.OPENAI_API_KEY },
  preflight: true,
  cleanupTimeoutMs: 10_000,
});
const result = await session.run();
console.log(result.record.execution, result.record.taskVerification);

// One-call alternative creates a fresh session:
// const result = await kit.runWorkflow({ workflow: './workflow.yaml', providerConfig: {...} });
```

Pass `client` for an existing `ModelClient`, or `target` for a custom `AgentTarget`; do not supply both.
These are trusted host extensions. They must respect the session's tool, budget, and abort contract.
SDK calls do not persist state or transcripts automatically.

The low-level session accepts a validated workflow and an `AgentTarget`. This makes deterministic
fixtures, existing adapters, and custom targets use the same controls:

```ts
import {
  createAgentWorkflowSession,
  createModelClientTarget,
  loadAgentWorkflow,
} from '@artemiskit/sdk';
import { OpenAIAdapter } from '@artemiskit/adapter-openai';

const workflow = await loadAgentWorkflow('./workflow.yaml');
const client = new OpenAIAdapter({ provider: 'openai', apiKey: process.env.OPENAI_API_KEY });
const session = createAgentWorkflowSession({
  workflow,
  target: createModelClientTarget(client),
  fixtureRoot: process.cwd(),
  preflight: true,
});

const eventReader = (async () => {
  for await (const event of session.events()) console.log(event);
})();
const result = await session.run();
await eventReader;
console.log(result.record); // bounded execution evidence
// result.state and result.transcript are sensitive working data.
```

Run this only with a reviewed workflow and an authorized provider budget. Use `session.cancel()`
or a caller `AbortSignal` to stop new work. A session executes once; repeated `run()` calls share
that execution. Create a new session for a fresh run.

Cancellation is not rollback. Supported transports receive abort signals; unsupported or still
pending callbacks are disclosed. Cleanup is complete only when the owned environment and tracked
operations meet the recorded cleanup contract. Inspect unresolved cleanup before considering
artifacts discarded.

## Retain evidence deliberately

Persist the bounded `result.record` by default. Working state and transcripts can contain fixture
content, prompts, model responses, draft recipients and file contents; they are not sanitized
execution evidence. Event callbacks and the session event stream expose bounded metadata rather
than tool arguments or response text.

Checksums provide artifact correlation, not content encryption or proof that an outcome passed.
Low-entropy fixture values may still be guessable from their checksums. Use an appropriate retention
policy for the data being evaluated.

Historical prompt-response manifests and reports retain their existing contract. Workflow records
have their own schema and must not be passed to legacy report generators as if they were scored
scenario results. Durable restart is 0.6.3; professional workflow reports are 0.6.4.
