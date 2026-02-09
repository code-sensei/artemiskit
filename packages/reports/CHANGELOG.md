# @artemiskit/reports

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

## 0.2.2

### Patch Changes

- Updated dependencies [d5ca7c6]
  - @artemiskit/core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies
  - @artemiskit/core@0.2.1

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
