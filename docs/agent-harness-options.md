# Agent harness options for ArtemisKit

Research date: 25 September 2026, after the 0.6.0 implementation and validation.
This initial architecture assessment is now followed by a
[matched experiment and final recommendations](agent-harness-experiment.md). No upstream project
was forked or adopted as a production runtime; pinned research dependencies live in an isolated
experiment package.

## Recommendation

Keep ArtemisKit responsible for scenario contracts, authority, environment isolation, independent
outcome checks, evidence, and comparison eligibility. Support selected third-party harnesses as
optional execution integrations and assessment targets. A customer should be able to assess both
the model and the particular harness/configuration deployed around it.

My recommended order is:

1. Finish the native controlled environment/loop in 0.6.1 using the new neutral contract. This gives
   ArtemisKit a small reference implementation with explicit controls.
2. Use **Vercel AI SDK** as the first additional TypeScript integration candidate because the repo
   already depends on it. Its loop controls are useful, but our existing adapter needs additional
   tool/event support before it can satisfy the new workflow contract.
3. Add **Pi agent-core** as the next TypeScript option, using the tested strict-argument hook.
   Prefer its core package over taking ownership of the entire coding CLI.
4. Keep **fx/libfx** experimental: tools and checkpoint restore worked, but host cleanup and
   provider transport require further qualification.
5. Add **Deep Agents/LangGraph** when testing long-running, stateful, delegated business workflows.
   Retain **OpenHands** for software-engineering assessments. Treat **Mastra** as customer-demand
   coverage rather than another mandatory runtime.

These priorities are engineering judgments informed by the repository and the follow-up experiment.
The trials establish integration behavior, not a winning harness for general task outcomes.

## Shortlist

