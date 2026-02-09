# ArtemisKit Roadmap

This document outlines the development roadmap for ArtemisKit, the open-source LLM evaluation toolkit.

**Current Version:** 0.2.4 (February 2026)  
**License:** Apache-2.0  
**Status:** Active Development

---

## Legend

- ✅ Completed
- 🚧 In Progress
- 📋 Planned
- 💡 Proposed (community input welcome)

---

## v0.1.x - Initial Public Release ✅

**Goal:** Stable, production-ready CLI toolkit with core evaluation capabilities.

**Status:** Complete (v0.1.6 released)

### CLI Commands

| Feature | Status | Description |
|---------|--------|-------------|
| `artemiskit run` | ✅ | Scenario-based evaluation |
| `artemiskit redteam` | ✅ | Security red team testing |
| `artemiskit stress` | ✅ | Load and stress testing |
| `artemiskit report` | ✅ | Report regeneration from manifests |
| `artemiskit history` | ✅ | View run history |
| `artemiskit compare` | ✅ | Compare two runs |
| `artemiskit init` | ✅ | Initialize configuration |
| CLI aliases (`akit`) | ✅ | Short command alias |

### Scenario Evaluation

| Feature | Status | Description |
|---------|--------|-------------|
| YAML scenario files | ✅ | Define tests in YAML format |
| Multi-turn conversations | ✅ | Support for conversation flows |
| `contains` expectation | ✅ | Check if response contains text |
| `exact` expectation | ✅ | Exact match checking |
| `regex` expectation | ✅ | Regular expression matching |
| `fuzzy` expectation | ✅ | Fuzzy string similarity matching |
| `llm_grader` expectation | ✅ | LLM-based response grading |
| `json_schema` expectation | ✅ | Validate JSON structure |
| Variable injection | ✅ | Template variables in prompts |
| Per-scenario config | ✅ | Override provider/model per scenario |

### Security Testing (Red Team)

| Feature | Status | Description |
|---------|--------|-------------|
| `injection` attacks | ✅ | Prompt injection testing |
| `jailbreak` attacks | ✅ | Jailbreak attempt testing |
| `extraction` attacks | ✅ | Data extraction probes |
| `hallucination` triggers | ✅ | Hallucination testing |
| `pii` disclosure tests | ✅ | PII leakage detection |
| Configurable iterations | ✅ | Set attacks per category |
| Vulnerability scoring | ✅ | Defense rate metrics |

### Stress Testing

| Feature | Status | Description |
|---------|--------|-------------|
| Concurrent requests | ✅ | Configurable concurrency |
| Iteration control | ✅ | Set total request count |
| Latency metrics | ✅ | avg, min, max, p50, p95, p99 |
| Success/failure tracking | ✅ | Track error rates |
| Throughput measurement | ✅ | Requests per second |

### Providers

| Provider | Status | Description |
|----------|--------|-------------|
| OpenAI | ✅ | Direct OpenAI API |
| OpenAI-compatible | ✅ | Ollama, vLLM, LM Studio etc |
| Azure OpenAI | ✅ | Azure-hosted OpenAI |
| Anthropic | ✅ | Claude models |
| Vercel AI SDK | ✅ | Multiple providers |
| Google AI | coming soon | Gemini models |
| Ollama | coming soon | Local model support |

### Reports

| Feature | Status | Description |
|---------|--------|-------------|
| HTML reports | ✅ | Interactive HTML dashboards |
| JSON manifests | ✅ | Machine-readable output |
| Resolved config display | ✅ | Show config with source tracking |
| Report regeneration | ✅ | Regenerate from saved manifests |

### Configuration

| Feature | Status | Description |
|---------|--------|-------------|
| `artemis.config.yaml` | ✅ | File-based configuration |
| Environment variables | ✅ | `OPENAI_API_KEY`, etc. |
| CLI flag overrides | ✅ | Runtime configuration |
| Config precedence | ✅ | CLI > Scenario > Config > Env > Default |
| Source tracking | ✅ | Track where each config value came from |

### Redaction

| Feature | Status | Description |
|---------|--------|-------------|
| Built-in patterns | ✅ | Email, phone, SSN, API keys, etc. |
| Custom regex patterns | ✅ | User-defined redaction rules |
| CLI flags (`--redact`) | ✅ | Enable redaction via CLI |
| Scenario-level config | ✅ | Configure redaction per scenario |
| Case-level config | ✅ | Override redaction per test case |
| Report indicators | ✅ | Visual badges for redacted content |
| Config precedence | ✅ | CLI > Case > Scenario > Config |

### Storage

