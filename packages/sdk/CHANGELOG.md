# @artemiskit/sdk

## 0.3.2

### Patch Changes

- SDK Parity + Guardian Semantic Validation (v0.3.2)

  ## New Features

  ### SDK Parity Methods

  #### `kit.validate()` - Scenario Validation

  Validate scenario files without execution for CI/CD pre-flight checks.

  ```typescript
  const result = await kit.validate({
    scenario: "./scenarios/**/*.yaml",
    strict: false,
  });

  if (!result.valid) {
    console.error("Validation errors:", result.errors);
    process.exit(1);
  }
  ```

  **Returns:** `ValidationResult` with `valid`, `scenarios`, `errors`, and `warnings` fields.

  #### `kit.compare()` - Run Comparison

  Compare two test runs for regression detection.

  ```typescript
  const comparison = await kit.compare({
    baseline: "run_abc123",
    current: "run_xyz789",
    threshold: 0.05,
  });

  if (comparison.hasRegression) {
    console.error("Regression detected!", comparison.summary);
  }
  ```

  ### Guardian Mode Normalization

  Canonical modes replace legacy mode names with deprecation warnings:

  | Canonical Mode | Legacy Mode (Deprecated) | Behavior                     |
  | -------------- | ------------------------ | ---------------------------- |
  | `observe`      | `testing`                | Log only, never block        |
  | `selective`    | `hybrid`                 | Block high-confidence only   |
  | `strict`       | `guardian`               | Block all detected (default) |

  ```typescript
  // Using canonical modes (recommended)
  const guardian = createGuardian({ mode: "selective" });

  // Legacy modes still work but emit deprecation warnings
  const guardian = createGuardian({ mode: "testing" });
  // Console: [ArtemisKit Guardian] Mode 'testing' is deprecated. Use 'observe' instead.
  ```

  ### SemanticValidator - LLM-as-Judge Content Validation

  New `SemanticValidator` class for LLM-based content analysis, now the default validation strategy.

  ```typescript
  import { SemanticValidator, createSemanticValidator } from "@artemiskit/sdk";

  const validator = createSemanticValidator(llmClient, {
    strategy: "semantic",
    semanticThreshold: 0.9,
    categories: ["prompt_injection", "jailbreak", "pii_disclosure"],
  });

  // Validate input
  const inputResult = await validator.validateInput("User message here");
  if (inputResult.shouldBlock) {
    // Handle violation
  }

  // Validate output
  const outputResult = await validator.validateOutput("LLM response here");

  // Use as Guardian guardrail
  const guardrail = validator.asGuardrail("input");
  ```

  **Features:**

  - Input validation: Detects prompt injection, jailbreak attempts, role manipulation
  - Output validation: Detects PII disclosure, harmful content, system leakage
  - Configurable threshold: Control blocking sensitivity (0-1)
  - Fail-open behavior: On LLM errors, defaults to allowing (for availability)
  - Guardrail integration: Use `asGuardrail()` for Guardian integration

  ### Semantic Validation as Default

  Guardian now defaults to semantic (LLM-as-judge) content validation when an `llmClient` is provided.

  ```typescript
  const guardian = createGuardian({
    llmClient: myLLMClient, // Required for semantic validation
    contentValidation: {
      strategy: "semantic", // NEW DEFAULT (was 'pattern')
      semanticThreshold: 0.9,
    },
  });
  ```

  **Validation Strategies:**

  | Strategy   | Description                          | Requires LLM |
  | ---------- | ------------------------------------ | ------------ |
  | `semantic` | LLM-based content analysis (default) | Yes          |
  | `pattern`  | Regex/pattern matching only          | No           |
  | `hybrid`   | Both semantic and pattern            | Yes          |
  | `off`      | Disable content validation           | No           |

  ## New Exports

  ```typescript
  import {
    // Existing
    ArtemisKit,
    createGuardian,
    Guardian,

    // New in 0.3.2
    normalizeGuardianMode,
    SemanticValidator,
    createSemanticValidator,
  } from "@artemiskit/sdk";
  ```

  ## Type Changes

  ```typescript
  // New canonical modes
  type GuardianModeCanonical = "observe" | "selective" | "strict";

  // Legacy modes (deprecated)
  type GuardianModeLegacy = "testing" | "guardian" | "hybrid";

  // Union type for backwards compatibility
  type GuardianMode = GuardianModeCanonical | GuardianModeLegacy;

  // Validation categories
  type ValidationCategory =
    | "prompt_injection"
    | "jailbreak"
    | "pii_disclosure"
    | "role_manipulation"
    | "data_extraction"
    | "content_safety";
  ```

  ## Migration Notes

  ### Content Validation Default Change

  If you relied on pattern-only validation, explicitly set:

  ```typescript
  const guardian = createGuardian({
    contentValidation: { strategy: "pattern" },
  });
  ```

  ### Mode Name Updates (Optional)

  Legacy mode names continue to work but emit deprecation warnings:

  ```typescript
  // Before (still works)
  createGuardian({ mode: "testing" });

  // After (recommended)
  createGuardian({ mode: "observe" });
  ```

  ## Breaking Changes

  None. All changes are backwards compatible.

## 0.3.1

### Patch Changes

