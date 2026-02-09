# ArtemisKit v0.2.4 Release Notes

**Release Date:** February 2026  
**Type:** Minor Feature Release

---

## Highlights

This release combines the planned v0.2.2 (Validation & Export) and v0.2.3 (Cost & Compliance) features into a single release, delivering powerful new capabilities for CI/CD integration and compliance documentation.

---

## New Features

### Validate Command

New `artemiskit validate` command for validating scenario files without executing them against an LLM. Catch errors early in your development workflow and CI pipelines.

```bash
# Validate a single file
akit validate scenarios/qa-test.yaml

# Validate all scenarios in a directory
akit validate scenarios/

# Strict mode - treat warnings as errors
akit validate scenarios/ --strict

# JSON output for automation
akit validate scenarios/ --json

# Export to JUnit XML for CI
akit validate scenarios/ --export junit --export-output ./test-results
```

**Validation Levels:**
- **YAML Syntax** — Validates proper YAML formatting
- **Schema Validation** — Validates against ArtemisKit schema using Zod
- **Semantic Validation** — Detects duplicate case IDs, undefined variable references
- **Warnings** — Identifies deprecated fields, missing descriptions, performance hints

### JUnit XML Export

Added JUnit XML export support for seamless CI/CD integration with Jenkins, GitHub Actions, GitLab CI, Azure DevOps, and other platforms.

```bash
# Export run results to JUnit XML
akit run scenarios/ --export junit --export-output ./test-results

# Export security test results
akit redteam scenarios/chatbot.yaml --export junit --export-output ./security-results

# Export validation results
akit validate scenarios/ --export junit --export-output ./validation-results
```

**JUnit Reports Include:**
- Test suite metadata (run ID, provider, model, success rate)
- Individual test cases with pass/fail status
- Failure details with matcher type and expected values
- System output with actual responses
- Timing information for each test

### Cost Tracking & Budget Enforcement

Automatic cost estimation based on token usage and built-in model pricing data.

```bash
# Run with budget limit (fails if cost exceeds $1.00)
akit run scenarios/ --budget 1.00

# View cost in history
akit history --show-cost
```

**Output Example:**
```
Results: 10/10 passed (100%)
Tokens: 15,234 (prompt: 12,000, completion: 3,234)
Estimated Cost: $0.0234
```

### Markdown Export

Generate compliance-ready markdown reports for documentation and audit trails.

```bash
# Export run results to markdown
akit run scenarios/ --export markdown --export-output ./compliance-reports

# Export security results to markdown
akit redteam scenarios/chatbot.yaml --export markdown --export-output ./security-reports
```

**Markdown Reports Include:**
- Summary table with pass/fail rates, latency, and cost metrics
- Detailed results for failed test cases
- Configuration used for the run
- Redaction summary (if enabled)
- Recommendations for remediation (redteam)

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: LLM Evaluation

on: [push, pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        
      - name: Install ArtemisKit
        run: bun add -g @artemiskit/cli
        
      - name: Validate Scenarios
        run: akit validate scenarios/ --strict --export junit --export-output ./validation-results
        
      - name: Run Evaluation
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: akit run scenarios/ --ci --export junit --export-output ./test-results --budget 5.00
        
      - name: Run Security Tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: akit redteam scenarios/chatbot.yaml --export junit --export-output ./security-results
        
      - name: Publish Test Results
        uses: EnricoMi/publish-unit-test-result-action@v2
        if: always()
        with:
          files: |
            validation-results/*.xml
            test-results/*.xml
            security-results/*.xml
```

### GitLab CI Example

```yaml
llm-evaluation:
  image: oven/bun:latest
  script:
    - bun add -g @artemiskit/cli
    - akit validate scenarios/ --strict
    - akit run scenarios/ --ci --export junit --budget 5.00
  artifacts:
    reports:
      junit: artemis-exports/*.xml
    expire_in: 30 days
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
```

---

## CLI Commands Summary

| Command | Description |
|---------|-------------|
| `akit run` | Run scenario-based evaluations |
| `akit validate` | **NEW** Validate scenarios without running |
| `akit redteam` | Security red team testing |
| `akit stress` | Load and stress testing |
| `akit compare` | Compare two evaluation runs |
| `akit baseline` | Manage baselines for regression detection |
| `akit report` | Generate reports from saved runs |
| `akit history` | View run history (now with `--show-cost`) |
| `akit init` | Initialize configuration |

---

## New CLI Options

### Run Command
| Option | Description |
|--------|-------------|
| `--export junit` | Export results to JUnit XML |
| `--export markdown` | Export results to markdown |
| `--export-output <dir>` | Output directory for exports |
| `--budget <amount>` | Maximum budget in USD |

### Redteam Command
| Option | Description |
|--------|-------------|
| `--export junit` | Export results to JUnit XML |
| `--export markdown` | Export results to markdown |
| `--export-output <dir>` | Output directory for exports |

### Validate Command (New)
| Option | Description |
|--------|-------------|
| `--json` | Output results as JSON |
| `--strict` | Treat warnings as errors |
| `--quiet` | Only output errors |
| `--export junit` | Export to JUnit XML |
| `--export-output <dir>` | Output directory for exports |

### History Command
| Option | Description |
|--------|-------------|
| `--show-cost` | Display cost column and total |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed / validation successful |
| 1 | Tests failed / validation errors / budget exceeded |
| 2 | Configuration or runtime error |

---

## Package Updates

| Package | Version |
|---------|---------|
| `@artemiskit/cli` | 0.2.4 |
| `@artemiskit/core` | 0.2.4 |
| `@artemiskit/reports` | 0.2.4 |
| `@artemiskit/redteam` | 0.2.4 |
| `@artemiskit/adapter-openai` | 0.1.11 |
| `@artemiskit/adapter-vercel-ai` | 0.1.11 |
| `@artemiskit/adapter-anthropic` | 0.1.11 |

---

## Upgrading

```bash
# npm
npm update -g @artemiskit/cli

# bun
bun update -g @artemiskit/cli

# pnpm
pnpm update -g @artemiskit/cli
```

---

## Documentation

- [Validate Command](/docs/cli/commands/validate/)
- [Run Command - JUnit Export](/docs/cli/commands/run/#junit-xml-export)
- [Redteam Command - JUnit Export](/docs/cli/commands/redteam/#export-to-junit-xml)
- [CI/CD Integration](/docs/cli/ci-cd/)
- [Baseline Command](/docs/cli/commands/baseline/)

---

## What's Next

See [ROADMAP.md](ROADMAP.md) for upcoming features in v0.3.0:
- Programmatic SDK (`@artemiskit/sdk`)
- OWASP LLM Top 10 2025 attack vectors
- Jest/Vitest integration
- SQLite local storage
- LangChain/CrewAI adapters

---

## Contributors

Thank you to everyone who contributed to this release!

---

**Full Changelog:** [v0.2.3...v0.2.4](https://github.com/code-sensei/artemiskit/compare/v0.2.3...v0.2.4)
