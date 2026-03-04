# @artemiskit/adapter-vercel-ai

## 0.1.12

### Patch Changes

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

- Updated dependencies
  - @artemiskit/core@0.3.0

## 0.1.11

### Patch Changes

- Updated dependencies [16604a6]
  - @artemiskit/core@0.2.4

## 0.1.10

### Patch Changes

- Updated dependencies [37403aa]
  - @artemiskit/core@0.2.3

## 0.1.9

### Patch Changes

- Updated dependencies [d5ca7c6]
  - @artemiskit/core@0.2.2

## 0.1.8

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.2.1

## 0.1.7

### Patch Changes

- Updated dependencies [d2c3835]
  - @artemiskit/core@0.2.0

## 0.1.6

### Patch Changes

- Updated dependencies [27d7645]
  - @artemiskit/core@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [8e10aaa]
  - @artemiskit/core@0.1.5

## 0.1.4

### Patch Changes

- 367eb3b: fix: resolve npm install error caused by workspace:\* protocol

  Fixed an issue where `npm i -g @artemiskit/cli` would fail with
  "Unsupported URL Type workspace:_" error. The publish workflow now
  automatically replaces workspace:_ dependencies with actual version
  numbers before publishing to npm.

- Updated dependencies [367eb3b]
  - @artemiskit/core@0.1.4

## 0.1.3

### Patch Changes

- 11ac4a7: Updated Package Documentations
- Updated dependencies [11ac4a7]
  - @artemiskit/core@0.1.3

## 0.1.2

### Patch Changes

- 6350e5d: Initial release of ArtemisKit - LLM Evaluation Toolkit

  Features:

  - Scenario-based evaluation with YAML test definitions
  - Multiple expectation types: contains, exact, regex, fuzzy, llm_grader, json_schema
  - Red team security testing (injection, jailbreak, extraction, hallucination, PII)
  - Stress testing with configurable concurrency and latency metrics
  - PII/sensitive data redaction with built-in and custom patterns
  - Interactive HTML reports with run comparison
  - Multi-provider support: OpenAI, Azure OpenAI, Anthropic
  - Local and Supabase storage backends

- Updated dependencies [6350e5d]
  - @artemiskit/core@0.1.2

## 0.1.1

### Patch Changes

- 1200625: Initial release of ArtemisKit - LLM Evaluation Toolkit

  ArtemisKit is a comprehensive toolkit for testing, validating, and auditing LLM-powered applications.

  Features:

  - Scenario-based evaluation with YAML test definitions
  - Multiple expectation types: contains, exact, regex, fuzzy, llm_grader, json_schema
  - Red team security testing (injection, jailbreak, extraction, hallucination, PII disclosure)
  - Stress testing with configurable concurrency and detailed latency metrics
  - PII/sensitive data redaction with built-in and custom patterns
  - Interactive HTML reports with run comparison
  - Multi-provider support: OpenAI, Azure OpenAI, Anthropic
  - Local and Supabase storage backends
  - Run history tracking and comparison

  CLI Commands:

  - artemiskit run - Execute scenario-based evaluations
  - artemiskit redteam - Run adversarial security tests
  - artemiskit stress - Perform load testing
  - artemiskit report - Regenerate reports from manifests
  - artemiskit history - View past runs
  - artemiskit compare - Compare two runs
  - artemiskit init - Initialize configuration

- Updated dependencies [1200625]
  - @artemiskit/core@0.1.1