- 29e29d6: Fix npm install error caused by unresolved workspace:\* dependencies

  The published package contained workspace:\* protocol references for @artemiskit/adapter-deepagents and @artemiskit/adapter-langchain, which npm doesn't support. These are now properly resolved to version numbers during publish.

  Fix npm install error caused by unresolved workspace:\* dependencies

  The published package contained workspace:\* protocol references for @artemiskit/adapter-deepagents and @artemiskit/adapter-langchain, which npm doesn't support. These are now properly resolved to version numbers during publish.

## 0.3.0

### Minor Changes

- ## v0.3.0 - SDK, Guardian Mode & OWASP Compliance

  This major release delivers the full programmatic SDK, runtime protection with Guardian Mode, OWASP LLM Top 10 2025 attack vectors, and agentic framework adapters.

  ### Programmatic SDK (`@artemiskit/sdk`)

  The new SDK package provides a complete programmatic API for LLM evaluation:

  - **ArtemisKit class** with `run()`, `redteam()`, and `stress()` methods
  - **Jest integration** with custom matchers (`toPassAllCases`, `toHaveSuccessRate`, etc.)
  - **Vitest integration** with identical matchers
  - **Event handling** for real-time progress updates
  - **13 custom matchers** for run, red team, and stress test assertions

  ```typescript
  import { ArtemisKit } from "@artemiskit/sdk";
  import { jestMatchers } from "@artemiskit/sdk/jest";

  expect.extend(jestMatchers);

  const kit = new ArtemisKit({ provider: "openai", model: "gpt-4o" });
  const results = await kit.run({ scenario: "./tests.yaml" });
  expect(results).toPassAllCases();
  ```

  ### Guardian Mode (Runtime Protection)

  New Guardian Mode provides runtime protection for AI/LLM applications:

  - **Three operating modes**: `testing`, `guardian`, `hybrid`
  - **Prompt injection detection** and blocking
  - **PII detection & redaction** (email, SSN, phone, API keys)
  - **Action validation** for agent tool/function calls
  - **Intent classification** with risk assessment
  - **Circuit breaker** for automatic blocking on repeated violations
  - **Rate limiting** and **cost limiting**
  - **Custom policies** via TypeScript or YAML

  ```typescript
  import { createGuardian } from "@artemiskit/sdk/guardian";

  const guardian = createGuardian({ mode: "guardian", blockOnFailure: true });
  const protectedClient = guardian.protect(myLLMClient);
  ```

  ### OWASP LLM Top 10 2025 Attack Vectors

  New red team mutations aligned with OWASP LLM Top 10 2025:

  | Mutation             | OWASP | Description                    |
  | -------------------- | ----- | ------------------------------ |
  | `bad-likert-judge`   | LLM01 | Exploit evaluation capability  |
  | `crescendo`          | LLM01 | Multi-turn gradual escalation  |
  | `deceptive-delight`  | LLM01 | Positive framing bypass        |
  | `system-extraction`  | LLM07 | System prompt leakage          |
  | `output-injection`   | LLM05 | XSS, SQLi in output            |
  | `excessive-agency`   | LLM06 | Unauthorized action claims     |
  | `hallucination-trap` | LLM09 | Confident fabrication triggers |

  ```bash
  akit redteam scenario.yaml --owasp LLM01,LLM05
  akit redteam scenario.yaml --owasp-full
  ```

  ### Agentic Framework Adapters

  New adapters for testing agentic AI systems:

  **LangChain Adapter** (`@artemiskit/adapter-langchain`)

  - Test chains, agents, and runnables
  - Capture intermediate steps and tool usage
  - Support for LCEL, ReAct agents, RAG chains

  **DeepAgents Adapter** (`@artemiskit/adapter-deepagents`)

  - Test multi-agent systems and workflows
  - Capture agent traces and inter-agent messages
  - Support for sequential, parallel, and hierarchical workflows

  ```typescript
  import { createLangChainAdapter } from "@artemiskit/adapter-langchain";
  import { createDeepAgentsAdapter } from "@artemiskit/adapter-deepagents";

  const adapter = createLangChainAdapter(myChain, {
    captureIntermediateSteps: true,
  });
  const result = await adapter.generate({ prompt: "Test query" });
  ```

  ### Supabase Storage Enhancements

  Enhanced cloud storage capabilities:

  - **Analytics tables** for metrics tracking
  - **Case results table** for granular analysis
  - **Baseline management** for regression detection
  - **Trend analysis** queries

  ### Bug Fixes

  - **adapter-openai**: Use `max_completion_tokens` for newer OpenAI models (o1, o3, gpt-4.5)
  - **redteam**: Resolve TypeScript and flaky test issues in OWASP mutations
  - **adapters**: Fix TypeScript build errors for agentic adapters
  - **core**: Add `langchain` and `deepagents` to ProviderType union

  ### Examples

  New comprehensive examples organized by feature:

  - `examples/guardian/` - Guardian Mode examples (testing, guardian, hybrid modes)
  - `examples/sdk/` - SDK usage examples (Jest, Vitest, events)
  - `examples/adapters/` - Agentic adapter examples
  - `examples/owasp/` - OWASP LLM Top 10 test scenarios

  ### Documentation

  - Complete SDK documentation with API reference
  - Guardian Mode guide with all three modes explained
  - Agentic adapters documentation (LangChain, DeepAgents)
  - Test matchers reference for Jest/Vitest
  - OWASP LLM Top 10 testing scenarios

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.3.0
  - @artemiskit/redteam@0.3.0
