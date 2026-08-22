# Evaluate a real Ling agent with TrueForge

ArtemisKit can run a real tool-using Ling agent through TrueForge, place it in a disposable Docker
workspace, and score independently observed evidence. The single-task example asks the agent to
repair one invalid ArtemisKit YAML expectation. A separate suite exercises five deterministic
authoring, repair, and diagnosis tasks across a fixed Ling model matrix.

This is a local evaluation workflow, not a hosted-agent deployment. Only the Ling model request
leaves the machine.

## Components

- `@artemiskit/core` defines harness-neutral tasks, traces, outcome evidence, and verdicts.
- `@artemiskit/adapter-trueforge` configures Ling as a custom OpenAI-compatible provider and maps
  TrueForge turn events into a sanitized ArtemisKit outcome.
- `@artemiskit/mcp-docker-sandbox` gives the agent five bounded workspace tools: read, patch,
  status, diff, and allowlisted command execution.
- `examples/agent-evaluation/scenario-repair` supplies a deterministic fixture, task contract,
  exact expected artifact, and end-to-end runner.
- `examples/agent-evaluation/ling-benchmark` supplies the fixed suite matrix, four additional task
  fixtures, a serial runner, per-attempt evidence, and aggregate counts.

The runner currently targets TrueForge CLI 0.1.4 and `@truefoundry/trueforge-sdk` 0.1.3.

## Prerequisites

1. Install Bun dependencies with `bun install` and build the repository with `bun run build`.
2. Install Docker and pull the pinned runtime image once while online:

   ```bash
   docker pull oven/bun:1.3.10
   ```

3. Create a Ling Studio API key. Keep it in the shell or an ignored root `.env`; never commit it.
4. Start a local TrueForge server on port 8790. A temporary database avoids retaining the
   provider credential after the test:

   ```bash
   TRUEFORGE_RUN_DIR="$(mktemp -d)"
   SQLITE_PATH="$TRUEFORGE_RUN_DIR/trueforge.sqlite" \
     npm exec --yes @truefoundry/trueforge@0.1.4 -- --port 8790
   ```

The TrueForge process stores configured provider credentials in its SQLite database. After the
server is stopped, remove only the temporary directory printed or assigned for that run if you do
not want to retain it.

## Run Flash or Tiny

In a second terminal at the repository root:

```bash
export LING_API_KEY="your-studio-key"
LING_REAL_AGENT_TESTS=1 bun run eval:agent:trueforge
```

That uses `Ling-3.0-flash`. Select Tiny explicitly with:

```bash
LING_REAL_AGENT_TESTS=1 \
LING_REAL_AGENT_MODEL=Ling-3.0-tiny \
bun run eval:agent:trueforge
```

The runner accepts only those two documented model IDs. Without both `LING_REAL_AGENT_TESTS=1`
and `LING_API_KEY`, it exits successfully without contacting Ling or TrueForge.

## Run the benchmark suite

After completing the same prerequisites, run the committed suite from the repository root:

```bash
export LING_API_KEY="your-studio-key"
LING_REAL_AGENT_TESTS=1 bun run eval:agent:trueforge:suite
```

The suite runs each configured task-and-model coordinate three times:

| Task | Flash | Tiny |
|------|-------|------|
| Scenario repair | 3 | 3 |
| Minimal failing-case repair | 3 | — |
| Scenario authoring | 3 | 3 |
| Tool-trace authoring | 3 | — |
| Validation diagnosis | 3 | 3 |

That is 24 fresh attempts: 15 with `Ling-3.0-flash` and 9 with `Ling-3.0-tiny`. Attempts execute
serially. A task or infrastructure failure is recorded without aborting later coordinates, and the
suite exits nonzero unless all 24 attempts pass. The same opt-in gate applies: without both
`LING_REAL_AGENT_TESTS=1` and a non-empty `LING_API_KEY`, the command exits successfully before
building the CLI bundle or contacting Ling, TrueForge, or Docker.

## What is verified

For every run ArtemisKit:

1. builds a standalone `akit` validation bundle;
2. copies the fixture into a fresh host temporary directory;
3. gives TrueForge only the five tools declared by the task;
4. records normalized tool actions and sanitized TrueForge events;
5. reruns every acceptance command after the agent stops;
6. compares every declared artifact with its expected file byte for byte;
7. checks changed paths, action/time budgets, rejected or failed actions, termination state, and
   evidence consistency; and
8. writes a JSON result beneath `agent-evaluation-runs/trueforge-ling/<timestamp>/result.json`.

The result directory is gitignored. The report includes the model, task, trace, diff, acceptance
and artifact checks, token metrics when TrueForge supplies them, and one of these verdicts:
`passed`, `passed_with_recovery`, `task_failed`, or `infrastructure_failed`. It never writes the
Ling API key.

The suite applies the same checks independently in each fresh workspace. It writes sanitized
attempt records to
`agent-evaluation-runs/trueforge-ling-suite/<timestamp>/attempts/001.json` and subsequent numbered
files, plus aggregate counts in `aggregate.json`. The aggregate groups total and passed attempts by
model and task; use the attempt files for complete verdict and evidence details.

## Safety boundary

- The source fixture is copied and never mounted into the container.
- Only the disposable copy is writable. Git metadata remains outside the container mount.
- Validation containers have no network, a read-only root filesystem, dropped Linux capabilities,
  no-new-privileges, PID/memory/CPU limits, bounded output, and named-container cleanup.
- Commands are parsed against each task's fixed allowlist; acceptance commands must be a subset of
  that authority. There is no arbitrary shell tool, package install, remote Git, Docker socket, or
  host-path access.
- The MCP server binds to loopback and remote binding requires a separate explicit opt-in.
- Cleanup failures fail closed instead of silently reusing a potentially unsafe workspace.

TrueForge's own general-purpose sandbox is disabled for this workflow. The dedicated ArtemisKit
MCP workspace is the only execution environment exposed to the agent. The writable bind mount has
no filesystem quota, so this package is intended for trusted local evaluation hosts, not
multi-tenant production execution.

## Troubleshooting

- `Failed to configure the TrueForge model provider`: confirm the server is running at
  `http://localhost:8790` and uses TrueForge 0.1.4.
- Docker image or launch errors: run `docker image inspect oven/bun:1.3.10` and confirm Docker is
  running before retrying.
- `task_failed`: inspect the saved diff, actions, and acceptance checks; the harness operated, but
  the agent did not satisfy the task.
- `infrastructure_failed`: inspect the evidence issue codes for missing/invalid evidence, MCP or
  Docker failures, or an unavailable TrueForge/Ling endpoint.

Do not publish raw evaluation artifacts until you have reviewed them. The adapter redacts configured
credentials, but prompts and model-generated content can still contain information specific to the
task you supplied.

## Compatibility snapshot

On 2026-08-22, commit `b76117ac70ecd56e75da28cb07a763542a0bb087` was exercised three
times per model against the same scenario-repair task with temperature 0, a ten-iteration limit,
TrueForge 0.1.4, and the Ling Studio endpoint.

| Model | Strict verdicts | Exact artifact | Average actions | Average tokens | Average elapsed |
|-------|-----------------|----------------|-----------------|----------------|-----------------|
| Ling-3.0-flash | 3/3 `passed_with_recovery` | 3/3 | 5 | 13,321 | 11.1 s |
| Ling-3.0-tiny | 0/3 passed; 3/3 `task_failed` | 0/3 | 10 | 23,245 | 11.2 s |

Flash consistently read the scenario, reproduced the validation error, made the exact one-line
repair, revalidated it, and inspected the diff. Tiny repeatedly sent shell-style discovery commands
through `workspace_run`, did not use `workspace_patch`, and reached the iteration limit.

Prompt specificity mattered. In an earlier five-run Flash sample, a shorter one-line command
restriction produced the correct final artifact in 5/5 runs, but every run also attempted one
prohibited discovery command and therefore failed the strict policy score. Expanding the prompt into
an explicit per-tool contract changed the next Flash sample to 3/3 strict passes. This small sample
is a compatibility observation, not a general benchmark; retain the raw sanitized artifacts and run
larger repeated suites before drawing broader model conclusions.
