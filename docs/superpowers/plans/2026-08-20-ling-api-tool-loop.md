# Ling API and Tool-Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Ling Studio API support and a safe, provider-neutral tool-loop evaluator, then ship public Flash/Tiny benchmark scenarios and documentation.

**Architecture:** `@artemiskit/adapter-ling` owns Ling-specific authentication, model metadata, and request fields. Core owns provider-neutral tool definitions, guarded loop execution, trace artifacts, fixture execution, and trace assertions. The CLI exposes the capability through existing scenario/config paths; the SDK exposes a caller-supplied executor for real tools.

**Tech Stack:** Bun workspaces, TypeScript strict mode, Zod scenario schemas, OpenAI Node SDK, AJV JSON Schema validation, Commander, Bun test, Biome.

---

## File map

- Create `packages/adapters/ling/`: Ling SDK package, client, types, tests, README, and changelog.
- Modify `packages/core/src/adapters/types.ts`, `registry.ts`, `scenario/schema.ts`, `runner/*`, `artifacts/*`, and `evaluators/*`: provider contract, safe tool-loop engine, artifacts, and assertions.
- Create `packages/core/src/tools/`: shared tool schema validation, fixture executor, and loop types.
- Modify `packages/cli/src/adapters.ts`, `config/schema.ts`, and `utils/adapter.ts`: Ling registration and config resolution.
- Modify `packages/sdk/src/*`: explicit SDK tool executor and tool-loop options.
- Create `examples/11-ling-api/`: safe public scenarios, fixture data, an opt-in smoke script, and report template.
- Modify `docs-content/`: provider, scenario, and benchmark documentation.

### Task 1: Establish a reproducible baseline and provider contract

**Files:**
- Modify: `packages/core/src/adapters/types.ts`
- Modify: `packages/core/src/adapters/registry.ts`
- Modify: `packages/core/src/scenario/schema.ts`
- Modify: `packages/cli/src/config/schema.ts`
- Modify: `packages/cli/src/utils/adapter.ts`
- Test: `packages/core/src/adapters/types.test.ts` (create)
- Test: `packages/cli/src/__tests__/integration/config.test.ts`

- [ ] **Step 1: Capture the pre-change baseline**

Run: `bun run build && bun test && bun run typecheck && bun run lint`

Expected: build/test/typecheck pass; record the existing Biome warnings separately if they remain.

- [ ] **Step 2: Write failing provider-contract tests**

Create tests that require `ling` to be accepted by provider config and that assert Ling-only settings survive YAML parsing:

```ts
const scenario = parseScenarioString(`
name: ling-contract
provider: ling
model: Ling-3.0-flash
providerConfig:
  apiKey: \${LING_API_KEY}
  thinking: { type: enabled }
  enableSearch: true
cases:
  - id: hello
    prompt: hello
    expected: { type: contains, values: [hello] }
`);

expect(scenario.provider).toBe('ling');
expect(scenario.providerConfig?.thinking).toEqual({ type: 'enabled' });
```

- [ ] **Step 3: Run the focused tests and confirm failure**

Run: `bun test packages/core/src/adapters/types.test.ts packages/core/src/scenario/parser.test.ts`

Expected: failure because `ling`, `thinking`, and `enableSearch` are not accepted.

- [ ] **Step 4: Add the provider-neutral and Ling configuration types**

In `packages/core/src/adapters/types.ts`, add `ling` once to `ProviderType`, add a typed namespaced request extension, and add a Ling config interface:

```ts
export interface LingRequestOptions {
  thinking?: { type: 'enabled' | 'disabled' };
  enableSearch?: boolean;
  searchOptions?: Record<string, unknown>;
}

export interface GenerateOptions {
  // existing fields
  providerOptions?: { ling?: LingRequestOptions };
}

export interface LingAdapterConfig extends BaseAdapterConfig {
  provider: 'ling';
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: 'Ling-3.0-flash' | 'Ling-3.0-tiny' | string;
  thinking?: LingRequestOptions['thinking'];
  enableSearch?: boolean;
  searchOptions?: Record<string, unknown>;
}
```

Mirror only serialisable Ling fields in the Zod provider config schemas. Do not add a generic unvalidated `Record<string, unknown>` to scenario provider config.

