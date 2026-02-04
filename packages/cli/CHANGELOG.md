# @artemiskit/cli

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
