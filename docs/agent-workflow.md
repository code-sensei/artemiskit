# Agent-workflow design guide

> **Status:** The 0.6.0 contract is published. The 0.6.1 execution milestone is published
> to npm and registry-qualified; remote tags await an approval-blocked GitHub push. See the [execution guide](workflow-execution.md) and
> [release plan](releases/0.6.x-release-plan.md) for publication status. Independent task scoring,
> durable recovery, and workflow reports remain later milestones. Existing real-agent examples
> remain documented in [agent evaluation](../examples/agent-evaluation/README.md).

The published 0.6.0 package map and validation remain in its [release record](releases/0.6.0.md).
Package versions are independent; use each milestone's exact package map when installing.

The [0.6.x release plan](releases/0.6.x-release-plan.md) defines complete milestone acceptance and
sequential npm/tag publication. Package versions remain independent of milestone labels. The
[harness experiment](agent-harness-experiment.md) informs the controls below; its research runner is
not the production workflow runner.

## Purpose

An agent workflow evaluates whether a tool-using AI system can complete a declared task under a
defined authority boundary. It is different from a prompt-response test: ArtemisKit must observe
the tools used, state or artifacts produced, policy decisions made, and independently verified
outcome.

The contract is designed for general workflows across sectors. It does not make a sector, provider,
agent framework, Docker, MCP, or a particular model the public harness contract.

## Design principles

- Scenarios remain plain, reviewable YAML.
- A scenario declares the smallest required tool and authority set.
- The same policy vocabulary applies in every environment.
- Simulated execution is safe and repeatable by default.
- Deterministic evidence takes precedence where an outcome can be objectively checked.
- An agent's self-report and an LLM judge are never the sole proof of workflow completion.
- Evidence is bounded, sanitized, and explicit about unavailable or invalid measurements.

## Version 1 scenario shape

The following shape is validated by `AgentWorkflowSchema`. Fixture references are validated as safe
relative paths; authoring and validation never read their contents or execute a target:

```yaml
version: "1"
kind: agent_workflow
name: document-review-and-handoff
description: Review a declared document set and record an approval request when human review is needed.

target:
  provider: openai
  model: configured-by-runner

environment:
  type: simulated
  policy:
    network: denied
    side_effects: approval_required
    permissions:
      records: read
      documents: read
      workflow_state: write
    budgets:
      max_actions: 10
      timeout_ms: 60000

tools:
  - search
  - read_document
  - query_records
  - request_approval
  - record_decision

workflow:
  system_instructions: Follow the declared policy and request approval when the review is uncertain.
  initial_state: fixtures/review-state.yaml
  turns:
    - role: user
      content: Review the submitted material and prepare the required handoff.

outcomes:
  deterministic:
    - type: workflow_state
      path: approvals.requested
      equals: true
    - type: tool_trace
      tool: request_approval
      minimum_calls: 1
    - type: policy
      rule: no_undeclared_tool
      expected: passed
  semantic:
    - type: llm_judge
      rubric: The handoff explains the remaining uncertainty clearly and does not claim final approval.
      mode: strict_assurance

evidence:
  trace: summary
  artifacts: checksums
  redact: true
```

`fixtures` above describes controlled test data, not a separate user-facing execution model. Users
declare `tools` and `environment`; ArtemisKit uses deterministic fixtures internally when a
simulated environment needs state or tool responses.

## Implemented tool catalog

The 0.6.0 catalog contains `search`, `read_document`, `query_records`, `read_file`, `write_file`,
`calculator`, `get_workflow_state`, `request_approval`, `record_decision`, `draft_message`,
`delegate_task`, and `get_task_status`. Each has versioned JSON input/output schemas, authority
requirements, bounded metadata-only evidence, and explicit failure modes. Use `artemiskit tools
describe <id>` for its exact contract. Descriptors returned by the API are defensive copies.

`executeSimulatedTool` runs one declared tool against detached JSON state. It cannot access the
host filesystem or network. Simulated files, drafts, approvals, and delegated tasks are state
records; they do not write real files, send messages, approve external actions, or launch agents.
Undeclared tools, missing permissions, unsafe paths, and invalid input/state return explicit
failure results. Returned state and output are working data; only the `evidence` field is a
bounded metadata summary suitable for retention. Do not persist raw state as sanitized evidence.

