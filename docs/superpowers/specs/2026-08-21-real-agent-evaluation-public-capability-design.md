# Real-Agent Evaluation Public Capability Design

## Goal

Add a public ArtemisKit capability for evaluating real, tool-using agents in disposable local environments. The first harness integration is TrueForge; the first execution backend is a local Docker MCP server.

## Product boundary

Core defines generic harness and evaluation contracts. It must not depend on TrueForge, Docker, or an MCP SDK. Optional packages implement those integrations:

- `@artemiskit/core`: task specification, normalized agent trace, outcome checks, and report types.
- `@artemiskit/adapter-trueforge`: submits a task to TrueForge and maps sessions, turns, and events to core traces.
- `@artemiskit/mcp-sandbox`: exposes disposable Docker-backed workspace, Git, file, and allowlisted command tools over MCP.

The first public release supports TrueForge only. The core interface is intentionally open for future harness adapters without adding them now.

## Safety model

Every run receives a fresh host temporary workspace copied from the fixture. Only that disposable copy is bind-mounted read-write into the network-disabled container; Git control data stays in a separate host directory outside the mount. The MCP server permits reads, patches, Git status/diff, and allowlisted validation commands only inside the assigned workspace. It rejects host paths, network commands, package installation, Docker socket access, background processes, remote Git, destructive workspace-wide operations, and secrets. Containers use a read-only root filesystem and are destroyed after artifact collection.

## Evaluation model

A task declares its fixture, allowed tools, command budget, time budget, allowed changed paths, and acceptance commands. ArtemisKit evaluates:

- completion and acceptance-command success
- changed-path/diff-scope compliance
- prohibited tool attempts
- command/tool counts and latency
- normalized action trace and final artifact diff
- model token/latency metadata where the harness exposes it

## TrueForge flow

TrueForge receives Ling or another configured model through its custom OpenAI-compatible provider. It connects to the local MCP sandbox server. The ArtemisKit adapter creates a session and turn, collects persistent turn events, retrieves sandbox artifacts, executes acceptance checks, and writes an agent-evaluation manifest.

## First example

The public example is a scenario-repair task: repair an invalid ArtemisKit YAML expectation in a fixture repository, run `akit validate`, and produce a minimal diff. It is repeatable, offline except for the selected model API, and safe to publish.

## Non-goals

No hosted deployment, Daytona dependency, browser tools, arbitrary shell, production service access, remote Git, second harness adapter, or automatic package publishing in this release.