| Candidate | Verified capabilities and license | Fit and integration decision |
| --- | --- | --- |
| Vercel AI SDK | TypeScript `ToolLoopAgent`, per-step configuration, stop conditions and abort/timeouts; Apache-2.0. [API](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent), [loop controls](https://ai-sdk.dev/docs/agents/loop-control), [license](https://github.com/vercel/ai/blob/main/LICENSE). | Closest existing dependency. Good first optional general tool-loop backend. Our policy executor must authorize tool callbacks; a loop stop condition alone is not a sandbox or an independent outcome check. |
| fx / libfx | Zig core with native Node and WASM embedding; host tools, events, cancellation and checkpoints. Apache-2.0; project labels itself experimental. [Project](https://fx.sh/), [embedding](https://fx.sh/docs/lib), [license](https://github.com/vercel-labs/fx/blob/main/LICENSE). | Promising compact embedded option and coding-agent assessment target. Pin the version and validate the SDK separately from the CLI. A tool-bridge probe passed locally; not yet a production integration. |
| Pi agent-core | TypeScript runtime, configurable model stream, tool preflight/postprocessing, events, cancellation and low-level loop APIs. MIT. The original repository redirects to `earendil-works/pi`; current package namespace differs from older tutorials. [Repository](https://github.com/earendil-works/pi), [core contract](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md), [package](https://github.com/earendil-works/pi/blob/main/packages/agent/package.json). | Strongest candidate if we want to customize or maintain a runtime fork in our existing language. Use preflight plus ArtemisKit tool enforcement. Pi explicitly does not supply an OS permission sandbox. |
| Deep Agents + LangGraph | General harness with context management, filesystem backends, subagents and human intervention; LangGraph persistence separates checkpoints from durable stores. OSS libraries use MIT. [Harness](https://docs.langchain.com/oss/javascript/deepagents/overview), [persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence), [Deep Agents license](https://github.com/langchain-ai/deepagentsjs/blob/main/LICENSE), [LangGraph license](https://github.com/langchain-ai/langgraphjs/blob/main/LICENSE). | Best fit in this shortlist for richer delegated/stateful business-agent assessments. More runtime behavior to identify and control; reset memory and checkpoint namespaces between assessment coordinates. Qualify the existing ArtemisKit adapter against current APIs. |
| OpenHands Software Agent SDK | Coding-focused SDK/Agent Server with ephemeral workspaces, Python implementation and TypeScript/REST clients. SDK MIT. [Source and boundaries](https://github.com/OpenHands/software-agent-sdk), [license](https://github.com/OpenHands/software-agent-sdk/blob/main/LICENSE). | Useful optional coding/repository task target. A server/process boundary adds integration overhead for our Bun toolkit; not my default for document, records, approval or communication workflows. |
| Mastra | TypeScript agents with tools/model selection. License is Apache-2.0 outside explicitly excluded enterprise directories. [Agents](https://mastra.ai/docs/agents/overview), [license boundaries](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md). | Useful for assessing customer applications built with Mastra. Broad framework adoption is not necessary to implement ArtemisKit's evidence contract; a wholesale fork also requires reviewing the enterprise-directory boundary. |

## What fx changes for this decision

The embedded API deliberately gives the host control over instructions and tools. It does not
automatically inherit the CLI's shell/filesystem tools or permission review. Host callbacks must
validate and authorize effects themselves. This maps well to our simulated tools and later
environment executor. Events must be consumed while a turn runs; waiting only for its result can
stall through backpressure. Cancellation also requires cooperative tool callbacks.
[Node SDK](https://fx.sh/docs/lib/node).

Provider independence needs precise wording. The CLI documents local/custom connections, while
the documented embedded `AgentOptions` uses a Gateway credential and host-controlled `fetch`.
Those are different integration surfaces. The published 0.0.11 code also exposes a restricted
Gateway/loopback URL override; that is not evidence of a general OpenAI-compatible transport.
We should verify direct-provider behavior or build a deliberate bridge before describing the
embedded SDK as a drop-in local-provider backend.
[Custom CLI connections](https://fx.sh/docs/configure-fx/custom-model-connections),
[SDK API](https://fx.sh/docs/lib/api), [published package](https://www.npmjs.com/package/libfx/v/0.0.11).

The CLI's default automatic permission review can make additional model calls. If evaluating that
CLI, retain reviewer identity, attempts, usage and decisions separately from the task agent; an
automatic reviewer is not our deterministic authority policy. For embedded use, enforce policy in
our host callbacks. [CLI permissions](https://fx.sh/docs/configure-fx/permissions).

The website and packaged README differ in some optional capabilities. Pinning and testing the
actual package matters more than assuming all current web examples match it. The documented
0.0.7-to-0.0.11 API migration is also evidence that compatibility maintenance is a real cost.
[Version compatibility](https://fx.sh/docs/lib#version-compatibility).

### Offline experiment performed

Downloaded `libfx@0.0.11` with `npm pack --ignore-scripts` into a temporary directory; no workspace
dependency or lockfile changes. Package SHA-1: `30dec14c1016c05d7b5649f36e023b8ec6d9f517`.
Used its packaged native addon with a fixture transport; no real credential or inference call.
The fixture produced a tool request followed by a final response.

| Check | Observed result |
| --- | --- |
| Bridge libfx tool descriptor to ArtemisKit `request_approval` | Executed successfully; final state records pending human approval |
| Remove required `workflow_state: write` permission | ArtemisKit returned denied and state stayed unchanged |
| Tool-call events | Start/end retained; start matched the requested call ID |
| Save checkpoint | Nonempty checkpoint produced |
| Already-aborted prompt | Returned cancelled; no additional model request |
| Runtime | Passed under Bun 1.3.10 and Node 24.18.0 with the native backend |

The Node probe used a separate temporary Node-targeted build of the workflow primitives. Importing
ArtemisKit's existing Bun-targeted full bundle directly into Node failed; this experiment does not
certify Node support for the published ArtemisKit package. Bun used the normal core build.
Probe retained at `/tmp/artemis-harness-research.9XRBHI/probe.mjs` on this machine.

This establishes an integration seam, not model quality, concurrent safety, crash recovery,
checkpoint restoration, WASM compatibility, adversarial isolation or hard spend enforcement.
The subsequent matched experiment covers the native reference, AI SDK, Pi and fx. Deep Agents,
OpenHands and Mastra remain documentation/source review only.

## Architecture and comparison rules

Use two explicit assessment modes. In a controlled model trial, ArtemisKit supplies the same
loop, tools, fixtures and policy to each model. In a deployed-agent trial, assess the customer's
actual harness, prompts, memory, tools and environment as a complete system. Record which mode
was used; changing a harness changes the assessed system.

The new `AgentTarget` is a single-turn model boundary. A full external harness can execute several
model/tool turns inside one call, so wrapping its final text in `ModelClient` would hide actions,
retries and failures. Add a separate session/event integration contract when introducing these
backends; do not pretend full harnesses already satisfy the new turn contract.

For each integration, require declared tool allowlists; host-enforced authority; fresh state;
explicit total action/token/time ceilings; cancellation with documented transport limits;
stable tool IDs and event order; redaction before retention; and independently observed final
state/artifacts. Record harness version/commit, configuration digest, prompt/skill/MCP identities,
provider/model identities, retries, compaction, delegated work and unavailable measurements.

The same model in fx, Pi and Deep Agents can receive different prompts, context handling, tools
and retries. Publish those as different configurations. Multiple options are valuable because
ArtemisKit can expose the effect of those choices; they should not silently share one baseline.

Repository inspection also found that `adapter-vercel-ai` currently calls `generateText` without
forwarding declared tools, and `adapter-deepagents` uses a generic invoke/run/execute wrapper.
Their existence reduces starting work but does not prove current upstream harness compatibility.
No adjacent adapter refactor was included in the 0.6.0 implementation.

## When a fork is worthwhile

The first choice is a pinned adapter using public hooks: the fx experiment needed no upstream
modification. If a requirement cannot be enforced or observed through those hooks, keep a small,
versioned patch set with upstream synchronization and conformance tests.

For **fx**, plausible fork work is a supported direct-provider SDK transport, per-model-request
policy/budget interception, configurable retry policy, and complete attempt/usage/event exports.
First confirm the gap against a pinned source revision; tool authorization already belongs in the
host and does not justify a fork by itself. Its Zig/native build and cross-platform assets would
be a new maintenance obligation.

For **Pi**, a focused agent-core fork is a better language fit if extensive runtime changes become
necessary. Its preflight and stream hooks may avoid most patches. For **Deep Agents**, try custom
backends/middleware before forking; they are designed extension points. State-backed files are
useful, while a local shell backend is explicitly not isolation.
[Backend extension and isolation boundaries](https://docs.langchain.com/oss/javascript/deepagents/backends).

For any redistributed fork, retain upstream license/notices and identify our changes; review
dependencies and separately licensed components as well as the root license. A new maintained
fork should earn its cost through a demonstrated control or evidence requirement.

## Matched experiment completed; remaining qualification

The [executed pack](agent-harness-experiment.md) includes 192 original fixture coordinates, 24
coercion follow-up coordinates, and 48 local-model task coordinates. It retains the Pi coercion
failures and the model's failure to produce structured tool calls. The tested Pi remedy uses a public
hook; no fork was needed. Before production adoption, qualify stock provider paths, transport
cancellation, event/error coverage and broader workloads with models that pass a tool-call preflight.