Inline state uses `documents: {id: text}`, `records: {collection: [objects]}`,
`files: {relativePath: text}`, and `workflow_state: {}`. Tools may also maintain `drafts` and `tasks`.
These single-tool primitives do not enforce run budgets. The native session engine adds conversation
orchestration, cumulative limits, cancellation, and bounded execution evidence around them.

### Future catalog direction

The core catalog should contain general capabilities rather than business-sector verbs. Initial
families are proposed below.

| Family | Proposed tools | Typical authority |
| --- | --- | --- |
| Retrieval | `search`, `fetch_url`, `read_document`, `list_documents`, `query_knowledge_base` | Read; network only when explicitly enabled |
| Records | `query_records`, `get_record`, `create_record`, `update_record`, `delete_record` | Read or write as declared |
| Files and artifacts | `list_files`, `read_file`, `write_file`, `create_directory`, `apply_patch` | Path-scoped read/write |
| Computation | `calculator`, `run_transform`, `validate_json`, `validate_schema` | No external authority |
| Workflow | `get_workflow_state`, `update_workflow_state`, `request_approval`, `record_decision` | Declared state transitions |
| Communication | `draft_message`, `send_message`, `create_task`, `schedule_event` | Draft or explicitly authorized send/create |
| Coordination | `delegate_task`, `get_task_status`, `submit_result` | Bounded task scope |

Each catalog tool must have a stable identifier, version, JSON input/output schema, authority
classification, bounded evidence summary, deterministic simulated behavior, and documented failure
modes. Custom tool registration is deferred; version 1 currently accepts only the built-in IDs.

Sector-specific semantics—such as support tickets, shipments, lending, health records, or public
sector casework—belong in scenario extensions and later reviewed packs, not in the core catalog.

## Environments and common policy

The environment selects an implementation. It must not change the policy language or let a model
change its own authority.

| Environment | Purpose | Side effects | Primary use |
| --- | --- | --- | --- |
| `simulated` | Controlled tool responses and state transitions | None outside the run | Authoring, CI, release validation, repeatable assessment |
| `sandbox` | Fresh disposable Docker filesystem | Limited to disposable resources | Artifact, stateful, and multi-step workflows |
| `external` (future; rejected by the current schema) | Explicitly authorized configured integration | Potentially real; initially read-only | Separately scoped pilot work |

The execution contract accepts `simulated` and `sandbox`, `network: denied`, and
`side_effects: denied | approval_required`. Resource permissions are explicit. `max_actions` and
`timeout_ms` are required; `max_model_requests`, `max_tool_calls`, and `max_tokens` are optional.
Unknown policy keys are rejected. An optional `paths` policy restricts file tools to exact safe
relative paths; it does not interpret globs. Without it, file permissions apply throughout that run's
isolated file map or workspace. For example:

```yaml
policy:
  network: denied
  side_effects: approval_required
  permissions:
    files: write
    workflow_state: write
  paths:
    read: [input/brief.txt, output/handoff.txt]
    write: [output/handoff.txt]
  budgets:
    max_actions: 12
    max_model_requests: 6
    max_tool_calls: 6
    max_tokens: 4096
    timeout_ms: 60000
```

Commands, network tools, external effects, and user-selected faults are not accepted capabilities
in this milestone. Sandbox file tools use real disposable files; approvals, drafts, and delegation
remain local pending records with no external authority. See [execution controls](workflow-execution.md).

`simulated` is the default because it makes tool calls, state, faults, and outcomes reproducible
without customer data, live systems, external spend, or uncontrolled side effects. It is not a
claim that production behavior is identical. A sandbox increases execution realism while preserving
disposability. External execution must require explicit operator approval, configured credentials
outside the scenario, allowlists, budgets, and a retained approval reference.

Denied network, tool, path, command, or side-effect requests must produce explicit policy evidence
in all environments. A scenario should not need to learn a different safety model when changing
from simulated to sandbox execution.

## Outcome scoring (0.6.2; not executed in 0.6.1)

### Deterministic outcome evidence

Use deterministic scoring whenever the result is objectively observable:

- An artifact exists and matches a schema, checksum, or expected content.
- A declared state transition occurred or did not occur.
- A required tool call occurred with valid arguments.
- A forbidden or undeclared tool call did not occur.
- A policy, authority, budget, or timeout rule was satisfied.
- A structured value meets a declared constraint.

### Semantic evidence