- [ ] **Step 5: Add Ling config resolution without changing other providers**

Add a `case 'ling'` branch in `buildAdapterConfig()` that resolves `apiKey` from scenario config, config file, then `process.env.LING_API_KEY`; resolves `baseUrl` to `https://api.ant-ling.com/v1`; and writes `provider: 'ling'` plus the actual resolved model/base URL into `ResolvedConfig`.

The generated adapter config must be:

```ts
{
  provider: 'ling',
  apiKey: resolvedApiKey.value,
  baseUrl: resolvedBaseUrl.value ?? 'https://api.ant-ling.com/v1',
  defaultModel: resolvedModel.value,
  thinking: scenarioConfig?.thinking ?? fileProviderConfig?.thinking,
  enableSearch: scenarioConfig?.enableSearch ?? fileProviderConfig?.enableSearch,
  searchOptions: scenarioConfig?.searchOptions ?? fileProviderConfig?.searchOptions,
}
```

- [ ] **Step 6: Verify contract behavior**

Run: `bun test packages/core/src/adapters/types.test.ts packages/core/src/scenario/parser.test.ts packages/cli/src/__tests__/integration/config.test.ts`

Expected: all focused tests pass and existing provider parsing remains unchanged.

- [ ] **Step 7: Commit the contract unit**

Run:

```bash
git add packages/core/src/adapters/types.ts packages/core/src/adapters/registry.ts packages/core/src/scenario/schema.ts packages/cli/src/config/schema.ts packages/cli/src/utils/adapter.ts packages/core/src/adapters/types.test.ts packages/cli/src/__tests__/integration/config.test.ts
git commit -m "feat: add Ling provider configuration contract"
```

### Task 2: Implement and test the native Ling adapter

