# Evaluate a real Ling agent with TrueForge

ArtemisKit can run a real tool-using Ling agent through TrueForge, place it in a disposable Docker
workspace, and score independently observed evidence. The included scenario asks the agent to
repair one invalid ArtemisKit YAML expectation and prove the repair with `akit validate`.

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

## What is verified

For every run ArtemisKit:

1. builds a standalone `akit` validation bundle;
2. copies the fixture into a fresh host temporary directory;
3. gives TrueForge only the five tools declared by the task;
4. records normalized tool actions and sanitized TrueForge events;
5. reruns every acceptance command after the agent stops;
6. checks the repaired file with ArtemisKit's validator and parser and requires exact source
   equality with the expected artifact;
7. checks changed paths, action/time budgets, rejected or failed actions, termination state, and
   evidence consistency; and
8. writes a JSON result beneath `agent-evaluation-runs/trueforge-ling/<timestamp>/result.json`.

The result directory is gitignored. The report includes the model, task, trace, diff, acceptance
and artifact checks, token metrics when TrueForge supplies them, and one of these verdicts:
`passed`, `passed_with_recovery`, `task_failed`, or `infrastructure_failed`. It never writes the
Ling API key.

## Safety boundary

- The source fixture is copied and never mounted into the container.
- Only the disposable copy is writable. Git metadata remains outside the container mount.
- Validation containers have no network, a read-only root filesystem, dropped Linux capabilities,
  no-new-privileges, PID/memory/CPU limits, bounded output, and named-container cleanup.
- Commands are parsed against a fixed allowlist; there is no arbitrary shell tool, package install,
  remote Git, Docker socket, or host-path access.
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
