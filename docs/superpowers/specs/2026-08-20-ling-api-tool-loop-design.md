# Ling API and Tool-Loop Evaluation Design

## Goal

Make Ling-3.0-Flash and Ling-3.0-Tiny first-class, publicly documented ArtemisKit providers, and add a provider-neutral, safe tool-loop evaluator so their agentic API behavior can be measured reproducibly.

## Scope

This work covers the Ant Ling Studio API only. Local Tiny deployment, hardware measurements, and local-inference runtime compatibility are intentionally deferred to a separate report and implementation effort.

The public contribution includes source code, sanitised fixture scenarios, documentation, tests, and report templates. It excludes API keys, `.env` files, private prompts, production tools, and authenticated run artifacts.

## Architecture

### Native Ling adapter

Add `@artemiskit/adapter-ling` as a workspace package. It implements the existing `ModelClient` interface and calls Ant Ling's OpenAI-compatible endpoint at `https://api.ant-ling.com/v1` with `LING_API_KEY`.

The adapter supports the documented `Ling-3.0-flash` and `Ling-3.0-tiny` models, chat completions, streaming, JSON responses, tool calls, and API token usage. Ling-only request controls are typed at the adapter boundary:

- Flash thinking: `{ type: 'enabled' | 'disabled' }`.
- Web search: `enableSearch` and optional `searchOptions`.

Core remains provider-neutral. The core request type exposes a namespaced provider-options object; the Ling adapter validates and serialises only its `ling` namespace. This avoids leaking Ling settings into other adapters while keeping custom adapters possible.

The adapter reports usage returned by Ling. ArtemisKit must not estimate a USD cost for these beta runs. Manifests instead retain token totals and optional beta allocation metadata supplied by the caller.

### Tool-loop engine

Add a provider-neutral execution path to core. When a scenario defines tools and enables the loop, the runner:

1. sends the messages and allowed tool definitions to the model;
2. validates each returned tool call against the allowed tool name and JSON Schema;
3. invokes a safe tool executor;
4. appends a `tool` message containing the result or controlled tool error;
5. repeats until the model returns a final answer or the loop reaches a guardrail;
6. stores a redacted, structured trace in the case result.

The CLI uses deterministic YAML fixture tools only. Fixtures map defined input patterns to static JSON/text outputs and cannot invoke shell commands, browsers, filesystems, or networks. The SDK may receive a caller-supplied executor for real application tools, but ArtemisKit never discovers or invokes a tool without that executor being explicitly supplied.

Loop guardrails are mandatory: allowed-tool enforcement, argument schema validation, maximum steps, total timeout, duplicate-call detection, bounded tool-result size, and clear terminal outcomes for tool failure, malformed arguments, and loop exhaustion.

### Scenario format and evaluation

Extend the scenario schema with typed tool definitions, deterministic fixture definitions, and a `toolLoop` policy. Existing scenarios remain valid and retain their current one-shot behavior.

Add a tool-trace expectation that checks ordered or unordered calls, required and forbidden tools, argument expectations, maximum calls, and final outcome. It composes with current expectations so a case can require both a valid tool sequence and a JSON-valid final answer.

### Benchmark pack

Add a public, sanitised Ling benchmark directory with separate tags for `flash`, `tiny`, `thinking`, `tool-loop`, `long-context`, `structured-output`, `redteam`, and `stress`.

The suite measures:

- instruction following and strict JSON output for both models;
- compact high-frequency extraction and classification for Tiny;
- Flash thinking enabled versus disabled;
- Flash long-context retrieval and conflicting-instruction behavior;
- deterministic multi-step tool selection, arguments, recovery, and final answers;
- bounded red-team resistance and load behavior;
- API request and response compatibility through mocked tests, plus opt-in live smoke tests only when `LING_API_KEY` is set.

Search is covered with deterministic request-contract tests. Live web-search evaluation remains optional because changing external search results cannot support stable content assertions.

## Public API and safety boundaries

- `ling` is a first-class provider; its API key is read from `LING_API_KEY` or explicit provider config.
- `ling` defaults to the Studio API endpoint, but allows an explicit base URL for controlled testing.
- Live tests are skipped unless explicitly enabled and a key is present. Their output must redact prompts/responses according to the test configuration and never print credentials.
- The default reporter shows Ling token usage but labels cost as unavailable unless explicit non-beta pricing is configured.
- No default tool executor performs external side effects.

## Acceptance criteria

1. A user can configure `provider: ling` and run Flash or Tiny using only `LING_API_KEY`.
2. Flash thinking and search settings are type-checked, serialised correctly, and tested without a live key.
3. API token usage is persisted in run, stress, and report artifacts without an invented Ling USD estimate.
4. YAML fixture-tool scenarios execute multi-step calls, preserve a trace, and enforce all loop guardrails.
5. SDK users can supply an explicit executor; missing executors fail safely before side effects.
6. Tool-trace assertions identify wrong tool selection, invalid arguments, forbidden calls, excessive calls, failed recovery, and invalid final output.
7. The public benchmark pack runs against both Ling models with one documented command per suite.
8. Unit, integration, typecheck, lint, build, and opt-in live smoke validations are documented and pass at the appropriate gate.
9. No secret, live artifact, or unredacted sensitive fixture is included in Git history.

## Delivery order

1. Native provider contract, adapter package, registration, and documentation.
2. Tool-loop types, trace artifacts, safe executors, and SDK executor contract.
3. YAML parsing, CLI wiring, fixture tools, and trace expectations.
4. Ling benchmark scenarios, reports, and opt-in live smoke coverage.
5. Full validation, diff review, local atomic commits, and a separate explicit approval gate before pushing to GitHub.

## Non-goals

- Local Ling Tiny deployment or local-performance claims.
- Arbitrary YAML-driven shell, browser, file, database, or network tools.
- Automatic publishing, pushing, releases, deployments, or contacting Ant Ling.
- Changing existing provider behavior except where provider-neutral tool-loop types are required.