**Files:**
- Create: `packages/adapters/ling/package.json`
- Create: `packages/adapters/ling/tsconfig.json`
- Create: `packages/adapters/ling/src/types.ts`
- Create: `packages/adapters/ling/src/client.ts`
- Create: `packages/adapters/ling/src/index.ts`
- Create: `packages/adapters/ling/src/client.test.ts`
- Create: `packages/adapters/ling/README.md`
- Create: `packages/adapters/ling/CHANGELOG.md`
- Modify: `packages/core/src/adapters/registry.ts`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/adapters.ts`
- Modify: `bun.lock`

- [ ] **Step 1: Write adapter request/response tests using a mocked OpenAI client**

Test the payload shape rather than a live service. Assert the client sends model, messages, tools, Ling thinking, search fields, and serialises no Ling field when absent:

```ts
expect(create).toHaveBeenCalledWith(expect.objectContaining({
  model: 'Ling-3.0-flash',
  tools: [weatherTool],
  thinking: { type: 'enabled' },
  enable_search: true,
  search_options: { max_results: 3 },
}));
```

Also test normal text, empty text with tool calls, token usage mapping, streaming chunks, API error propagation without secrets, and Tiny capability metadata.

- [ ] **Step 2: Run the adapter test and confirm failure**

Run: `bun test packages/adapters/ling/src/client.test.ts`

Expected: failure because the package/client does not exist.

- [ ] **Step 3: Create the package and client**

Use `packages/adapters/openai` as the build/package convention. The client must instantiate the OpenAI SDK with the Ling key and base URL:

```ts
this.client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseUrl ?? 'https://api.ant-ling.com/v1',
  timeout: config.timeout ?? 60_000,
  maxRetries: config.maxRetries ?? 2,
});
```

In `generate()`, merge config defaults and request `providerOptions?.ling`, then call `chat.completions.create()` with:

```ts
thinking,
enable_search: enableSearch,
search_options: searchOptions,
tools: options.tools,
response_format: options.responseFormat,
```

Return normalised `ToolCall[]`, `finishReason`, text, API token usage, latency, and raw response. Do not use the OpenAI adapter's GPT-specific token parameter heuristic.

- [ ] **Step 4: Register the adapter**

Register `ling` in core's lazy registry and CLI's direct registry. Add `@artemiskit/adapter-ling: workspace:*` to CLI dependencies so bundled CLI use does not rely on dynamic imports.

- [ ] **Step 5: Run package and CLI integration tests**

Run:

```bash
bun test packages/adapters/ling/src/client.test.ts packages/cli/src/__tests__/integration/config.test.ts
bun run --filter '@artemiskit/adapter-ling' typecheck
bun run --filter '@artemiskit/adapter-ling' build
```

Expected: all pass; no network access occurs.

- [ ] **Step 6: Commit the native adapter**

Run:

```bash
git add packages/adapters/ling packages/core/src/adapters/registry.ts packages/cli/package.json packages/cli/src/adapters.ts bun.lock
git commit -m "feat: add native Ling API adapter"
```

### Task 3: Add safe tool-loop contracts, traces, and fixture execution

**Files:**
- Create: `packages/core/src/tools/types.ts`
- Create: `packages/core/src/tools/schema-validator.ts`
- Create: `packages/core/src/tools/fixture-executor.ts`
- Create: `packages/core/src/tools/index.ts`
- Create: `packages/core/src/tools/fixture-executor.test.ts`
- Create: `packages/core/src/tools/schema-validator.test.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/adapters/types.ts`
- Modify: `packages/core/src/artifacts/types.ts`
- Modify: `bun.lock`

- [ ] **Step 1: Write failing safety tests**

Cover unknown tool, invalid JSON, invalid schema, fixture match, fixture tool failure, result-size limit, duplicate-call limit, and missing SDK executor. The expected guarded result shape is:

```ts
expect(result).toEqual({
  status: 'error',
  error: { code: 'TOOL_ARGUMENTS_INVALID', message: expect.any(String) },
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `bun test packages/core/src/tools/fixture-executor.test.ts packages/core/src/tools/schema-validator.test.ts`

Expected: failure because the tools module does not exist.

- [ ] **Step 3: Add explicit tool and trace types**

Define `ToolDefinition`, `ToolLoopPolicy`, `ToolExecutor`, `ToolExecutionResult`, and `ToolTraceEntry`. Keep executor input/output JSON-safe:

```ts
export interface ToolExecutor {
  execute(call: ToolCall, context: { caseId: string; step: number }): Promise<ToolExecutionResult>;
}

export interface ToolTraceEntry {
  step: number;
  toolCall: ToolCall;
  result?: unknown;
  error?: { code: string; message: string };
  latencyMs: number;
}
```

Add `toolTrace?: ToolTraceEntry[]` and `toolLoop?: { status; steps; terminationReason }` to `CaseResult`.

- [ ] **Step 4: Add AJV-backed argument validation and deterministic fixtures**

Add `ajv` as an exact core runtime dependency. Compile each function JSON Schema once, validate parsed arguments, and return formatted AJV errors without echoing secrets.

Fixture definitions may return only static values or explicit controlled errors. Reject a fixture that declares command, URL, path, code, or environment fields. A valid fixture is:

```yaml
fixtures:
  get_weather:
    - when: { city: Lagos }
      result: { temperature_c: 28, condition: sunny }
```

- [ ] **Step 5: Run the focused tool-module tests**

Run: `bun test packages/core/src/tools/fixture-executor.test.ts packages/core/src/tools/schema-validator.test.ts`

Expected: all pass, including every denied execution path.

- [ ] **Step 6: Commit the safe tool foundation**

Run:

```bash
git add packages/core/package.json packages/core/src/tools packages/core/src/adapters/types.ts packages/core/src/artifacts/types.ts packages/core/src/index.ts bun.lock
git commit -m "feat: add safe tool execution contracts"
```

### Task 4: Execute guarded tool loops and evaluate traces

**Files:**
- Create: `packages/core/src/runner/tool-loop.ts`
- Create: `packages/core/src/runner/tool-loop.test.ts`
- Create: `packages/core/src/evaluators/tool-trace.ts`
- Create: `packages/core/src/evaluators/tool-trace.test.ts`
- Modify: `packages/core/src/runner/executor.ts`
- Modify: `packages/core/src/runner/types.ts`
- Modify: `packages/core/src/evaluators/index.ts`
- Modify: `packages/core/src/evaluators/types.ts`
- Modify: `packages/core/src/scenario/schema.ts`

- [ ] **Step 1: Add failing loop and trace-evaluator tests**

Test a two-call successful loop, malformed arguments, disallowed tool, fixture failure followed by recovery, maximum-step exhaustion, repeated identical calls, total timeout, and final-response evaluation after the last tool result.

Add a `tool_trace` expectation test such as:

```ts
expected: {
  type: 'tool_trace',
  requiredTools: ['lookup_customer', 'create_ticket'],
  forbiddenTools: ['delete_customer'],
  ordered: true,
  maxCalls: 2,
}
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `bun test packages/core/src/runner/tool-loop.test.ts packages/core/src/evaluators/tool-trace.test.ts`

Expected: failure because neither execution path nor evaluator exists.

- [ ] **Step 3: Extend the YAML schema conservatively**

Add optional top-level `tools`, `fixtures`, and `toolLoop` fields. Require `toolLoop.enabled: true` before execution. Default policy:

```ts
{ enabled: false, maxSteps: 5, timeoutMs: 60_000, maxToolResultBytes: 32_768, rejectDuplicateCalls: true }
```

Add `tool_trace` to the expected discriminated union. Reject unknown fields and reject fixture definitions for tools not declared in `tools`.

- [ ] **Step 4: Implement the loop in the runner**

`executeToolLoop()` must call `client.generate()` with messages/tools, validate each call, execute via the supplied executor, append:

```ts
{ role: 'tool', name: call.function.name, content: JSON.stringify(execution.result) }
```

It must terminate with an explicit reason: `completed`, `max_steps`, `timeout`, `duplicate_call`, `invalid_arguments`, `unknown_tool`, or `tool_error`. Never retry a side-effecting SDK executor automatically; retries apply only to the outer initial request before any tool call.

Update `executeCase()` to select the loop only when enabled and pass its trace in evaluator context.

- [ ] **Step 5: Implement trace evaluation**

`ToolTraceEvaluator` compares trace entries without requiring model text. It fails if a required tool is missing, a forbidden tool appears, order is wrong when requested, calls exceed `maxCalls`, or an argument expectation fails. It returns a details object containing only call names, step counts, and redacted argument summaries.

- [ ] **Step 6: Verify core behavior**

Run:

```bash
bun test packages/core/src/runner/tool-loop.test.ts packages/core/src/evaluators/tool-trace.test.ts packages/core/src/scenario/parser.test.ts
bun run --filter '@artemiskit/core' typecheck
```

Expected: all pass and legacy one-shot case tests remain green.

- [ ] **Step 7: Commit the loop behavior**

Run:

```bash
git add packages/core/src/runner packages/core/src/evaluators packages/core/src/scenario/schema.ts
git commit -m "feat: execute and evaluate guarded tool loops"
```

### Task 5: Wire tool loops through the CLI and SDK

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Modify: `packages/sdk/src/artemiskit.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/types-only.ts`
- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/commands/stress.ts`
- Test: `packages/sdk/src/__tests__/artemiskit.test.ts`
- Test: `packages/cli/src/__tests__/integration/config.test.ts`

- [ ] **Step 1: Write failing SDK tests**

Require `kit.run()` to accept a supplied `toolExecutor` and prove it is called for an enabled loop. Prove missing executor fails safely and fixture execution is selected for CLI/scenario runs.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `bun test packages/sdk/src/__tests__/artemiskit.test.ts packages/cli/src/__tests__/integration/config.test.ts`

Expected: failure because `toolExecutor` is not part of SDK run options.

- [ ] **Step 3: Add SDK-only real executor support**

Add this field to SDK run options and forward it to core:

```ts
toolExecutor?: ToolExecutor;
```

When a scenario enables a loop but provides neither fixtures nor this executor, return an error result with `TOOL_EXECUTOR_REQUIRED`. Do not add a CLI flag for arbitrary executor modules.

- [ ] **Step 4: Preserve safety in stress and red-team commands**

Reject scenarios with `toolLoop.enabled` in `stress` and `redteam` until those commands have explicit semantics for multi-step transactions. Emit a descriptive error directing users to `akit run`. This prevents misleading request-rate metrics and repeated side effects.

- [ ] **Step 5: Verify SDK and CLI behavior**

Run:

```bash
bun test packages/sdk/src/__tests__/artemiskit.test.ts packages/cli/src/__tests__/integration/config.test.ts
bun run --filter '@artemiskit/sdk' typecheck
bun run --filter '@artemiskit/cli' typecheck
```

Expected: all pass; SDK executor remains opt-in.

- [ ] **Step 6: Commit SDK/CLI wiring**

Run:

```bash
git add packages/sdk packages/cli/src/commands/run.ts packages/cli/src/commands/stress.ts
git commit -m "feat: expose safe tool loops in SDK and CLI"
```

### Task 6: Add Ling benchmark scenarios and opt-in live verification

**Files:**
- Create: `examples/11-ling-api/README.md`
- Create: `examples/11-ling-api/artemis.config.example.yaml`
- Create: `examples/11-ling-api/scenarios/flash-core.yaml`
- Create: `examples/11-ling-api/scenarios/tiny-core.yaml`
- Create: `examples/11-ling-api/scenarios/flash-thinking.yaml`
- Create: `examples/11-ling-api/scenarios/flash-tool-loop.yaml`
- Create: `examples/11-ling-api/scenarios/flash-long-context.yaml`
- Create: `examples/11-ling-api/scenarios/shared-tools.yaml`
- Create: `examples/11-ling-api/scripts/live-smoke.ts`
- Create: `examples/11-ling-api/scripts/live-smoke.test.ts`
- Create: `examples/11-ling-api/report-template.md`

- [ ] **Step 1: Write tests for the public artifacts**

Parse every YAML file and test that the live smoke script exits successfully with a skip message when `LING_API_KEY` or `LING_LIVE_TESTS=1` is absent. The script must never print the key.

- [ ] **Step 2: Run the artifact tests and confirm failure**

Run: `bun test examples/11-ling-api/scripts/live-smoke.test.ts`

Expected: failure because the benchmark package does not exist.

- [ ] **Step 3: Add deterministic public scenarios**

Use tags to separate cost and capability domains. Use fixture tools only. Include a recovery case where `lookup_invoice` returns a controlled `NOT_FOUND` error and the model must call `search_invoices` before returning a final JSON response.

The example config must contain only:

```yaml
provider: ling
model: Ling-3.0-flash
providers:
  ling:
    apiKey: ${LING_API_KEY}
    baseUrl: https://api.ant-ling.com/v1
storage: { type: local, basePath: ./artemis-runs }
```

- [ ] **Step 4: Add an opt-in live smoke script**

Require both `LING_API_KEY` and `LING_LIVE_TESTS=1`. Make one Tiny JSON request, one Flash plain request, and one Flash fixture tool-loop request. Set redaction enabled; write manifests under ignored `artemis-runs/ling-live/`; return non-zero on an assertion failure; print model names, pass/fail, latency, and token counts only.

- [ ] **Step 5: Add the report template**

Require task ID, date/time zone, endpoint, model, settings, test-suite commit, token totals, latency percentiles, pass/fail counts, reproducible failure cases, and explicit distinction between measured results and vendor claims. Include a section titled `Beta allocation consumed (tokens)`; do not include a fabricated USD cost.

- [ ] **Step 6: Verify artifacts without credentials**

Run:

```bash
akit validate examples/11-ling-api/scenarios
bun test examples/11-ling-api/scripts/live-smoke.test.ts
LING_LIVE_TESTS=0 bun run examples/11-ling-api/scripts/live-smoke.ts
```

Expected: scenario validation passes; test passes; live script skips safely without a request.

- [ ] **Step 7: Run the authenticated smoke gate**

Run locally only, with the key inherited from ignored `.env`:

```bash
LING_LIVE_TESTS=1 bun run examples/11-ling-api/scripts/live-smoke.ts
```

Expected: Flash, Tiny, and tool-loop smoke checks pass; inspect the resulting manifest before sharing any result.

- [ ] **Step 8: Commit only sanitised assets**

Run:

```bash
git add examples/11-ling-api
git status --short
git commit -m "test: add Ling API benchmark scenarios"
```

Confirm `.env` and `artemis-runs/` are absent from staged files before committing.

### Task 7: Document and release the public feature

**Files:**
- Create: `docs-content/cli/providers/ling.mdx`
- Modify: `docs-content/cli/providers/index.mdx`
- Modify: `docs-content/concepts/scenarios.mdx`
- Modify: `docs-content/cli/commands/run.mdx`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `packages/cli/src/commands/init.ts`
- Test: `packages/cli/src/__tests__/integration/init-command.test.ts`

- [ ] **Step 1: Write failing init/documentation-adjacent tests**

Add an init test that verifies the generated `.env` template includes an empty `LING_API_KEY=` line and no literal secret. Add config-generation coverage for a `ling` wizard selection if the existing prompt supports it; otherwise document Ling in the static default config only and leave the wizard unchanged.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test packages/cli/src/__tests__/integration/init-command.test.ts`

Expected: failure because Ling is not included in init output.

- [ ] **Step 3: Document setup and tool safety**

The provider page must include the model IDs, `LING_API_KEY`, endpoint, Flash-only thinking/search controls, Tiny API use, expected token reporting, live-test opt-in, and the fact that CLI tools are fixtures only. The scenario page must show a complete fixture-tool-loop example and explain all terminal statuses.

- [ ] **Step 4: Update init safely**

Append exactly `LING_API_KEY=` to generated environment templates. Never write the current process environment value to files.

- [ ] **Step 5: Run docs-adjacent tests**

Run: `bun test packages/cli/src/__tests__/integration/init-command.test.ts && bun run lint`

Expected: init tests pass; lint introduces no new diagnostics.

- [ ] **Step 6: Commit documentation**

Run:

```bash
git add docs-content README.md CHANGELOG.md packages/cli/src/commands/init.ts packages/cli/src/__tests__/integration/init-command.test.ts
git commit -m "docs: document Ling provider and tool loops"
```

### Task 8: Perform the integrated release-quality verification

**Files:**
- Review: all staged implementation files and generated manifests only

- [ ] **Step 1: Run the complete offline validation suite**

Run:

```bash
bun run build
bun test
bun run typecheck
bun run lint
akit validate examples/11-ling-api/scenarios
```

Expected: build/test/typecheck pass. Report any existing lint warnings separately and ensure the change adds none.

- [ ] **Step 2: Run the opt-in live API validation**

Run:

```bash
LING_LIVE_TESTS=1 bun run examples/11-ling-api/scripts/live-smoke.ts
akit run examples/11-ling-api/scenarios/flash-core.yaml --redact --ci --summary json
akit run examples/11-ling-api/scenarios/tiny-core.yaml --redact --ci --summary json
akit run examples/11-ling-api/scenarios/flash-tool-loop.yaml --redact --ci --summary json
```

Expected: all requested calls complete, report token/latency metrics, and write only ignored artifacts. Do not run stress/red-team commands against tool-loop scenarios.

- [ ] **Step 3: Review secret and public-diff safety**

Run:

```bash
git status --short
git diff main...HEAD --check
git log --oneline main..HEAD
git diff main...HEAD -- . ':!.env' ':!artemis-runs/**' ':!artemis-output/**'
```

Expected: no secret-bearing content, no live manifests, no generated `dist/`, and only scoped Ling/tool-loop/docs changes.

- [ ] **Step 4: Request explicit push approval**

Report branch, local commits, validation outcomes, live-tested scope, consumed beta tokens, known limitations, and the complete diff summary. Ask separately for permission to push the reviewed commits to `origin`; do not push, release to npm, deploy docs, or contact Ant Ling without that approval.

## Plan self-review

- Spec coverage: Tasks 1–2 implement the native Ling provider; Tasks 3–5 implement safe provider-neutral tool loops; Task 6 supplies reproducible API benchmarks; Task 7 documents public use; Task 8 validates and preserves the no-push boundary.
- Placeholder scan: no task relies on unspecified behavior; tool safety, termination states, files, commands, and expected outcomes are explicit.
- Type consistency: `ToolExecutor`, `ToolTraceEntry`, `ToolLoopPolicy`, `providerOptions.ling`, and `tool_trace` are defined before they are used by subsequent tasks.
