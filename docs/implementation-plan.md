# Artemis Implementation Plan

> Comprehensive technical implementation guide for the Agent Reliability Toolkit

---

## Table of Contents

1. [Overview](#1-overview)
2. [Implementation Status](#2-implementation-status)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Implemented Features](#5-implemented-features)
6. [Remaining Work](#6-remaining-work)
7. [API Specifications](#7-api-specifications)
8. [Configuration Schema](#8-configuration-schema)
9. [Database Schema](#9-database-schema)
10. [Development Guidelines](#10-development-guidelines)

---

## 1. Overview

### 1.1 Purpose

Artemis is an Agent Reliability Toolkit for testing, validating, stress-testing, and auditing LLM-driven agents. This document tracks the implementation status and provides guidance for future development.

### 1.2 MVP Scope

- TypeScript monorepo with core libraries and CLI
- Extensible provider adapter system supporting multiple LLM providers
- MVP adapters: OpenAI SDK (with Azure support) and Vercel AI SDK
- Scenario-driven test runner with YAML configuration
- Evaluation matchers: exact, regex, fuzzy, LLM-grader, contains, json_schema
- Artifact generation with run manifests
- Supabase and local filesystem storage
- HTML/JSON reports
- GitHub Actions integration
- Basic red-team mutation primitives

### 1.3 Multi-Provider Architecture

| Provider | Status | Adapter Package | Notes |
|----------|--------|-----------------|-------|
| OpenAI | **Implemented** | `@artemiskit/adapter-openai` | Direct OpenAI SDK |
| Azure OpenAI | **Implemented** | `@artemiskit/adapter-openai` | Via Azure config |
| Vercel AI SDK | **Implemented** | `@artemiskit/adapter-vercel-ai` | OpenAI/Azure providers |
| OpenAI-compatible | **Implemented** | `@artemiskit/adapter-openai` | Via custom baseUrl |
| Anthropic | Placeholder | `@artemiskit/adapter-anthropic` | Structure ready, not implemented |
| Google, Mistral, etc. | Not Started | - | Future work |

---

## 2. Implementation Status

### 2.1 Completed Phases

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0: Foundation | ✅ Complete | Bun monorepo, TypeScript, Biome, Supabase migrations, CI/CD |
| Phase 1: Core Libraries | ✅ Complete | Types, adapters, evaluators, storage, artifacts, provenance |
| Phase 2: Provider Adapters | ✅ Complete | OpenAI SDK, Vercel AI SDK, Anthropic placeholder |
| Phase 3: CLI | ✅ Complete | init, run, compare, history commands |
| Phase 6: Reporting | ✅ Complete | HTML and JSON report generators |
| Phase 8: Red-Team | ✅ Complete | Mutations, detector, severity mapper |
| Phase 9: Testing | ✅ Complete | 23 unit tests, 87% coverage |

### 2.2 What Was Consolidated

Some phases from the original plan were implemented together:

- **Phase 4 (Evaluation & Metrics)**: Implemented in Phase 1 as `packages/core/src/evaluators/` and metrics in `artifacts/manifest.ts`
- **Phase 5 (Artifacts & Storage)**: Implemented in Phase 1 as `packages/core/src/storage/` and `artifacts/`
- **Phase 7 (CI/CD)**: Implemented in Phase 0 as `.github/workflows/`

### 2.3 Git Commit History

```
7a71d86 feat: Phase 9 - Testing Strategy
5dd6d85 feat: Phase 6 & 8 - Reporting and Red-Team Module
64f6a39 feat: Phase 3 - CLI Implementation
ced578e feat: Phase 2 - Provider Adapters
96176b0 feat: Phase 1 - Core Libraries
270ed3f feat: Phase 0 - Foundation & Setup
```

---

## 3. Technology Stack

### 3.1 Core Technologies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Runtime | Bun | 1.1+ | Package manager, bundler, test runner, runtime |
| Language | TypeScript | 5.3+ | Type safety |
| CLI Framework | Commander.js | 12.x | CLI argument parsing |
| Testing | Bun Test | - | Unit/integration tests |
| Linting | Biome | 1.5+ | Linting and formatting |
| Database/Storage | Supabase | - | PostgreSQL + Storage |

### 3.2 Key Dependencies

**Core:**
- `zod` - Schema validation
- `yaml` - YAML parsing
- `fastest-levenshtein` - Fuzzy matching
- `nanoid` - ID generation
- `pino` - Logging
- `@supabase/supabase-js` - Supabase client

**Adapters:**
- `openai` - OpenAI SDK
- `ai`, `@ai-sdk/openai`, `@ai-sdk/azure` - Vercel AI SDK

**CLI:**
- `commander` - CLI framework
- `chalk` - Terminal colors
- `ora` - Spinners
- `cli-table3` - Tables

**Reports:**
- `handlebars` - HTML templating

---

## 4. Project Structure

```
artemis/
├── packages/
│   ├── core/                     # @artemiskit/core
│   │   └── src/
│   │       ├── adapters/         # ModelClient interface, registry, factory
│   │       ├── artifacts/        # Run manifest types and generation
│   │       ├── evaluators/       # All evaluator implementations
│   │       ├── provenance/       # Git and environment info
│   │       ├── scenario/         # Schema and YAML parser
│   │       ├── storage/          # Supabase and local adapters
│   │       └── utils/            # Errors, logger
│   │
│   ├── adapters/
│   │   ├── openai/               # @artemiskit/adapter-openai ✅
│   │   ├── vercel-ai/            # @artemiskit/adapter-vercel-ai ✅
│   │   └── anthropic/            # @artemiskit/adapter-anthropic (placeholder)
│   │
│   ├── cli/                      # @artemiskit/cli ✅
│   │   └── src/
│   │       ├── commands/         # init, run, compare, history
│   │       └── cli.ts            # Main entry
│   │
│   ├── reports/                  # @artemiskit/reports ✅
│   │   └── src/
│   │       ├── html/             # HTML generator with Handlebars
│   │       └── json/             # JSON generator
│   │
│   └── redteam/                  # @artemiskit/redteam ✅
│       └── src/
│           ├── mutations/        # typo, role-spoof, instruction-flip, cot-injection
│           ├── generator.ts      # RedTeamGenerator
│           ├── detector.ts       # UnsafeResponseDetector
│           └── severity.ts       # SeverityMapper
│
├── supabase/
│   └── migrations/               # Database schema ✅
│
├── samples/
│   ├── scenarios/                # Example YAML scenarios
│   └── configs/                  # Example config files
│
├── .github/workflows/            # CI/CD ✅
├── docs/                         # Documentation
└── [config files]                # package.json, tsconfig, biome, etc.
```

---

## 5. Implemented Features

### 5.1 Core Library (`@artemiskit/core`)

**Adapter System:**
```typescript
// Create an adapter
const client = await createAdapter({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: 'gpt-4',
});

// Generate completion
const result = await client.generate({
  prompt: 'Hello, world!',
  temperature: 0,
});
```

**Evaluators:**
- `exact` - Exact string match (case sensitive/insensitive)
- `regex` - Regular expression pattern matching
- `fuzzy` - Levenshtein distance similarity
- `contains` - Value containment (all/any mode)
- `json_schema` - JSON schema validation
- `llm_grader` - LLM-based evaluation with rubric

**Storage:**
- `SupabaseStorageAdapter` - Cloud storage with PostgreSQL metadata
- `LocalStorageAdapter` - Filesystem fallback

**Artifacts:**
- Run manifest generation with metrics
- Git provenance tracking
- CI environment detection

### 5.2 Provider Adapters

**OpenAI Adapter (`@artemiskit/adapter-openai`):**
- Direct OpenAI API support
- Azure OpenAI support via config
- OpenAI-compatible endpoints via baseUrl
- Streaming and embeddings

**Vercel AI Adapter (`@artemiskit/adapter-vercel-ai`):**
- OpenAI provider
- Azure provider
- Extensible for future providers

### 5.3 CLI (`@artemiskit/cli`)

```bash
# Initialize project
artemis init

# Run tests
artemis run scenarios/basic.yaml --provider openai --model gpt-4

# Compare runs
artemis compare <baseline-id> <current-id> --threshold 0.05

# View history
artemis history --limit 20 --scenario basic
```

### 5.4 Reports (`@artemiskit/reports`)

```typescript
import { generateHTMLReport, generateJSONReport } from '@artemiskit/reports';

const html = generateHTMLReport(manifest);
const json = generateJSONReport(manifest, { pretty: true });
```

### 5.5 Red-Team (`@artemiskit/redteam`)

**Mutations:**
- `TypoMutation` - Random typos (severity: low)
- `RoleSpoofMutation` - System prompt override attempts (severity: high)
- `InstructionFlipMutation` - Negates instructions (severity: medium)
- `CotInjectionMutation` - Misleading reasoning injection (severity: high)

**Generator:**
```typescript
const generator = new RedTeamGenerator();
const mutatedPrompts = generator.generate(originalPrompt, 10);
```

**Detector:**
```typescript
const detector = new UnsafeResponseDetector();
const result = detector.detect(response);
// { unsafe: boolean, reasons: string[], severity: 'low'|'medium'|'high'|'critical' }
```

---

## 6. Remaining Work

### 6.1 Not Yet Implemented

| Feature | Priority | Description |
|---------|----------|-------------|
| Runner Module | High | Extract test runner from CLI into reusable core module |
| Prometheus Metrics | Medium | `/metrics` endpoint for observability |
| Redaction Module | Medium | PII and secret redaction from logs/manifests |
| `artemis report` command | Medium | Generate reports from stored runs |
| `artemis stress` command | Low | Concurrent request stress testing |
| `artemis redteam` command | Low | Run red-team scenarios from CLI |
| Config File Loading | Medium | Load `artemis.config.yaml` in CLI commands |

### 6.2 Future Provider Adapters

```typescript
// Uncomment and implement when needed:
// @artemiskit/adapter-anthropic - Direct Anthropic SDK
// @artemiskit/adapter-google - Google AI / Vertex AI
// @artemiskit/adapter-mistral - Mistral AI
// @artemiskit/adapter-ollama - Local Ollama
// @artemiskit/adapter-bedrock - AWS Bedrock
```

### 6.3 Recommended Next Steps

1. **Extract Runner Module**: Move test execution logic from `cli/commands/run.ts` to `core/runner/`
2. **Add Config Loading**: Parse `artemis.config.yaml` for default settings
3. **Implement `report` command**: Generate HTML/JSON from stored run IDs
4. **Add Integration Tests**: Test with real API calls (recorded fixtures)
5. **Implement Anthropic Adapter**: Uncomment and complete the placeholder

---

## 7. API Specifications

### 7.1 ModelClient Interface

```typescript
interface ModelClient {
  readonly provider: string;
  generate(options: GenerateOptions): Promise<GenerateResult>;
  stream?(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string>;
  embed?(text: string): Promise<number[]>;
  capabilities(): Promise<ModelCapabilities>;
  close?(): Promise<void>;
}
```

### 7.2 Scenario Schema

```yaml
name: string (required)
description: string (optional)
version: string (default: "1.0")
provider: openai | azure-openai | vercel-ai | ...
model: string
temperature: number (0-2)
seed: number
cases:
  - id: string (required)
    name: string (optional)
    prompt: string | ChatMessage[]
    expected:
      type: exact | regex | fuzzy | contains | json_schema | llm_grader
      # type-specific fields...
    tags: string[]
```

### 7.3 Run Manifest Schema

```typescript
interface RunManifest {
  version: string;
  run_id: string;
  project: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  config: RunConfig;
  metrics: RunMetrics;
  git: GitInfo;
  provenance: ProvenanceInfo;
  cases: CaseResult[];
  environment: EnvironmentInfo;
}
```

---

## 8. Configuration Schema

### 8.1 artemis.config.yaml

```yaml
project: my-project

provider: openai
model: gpt-4

providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
    defaultModel: gpt-4
  
  azure-openai:
    apiKey: ${AZURE_OPENAI_API_KEY}
    resourceName: ${AZURE_OPENAI_RESOURCE}
    deploymentName: ${AZURE_OPENAI_DEPLOYMENT}
    apiVersion: "2024-02-15-preview"

storage:
  type: supabase | local
  url: ${SUPABASE_URL}
  anonKey: ${SUPABASE_ANON_KEY}
  bucket: artemis-runs

scenariosDir: ./scenarios
output:
  format: json
  dir: ./artemis-output
```

### 8.2 Environment Variables

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Providers
OPENAI_API_KEY=sk-...
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_RESOURCE=your-resource
AZURE_OPENAI_DEPLOYMENT=gpt-4
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Artemis
ARTEMIS_PROJECT=my-project
ARTEMIS_LOG_LEVEL=info
```

---

## 9. Database Schema

### 9.1 Tables

**runs:**
```sql
CREATE TABLE runs (
  id UUID PRIMARY KEY,
  run_id TEXT UNIQUE NOT NULL,
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  success_rate DECIMAL(5, 4) NOT NULL,
  total_cases INTEGER NOT NULL,
  passed_cases INTEGER NOT NULL,
  failed_cases INTEGER NOT NULL,
  median_latency_ms INTEGER,
  total_tokens INTEGER,
  git_commit TEXT,
  git_branch TEXT,
  run_by TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  manifest_path TEXT NOT NULL
);
```

**case_results:**
```sql
CREATE TABLE case_results (
  id UUID PRIMARY KEY,
  run_id TEXT REFERENCES runs(run_id),
  case_id TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  score DECIMAL(5, 4),
  matcher_type TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  tags TEXT[]
);
```

**baselines:**
```sql
CREATE TABLE baselines (
  id UUID PRIMARY KEY,
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  run_id TEXT REFERENCES runs(run_id),
  UNIQUE(project, scenario)
);
```

---

## 10. Development Guidelines

### 10.1 Commands

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint

# Build all packages
bun run build

# Run CLI in dev mode
bun run dev -- run scenarios/basic.yaml
```

### 10.2 Adding a New Evaluator

1. Create `packages/core/src/evaluators/my-evaluator.ts`
2. Implement the `Evaluator` interface
3. Register in `packages/core/src/evaluators/index.ts`
4. Add tests in `my-evaluator.test.ts`

### 10.3 Adding a New Provider Adapter

1. Create `packages/adapters/my-provider/`
2. Implement `ModelClient` interface
3. Register in `packages/core/src/adapters/registry.ts`
4. Add to CLI's `buildAdapterConfig()` function

### 10.4 Commit Convention

```
feat: Description of feature
fix: Description of fix
docs: Documentation changes
test: Test additions/changes
refactor: Code refactoring
```

---

*Document Version: 2.0 (Post-Implementation)*
*Last Updated: January 2026*
