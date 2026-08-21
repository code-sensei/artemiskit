# Ling ArtemisKit Agent Benchmark Design

## Goal

Measure Ling-3.0-Flash and Ling-3.0-Tiny as realistic coding agents by having each operate a disposable ArtemisKit fixture repository. The benchmark measures completed, verified work—not tool-call intent alone.

## Scope

The first benchmark agent is an ArtemisKit scenario-authoring and repair agent. It receives a bounded task, can inspect and edit only a temporary fixture repository, and must validate its result with real local commands.

Out of scope: the user workspace, remote Git operations, external network access, package installation, arbitrary shell execution, production services, and secrets.

## Sandbox

Each case creates a temporary repository seeded from a version-controlled fixture. The agent receives only the fixture path and a constrained tool set:

- `list_files`, `read_file`, `search_files`
- `apply_patch` and `write_file` within the fixture root
- `git_status`, `git_diff` within the fixture root
- `run_command` allowlisted to `bun test`, `bun run typecheck`, `bun run build`, `akit validate`, and formatter/linter commands

The command wrapper rejects path traversal, network commands, package installation, background processes, destructive commands, and writes outside the fixture root. Every call records inputs, result status, duration, changed paths, and command output summaries.

## Cases

1. Create a valid ArtemisKit scenario from a concise feature requirement.
2. Repair an invalid expectation/schema in an existing scenario.
3. Resolve a failing test by making the smallest valid scenario/configuration change.
4. Add a tool-trace expectation while retaining fixture-only safety.
5. Diagnose a failed validation and return a structured evidence-backed summary.

Each case has an initial fixture state, acceptance tests, expected changed files, prohibited paths, and a maximum command/tool budget.

## Agent loop

1. Read task and inspect only relevant files.
2. State an intended minimal change.
3. Read/edit through sandbox tools.
4. Run the required validation command after each meaningful change.
5. Stop only after acceptance checks pass, or return a structured blocked/failure outcome.

The model controls planning and tool selection. The harness controls authority, state checks, timeouts, and evidence capture.

## Measurements

- task completion rate
- validation-pass rate
- first-pass success rate
- mean edits and commands to completion
- invalid/prohibited tool calls
- latency and API token usage
- diff scope compliance
- failure category and recovery quality

Each run writes a sanitized action trace and final diff. Report results by model, task family, and repetition; retain genuine failures.

## Model protocol

Run both models at temperature 0. Flash uses the same prompt/tool contract as Tiny. Each task is repeated three times with a freshly seeded fixture. Tiny is evaluated only on compact tasks whose fixture context fits its intended resource-sensitive use; Flash receives the full five-case set.

## Acceptance criteria

The benchmark is ready when fixtures seed deterministically, tools cannot escape the sandbox, all acceptance checks run locally, action traces are saved, and a report aggregate distinguishes successful completion from plausible-but-unverified output.
