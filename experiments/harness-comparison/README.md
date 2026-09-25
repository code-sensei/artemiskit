# Matched harness experiment

This is an isolated research package, not a released ArtemisKit runner. It executes real native,
AI SDK, Pi and fx loops with a shared transport and ArtemisKit's simulated tools. Nothing here adds
a production CLI flag, changes a workspace dependency, or grants access to real business systems.

See [findings and recommendations](../../docs/agent-harness-experiment.md).

## Reproduce

Requirements: the built checkout, Bun, and the pinned dependencies in this folder. The recorded
runs used macOS arm64, Bun 1.3.10, AI SDK 6.0.27, Pi agent-core/pi-ai 0.87.1 and libfx 0.0.11.
The fx experiment uses its native backend; other platforms and WASM were not qualified here.

From the repository root:

```sh
bun run build
cd experiments/harness-comparison
npm ci --ignore-scripts --no-audit --no-fund

# Original 16-case pack: 192 coordinates, including two-process restart tests.
bun run run.mjs --repetitions 3 \
  --cases document,records,artifact,approval,permission_denied,undeclared_tool,malformed_arguments,action_budget,request_budget,token_budget,cancel_during_tool,false_success,missing_usage,fresh_state,resume,resume_budget \
  --output /tmp/artemis-harness-baseline.json

# Follow-up: preserve the failing Pi configuration and test the public-hook remedy.
bun run run.mjs --repetitions 3 \
  --cases coerced_arguments,strict_coerced_arguments \
  --output /tmp/artemis-harness-coercion.json

# Opt-in inference, ONLY the already-installed local qwen2.5-coder:3b.
# Does not download models or use cloud model entries or provider credentials.
bun run run.mjs --live --repetitions 3 --output /tmp/artemis-harness-live.json

# Separate synthetic-data diagnostic; does not execute tool-like response text.
bun protocol-probe.mjs /tmp/artemis-protocol-probe.json

# Verify the committed evidence, including the deliberately retained failures.
bun verify-results.mjs
```

Exit code 1 means at least one coordinate failed its outcome/control assertion. In the coercion
pack the three unguarded Pi failures are deliberately retained, so exit 1 is expected. It is not
an installation failure. A crashed or timed-out worker also stays in the denominator as a failure.
Without `--cases`, the offline command includes both the original pack and the follow-up.

`--backends native,ai-sdk,pi,fx`, `--cases <comma-separated-ids>` and `--repetitions <1..20>` narrow
the run. Backend order rotates between repetitions. Live mode accepts only the four task cases.

## What is actually controlled

- `native` is a small experimental loop over `createModelClientTarget`; 0.6.0 itself provides only
  the single-turn primitive. The other three are real upstream loops behind public extension hooks.
- All four receive the same instructions, tool schemas, task, detached fixture state and authority.
  Provider-bound message digests make transcript differences observable. Restored history can differ.
- `executeSimulatedTool` enforces declaration, permission, strict input and state contracts. Files
  and approvals are JSON state, not OS files or external approvals. No real messages are sent.
- The **experimental host** enforces cumulative admitted-action and request counters, checks token
  allowance before the next request, tracks pending tools, and rechecks abort immediately before
  mutation. These are not claims about built-in upstream controls or shipped ArtemisKit budgets.
- Token enforcement is a pre-request soft ceiling: the last response can overshoot it. Missing
  usage blocks another request and remains `null` in results. Numeric zeros passed into harness
  interface shims are not reported as known zero consumption.
- Deterministic transport usage is synthetic: eight tokens per response. Live usage is reported by
  Ollama. Paid-provider spend is zero; local compute cost is unmeasured, not zero.
- Each coordinate runs in a new process with a 10-second fixture / 60-second live watchdog, plus
  cooperative cancellation at 7 / 55 seconds. This bounds our worker, not arbitrary external effects.
- Restart saves a completed-turn checkpoint, starts a second process, restores conversation plus
  ArtemisKit fixture state and counters, and verifies continuation. This does not test mid-effect
  crash consistency or exactly-once execution.
- The fx `fetch` hook translates its Gateway-style request/stream to the same experiment driver.
  Its normal Gateway connection and a native direct-Ollama SDK integration are **not** tested.
- AI SDK uses a custom LanguageModelV3; Pi uses a custom `streamFn`. Stock provider adapters,
  streaming network behavior, retries, compaction, delegation, MCP and OS sandboxes are outside scope.

## Result interpretation

`passed` describes the case's assertion. For task cases it is the independently observed task
outcome. For controls it means the expected protection was observed. In `false_success`, a control
pass intentionally accompanies `taskOutcome: failed`: saying “Done” without writing the file fails.

`reportedStatus` preserves each runtime's vocabulary. It is never used as the task-success oracle.
`toolEventsPaired` is a limited check of this bridge's event mapping, not a complete telemetry audit.
In particular, the minimal AI SDK mapping uses step calls/results but does not normalize its
tool-error branch; fx cancellation can finish before a pending host callback has settled. The worker
waits for host callbacks before checking final state and records `toolsPendingAtClose`.

Pi's `strict_coerced_arguments` variant adds a `beforeToolCall` hook that compares the original
arguments with Pi's validated arguments and blocks changes. The other variants retain the initial
configuration. This preserves both the defect relative to strict assessment and its tested remedy.

All fixture data is invented. Matched-run JSON retains metrics, statuses and metadata, not raw model
text or tool output. The separate protocol diagnostic retains its synthetic response text to make
the tool-protocol failure inspectable. Temporary checkpoints contain fixture conversation/state and are kept in a private
temporary directory. Do not reuse this retention policy for customer data without implementing the
redaction, retention and checkpoint-protection contract.

## Current CLI and SDK example

From the repository root, these use the implemented, unreleased 0.6.0 source:

```sh
bun packages/cli/bin/artemis.ts tools describe request_approval
bun packages/cli/bin/artemis.ts init agent-workflow --yes \
  --name harness-review --provider openai --model configured-model \
  --tools request_approval --expect-state approvals.requested --equals true \
  --output /tmp/harness-review.yaml
bun packages/cli/bin/artemis.ts scenario validate /tmp/harness-review.yaml
bun experiments/harness-comparison/sdk-example.mjs /tmp/harness-review.yaml
```

The example checks pending approval, denied execution without permission, and unchanged input state.
It runs a simulated tool through the SDK. The production `akit run` does not yet execute workflow
YAML; use the experiment runner above to reproduce the multi-turn comparison. The `akit` alias is
equivalent to the source CLI command once this checkout's CLI is built and linked.
