# @artemiskit/cli

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