| Feature | Status | Description |
|---------|--------|-------------|
| Local file storage | ✅ | Save to `artemis-runs/` |
| Run history | ✅ | List and filter past runs |
| Run comparison | ✅ | Compare two runs |
| Supabase storage | ✅ | Cloud storage adapter |

### CLI User Experience

| Feature | Status | Description |
|---------|--------|-------------|
| Color output (chalk) | ✅ | Colored terminal output |
| Spinners (ora) | ✅ | Progress indicators |
| Table formatting | ✅ | Structured result display |
| Progress bars | ✅ | Visual progress for long operations |
| Enhanced error display | ✅ | Formatted error messages with context |
| Summary panels | ✅ | Boxed summary sections |
| Box-drawing tables | ✅ | Unicode box-drawing for compare/history |
| TTY detection | ✅ | Graceful fallback for non-TTY environments |

### Documentation & Release

| Feature | Status | Description |
|---------|--------|-------------|
| README | ✅ | Project documentation |
| CONTRIBUTING guide | ✅ | Contribution guidelines |
| Provider docs | ✅ | Provider-specific setup guides |
| Storage docs | ✅ | Local and Supabase storage guides |
| CLI help text | ✅ | `--help` for all commands |
| npm package publish | ✅ | Published to npm registry |
| Changesets configured | ✅ | Version management ready |

### Testing & Quality

| Feature | Status | Description |
|---------|--------|-------------|
| Unit tests | ✅ | Core module tests (95+ tests) |
| Integration tests | ✅ | CLI command tests (60+ tests) |
| Test coverage | ✅ | 80%+ source file coverage |
| Linting (Biome) | ✅ | Code quality |
| TypeScript strict mode | ✅ | Type safety |

---

## v0.2.0 - Enhanced Evaluation ✅

**Goal:** Richer evaluation capabilities, programmatic SDK, and improved developer experience.

**Status:** Complete (v0.2.0 released February 2026)

### Enhanced Scenarios

| Feature | Status | Description |
|---------|--------|-------------|
| Directory scanning | ✅ | Run all scenarios in a directory |
| Glob pattern matching | ✅ | `akit run scenarios/**/*.yaml` |
| Parallel execution | ✅ | Run scenarios concurrently (`--parallel` flag) |
| `similarity` expectation | ✅ | Semantic similarity matching with `mode` (embedding/llm) and `embeddingModel` options |
| Scenario tags | ✅ | Label and filter scenarios (`--tags` flag) |
| Combined matchers | ✅ | `and`/`or` logic between assertions (`type: combined`) |
| `not_contains` expectation | ✅ | Negative containment check |
| Inline custom matchers | ✅ | Safe expression-based matchers in YAML (`type: inline`) |

### Enhanced Reports

| Feature | Status | Description |
|---------|--------|-------------|
| Collapsible sections | ✅ | Expand/collapse in HTML |
| Filter by status | ✅ | Show only failures |
| Search functionality | ✅ | Search through results |
| Run comparison view | ✅ | Visual diff between runs (`--html` and `--json` flags in compare command) |

### Red Team Enhancements

| Feature | Status | Description |
|---------|--------|-------------|
| `encoding` mutation | ✅ | Base64, ROT13, hex, unicode obfuscation (`--mutations encoding`) |
| `multi_turn` mutation | ✅ | Multi-message sequences with 4 strategies + custom conversations |
| Custom attack YAML | ✅ | Define custom attacks in YAML format (`--custom-attacks`) |
| Custom multi-turn | ✅ | Use array prompts for custom conversation flows (consistent with `run` command) |
| Severity scoring | ✅ | CVSS-like severity ratings with attack/detection scoring |

### Stress Test Enhancements

| Feature | Status | Description |
|---------|--------|-------------|
| Ramp-up testing | ✅ | Gradual load increase |
| Token usage tracking | ✅ | Monitor token consumption per request |
| Cost estimation | ✅ | Estimate API costs with model pricing data |
| p90 latency | ✅ | Added p90 percentile to latency metrics |

### CLI Interactivity (Phase 1)

| Feature | Status | Description |
|---------|--------|-------------|
| Interactive prompts | ✅ | Inquirer-based user prompts (`--interactive` flag) |
| Scenario selection | ✅ | Choose scenarios interactively when no path given |
| Provider selection | ✅ | Select provider/model at runtime in interactive mode |
| Confirmation dialogs | ✅ | Confirm destructive actions |
| Interactive init wizard | ✅ | Guided configuration setup (`artemiskit init -i`) |

### Metrics & Observability

> **Note:** Deferred to v1.0.0 for production-grade observability features.

| Feature | Status | Description |
|---------|--------|-------------|
| Prometheus metrics | 💡 Deferred | Export metrics in Prometheus format (moved to v1.0.0) |
| OpenTelemetry spans | 💡 Deferred | Distributed tracing support (moved to v1.0.0) |
| Custom metrics hooks | 💡 Deferred | User-defined metric collectors (moved to v1.0.0) |