Strict LLM judging is appropriate only for declared semantic dimensions that cannot be objectively
checked, such as clarity, helpfulness, tone, or appropriateness of an explanation. It must use the
strict assurance parsing and bounded evidence contract, identify the judge configuration, and remain
separate from deterministic outcome evidence.

An LLM judge cannot turn an objectively failed workflow into a pass. A final composite result must
state the deterministic outcome, semantic outcome where applicable, and any policy, target,
environment, or measurement failures separately.

## CLI authoring and validation

The CLI supports guided authoring in a terminal and non-interactive flags:

```bash
artemiskit init agent-workflow
artemiskit tools list
artemiskit tools describe query_records
artemiskit scenario validate workflow.yaml

# Reproducible generation without prompts (akit is an alias)
akit init agent-workflow --yes --name review-and-handoff \
  --provider openai --model configured-model \
  --tools read_document,request_approval \
  --expect-state approvals.requested --equals true \
  --max-actions 10 --max-tool-calls 10 --max-tokens 4096 --timeout 60000 \
  --output workflow.yaml
```

The wizard asks for a workflow name, target, tools, instructions, initial request, budgets,
observable outcome, and optional semantic criterion. It uses the simulated environment, denies
network/external side effects, and writes the minimum resource permissions required by selected
tools explicitly into the YAML. Edit the generated initial state, turns, and assertions as needed;
the default assertion only requires the first selected tool to be called. Add meaningful final-state
assertions for your task. Files are never overwritten unless `--force` is supplied.

Every guided action needs a non-interactive counterpart for scripts and CI. The CLI must not retain
undocumented state or create hidden authority grants. Both `akit validate` and `akit scenario validate`
accept mixed directories of legacy scenarios and workflows. Validation does not resolve provider
credentials or dereference fixture paths. `akit run` continues to accept legacy scenarios only;
explicit `akit workflow run` and `akit workflow preflight` use the controlled session engine.
See the [execution guide](workflow-execution.md) for commands, result fields, and exit semantics.

## Programmatic contract

The core and SDK packages export `AgentWorkflowSchema`, `validateAgentWorkflow`, `parseAgentWorkflow`,
`loadAgentWorkflow`, `listWorkflowTools`, `getWorkflowTool`, `executeSimulatedTool`, and
`createModelClientTarget`, plus their public types. The schema requires at least one deterministic
assertion (`workflow_state`, `tool_trace`, `policy`, or `file`); optional semantic criteria must use
`strict_assurance`. These remain declarations for the 0.6.2 scoring engine; 0.6.1 reports task verification as unavailable.

`createModelClientTarget(client)` adapts an existing `ModelClient` without provider-specific dispatch.
Its `turn` method takes a conversation, declared function schemas, generation settings, and per-turn
timeout/tool-call limits. It validates tool-call IDs, argument schemas, usage, and capability support,
and returns normalized assistant messages or explicit `unsupported`, `invalid`, or `error` results.
OpenAI and Ling adapters have deterministic HTTP integration tests covering a tool-call turn followed
by a correlated tool-result continuation. These prove adapter compatibility, not live model tool-use quality.

The OpenAI and Ling adapters forward transport abort signals and disable automatic retries on the
controlled target path. Other adapters must advertise supported cancellation truthfully; a bounded
wait alone does not establish transport cancellation. Session cleanup tracks owned work and records
unresolved callbacks. Returned messages, arguments, state, and transcripts are sensitive working data.
Only the bounded session `record` and metadata events form the default persistence boundary.
Missing provider usage is explicitly unavailable; explicit measured zero is distinct from missing
counters. Cumulative token accounting and overshoot are documented in the [execution guide](workflow-execution.md).

Core and SDK also expose `createAgentWorkflowSession` and `runAgentWorkflow`, with typed events,
result, environment, and cleanup contracts. The SDK `ArtemisKit` wrapper uses the same engine.

## Report views (0.6.4)

All report views derive from the same saved, sanitized manifest and workflow evidence.

| View | Intended content |
| --- | --- |
| Technical | Full methodology, configuration, case/workflow outcomes, evidence, limitations, and appendices |
| Executive | Scope, readiness, key strengths, material risks, and evidence-grounded next actions |
| Comprehensive | Executive and technical content combined with coverage, findings, failure modes, recommendations, and evidence appendix |

The comprehensive report is the canonical cohesive deliverable. It should include scope and
exclusions; target configuration; methodology; validity denominator; scenario and workflow
coverage; strengths and weaknesses; failure modes; policy/tool evidence; costs only when attested;
comparison eligibility where relevant; limitations; recommendations; and traceable artifact
references.

