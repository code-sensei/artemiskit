# Agent harness experiment: results and recommendations

25 September 2026. Follows [the initial options assessment](agent-harness-options.md).
The implementation is an isolated [reproducible experiment](../experiments/harness-comparison/README.md),
not adoption of a new production runtime. ArtemisKit 0.6.0 remains the implemented, unreleased
contract/primitives milestone; multi-turn execution and scoring remain later milestones.

## Decision

**Keep a small ArtemisKit-controlled native runner as the default. Integrate AI SDK first, Pi
second with strict argument handling, and fx as an experimental option. Do not fork yet.**

The experiment supports integration feasibility and identifies required controls. It does **not**
show that one harness makes a model better at completing tasks. In fact, the selected local model
failed the task checks through every harness. Supporting multiple harnesses is still useful:
ArtemisKit must assess the system a customer actually deploys, including its harness configuration.

## Executed comparison

Pinned versions: AI SDK 6.0.27, Pi agent-core and pi-ai 0.87.1, libfx 0.0.11. The native reference
uses the checkout's `createModelClientTarget` with an experimental loop. All runs used Bun 1.3.10
on macOS arm64. Each coordinate used a fresh process; checkpoint tests used two separate processes.

The same five ArtemisKit tool descriptors, initial state, task and policy were supplied to each
backend. The four task cases were document retrieval, record lookup, file creation and approval
handoff. Controls covered denied writes, undeclared tools, malformed arguments, action/request/token
limits, cancellation, misleading success text, missing usage, fresh state and checkpoint continuation.
Two follow-up variants tested argument coercion and its prevention. Every variant ran three times.

The driver used real upstream loops but shared custom provider transport hooks. AI SDK used a
LanguageModelV3 implementation; Pi used `streamFn`; fx used a Gateway-protocol `fetch` translation
bridge. This deliberately controls the model input. It does not qualify those libraries' stock
provider adapters, normal CLI configurations or fx's live Gateway path.

| Backend | Original fixture pack | Unguarded coercion check | Strict variant | Local-model task checks |
| --- | ---: | ---: | ---: | ---: |
| Native reference | 48/48 | 3/3 | 3/3 | 0/12 |
| AI SDK | 48/48 | 3/3 | 3/3 | 0/12 |
| Pi | 48/48 | **0/3** | **3/3 with public hook** | 0/12 |
| fx | 48/48 | 3/3 | 3/3 | 0/12 |

This is 192 original fixture coordinates, 24 follow-up coordinates and 48 live coordinates: **264
recorded coordinates**, including failed ones. A control pass means the expected protection was
observed, not that a business task succeeded. In the false-success case, all harnesses said “Done”
without producing the requested artifact, and the independent task outcome correctly stayed failed.

Saved evidence:

- [Original fixture pack](../experiments/harness-comparison/results/deterministic.json)
- [Coercion failure and public-hook remedy](../experiments/harness-comparison/results/coercion.json)
- [Matched local-model trials](../experiments/harness-comparison/results/live.json)
- [Post-hoc provider protocol diagnostics](../experiments/harness-comparison/results/protocol-probe.json)

## Findings that affect the product

### 1. Successful termination is not successful execution

All four runtimes could finish normally after a denied write. All four also returned a normal
completion in the live trials without executing any tool. ArtemisKit must retain runtime status,
task outcome, policy outcome and measurement availability separately. A “done” message cannot
override missing artifacts or an unmet state assertion.

**CLI effect:** show an outcome such as `task failed: required approval request missing` even when
the runtime says `stop` or `completed`; return a failing workflow exit status when required outcomes
are unmet. Display pending human approval separately from approval granted.

**SDK effect:** return typed outcome and policy fields alongside the harness termination reason.
This will let Loki distinguish a finished conversation from a verified result without scraping text.

### 2. Pi can change the behavior being assessed

The model fixture supplied `write_file({ path: "number.txt", content: 42 })`. The declared schema
requires string content. Native rejected the response before execution; AI SDK and fx reached the
shared executor, which rejected the invalid input. Pi converted `42` to `"42"` and wrote the file
in all three runs. Pi's published validation code deliberately performs schema coercion.

The public `beforeToolCall` hook exposes both original and validated arguments. Comparing them and
blocking changes prevented the write in all three retests, with no upstream changes:

```js
import { isDeepStrictEqual } from 'node:util';

// Pi Agent configuration: tested in the strict_coerced_arguments variant.
beforeToolCall: ({ toolCall, args }) => {
  if (!isDeepStrictEqual(toolCall.arguments, args)) {
    return {
      block: true,
      terminate: true,
      reason: 'Raw tool arguments were rewritten',
    };
  }
}
```

**Recommendation:** strict assessment should validate the original call before repairs or coercion.
For a customer-agent assessment, preserve and report the customer's configured repair behavior.
These are different configurations and should have different comparison identities. A repair may
improve an application's completion rate while obscuring the model's original error.

AI SDK's plain `jsonSchema` bridge was also not a substitute for host validation: this configuration
did not supply a schema validation callback. Keep ArtemisKit's strict executor boundary even when
upstream validation is configured. The observed difference is configuration-specific, not a claim
that any of these libraries lacks validation features.

### 3. Cancellation requires host-owned cleanup

In each fx cancellation test, one host tool callback remained pending after the agent closed. The
host callback checked abort before mutation; the worker then waited for it to settle and verified
that no file was written. Its normal tool-end event was absent. Other backends had no pending
callback at close in this test.

The minimal AI SDK event mapping also left unknown-tool attempts unmatched because it mapped step
calls/results without normalizing the separate error path. That is a bridge coverage gap, not proof
that the SDK cannot expose errors.

**Recommendation:** record requested calls, validation decisions, execution starts and terminal
results at the ArtemisKit boundary. Map runtime error/cancel events explicitly. Track and drain
host-owned work before reporting final state. `Ctrl-C` should produce a usable interrupted-run
record; it must not simply print success because a runtime promise settled.

This tested a cooperative simulated callback, not the ability to undo a network effect or terminate
an uncooperative external tool. The current `ModelClient` contract also cannot cancel provider
transport; its timeout bounds waiting. These limitations remain explicit.

### 4. Checkpoints need ArtemisKit state as well as conversation history

All backends restored a completed-turn conversation in a second process. Restoration retained a
fixture artifact, allowed the follow-up approval task, and preserved the host's remaining action
and request budgets. The fx checkpoint contains its own conversation representation; the other
bridges serialized their message histories. **Every backend still needed separate fixture state and
budget counters.**

**CLI effect:** eventual resume should restore a complete run envelope and validate its scenario,
tool, policy and harness identities. It must not reset budget counters. An opaque harness checkpoint
alone is insufficient. Fresh execution must remain the default.

This was restart between completed turns, not crash recovery during a write. Atomic checkpoints,
idempotency, conflicting restores and exactly-once external effects remain untested.

### 5. Advertised tool capability needs an execution preflight

The installed `qwen2.5-coder:3b` (Q4_K_M, digest
`e7149271c2969e2737cec50f58393671d690a6f99789d1a776c916efeb11fa98`) advertised tool support
through Ollama 0.32.14. Yet all 48 matched requests produced zero structured tool calls. In a raw
document-task diagnostic it returned this as ordinary assistant text:

```json
{"name": "read_document", "arguments": {"id": "brief"}}
```

An explicit formatting reminder still returned text, wrapped in a Markdown code block. Neither
response populated the provider's `tool_calls` field. Both provider finish reasons were `stop`.
The harnesses therefore had no authorized call to execute. The endpoint/model/template configuration
failed the tested protocol; this does not establish that all Qwen models or all Ollama configurations
cannot use tools.

**CLI effect:** add an explicit, bounded tool-use preflight before relying on a workflow configuration.
Check one real tool round trip, not just a model catalog flag. Explain a protocol failure plainly.
Keep scenario validation offline and free of provider calls. Do not silently recover by executing
JSON found in arbitrary assistant prose.

**SDK effect:** expose preflight results separately from static capability metadata, with actual
provider/model identity, usage and failure reason. Any provider-specific repair must be an explicit,
versioned option whose effects remain visible in the assessment.

### 6. This experiment does not establish a speed or cost winner

| Backend | Median live trial elapsed time | Reported tokens across 12 trials |
| --- | ---: | ---: |
| Native reference | 1.14 s | 4,563 |
| AI SDK | 1.09 s | 4,563 |
| Pi | 1.12 s | 4,563 |
| fx | 1.13 s | 4,563 |

