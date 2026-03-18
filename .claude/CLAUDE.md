# ArtemisKit - Claude Code Reference

> **Purpose:** This file provides Claude Code with essential project context, conventions, and documentation links for effective assistance.

---

## Project Summary

**Name:** ArtemisKit (Agent Reliability Toolkit)  
**Description:** Open-source LLM evaluation and testing toolkit  
**Repository:** https://github.com/code-sensei/artemiskit  
**Website:** https://artemiskit.vercel.app  
**License:** Apache-2.0  
**Current Version:** 0.3.3 (March 2026)  
**Status:** Active Development

### What This Project Does

ArtemisKit provides systematic testing and evaluation for Large Language Model (LLM) applications:

- **Quality Assurance** — Test prompts and responses with scenario-based testing (YAML-driven)
- **Security Testing** — Red team your LLM for vulnerabilities (prompt injection, jailbreaks, data extraction, hallucination, PII disclosure)
- **Performance Testing** — Stress test under load with concurrency, latency metrics, and throughput measurement
- **Multi-Provider Support** — OpenAI, Anthropic, Azure OpenAI, Vercel AI SDK, OpenAI-compatible APIs (Ollama, vLLM, LM Studio)
- **Comprehensive Reporting** — Interactive HTML dashboards and JSON manifests
- **Cloud Storage** — Local file storage and Supabase integration

---

## Tech Stack

| Category          | Technology           | Version | Notes                                    |
| ----------------- | -------------------- | ------- | ---------------------------------------- |
| Runtime           | Bun                  | 1.1.0+  | Modern JavaScript runtime (required)     |
| Language          | TypeScript           | 5.3.0+  | Strict mode enabled                      |
| Package Manager   | Bun Workspaces       | —       | Monorepo workspace management            |
| CLI Framework     | Commander.js         | 12.x    | Command-line argument parsing            |
| Interactive       | Inquirer.js          | 9.x     | Interactive prompts                      |
| Output            | Chalk + Ora          | 5.x/8.x | Colors and spinners                      |
| Tables            | cli-table3           | 0.6.x   | Terminal table formatting                |
| Validation        | Zod                  | 3.22+   | Schema validation                        |
| Config Parsing    | YAML                 | 2.3+    | Scenario and config files                |
| Fuzzy Matching    | fastest-levenshtein  | 1.x     | String similarity                        |
| Metrics           | prom-client          | 15.x    | Prometheus metrics (planned)             |
| Storage           | Supabase JS          | 2.39+   | Cloud storage adapter                    |
| Logging           | Consola              | 3.4+    | Logging library                          |
| Linting           | Biome                | 1.5+    | Code quality and formatting              |
| Testing           | Bun Test             | —       | Built-in test runner                     |
| Versioning        | Changesets           | 2.29+   | Version management                       |

---

## Critical Rules

### 1. Runtime: Bun Only

This project uses **Bun** as its runtime and package manager. Do not use npm/yarn/pnpm for running scripts.

```bash
# ✓ CORRECT
bun install
bun run build
bun test

# ✗ WRONG
npm install
npm run build
```

### 2. Workspace Structure

This is a **monorepo** with multiple packages. Always respect workspace boundaries.

```bash
# Run command in all packages
bun run --filter '*' build

# Run command in specific package
bun run --filter '@artemiskit/cli' dev
```

### 3. Code Quality: Biome

Use Biome for linting and formatting. Never commit code that fails lint checks.

```bash
bun run lint        # Check
bun run lint:fix    # Auto-fix
bun run format      # Format
```

### 4. Testing: Comprehensive Coverage

Maintain 80%+ test coverage. Write tests for all new functionality.

```bash
bun test                  # Run all tests
bun test --watch          # Watch mode
bun test --coverage       # Coverage report
```

### 5. Manual CLI Testing

When testing CLI commands manually during development, use the CLI entry point directly:

```bash
# Run CLI commands via the entry point
bun packages/cli/bin/artemis.ts run scenarios/example.yaml
bun packages/cli/bin/artemis.ts redteam --prompt "You are a helpful assistant"
bun packages/cli/bin/artemis.ts baseline set <run-id>
bun packages/cli/bin/artemis.ts history --ci
```

This bypasses the need for a global install and tests the actual source code.