---

## v0.2.x - Patch Releases

**Goal:** Incremental improvements for CI/CD integration, validation, and compliance documentation.

**Specifications:** See [dev-docs/v0.2.x/](dev-docs/v0.2.x/) for detailed technical specifications.

### v0.2.1 - Baseline & CI Essentials ✅

**Focus:** Regression detection and CI-friendly output.

**Status:** Complete (February 2026)

| Feature | Status | Description |
|---------|--------|-------------|
| `baseline` command | ✅ | CRUD for baseline runs (`set`, `list`, `get`, `remove`) |
| `--ci` flag | ✅ | Machine-readable output for CI pipelines |
| `--summary` flag | ✅ | Condensed output with format options (`json`, `text`, `security`) |
| `--baseline` flag | ✅ | Auto-compare against baseline when set |
| `--threshold` flag | ✅ | Configurable regression threshold (default 5%) |
| Regression detection | ✅ | Detect score drops from baseline with exit code 1 |

### v0.2.2 - Validation & Export ✅

**Focus:** Fail-fast validation and CI platform integration.

**Status:** Complete (February 2026) - Released as v0.2.4

| Feature | Status | Description |
|---------|--------|-------------|
| `validate` command | ✅ | Validate scenarios without running them |
| Multi-level validation | ✅ | YAML syntax → schema → semantic checks |
| `--export junit` | ✅ | JUnit XML export for CI platforms (run, redteam, validate) |
| GitHub Actions example | ✅ | Ready-to-use workflow template in docs |
| GitLab CI example | ✅ | Ready-to-use pipeline template in docs |

### v0.2.3 - Cost & Compliance ✅

**Focus:** Cost awareness and compliance documentation.

**Status:** Complete (February 2026)

| Feature | Status | Description |
|---------|--------|-------------|
| Cost tracking | ✅ | Track API costs (visible by default in summaries) |
| `--budget` flag | ✅ | Fail run if cost exceeds threshold |
| `--show-cost` flag | ✅ | Show cost breakdown in history command |
| `--export markdown` | ✅ | Markdown export for compliance documentation |
| Model pricing data | ✅ | Built-in pricing for common models |

### v0.2.4 - Combined Release ✅

**Focus:** Combined release of v0.2.2 and v0.2.3 features.

**Status:** Complete (February 2026)

All features from v0.2.2 and v0.2.3 are included in this release.

---

## v0.3.0 - SDK & Advanced Features

**Goal:** Programmatic SDK, OWASP LLM Top 10 compliance, local persistence, and advanced security testing.

**Specifications:** See [dev-docs/v0.3.x/](dev-docs/v0.3.x/) for detailed technical specifications.

### Enhanced Red Team Attack Vectors (OWASP LLM Top 10 2025)

> **Priority:** High - Core security feature aligned with OWASP LLM Top 10 2025

| Feature | Status | OWASP | Description |
|---------|--------|-------|-------------|
| `bad-likert-judge` mutation | 📋 | LLM01 | Exploit evaluation capability (60%+ success rate) |
| `crescendo` mutation | 📋 | LLM01 | Multi-turn gradual escalation attack |
| `deceptive-delight` mutation | 📋 | LLM01 | Positive framing bypass |
| `many-shot` mutation | 💡 | LLM01 | Long context window exploitation |
| `output-injection` mutation | 📋 | LLM05 | XSS, SQLi, command injection in output |
| `excessive-agency` mutation | 📋 | LLM06 | Unauthorized action claim testing |
| `system-extraction` mutation | 📋 | LLM07 | System prompt leakage techniques |
| `hallucination-trap` mutation | 📋 | LLM09 | Confident fabrication triggers |
| `rag-poisoning` mutation | 💡 | LLM08 | Context/retrieval manipulation |
| `--owasp` flag | 📋 | All | Test by OWASP category (e.g., `--owasp LLM01,LLM05`) |
| `--owasp-full` flag | 📋 | All | Full OWASP compliance scan |
| `--min-severity` flag | 📋 | All | Filter attacks by severity level |
| Attack configuration file | 📋 | All | YAML-based attack customization |

### Programmatic SDK (TypeScript/JavaScript)

| Feature | Status | Description |
|---------|--------|-------------|
| `@artemiskit/sdk` | 📋 | Import and use programmatically |
| Jest integration | 📋 | Use in Jest tests |
| Vitest integration | 📋 | Use in Vitest tests |
| Event emitters | 📋 | Progress callbacks |

### Local Storage

