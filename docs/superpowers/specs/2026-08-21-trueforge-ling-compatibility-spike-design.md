# TrueForge + Ling Compatibility Spike Design

## Objective

Verify that Ling-3.0-Flash can run as a real coding agent through TrueForge, using a local Docker sandbox and a disposable ArtemisKit fixture repository. ArtemisKit remains the scorer and report-artifact layer.

## Scope

This is a compatibility spike, not a production deployment and not a public dependency integration. It proves one end-to-end task: an agent repairs a deliberately invalid ArtemisKit scenario and verifies it with local validation.

## Architecture

```text
Ling Studio API → TrueForge local server → local Docker sandbox → disposable fixture repo
                                      ↓
                        session, tool, and sandbox-artifact traces
                                      ↓
                         ArtemisKit acceptance scorer and manifest
```

## Runtime boundaries

- TrueForge runs localhost-only in local mode.
- Ling is configured as a custom OpenAI-compatible provider with the official Studio endpoint and an environment-provided key.
- A Docker sandbox receives a freshly seeded temporary repository for each run.
- The sandbox has no mounted user workspace, no host Docker socket, no credentials, and no external network access except the model request made by TrueForge outside the sandbox.
- The sandbox command allowlist is `bun test`, `bun run typecheck`, `bun run build`, `akit validate`, `git status`, and `git diff`.
- No package installation, remote Git, browser, or arbitrary network tools are enabled.

## Fixture task

The fixture contains one invalid ArtemisKit YAML scenario: an expectation uses an invalid type. The task instructs the agent to inspect the fixture, make the smallest valid correction, run `akit validate`, and report the evidence.

Acceptance requires:

1. Only the declared scenario file changed.
2. `akit validate` exits successfully.
3. The final scenario uses a valid expectation type.
4. The task trace contains at least one inspection, one edit, and one verification action.

## Evidence

Capture sanitized TrueForge turn/session events, tool calls, sandbox artifact paths, final Git diff, command exit codes, ArtemisKit acceptance result, model/token metadata, and latency. Never store the API key or raw environment.

## Decision gate

Proceed to the full real-agent benchmark only if the spike successfully configures Ling, provisions the sandbox, completes the task, and exposes retrievable trace/artifact evidence. Otherwise, report the exact compatibility blocker and retain ArtemisKit’s existing fixture-loop tests as the tool-use baseline.