### 6. Git: Authorization Required for Push

Do NOT push to shared remotes without explicit user authorization.

Reference: [.claude/rules/git-strategy.md](.claude/rules/git-strategy.md)

### 7. Logging: Trace All Actions

Log significant actions to the ai-trace directory.

Reference: [.claude/rules/enforce-logging-trace.md](.claude/rules/enforce-logging-trace.md)

---

## Project Structure

```
artemiskit/
├── .claude/                          # Claude Code configuration
│   ├── rules/                        # Enforcement rules (READ THESE)
│   └── CLAUDE.md                     # This file
├── ai-trace/                         # AI action audit logs
├── docs-content/                     # Documentation (MDX format)
│   ├── index.mdx                     # Main introduction
│   ├── cli/                          # CLI documentation
│   │   ├── getting-started.mdx       # Quick start guide
│   │   ├── installation.mdx          # Installation instructions
│   │   ├── commands/                 # Command documentation
│   │   │   ├── run.mdx               # akit run
│   │   │   ├── redteam.mdx           # akit redteam
│   │   │   ├── stress.mdx            # akit stress
│   │   │   ├── report.mdx            # akit report
│   │   │   ├── history.mdx           # akit history
│   │   │   ├── compare.mdx           # akit compare
│   │   │   └── init.mdx              # akit init
│   │   ├── providers/                # Provider configuration
│   │   │   ├── openai.mdx
│   │   │   ├── anthropic.mdx
│   │   │   ├── azure.mdx
│   │   │   ├── vercel-ai.mdx
│   │   │   └── openai-compatible.mdx
│   │   ├── scenarios/                # Scenario documentation
│   │   │   ├── format.mdx            # YAML format
│   │   │   └── expectations.mdx      # Expectation types
│   │   └── storage/                  # Storage documentation
│   │       ├── local.mdx
│   │       └── supabase.mdx
│   └── api/                          # SDK documentation (future)
├── packages/
│   ├── cli/                          # @artemiskit/cli
│   │   ├── bin/artemis.ts            # CLI entry point
│   │   ├── src/
│   │   │   ├── commands/             # Command implementations
│   │   │   │   ├── run.ts            # Scenario runner
│   │   │   │   ├── redteam.ts        # Red team testing
│   │   │   │   ├── stress.ts         # Stress testing
│   │   │   │   ├── report.ts         # Report generation
│   │   │   │   ├── history.ts        # Run history
│   │   │   │   ├── compare.ts        # Run comparison
│   │   │   │   └── init.ts           # Config initialization
│   │   │   ├── config/               # Configuration handling
│   │   │   ├── output/               # Terminal output utilities
│   │   │   └── index.ts
│   │   └── package.json
│   ├── core/                         # @artemiskit/core
│   │   ├── src/
│   │   │   ├── runner/               # Evaluation engine
│   │   │   │   ├── runner.ts         # Main runner
│   │   │   │   ├── executor.ts       # Case executor
│   │   │   │   └── types.ts
│   │   │   ├── evaluators/           # Expectation matchers
│   │   │   │   ├── exact.ts          # Exact match
│   │   │   │   ├── contains.ts       # Contains
│   │   │   │   ├── not-contains.ts   # Not contains
│   │   │   │   ├── regex.ts          # Regex match
│   │   │   │   ├── fuzzy.ts          # Fuzzy similarity
│   │   │   │   ├── similarity.ts     # Semantic similarity
│   │   │   │   ├── llm-grader.ts     # LLM-based grading
│   │   │   │   ├── json-schema.ts    # JSON validation
│   │   │   │   ├── combined.ts       # AND/OR logic
│   │   │   │   ├── inline.ts         # Custom expressions
│   │   │   │   └── types.ts
│   │   │   ├── scenario/             # Scenario handling
│   │   │   │   ├── parser.ts         # YAML parsing
│   │   │   │   ├── schema.ts         # Zod schemas
│   │   │   │   ├── variables.ts      # Variable injection
│   │   │   │   └── discovery.ts      # File discovery
│   │   │   ├── storage/              # Storage adapters
│   │   │   │   ├── local.ts          # Local file storage
│   │   │   │   ├── supabase.ts       # Supabase adapter
│   │   │   │   ├── factory.ts        # Adapter factory
│   │   │   │   └── types.ts
│   │   │   ├── artifacts/            # Output artifacts
│   │   │   │   ├── manifest.ts       # Run manifest
│   │   │   │   └── types.ts
│   │   │   ├── redaction/            # PII redaction
│   │   │   │   ├── redactor.ts       # Redaction engine
│   │   │   │   └── types.ts
│   │   │   ├── adapters/             # Provider adapters
│   │   │   │   ├── registry.ts       # Adapter registry
│   │   │   │   ├── factory.ts        # Adapter factory
│   │   │   │   └── types.ts
│   │   │   ├── cost/                 # Cost estimation
│   │   │   │   ├── index.ts
│   │   │   │   └── pricing.ts        # Model pricing data
│   │   │   ├── provenance/           # Run provenance
│   │   │   │   ├── git.ts            # Git info capture
│   │   │   │   └── environment.ts    # Environment capture
│   │   │   ├── utils/                # Utilities
│   │   │   │   ├── logger.ts
│   │   │   │   └── errors.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── redteam/                      # @artemiskit/redteam
│   │   ├── src/
│   │   │   ├── attacks/              # Attack categories
│   │   │   │   ├── injection.ts      # Prompt injection
│   │   │   │   ├── jailbreak.ts      # Jailbreak attempts
│   │   │   │   ├── extraction.ts     # Data extraction
│   │   │   │   ├── hallucination.ts  # Hallucination triggers
│   │   │   │   └── pii.ts            # PII disclosure
│   │   │   ├── mutations/            # Attack mutations
│   │   │   │   ├── encoding.ts       # Base64, ROT13, hex, unicode
│   │   │   │   └── multi-turn.ts     # Multi-message sequences
│   │   │   ├── runner.ts             # Red team runner
│   │   │   ├── scoring.ts            # Vulnerability scoring
│   │   │   └── index.ts
│   │   └── package.json
│   ├── reports/                      # @artemiskit/reports
│   │   ├── src/
│   │   │   ├── html/                 # HTML report generation
│   │   │   ├── json/                 # JSON output
│   │   │   └── index.ts
│   │   └── package.json
│   └── adapters/                     # Provider adapters
│       ├── openai/                   # @artemiskit/adapter-openai
│       │   ├── src/
│       │   │   ├── adapter.ts        # OpenAI adapter
│       │   │   └── index.ts
│       │   └── package.json
│       ├── anthropic/                # @artemiskit/adapter-anthropic
│       │   ├── src/
│       │   │   ├── adapter.ts        # Anthropic adapter
│       │   │   └── index.ts
│       │   └── package.json
│       └── vercel-ai/                # @artemiskit/adapter-vercel-ai
│           ├── src/
│           │   ├── adapter.ts        # Vercel AI SDK adapter
│           │   └── index.ts
│           └── package.json
├── ROADMAP.md                        # Development roadmap
├── CONTRIBUTING.md                   # Contribution guidelines
├── package.json                      # Root workspace config
├── tsconfig.json                     # TypeScript configuration
└── biome.json                        # Biome configuration
```