| Feature | Status | Description |
|---------|--------|-------------|
| SQLite backend | 💡 | Persistent local database |
| Enhanced history | 💡 | Rich history queries |
| Trend analysis | 💡 | Track metrics over time |
| Data export | 💡 | Export to CSV/JSON |

### Supabase Storage Enhancements

| Feature | Status | Description |
|---------|--------|-------------|
| Case results table | 📋 | Store individual test case results |
| Baselines table | 📋 | Baseline runs for regression comparison |
| Metrics history table | 📋 | Aggregated daily metrics and trending |

### Model Comparison

| Feature | Status | Description |
|---------|--------|-------------|
| A/B testing | 💡 | Compare models side-by-side |
| Statistical analysis | 💡 | Significance testing |
| Cost-performance charts | 💡 | Compare cost vs quality |
| Benchmark suites | 💡 | Standard evaluation sets |

### Additional Providers

| Feature | Status | Description |
|---------|--------|-------------|
| LLM Providers |
| OpenRouter | 💡 | Multi-provider routing |
| LiteLLM | 💡 | Unified model access |
| Generic REST | 💡 | Custom endpoints |
| AWS Bedrock | 💡 | Amazon models |
| Agentic Frameworks & Systems - Initial impl |
| LangChain Adapter | 📋 | Adapter for testing LangChain.js agents |
| DeepAgents.js Adapter | 📋 | Adapter for testing DeepAgents agentic systems |
| CrewAI Adapter | 💡 | Deferred to Python SDK release |

### Configuration

| Feature | Status | Description |
|---------|--------|-------------|
| Named profiles | 💡 | Switch between configs |
| Secrets management | 💡 | Secure credential storage |
| Config validation | 💡 | Schema validation |

### CLI Interactivity (Phase 2)

| Feature | Status | Description |
|---------|--------|-------------|
| Real-time TUI | 💡 | Ink-based reactive interface |
| Live progress dashboard | 💡 | Real-time test progress display |
| Keyboard navigation | 💡 | Navigate results with arrow keys |
| Interactive filtering | 💡 | Filter results in real-time |
| Watch mode | 💡 | Re-run on file changes |

---

## v1.0.0 - Production Ready

**Goal:** Full CI/CD integration, stable APIs, and production-grade tooling.

### CI/CD Integration

| Feature | Status | Description |
|---------|--------|-------------|
| GitHub Action | 📋 | Official `artemiskit-action` |
| Exit codes | ✅ | 0=pass, 1=fail, 2=error |
| Configurable threshold | 📋 | Fail on X% regression |
| JUnit XML output | 📋 | Standard CI format |
| GitHub annotations | 📋 | Inline PR comments |
| GitLab CI template | 💡 | Official GitLab CI configuration |
| Azure DevOps task | 💡 | Azure Pipelines integration |

### Stability & Polish

| Feature | Status | Description |
|---------|--------|-------------|
| Stable public API | 📋 | No breaking changes guarantee |
| Comprehensive docs | 📋 | Full API documentation |
| Migration guides | 📋 | Upgrade guides from pre-1.0 |
| Performance benchmarks | 💡 | Published performance baselines |

---

## Future Considerations

These features are under consideration for future releases:

### Python Support

| Feature | Status | Description |
|---------|--------|-------------|
| `artemiskit` CLI (Python) | 💡 | Native Python CLI with pip install |
| `artemiskit` SDK (Python) | 💡 | Python SDK for programmatic use |
| pytest integration | 💡 | Use ArtemisKit in pytest tests |
| Shared scenario format | 💡 | Same YAML format across TS/Python |

### IDE Integration
- VS Code extension with YAML schema support
- Run scenarios from editor
- Inline result visualization

### Advanced Security
- ~~OWASP LLM Top 10 compliance pack~~ → Moved to v0.3.0 ✅
- Continuous monitoring mode
- Alert thresholds and notifications
- Automated regression testing for security

### Community Features
- Attack pattern library
- Shared scenario collections
- Plugin/extension system

---

## Contributing

We welcome contributions! Here's how you can help:

### Good First Issues
- Documentation improvements
- Additional test cases
- Bug fixes

### Feature Contributions
- New expectation matchers
- Additional provider adapters
- Report enhancements

### How to Contribute
1. Check the [Issues](https://github.com/artemiskit/artemiskit/issues) for open tasks
2. Fork the repository
3. Create a feature branch
4. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## Versioning

ArtemisKit follows [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

We use [Changesets](https://github.com/changesets/changesets) for version management.

---

## Feedback

Have ideas or suggestions? We'd love to hear from you:
- Open an [Issue](https://github.com/artemiskit/artemiskit/issues)
- Start a [Discussion](https://github.com/artemiskit/artemiskit/discussions)
- Join our community (coming soon)

---

*Last Updated: February 2026*
