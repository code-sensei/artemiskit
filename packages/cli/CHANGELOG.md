# @artemiskit/cli

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
  - @artemiskit/reports@0.3.0
  - @artemiskit/adapter-openai@0.1.12
  - @artemiskit/adapter-vercel-ai@0.1.12
  - @artemiskit/adapter-langchain@0.2.0
  - @artemiskit/adapter-deepagents@0.2.0

## 0.2.4

### Patch Changes

- 16604a6: ## New Features

  ### Validate Command

  New `artemiskit validate` command for validating scenario files without running them:

  - **YAML syntax validation** - Catches formatting errors
  - **Schema validation** - Validates against ArtemisKit schema using Zod
  - **Semantic validation** - Detects duplicate case IDs, undefined variables
  - **Warnings** - Identifies deprecated fields, missing descriptions, performance hints

  Options:

  - `--json` - Output results as JSON
  - `--strict` - Treat warnings as errors
  - `--quiet` - Only show errors
  - `--export junit` - Export to JUnit XML for CI integration

  ### JUnit XML Export

  Added JUnit XML export support for CI/CD integration with Jenkins, GitHub Actions, GitLab CI, and other systems:

  - `akit run scenarios/ --export junit` - Export run results
  - `akit redteam scenarios/chatbot.yaml --export junit` - Export security test results
  - `akit validate scenarios/ --export junit` - Export validation results

  JUnit reports include:

  - Test suite metadata (run ID, provider, model, success rate)
  - Individual test cases with pass/fail status
  - Failure details with matcher type and expected values
  - Timing information for each test

- Updated dependencies [16604a6]
  - @artemiskit/core@0.2.4
  - @artemiskit/reports@0.2.4
  - @artemiskit/adapter-openai@0.1.11
  - @artemiskit/adapter-vercel-ai@0.1.11
  - @artemiskit/redteam@0.2.4

## 0.2.3

### Patch Changes

- 37403aa: ## v0.2.3 - Cost Tracking & Compliance Features

  ### Cost Tracking

  - **Automatic cost estimation**: Run results now include estimated API costs based on token usage and model pricing data
  - **Cost display in output**: Summary output shows total tokens and estimated cost for each run
  - **`--budget` flag**: Set a maximum budget in USD for `run`, `redteam`, and `stress` commands - the command fails (exit code 1) if the estimated cost exceeds the budget

  ### History Enhancements

  - **`--show-cost` flag**: Display cost column and total in `history` command output
  - Cost data is stored with each run for historical tracking

  ### Markdown Export

  - **`--export markdown` flag**: Export run and redteam results to compliance-ready markdown format
  - **`--export-output` flag**: Specify custom output directory for exports (default: `./artemis-exports`)
  - Markdown reports include:
    - Summary table with pass/fail rates, latency, token usage, and cost metrics
    - Detailed results for failed test cases (run) or vulnerabilities found (redteam)
    - Configuration used for the run
    - Redaction summary (if enabled)
    - Recommendations for remediation (redteam)

  ### CI/CD Integration

  - Budget enforcement in pipelines: `akit run scenarios/ --ci --budget 5.00`
  - Cost tracking in CI summary output with `ARTEMISKIT_COST_USD` variable
  - Automatic markdown report generation for compliance documentation

- Updated dependencies [37403aa]
  - @artemiskit/core@0.2.3
  - @artemiskit/reports@0.2.3
  - @artemiskit/adapter-openai@0.1.10
  - @artemiskit/adapter-vercel-ai@0.1.10
  - @artemiskit/redteam@0.2.3

## 0.2.2

### Patch Changes

- d5ca7c6: Add baseline command and CI mode for regression detection

  ### New Features

  - **Baseline Command**: New `akit baseline` command with `set`, `list`, `get`, `remove` subcommands

    - Lookup by run ID (default) or scenario name (`--scenario` flag)
    - Store and manage baseline metrics for regression comparison

  - **CI Mode**: New `--ci` flag for machine-readable output

    - Outputs environment variable format for easy parsing
    - Auto-detects CI environments (GitHub Actions, GitLab CI, etc.)
    - Suppresses colors and spinners

  - **Summary Formats**: New `--summary` flag with `json`, `text`, `security` formats

    - JSON summary for pipeline parsing
    - Security summary for compliance reporting

  - **Regression Detection**: New `--baseline` and `--threshold` flags
    - Compare runs against saved baselines
    - Configurable regression threshold (default 5%)
    - Exit code 1 on regression detection