---

## Packages Overview

| Package                       | npm Name                    | Description                          |
| ----------------------------- | --------------------------- | ------------------------------------ |
| CLI                           | `@artemiskit/cli`           | Command-line interface               |
| Core                          | `@artemiskit/core`          | Evaluation engine, storage, utils    |
| Red Team                      | `@artemiskit/redteam`       | Security testing                     |
| Reports                       | `@artemiskit/reports`       | HTML/JSON report generation          |
| OpenAI Adapter                | `@artemiskit/adapter-openai`| OpenAI/Azure/Compatible API adapter  |
| Anthropic Adapter             | `@artemiskit/adapter-anthropic` | Anthropic Claude adapter         |
| Vercel AI Adapter             | `@artemiskit/adapter-vercel-ai` | Vercel AI SDK adapter            |

---

## CLI Commands

| Command              | Alias    | Description                                |
| -------------------- | -------- | ------------------------------------------ |
| `artemiskit run`     | `akit run` | Execute scenario-based evaluations       |
| `artemiskit redteam` | `akit redteam` | Security red team testing            |
| `artemiskit stress`  | `akit stress` | Load and stress testing               |
| `artemiskit report`  | `akit report` | Generate/regenerate reports           |
| `artemiskit history` | `akit history` | View run history                     |
| `artemiskit compare` | `akit compare` | Compare two evaluation runs          |
| `artemiskit init`    | `akit init` | Initialize configuration               |