All these trials failed task completion after one model request. The first native trial took 8.91 s
and bore the initial model load; others benefited from a warm model. Timings include session work
but exclude module import time. Each worker imports all experimental backends, so process startup
measurements cannot be used to compare production installation/startup costs.

The 48 matched trials consumed 18,252 Ollama-reported tokens. Two saved diagnostic requests consumed
766 more; two preparatory diagnostic calls also consumed 766. **Paid-provider spend was zero.**
Local compute cost was not measured. Fixture token counts are synthetic and unsuitable for cost
estimates. A pre-request token ceiling can overshoot on its last response; unknown usage must remain
unavailable rather than being interpreted as free execution.

## Integration order and expected operational effects

| Decision | Reason grounded in this work | Expected effect on CLI and SDK |
| --- | --- | --- |
| Native default | Existing strict turn contract; all control fixtures passed; no additional production harness required | Stable default, explicit policy/evidence, one scenario vocabulary. We still own the loop, lifecycle and scoring work. |
| AI SDK first optional integration | All control fixtures passed under the host wrapper; already a workspace dependency; public loop/model/tool hooks worked | Lowest incremental dependency burden. Reuse provider integration work, add complete error/event mapping and strict input validation. No demonstrated task-quality uplift. |
| Pi second optional integration | All original controls passed; strictness gap reproduced and resolved with a public hook | Good customization option for TypeScript workflows. Pin core packages, enforce/report coercion policy, and normalize messages/events. No full coding-CLI fork needed. |
| fx experimental option | Tools and restored checkpoints worked; pending callbacks and Gateway translation require additional care | Optional native assets and compatibility checks; explicit stream draining, host cleanup, and qualified provider transport. Keep installation/lifecycle costs away from the default path. |
| Deep Agents/LangGraph and OpenHands later | Not included in this runtime experiment | Add when customer workloads require durable delegation or coding environments. Do not claim this experiment ranked them. |

The future harness selection should be separate from provider selection: a customer may want
`ai-sdk` with different providers, or assess the same provider inside Pi and fx. Load optional
integrations only when selected. Save their pinned versions and configuration digests in every run.
Changing harness, repair policy or instructions should prevent accidental comparison as an identical
configuration.

**No fork is justified by the demonstrated gaps yet.** Pi's hook handled strict argument control.
fx's public transport/tool hooks were sufficient for this bounded bridge, although a supported direct
provider path still needs qualification. A focused Pi core fork would be the first candidate if a
future mandatory control cannot be expressed through hooks. A fx fork adds native/Zig and platform
maintenance and should require a demonstrated requirement that its public API cannot meet.

Keep the roadmap boundaries: 0.6.1 owns the controlled loop, authority and budgets; 0.6.2 owns independent
outcome scoring; 0.6.3 owns fault/recovery evidence. The experiment informs those increments; it does
not make them implemented or released.

### Approved implementation assignments

The [updated roadmap](../ROADMAP.md) and [0.6.x release plan](releases/0.6.x-release-plan.md)
turn these findings into milestone acceptance criteria:

| Finding | Required milestone work |
| --- | --- |
| A normal finish can hide task failure | 0.6.1 separates execution status from unavailable task verification; 0.6.2 adds independent outcomes, CLI exit codes and matching typed SDK results. |
| Argument coercion can conceal a model error | 0.6.1 validates original calls at the host boundary; optional Pi integration blocks or explicitly records configured repairs and identifies that configuration. |
| A closed runtime may leave a host callback pending | 0.6.1 tracks host work, maps error/cancel events and retains interrupted-run evidence with transport/effect limits. |
| Conversation checkpoints omit state and budget counters | 0.6.3 adds compatible durable checkpoints, separate-process resume, remaining budgets, operation identity and tested crash/replay boundaries. |
| Advertised tool support did not produce structured calls | 0.6.1 adds explicit bounded preflight and truthful usage; offline validation stays offline and prose never becomes an implicit executable call. |
| Evidence does not establish a speed, cost or quality winner | 0.6.4 reports coverage/validity/usage limitations; 0.7.x owns qualified comparative orchestration. Optional integrations make deployed systems assessable, not intrinsically better. |

