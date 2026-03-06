# Changelog

All notable changes to ArtemisKit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-03-05

### Highlights

- **Programmatic SDK** (`@artemiskit/sdk`) - Full TypeScript/JavaScript SDK with Jest/Vitest integration
- **Guardian Mode** - Runtime AI protection with injection detection, PII filtering, and action validation
- **OWASP LLM Top 10 2025** - 7 new attack mutations aligned with OWASP security guidelines
- **Agentic Framework Adapters** - LangChain.js and DeepAgents.js testing support
- **Supabase Storage Enhancements** - Case results, baselines, and metrics history tables

### Added

#### SDK (`@artemiskit/sdk`)

- `createRunner()` - Factory for programmatic test execution
- `createGuardian()` - Factory for runtime AI protection
- Jest integration with `toPassEvaluation()` and `toBeSecure()` matchers
- Vitest integration with the same custom matchers
- Event emitters for progress tracking and callbacks
- Full TypeScript definitions with strict typing

#### Guardian Mode

- `guardian.protect()` - Wrap LLM clients with protection
- `guardian.validateInput()` - Validate user inputs before LLM calls
- `guardian.validateOutput()` - Validate LLM responses before returning
- `guardian.validateAction()` - Validate agent tool/function calls
- `guardian.classifyIntent()` - Classify user intent with risk scoring
- Prompt injection detection with pattern matching
- Role hijack and jailbreak detection
- PII detection and redaction (email, phone, SSN, API keys)
- Content filtering by category (violence, hate speech, illegal, etc.)
- Circuit breaker for automatic request blocking
- Rate limiting (per minute/hour/day)
- Cost limiting and tracking
- YAML-based policy configuration
- Real-time metrics collection

#### Red Team OWASP Mutations

- `bad-likert-judge` - Exploit evaluation capability (LLM01)
- `crescendo` - Multi-turn gradual escalation (LLM01)
- `deceptive-delight` - Positive framing bypass (LLM01)
- `output-injection` - XSS, SQLi, command injection (LLM05)
- `excessive-agency` - Unauthorized action claims (LLM06)
- `system-extraction` - System prompt leakage (LLM07)
- `hallucination-trap` - Confident fabrication triggers (LLM09)
- `--owasp` flag - Test by OWASP category (e.g., `--owasp LLM01,LLM05`)
- `--owasp-full` flag - Full OWASP compliance scan
- `--min-severity` flag - Filter attacks by severity level
- `--attack-config` flag - YAML-based attack configuration with fine-grained mutation control and OWASP category overrides

#### Agentic Framework Adapters

- `@artemiskit/adapter-langchain` - Test LangChain.js agents and chains
- `@artemiskit/adapter-deepagents` - Test DeepAgents.js agentic systems

#### Supabase Storage

- `case_results` table - Individual test case results with full details
- `baselines` table - Baseline runs for regression comparison
- `metrics_history` table - Aggregated daily metrics and trending
- Analytics query methods for trend analysis

### Changed

- CLI now uses SDK internally for consistent behavior
- Red team attack scoring uses CVSS-like severity ratings
- Reports include Guardian violation details when applicable

### Fixed

- Rate limiting edge cases in stress testing
- Multi-turn conversation state handling in red team tests

---

## [0.2.4] - 2026-02-28

### Added

- `validate` command - Validate scenarios without running them
- Multi-level validation (YAML syntax → schema → semantic checks)
- `--export junit` flag - JUnit XML export for CI platforms
- `--export markdown` flag - Markdown export for compliance documentation
- `--budget` flag - Fail run if cost exceeds threshold
- `--show-cost` flag - Show cost breakdown in history command
- GitHub Actions workflow template in documentation
- GitLab CI pipeline template in documentation

### Changed

- Cost tracking now visible by default in summaries
- Model pricing data expanded for common models

---

## [0.2.1] - 2026-02-15

### Added

- `baseline` command - CRUD for baseline runs (`set`, `list`, `get`, `remove`)
- `--ci` flag - Machine-readable output for CI pipelines
- `--summary` flag - Condensed output with format options (`json`, `text`, `security`)
- `--baseline` flag - Auto-compare against baseline when set
- `--threshold` flag - Configurable regression threshold (default 5%)
- Regression detection with exit code 1 on score drops

---

## [0.2.0] - 2026-02-01

### Highlights

- **Enhanced Evaluation** - Directory scanning, parallel execution, similarity matching
- **Red Team Enhancements** - Encoding mutations, multi-turn attacks, custom YAML attacks
- **Interactive CLI** - Inquirer-based prompts for guided usage
- **Improved Reports** - Collapsible sections, filtering, search

### Added

#### Scenarios

- Directory scanning - Run all scenarios in a directory
- Glob pattern matching - `akit run scenarios/**/*.yaml`
- `--parallel` flag - Run scenarios concurrently
- `similarity` expectation - Semantic similarity matching
- `--tags` flag - Label and filter scenarios
- `combined` type - AND/OR logic between assertions
- `not_contains` expectation - Negative containment check
- `inline` type - Safe expression-based matchers

#### Reports

- Collapsible sections in HTML reports
- Filter by status (show only failures)
- Search functionality
- Run comparison view with `--html` and `--json` flags

#### Red Team

- `encoding` mutation - Base64, ROT13, hex, unicode obfuscation
- `multi_turn` mutation - Multi-message sequences with 4 strategies
- `--custom-attacks` flag - Define custom attacks in YAML format
- CVSS-like severity scoring

#### Stress Testing

- Ramp-up testing with gradual load increase
- Token usage tracking per request
- Cost estimation with model pricing data
- p90 latency metric

#### CLI

- `--interactive` flag - Inquirer-based user prompts
- Scenario selection when no path given
- Provider/model selection at runtime
- Confirmation dialogs for destructive actions
- `artemiskit init -i` - Guided configuration wizard

---

## [0.1.6] - 2026-01-15

### Added

- Initial public release
- `artemiskit run` - Scenario-based evaluation
- `artemiskit redteam` - Security red team testing
- `artemiskit stress` - Load and stress testing
- `artemiskit report` - Report regeneration
- `artemiskit history` - View run history
- `artemiskit compare` - Compare two runs
- `artemiskit init` - Initialize configuration
- CLI alias `akit`
- YAML scenario files with multi-turn support
- Expectation types: `contains`, `exact`, `regex`, `fuzzy`, `llm_grader`, `json_schema`
- Red team attacks: injection, jailbreak, extraction, hallucination, PII
- Stress testing with latency metrics (avg, min, max, p50, p95, p99)
- OpenAI, Azure OpenAI, Anthropic, Vercel AI SDK providers
- HTML and JSON reports
- Local file storage
- Supabase cloud storage
- Built-in PII redaction
- Configuration source tracking

---

[0.3.0]: https://github.com/code-sensei/artemiskit/compare/v0.2.4...v0.3.0
[0.2.4]: https://github.com/code-sensei/artemiskit/compare/v0.2.1...v0.2.4
[0.2.1]: https://github.com/code-sensei/artemiskit/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/code-sensei/artemiskit/compare/v0.1.6...v0.2.0
[0.1.6]: https://github.com/code-sensei/artemiskit/releases/tag/v0.1.6