---

## Scenario Format

Scenarios are defined in YAML files:

```yaml
name: example-scenario
description: Test basic LLM functionality
provider: openai
model: gpt-4

cases:
  - id: math-test
    prompt: "What is 2 + 2?"
    expected:
      type: contains
      values:
        - "4"
      mode: any

  - id: json-output
    prompt: "Return a JSON object with name and age"
    expected:
      type: json_schema
      schema:
        type: object
        required: ["name", "age"]
        properties:
          name: { type: string }
          age: { type: number }
```

### Expectation Types

| Type           | Description                                      |
| -------------- | ------------------------------------------------ |
| `contains`     | Response contains specified text                 |
| `not_contains` | Response does not contain specified text         |
| `exact`        | Exact string match                               |
| `regex`        | Regular expression match                         |
| `fuzzy`        | Fuzzy string similarity (Levenshtein)            |
| `similarity`   | Semantic similarity (embedding or LLM-based)     |
| `llm_grader`   | LLM-based response grading                       |
| `json_schema`  | JSON structure validation                        |
| `combined`     | AND/OR logic between multiple assertions         |
| `inline`       | Custom expression-based matcher                  |

---

## Configuration

### Config File (artemis.config.yaml)

```yaml
provider: openai
model: gpt-4

providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
    timeout: 60000
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}

output:
  format: json
  dir: ./artemis-output

storage:
  type: local  # or 'supabase'

redaction:
  enabled: true
  patterns:
    - email
    - phone
    - api_key
```

### Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Azure OpenAI
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_RESOURCE_NAME=...
AZURE_OPENAI_DEPLOYMENT_NAME=...

# Supabase (for cloud storage)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...
```

### Config Precedence

CLI flags > Scenario config > Config file > Environment variables > Defaults

---

## Red Team Testing

Security testing categories:

| Category        | Description                           |
| --------------- | ------------------------------------- |
| `injection`     | Prompt injection probes               |
| `jailbreak`     | Jailbreak attempts                    |
| `extraction`    | Data extraction tests                 |
| `hallucination` | Hallucination triggers                |
| `pii`           | PII disclosure detection              |

### Mutations

| Mutation      | Description                                    |
| ------------- | ---------------------------------------------- |
| `encoding`    | Base64, ROT13, hex, unicode obfuscation        |
| `multi_turn`  | Multi-message attack sequences                 |

---

## Stress Testing

Metrics captured:

- **Latency**: avg, min, max, p50, p90, p95, p99
- **Throughput**: requests per second
- **Success/Failure**: error rate tracking
- **Token Usage**: per-request token consumption
- **Cost Estimation**: API cost estimates

---

## Storage

### Local Storage

Saves to `artemis-runs/` directory:
- `run_manifest.json` — Complete run data
- HTML reports (timestamped)

### Supabase Storage

Cloud storage with tables:
- `runs` — Run metadata and results
- `case_results` — Individual test case results (planned)

---

## Available Scripts

```bash
# Development
bun run dev                    # Start CLI in dev mode
bun run build                  # Build all packages
bun run typecheck              # TypeScript type checking

# Testing
bun test                       # Run all tests
bun test --watch               # Watch mode
bun test --coverage            # Coverage report

# Code Quality
bun run lint                   # Check with Biome
bun run lint:fix               # Auto-fix issues
bun run format                 # Format code

# Database (Supabase)
bun run db:migrate             # Push schema changes
bun run db:generate-types      # Generate TypeScript types

