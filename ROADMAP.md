# ArtemisKit Roadmap

This document outlines the development roadmap for ArtemisKit, the open-source LLM evaluation toolkit.

**Current Version:** 0.1.5  
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
| Azure OpenAI | ✅ | Azure-hosted OpenAI |
| Anthropic | ✅ | Claude models |
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

## v0.2.0 - Enhanced Evaluation

**Goal:** Richer evaluation capabilities and CI/CD integration.

### Enhanced Scenarios

| Feature | Status | Description |
|---------|--------|-------------|
| Directory scanning | 📋 | Run all scenarios in a directory |
| Glob pattern matching | 📋 | `akit run scenarios/**/*.yaml` |
| Parallel execution | 📋 | Run scenarios concurrently |
| `similarity` expectation | 📋 | Semantic similarity matching |
| Scenario tags | ✅ | Label and filter scenarios |
| Combined matchers | 📋 | `and`/`or` logic between assertions |
| `not_contains` expectation | 📋 | Negative containment check |
| Inline custom matchers | 📋 | Define matcher functions in YAML |

### CI/CD Integration

| Feature | Status | Description |
|---------|--------|-------------|
| GitHub Action | 📋 | Official `artemiskit-action` |
| Exit codes | ✅ | 0=pass, 1=fail, 2=error |
| Configurable threshold | 📋 | Fail on X% regression |
| JUnit XML output | 📋 | Standard CI format |
| GitHub annotations | 📋 | Inline PR comments |

### Programmatic SDK (TypeScript/JavaScript)

| Feature | Status | Description |
|---------|--------|-------------|
| `@artemiskit/sdk` | 📋 | Import and use programmatically |
| Jest integration | 📋 | Use in Jest tests |
| Vitest integration | 📋 | Use in Vitest tests |
| Event emitters | 📋 | Progress callbacks |

### Enhanced Reports

| Feature | Status | Description |
|---------|--------|-------------|
| Collapsible sections | 📋 | Expand/collapse in HTML |
| Filter by status | 📋 | Show only failures |
| Search functionality | 📋 | Search through results |
| Run comparison view | 📋 | Visual diff between runs |

### Red Team Enhancements

| Feature | Status | Description |
|---------|--------|-------------|
| `encoding` attacks | 📋 | Base64, ROT13 obfuscation |
| `multi_turn` attacks | 📋 | Multi-message sequences |
| Custom attack YAML | 📋 | Define custom attacks |
| Severity scoring | 📋 | CVSS-like ratings |

### Stress Test Enhancements

| Feature | Status | Description |
|---------|--------|-------------|
| Ramp-up testing | 📋 | Gradual load increase |
| Token usage tracking | 📋 | Monitor token consumption |
| Cost estimation | 📋 | Estimate API costs |

### CLI Interactivity (Phase 1)

| Feature | Status | Description |
|---------|--------|-------------|
| Interactive prompts | 📋 | Inquirer-based user prompts |
| Scenario selection | 📋 | Choose scenarios interactively |
| Provider selection | 📋 | Select provider at runtime |
| Confirmation dialogs | 📋 | Confirm destructive actions |
| Interactive init wizard | 📋 | Guided configuration setup |

### Metrics & Observability

| Feature | Status | Description |
|---------|--------|-------------|
| Prometheus metrics | 📋 | Export metrics in Prometheus format |
| OpenTelemetry spans | 📋 | Distributed tracing support |
| Custom metrics hooks | 📋 | User-defined metric collectors |

---

## v0.3.0 - Advanced Features

**Goal:** Local persistence, model comparison, and additional providers.

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
| OpenRouter | 💡 | Multi-provider routing |
| LiteLLM | 💡 | Unified model access |
| Generic REST | 💡 | Custom endpoints |
| AWS Bedrock | 💡 | Amazon models |

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
- OWASP LLM Top 10 compliance pack
- Continuous monitoring mode
- Alert thresholds and notifications

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

*Last Updated: January 2026*