Later optional AI-assisted narrative may tailor these views for an audience, but it may only use
sanitized retained evidence. It must disclose its model/configuration and must not change scores,
statuses, denominators, eligibility, or factual findings.

## Implementation and release-validation sequence

Each milestone includes its relevant core, CLI, SDK, artifact compatibility, examples and tests;
declaring a schema without wiring its required consumers does not complete a behavior milestone.

| Milestone | Delivered capability and acceptance boundary |
| --- | --- |
| 0.6.0 | Contract/primitives and offline authoring, proven with at least two adapters; packed CLI/SDK/core and TypeScript consumers must work on declared Node/Bun entry points before publication. No workflow execution claim. |
| 0.6.1 | Native multi-turn runner and shared session/event interface; CLI/SDK execution with fresh simulated and disposable sandbox environments, fail-closed authority, cumulative budgets, explicit bounded tool preflight and tracked cancellation/cleanup. Independent task scoring remains unavailable. |
| 0.6.2 | Independent deterministic outcome checks and bounded strict semantic judging; typed runtime/task/policy/measurement states, consistent CLI exit codes, SDK results and saved evidence. Normal termination alone never establishes a pass. |
| 0.6.3 | Declared faults, bounded recovery/retries and durable CLI/SDK resume; compatible complete checkpoints preserve conversation, state/artifacts, authority, operation IDs and consumed budgets. Public recovery evidence is bounded/redacted separately from sensitive working checkpoints. |
| 0.6.4 | Offline deterministic technical, executive and comprehensive HTML/Markdown reports from the same canonical evidence through CLI and SDK, with explicit coverage, validity, usage and recovery limitations. |

Within 0.6.1, the implementation order is native loop/session contract, simulated and sandbox
environments, host enforcement and budgets, preflight/usage handling, cancellation and terminal
evidence, then integrated CLI/SDK conformance. Validate original tool arguments before effects; never
execute JSON extracted from assistant prose or silently repair a call. Preflight is an explicit
provider call with a bounded budget, separate from free offline validation. Record missing usage as
unavailable and document in-flight overshoot rather than claiming an absolute spend guarantee.

Cancellation must stop admission of new work, track callbacks until settled or explicitly unresolved,
and preserve a truthful interrupted-run record. Transport abort capability and irreversible effects
must be disclosed; a timeout or closed harness is not proof that host work stopped. Requested/pending
approval must remain distinct from authority granted. 0.6.3 adds durable restart and recovery, not an
excuse to omit basic cancellation handling from 0.6.1.

After the shared execution interface is qualified, add optional AI SDK integration first and Pi
second with explicit strictness/repair policy; keep fx experimental pending provider transport and
cleanup qualification. Harness selection is independent of provider selection. Integrations load
only when selected and record pinned versions/configuration identities. They can be separately
released without blocking native 0.6.1 and must pass the same applicable conformance checks. No
fork is justified by the current experiment. External-system execution and Loki integration are
separately scoped; neither is implied by a sandbox or simulated approval record.

Every user-facing 0.6 change must have focused unit/integration tests, typecheck, lint, and build
validation. Before a commit, push, or release that changes the runner, executor, artifacts, reports,
SDK, adapters, or CLI, build packages and run a bounded fixture-safe CLI workflow through every
locally installed Ollama model using the OpenAI-compatible endpoint. Inspect the saved manifest,
requested and observed model identity, tool and policy evidence, measurement counts, denominator,
cost provenance, and requested report export. These are compatibility-path checks, not native
Ollama-provider support.

Use bounded deadlines and retain failed/unsupported local-model outcomes rather than claiming
advertised tool support passed. Deterministic fixture tests establish contract acceptance; live
checks disclose configuration-specific limits. Test clean packed consumers before publishing and
clean registry consumers afterward. Publish and verify each milestone's npm package map, package
tags and `v0.6.x` milestone tag before publishing the next increment; see the release plan for exact
checks and the publishing script's dry-run and retained-receipt behavior. CI repairs remain deferred.

## Compatibility boundary

Existing YAML scenario tests, tool-loop fixtures, agent-evaluation examples, Ling support, TrueForge
support, and Docker/MCP sandbox tools remain supported independently while the 0.6 contract is
developed. The new workflow contract must not silently reinterpret historical scenarios or artifacts.