# Release (use `bun run release` to publish to npm)
bun run changeset              # Create changeset
bun run version                # Bump versions
bun run release                # Publish packages to npm (runs scripts/publish.sh)
```

---

## Development Workflow

### Adding a New Evaluator

1. Create file in `packages/core/src/evaluators/`
2. Implement the `Evaluator` interface
3. Add tests in same directory (`*.test.ts`)
4. Export from `packages/core/src/evaluators/index.ts`
5. Register in evaluator factory

### Adding a New Provider Adapter

1. Create package in `packages/adapters/`
2. Implement the `LLMAdapter` interface
3. Register in `packages/core/src/adapters/registry.ts`
4. Add documentation in `docs-content/cli/providers/`

### Adding a CLI Command

1. Create file in `packages/cli/src/commands/`
2. Register in `packages/cli/bin/artemis.ts`
3. Add documentation in `docs-content/cli/commands/`

---

## Current Development Phase

**v0.2.0** ✅ Complete (February 2026)

### Completed Features:

- ✅ Directory scanning and glob pattern matching
- ✅ Parallel scenario execution
- ✅ Similarity expectation (embedding/LLM modes)
- ✅ Scenario tags and filtering
- ✅ Combined matchers (AND/OR logic)
- ✅ Inline custom matchers
- ✅ Encoding mutations (base64, ROT13, hex, unicode)
- ✅ Multi-turn attack sequences
- ✅ Custom attack YAML support
- ✅ Severity scoring (CVSS-like)
- ✅ Stress test enhancements (ramp-up, token tracking, cost estimation)
- ✅ Interactive CLI mode
- ✅ Enhanced HTML reports (collapsible, filterable, searchable)

### Next: v0.3.0 (SDK & Advanced Features)

- 📋 Programmatic SDK (`@artemiskit/sdk`)
- 📋 Jest/Vitest integration
- 📋 SQLite local storage (enhanced history)
- 💡 Model A/B comparison
- 💡 Additional providers (LiteLLM, OpenRouter, AWS Bedrock)
- 📋 LangChain/CrewAI adapters

See: [ROADMAP.md](ROADMAP.md) for full roadmap

---

## Documentation Quick Reference

### Getting started:

→ [docs-content/cli/getting-started.mdx](docs-content/cli/getting-started.mdx)

### Scenario format and expectations:

→ [docs-content/cli/scenarios/format.mdx](docs-content/cli/scenarios/format.mdx)
→ [docs-content/cli/scenarios/expectations.mdx](docs-content/cli/scenarios/expectations.mdx)

### Provider configuration:

→ [docs-content/cli/providers/](docs-content/cli/providers/)

### Command reference:

→ [docs-content/cli/commands/](docs-content/cli/commands/)

### Storage setup:

→ [docs-content/cli/storage/](docs-content/cli/storage/)

### Full roadmap:

→ [ROADMAP.md](ROADMAP.md)

---

## Key Design Decisions

### 1. YAML-First Configuration

Scenarios and config use YAML for human readability and version control friendliness.

### 2. Adapter Pattern

Provider adapters are pluggable, allowing easy addition of new LLM providers without modifying core logic.

### 3. Config Source Tracking

Every resolved config value tracks its source (CLI, scenario, config file, env, default) for debugging and auditability.

### 4. Redaction by Default

Built-in PII redaction protects sensitive data in logs and reports.

### 5. Reproducible Runs

Manifests capture complete run state, enabling report regeneration and run comparison.

---

## Common Patterns

### Creating a Scenario Test

```yaml
name: my-scenario
description: Test description
provider: openai
model: gpt-4

variables:
  topic: "machine learning"

cases:
  - id: test-1
    prompt: "Explain {{topic}} in simple terms"
    expected:
      type: contains
      values:
        - "algorithm"
        - "data"
      mode: any
```

### Running with Options

```bash
# Run single scenario
akit run scenario.yaml

# Run all scenarios in directory
akit run scenarios/

# Run with specific provider/model
akit run scenario.yaml --provider anthropic --model claude-3-opus

# Run in parallel
akit run scenarios/ --parallel

# Filter by tags
akit run scenarios/ --tags "smoke,critical"

# Save results
akit run scenario.yaml --save
```

### Red Team Testing

```bash
# Basic red team
akit redteam --prompt "You are a helpful assistant"

# Specific attack categories
akit redteam --prompt "..." --categories injection,jailbreak

# With mutations
akit redteam --prompt "..." --mutations encoding,multi_turn

# Custom attacks
akit redteam --prompt "..." --custom-attacks attacks.yaml
```

### Stress Testing

```bash
# Basic stress test
akit stress --prompt "Hello" --iterations 100