0.6.0 must first pass fresh-package and advertised runtime/TypeScript consumer verification and
be published. Every following milestone includes the complete relevant CLI, SDK and evidence path
and receives its own verified npm package release map and sequential milestone tag. This section
records implementation decisions; it does not alter the experiment's retained results or expand
what those results demonstrate.

## Use what exists today

The following is available in the **built, unreleased checkout**. The published packages do not yet
include these 0.6.0 additions. Use the source CLI as shown, or `akit` after linking this checkout:

```sh
bun packages/cli/bin/artemis.ts tools describe request_approval
bun packages/cli/bin/artemis.ts init agent-workflow --yes \
  --name harness-review --provider openai --model configured-model \
  --tools request_approval --expect-state approvals.requested --equals true \
  --output /tmp/harness-review.yaml
bun packages/cli/bin/artemis.ts scenario validate /tmp/harness-review.yaml
bun experiments/harness-comparison/sdk-example.mjs /tmp/harness-review.yaml
```

The [tested SDK example](../experiments/harness-comparison/sdk-example.mjs) performs a simulated
approval request, verifies that it is pending, checks permission denial and verifies detached input
state. Its central API call is:

```js
import { executeSimulatedTool, loadAgentWorkflow } from '@artemiskit/sdk';

const scenario = await loadAgentWorkflow('/tmp/harness-review.yaml');
const result = executeSimulatedTool({
  tool: 'request_approval',
  input: { reason: 'Review A17' },
  state: { documents: {}, records: {}, files: {}, workflow_state: {} },
  declaredTools: scenario.tools,
  policy: scenario.environment.policy,
});
if (result.status === 'succeeded') {
  console.log(result.state.workflow_state.approvals.status); // pending
  console.log(result.evidence); // bounded metadata; raw state is not retained evidence
}
```

`createModelClientTarget(client).turn(...)` is also available for a validated single model turn;
the experiment's native backend shows a complete example of correlating its tool calls and results.
`executeSimulatedTool` itself does not enforce cumulative run budgets.

For multi-turn comparison **today**, run the research CLI:

```sh
bun experiments/harness-comparison/run.mjs \
  --backends native,ai-sdk,pi,fx --cases artifact,approval,resume --repetitions 3 \
  --output /tmp/harness-comparison.json
```

An eventual production interface could be `akit run workflow.yaml --harness ai-sdk`, backed by a
session/event SDK interface. **That flag, workflow execution command path, and session API are
proposals, not implemented APIs.** The current `akit run` accepts legacy scenarios only.

## Validation and limits

- The original pack passed 192/192 checks, including a final repetition after adding the opt-in Pi
  hook that verified it leaves those cases unchanged.
- The coercion command exited 1 as expected: three unguarded Pi failures remain in the results;
  the strict variant passed. The live command exited 1 because all 48 task outcomes failed.
- `bun experiments/harness-comparison/verify-results.mjs` checks all saved coordinates, expected
  failures, restart phases, missing-usage handling and equal initial live message digests.
- `bunx biome check experiments/harness-comparison` passed for the experiment code and saved JSON.
  Generated JSON was formatted without changing its data. The CLI generation/validation and SDK
  example above were executed.
- The 0.6.0 production packages were not changed in this experiment. Its earlier 1,355-test validation
  remains documented separately; this turn does not claim a fresh full-workspace test run.
- No stock hosted-provider integration, production sandbox, adversarial isolation, concurrent
  scheduling, real approval wait/resume, compaction, multi-agent delegation, MCP, or mid-action crash
  consistency was qualified. There is no evidence here for a universal harness quality ranking.

An early transport calibration accidentally supplied an extra empty system entry to Pi; it was
corrected before the matched baseline and live runs. Final live input hashes match across all four
backends. Results include source file digests; the follow-up adds only its explicitly selected Pi
hook, preserving the unguarded configuration for comparison.

Upstream reference material: [AI SDK ToolLoopAgent](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent),
[Pi agent-core documentation](https://github.com/earendil-works/pi/tree/main/packages/agent),
[Pi argument validation](https://github.com/earendil-works/pi/blob/main/packages/ai/src/utils/validation.ts),
[fx embedded API and lifecycle](https://fx.sh/docs/lib/api).
Runtime claims above are grounded in the pinned experiment, not assumed from upstream main.