- Updated dependencies [d5ca7c6]
  - @artemiskit/core@0.2.2
  - @artemiskit/adapter-openai@0.1.9
  - @artemiskit/adapter-vercel-ai@0.1.9
  - @artemiskit/redteam@0.2.2
  - @artemiskit/reports@0.2.2

## 0.2.1

### Patch Changes

- fix: improve LLM grader compatibility with reasoning models

  - Remove temperature parameter from LLM grader (reasoning models like o1, o3, gpt-5-mini only support temperature=1)
  - Increase maxTokens from 200 to 1000 to accommodate reasoning models that use tokens for internal thinking
  - Improve grader prompt for stricter JSON-only output format
  - Add fallback parsing for malformed JSON responses
  - Add markdown code block stripping from grader responses
  - Add `modelFamily` configuration option to Azure OpenAI provider for correct parameter detection when deployment names differ from model names

- Updated dependencies
  - @artemiskit/core@0.2.1
  - @artemiskit/adapter-openai@0.1.8
  - @artemiskit/adapter-vercel-ai@0.1.8
  - @artemiskit/redteam@0.2.1
  - @artemiskit/reports@0.2.1

## 0.2.0

### Minor Changes

- d2c3835: ## v0.2.0 - Enhanced Evaluation Features

  ### CLI (`@artemiskit/cli`)

  #### New Features

  - **Multi-turn mutations**: Added `--mutations multi_turn` flag for red team testing with 4 built-in strategies:
    - `gradual_escalation`: Gradually intensifies requests over conversation turns
    - `context_switching`: Shifts topics to lower defenses before attack
    - `persona_building`: Establishes trust through roleplay
    - `distraction`: Uses side discussions to slip in harmful requests
  - **Custom multi-turn conversations**: Support for array prompts in red team scenarios (consistent with `run` command format). The last user message becomes the attack target, preceding messages form conversation context.
  - **Custom attacks**: Added `--custom-attacks` flag to load custom attack patterns from YAML files with template variables and variations.
  - **Encoding mutations**: Added `--mutations encoding` for obfuscation attacks (base64, ROT13, hex, unicode).
  - **Directory scanning**: Run all scenarios in a directory with `akit run scenarios/`
  - **Glob pattern matching**: Use patterns like `akit run scenarios/**/*.yaml`
  - **Parallel execution**: Added `--parallel` flag for concurrent scenario execution
  - **Scenario tags**: Filter scenarios with `--tags` flag

  ### Core (`@artemiskit/core`)

  #### New Features

  - **Combined matchers**: New `type: combined` expectation with `operator: and|or` for complex assertion logic
  - **`not_contains` expectation**: Negative containment check to ensure responses don't include specific text
  - **`similarity` expectation**: Semantic similarity matching with two modes:
    - Embedding-based: Uses vector embeddings for fast semantic comparison
    - LLM-based fallback: Uses LLM to evaluate semantic similarity when embeddings unavailable
    - Configurable threshold (default 0.75)
  - **`inline` expectation**: Safe expression-based custom matchers in YAML using JavaScript-like expressions (e.g., `response.length > 100`, `response.includes('hello')`)
  - **p90 latency metric**: Added p90 percentile to stress test latency metrics
  - **Token usage tracking**: Monitor token consumption per request in stress tests
  - **Cost estimation**: Estimate API costs with model pricing data

  ### Red Team (`@artemiskit/redteam`)

  #### New Features

  - **MultiTurnMutation class**: Full implementation with strategy support and custom conversation prefixes
  - **Custom attack loader**: Parse and load custom attack patterns from YAML
  - **Encoding mutation**: Obfuscate attack payloads using various encoding schemes
  - **CVSS-like severity scoring**: Detailed attack severity scoring with:
    - `CvssScore` interface with attack vector, complexity, impact metrics
    - `CvssCalculator` class for score calculation and aggregation
    - Predefined scores for all mutations and detection categories
    - Human-readable score descriptions and vector strings

  ### Reports (`@artemiskit/reports`)

  #### New Features

  - **Run comparison HTML report**: Visual diff between two runs showing:
    - Metrics overview with baseline vs current comparison
    - Change summary (regressions, improvements, unchanged)
    - Case-by-case comparison table with filtering
    - Side-by-side response comparison for each case
  - **Comparison JSON export**: Structured comparison data for programmatic use

  ### CLI Enhancements

  - **Compare command `--html` flag**: Generate HTML comparison report
  - **Compare command `--json` flag**: Generate JSON comparison data

  ### Documentation

  - Updated all CLI command documentation
  - Added comprehensive examples for custom multi-turn scenarios
  - Documented combined matchers and `not_contains` expectations
  - Added mutation strategy reference tables