# With concurrency
akit stress --prompt "Hello" --iterations 100 --concurrency 10

# Ramp-up
akit stress --prompt "Hello" --iterations 100 --ramp-up
```

---

## Brand & Positioning

### One-Liner

> Open-source LLM testing and evaluation toolkit for testing, securing, and stress-testing AI applications.

### Elevator Pitch (30 seconds)

> ArtemisKit is a CLI tool that helps teams ship AI with confidence. One command gives you quality evaluation with 10+ evaluator types, security red-teaming with 6 mutation types, and performance stress testing with full metrics. It's open source, Apache 2.0, and built for teams who refuse to ship and pray.

### Core Value Proposition

| Capability | Command | What It Does |
|------------|---------|--------------|
| **TEST** | `artemiskit run` | Evaluate outputs with semantic similarity, LLM-as-judge, JSON schema, regex, fuzzy matching |
| **SECURE** | `artemiskit redteam` | Attack your LLM with prompt injection, jailbreaks, role spoofing, encoding attacks |
| **STRESS** | `artemiskit stress` | Measure p50/p95/p99 latency, throughput, token usage, costs under load |

### Brand Personality

| Trait | Expression |
|-------|------------|
| **Confident** | We know our tool works. No hedging, no maybes. |
| **Direct** | Short sentences. Clear claims. No fluff. |
| **Technical** | We speak engineer-to-engineer. Show code, show results. |
| **Honest** | We acknowledge limitations. We don't oversell. |
| **Urgent** | The problem is real. The solution is now. |

### Brand Voice

Technical-conversational. Like a senior engineer explaining something to a peer. Knowledgeable but not condescending. Direct but not cold.

**Language Rules:**
- Use active voice
- Use contractions (we're, you're, don't)
- Use technical terms your audience knows (p99, CI/CD, regression)
- Avoid marketing buzzwords (synergy, leverage, empower, unlock)
- Avoid superlatives without proof (best, fastest, most powerful)

---

## Target Audiences

### Tier 1 — Technical Practitioners (Primary)

| Audience | Pain Points | Content Angle |
|----------|-------------|---------------|
| **ML Engineers / AI Engineers** | Manual testing doesn't scale; regressions slip through after prompt changes; "works in notebook" ≠ production-ready | Quality evaluation, automated testing, CI/CD integration |
| **Security Engineers / AppSec** | Traditional security tools don't cover LLM attack surfaces; prompt injection is new threat model; compliance frameworks now asking about AI security | Red teaming methodology, attack vectors, CVSS-like scoring |
| **AI/ML Researchers** | Reproducibility crisis; evaluation methodology varies; peer reviewers question rigor | Evaluation methodology, reproducibility, benchmark design |

### Tier 2 — Technical + Process (Secondary)

| Audience | Pain Points | Content Angle |
|----------|-------------|---------------|
| **Compliance / GRC / Risk Teams** | EU AI Act (Aug 2026) requires documented testing; auditors asking "how do you validate AI?"; no audit trail | Compliance frameworks, audit trails, documentation |
| **DevOps / SRE** | LLM performance unpredictable; staging doesn't reflect production; latency discovered by users | Stress testing, p50/p95/p99 metrics, CI/CD gates |
| **QA Engineers** | LLM outputs non-deterministic; traditional assertions fail; regression testing nearly impossible | Scenario-based testing, evaluators, fuzzy matching |

### Tier 3 — Decision Makers (Tertiary)

| Audience | Pain Points | Content Angle |
|----------|-------------|---------------|
| **Engineering Leaders / CTOs** | 73% of AI projects fail; hard to demonstrate AI readiness; compliance pressure | ROI of testing, risk frameworks, governance |
| **AI Product Managers** | Can't quantify "good enough"; user complaints but no metrics | Quality metrics, acceptance criteria, release readiness |
| **RAG/LLM App Developers** | Hallucinations erode trust; citation accuracy hard to verify | Semantic evaluation, citation checking, grounding |

### Industry Segments

| Industry | Key Regulations | Specific Concerns |
|----------|-----------------|-------------------|
| **Healthcare AI** | HIPAA, FDA 21 CFR Part 11, FDA AI/ML guidance | Patient safety, clinical validation, explainability |
| **Financial Services** | SOX, OCC guidance, FFIEC, SEC, FINRA | Model risk management, fair lending, fraud detection |
| **Government / Public Sector** | FedRAMP, NIST AI RMF, OMB AI guidance | Transparency, accountability, procurement requirements |
| **Legal Tech** | Industry-specific | Contract analysis accuracy, liability for missed clauses |

---

## Key Messages by Audience

| Audience | Primary Hook | Proof Point |
|----------|--------------|-------------|
| **ML Engineers** | "Ship models you trust" | 10+ evaluator types |
| **Security Engineers** | "Break it before others do" | 6 mutation types + custom attacks |
| **Compliance/GRC** | "Audit-ready AI validation" | EU AI Act, HIPAA, SOX ready |
| **DevOps/SRE** | "Know your limits before users find them" | p50/p95/p99 metrics |
| **QA Engineers** | "Catch regressions before they reach users" | CI/CD integration |
| **Engineering Leaders** | "De-risk your AI investments" | Team velocity + compliance |
| **Government/Public Sector** | "Systematic AI governance" | Open source, self-hosted, audit trails |

---

## Competitive Positioning

| Competitor | Their Strength | Our Differentiation |
|------------|----------------|---------------------|
| Custom scripts | Full control | Pre-built, maintained, standardized |
| Paid platforms | More features | Free, self-hosted, no vendor lock-in |
| Promptfoo | Established | Security red-teaming, stress testing |
| LangSmith | Observability | Testing-first, CLI-native |

**Positioning Statement:**
> ArtemisKit is for teams who want open-source freedom with production-grade capabilities. We're not trying to be everything—we're focused on testing, security, and performance. Free forever. Self-hosted. Your data stays yours.

---

## Marketing Content Assets

### Content Strategy

→ [marketing-content/social/CONTENT-STRATEGY.md](marketing-content/social/CONTENT-STRATEGY.md)

### Posting Calendar

→ [marketing-content/social/POSTING-CALENDAR.md](marketing-content/social/POSTING-CALENDAR.md)

### Content Pillars

| Pillar | % of Content | Purpose |
|--------|--------------|---------|
| **Problem Awareness** | 40% | Establish urgency, create relatability |
| **Education** | 30% | Demonstrate expertise, provide value |
| **Product/Solution** | 20% | Show capabilities, drive adoption |
| **Community** | 10% | Build belonging, show momentum |

### Video Assets

```
Cinematic-Enhanced (Horizontal):
  marketing-content/outputs/videos/cinematic-enhanced/horizontal/UC{01-10}-Cinematic-Enhanced.mp4

