# Changelog

All notable changes to ArtemisKit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.3] - 2026-03-18

### Highlights

- **Guardian Security Hardening** - Critical security fixes for streaming and prompt injection detection
- **Programmatic Scenario Builders** - Type-safe fluent APIs for building scenarios
- **Type Contracts** - Strict type contracts for safe SDK usage

### Added

#### SDK (`@artemiskit/sdk`)

- `ScenarioBuilder` - Fluent API for building scenarios programmatically
- `TestCaseBuilder` - Fluent API for building test cases with expectations
- `createScenario()` and `createTestCase()` factory functions
- `shouldBlockViolation` callback for mode-aware per-violation blocking decisions
- `addedCases`/`removedCases` fields in comparison results

### Fixed

- **Security**: Streaming now throws on violations instead of bypassing protections
- **Security**: Hardened `parseResponse` to detect multiple JSON candidates as potential prompt injection
- Case-insensitive pattern matching in guardrails
- Lint warnings in semantic validator

### Changed

- Added `circuit_breaker` to GuardrailType for type safety

---

## [0.3.2] - 2026-03-12

### Highlights

- **SDK Parity Methods** - `kit.validate()` and `kit.compare()` for programmatic workflow
- **Guardian Mode Normalization** - Canonical modes with deprecation warnings for legacy names
- **Semantic Validation** - LLM-as-judge pattern as default content validation strategy

### Added

#### SDK (`@artemiskit/sdk`)

- `kit.validate()` - Validate scenario files without execution (pre-flight checks for CI/CD)
- `kit.compare()` - Compare two test runs for regression detection
- `SemanticValidator` class - LLM-based content analysis
- `createSemanticValidator()` factory function
- `normalizeGuardianMode()` utility for mode conversion

#### Guardian Mode

- Canonical modes: `observe`, `selective`, `strict`
- Deprecation warnings for legacy modes (`testing`, `guardian`, `hybrid`)
- Content validation strategies: `semantic`, `pattern`, `hybrid`, `off`
- Configurable semantic threshold (0-1)
- Input and output validation with LLM-as-judge

### Changed

- Default content validation strategy changed from `pattern` to `semantic`
- Guardian now requires `llmClient` for semantic validation

---

## [0.3.1] - 2026-03-06

### Highlights

- **Agent-Specific Mutations** - 4 new mutations targeting agentic AI vulnerabilities (LLM01, LLM08)
- **Dual Detection Modes** - Trace-based and response-based detection for agent attacks

### Added

#### Red Team Agent Mutations (`@artemiskit/redteam`)

- `agent-confusion` - Tests if agents can be confused about their identity, role, or capabilities
- `tool-abuse` - Tests if agents can be manipulated into misusing tools inappropriately
- `memory-poisoning` - Tests if agent memory/context can be corrupted with malicious data
- `chain-manipulation` - Tests if malicious instructions can propagate through agent chains
- `--agent-detection` CLI flag - Choose detection mode (`trace` or `response`)
- Dual detection strategies for trace-based and response-based analysis
- OWASP LLM01 (Prompt Injection) and LLM08 (Excessive Agency) coverage
- 110 new unit tests for agent mutations

### Changed

- Enhanced `AgentMutationDetector` with unified detection interface
- Red team results now include agent-specific vulnerability metrics

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

[0.3.3]: https://github.com/code-sensei/artemiskit/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/code-sensei/artemiskit/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/code-sensei/artemiskit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/code-sensei/artemiskit/compare/v0.2.4...v0.3.0
[0.2.4]: https://github.com/code-sensei/artemiskit/compare/v0.2.1...v0.2.4
[0.2.1]: https://github.com/code-sensei/artemiskit/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/code-sensei/artemiskit/compare/v0.1.6...v0.2.0
[0.1.6]: https://github.com/code-sensei/artemiskit/releases/tag/v0.1.6