### Patch Changes

- Updated dependencies [d2c3835]
  - @artemiskit/core@0.2.0
  - @artemiskit/redteam@0.2.0
  - @artemiskit/reports@0.2.0
  - @artemiskit/adapter-openai@0.1.7
  - @artemiskit/adapter-vercel-ai@0.1.7

## 0.1.8

### Patch Changes

- 27d7645: ### Fixed

  - Replaced `pino` logger with `consola` to fix Bun bundler compatibility issues. Some users experienced `ModuleNotFound: thread-stream/lib/worker.js` errors during installation due to pino's dynamic worker thread resolution that Bun's bundler cannot statically analyze.

  ### Changed

  - Logger implementation now uses `consola` internally. The public `Logger` class API remains unchanged - no code changes required for consumers.

  ### Removed

  - Removed `pino` and `pino-pretty` dependencies from `@artemiskit/core`.

- Updated dependencies [27d7645]
  - @artemiskit/core@0.1.6
  - @artemiskit/adapter-openai@0.1.6
  - @artemiskit/adapter-vercel-ai@0.1.6
  - @artemiskit/redteam@0.1.6
  - @artemiskit/reports@0.1.6

## 0.1.7

### Patch Changes

- @artemiskit/cli\*\* (patch)

  Enhanced CLI user experience and added comprehensive integration tests

  **UI Enhancements:**

  - Fixed table border alignment in compare and history commands (ANSI color codes no longer affect column widths)
  - Added progress bars, error display panels, and summary boxes
  - Added box-drawing tables with Unicode characters for structured output
  - Added TTY detection for graceful fallback in non-TTY/CI environments

  **Testing:**

  - Added 60+ integration tests for CLI commands (init, history, compare, report)
  - Added test helpers including mock LLM adapter and test utilities
  - Achieved 80%+ source file test coverage (155 total tests passing)

  **Documentation:**

  - Updated ROADMAP.md to mark v0.1.x as complete
  - Fixed docs to use correct YAML config format

## 0.1.6

### Patch Changes

- 6785df6: Enhanced CLI user experience and added integration tests

  - Fixed table border alignment in compare and history commands (ANSI color codes no longer affect column widths)
  - Added progress bars, error display panels, and summary boxes
  - Added box-drawing tables with Unicode characters for compare/history output
  - Added TTY detection for graceful fallback in non-TTY environments
  - Added 60+ integration tests for CLI commands (init, history, compare, report)
  - Achieved 80%+ source file test coverage

## 0.1.5

### Patch Changes

- Updated dependencies [8e10aaa]
  - @artemiskit/core@0.1.5
  - @artemiskit/adapter-openai@0.1.5
  - @artemiskit/adapter-vercel-ai@0.1.5
  - @artemiskit/redteam@0.1.5
  - @artemiskit/reports@0.1.5

## 0.1.4

### Patch Changes

- 367eb3b: fix: resolve npm install error caused by workspace:\* protocol

  Fixed an issue where `npm i -g @artemiskit/cli` would fail with
  "Unsupported URL Type workspace:_" error. The publish workflow now
  automatically replaces workspace:_ dependencies with actual version
  numbers before publishing to npm.

- Updated dependencies [367eb3b]
  - @artemiskit/adapter-openai@0.1.4
  - @artemiskit/adapter-vercel-ai@0.1.4
  - @artemiskit/core@0.1.4
  - @artemiskit/redteam@0.1.4
  - @artemiskit/reports@0.1.4

## 0.1.3

### Patch Changes

- 11ac4a7: Updated Package Documentations
- Updated dependencies [11ac4a7]
  - @artemiskit/adapter-openai@0.1.3
  - @artemiskit/adapter-vercel-ai@0.1.3
  - @artemiskit/core@0.1.3
  - @artemiskit/redteam@0.1.3
  - @artemiskit/reports@0.1.3

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
  - @artemiskit/adapter-openai@0.1.2
  - @artemiskit/adapter-vercel-ai@0.1.2
  - @artemiskit/core@0.1.2
  - @artemiskit/redteam@0.1.2
  - @artemiskit/reports@0.1.2

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
  - @artemiskit/adapter-openai@0.1.1
  - @artemiskit/adapter-vercel-ai@0.1.1
  - @artemiskit/core@0.1.1
  - @artemiskit/redteam@0.1.1
  - @artemiskit/reports@0.1.1