Editorial-Full (Horizontal):
  marketing-content/outputs/videos/editorial/horizontal/UC{01-10}-Editorial-Full.mp4

Editorial-Full (Vertical):
  marketing-content/outputs/videos/editorial/vertical/UC{01-10}-Editorial-Full-Vertical.mp4
```

### Use Case Videos

| UC | Title | Focus |
|----|-------|-------|
| UC01 | ML Quality Gate | ML Engineers quality testing |
| UC02 | Security Red Team | Security Engineers attack testing |
| UC03 | QA Regression Suite | QA Engineers regression testing |
| UC04 | DevOps Performance | DevOps/SRE stress testing |
| UC05 | Startup CTO | Engineering leaders risk |
| UC06 | Healthcare Compliance | Healthcare AI validation |
| UC07 | Fintech Risk | Financial services compliance |
| UC08 | Customer Support Quality | Support AI quality |
| UC09 | RAG Citation Checker | RAG hallucination testing |
| UC10 | CI/CD Pipeline | Automated quality gates |

---

## Reminders

1. **Use Bun** — Not npm/yarn/pnpm
2. **Respect workspace boundaries** — Import from package exports, not internal paths
3. **Write tests** — Maintain 80%+ coverage
4. **Run lint before commit** — `bun run lint:fix`
5. **Document changes** — Update relevant MDX docs
6. **Use changesets** — `bun run changeset` for version bumps
7. **Log significant actions** — Use ai-trace for audit trail
8. **Check ROADMAP.md** — Before implementing new features
9. **Follow brand voice** — Technical-conversational, confident, direct
10. **Know your audience** — Tier 1 (practitioners), Tier 2 (process), Tier 3 (decision makers)
