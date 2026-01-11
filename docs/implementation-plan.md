# Artemis Implementation Plan

> Comprehensive technical implementation guide for the Agent Reliability Toolkit

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technology Stack](#2-technology-stack)
3. [Provider Architecture & LLM SDK Discussion](#3-provider-architecture--llm-sdk-discussion)
4. [Project Structure](#4-project-structure)
5. [Phase 0: Foundation & Setup](#5-phase-0-foundation--setup)
6. [Phase 1: Core Libraries](#6-phase-1-core-libraries)
7. [Phase 2: Provider Adapters](#7-phase-2-provider-adapters)
8. [Phase 3: CLI Implementation](#8-phase-3-cli-implementation)
9. [Phase 4: Evaluation & Metrics](#9-phase-4-evaluation--metrics)
10. [Phase 5: Artifacts & Storage (Supabase)](#10-phase-5-artifacts--storage-supabase)
11. [Phase 6: Reporting](#11-phase-6-reporting)
12. [Phase 7: CI/CD Integration](#12-phase-7-cicd-integration)
13. [Phase 8: Red-Team Module](#13-phase-8-red-team-module)
14. [Phase 9: Testing Strategy](#14-phase-9-testing-strategy)
15. [API Specifications](#15-api-specifications)
16. [Configuration Schema](#16-configuration-schema)
17. [Development Guidelines](#17-development-guidelines)
18. [Database Schema (Supabase)](#18-database-schema-supabase)

---

## 1. Overview

### 1.1 Purpose

This document provides a detailed, actionable implementation plan for building Artemis MVP. It covers architecture decisions, code organization, API contracts, and step-by-step implementation tasks.

### 1.2 MVP Scope Summary

- TypeScript monorepo with core libraries and CLI
- **Extensible provider adapter system** supporting multiple LLM providers
- MVP adapters: **OpenAI SDK** (with Azure support) and **Vercel AI SDK**
- Scenario-driven test runner with YAML configuration
- Evaluation matchers: exact, regex, fuzzy, LLM-grader, contains, json_schema
- Artifact generation with `run_manifest.json`
- **Supabase** for storage (artifacts, run history) and database
- HTML/JSON reports
- GitHub Actions integration example
- Basic red-team mutation primitives

### 1.3 Multi-Provider Philosophy

Artemis is designed to be **provider-agnostic**. The adapter system allows users to connect to any LLM provider:

| Provider | Status | Adapter Package | Notes |
|----------|--------|-----------------|-------|
| OpenAI | **MVP** | `@artemis/adapter-openai` | Direct OpenAI SDK |
| Azure OpenAI | **MVP** | `@artemis/adapter-openai` | Via Azure config |
| Vercel AI SDK | **MVP** | `@artemis/adapter-vercel-ai` | Multi-provider wrapper |
| OpenAI-compatible | **MVP** | `@artemis/adapter-openai` | Via custom baseUrl |
| Anthropic | Post-MVP | `@artemis/adapter-anthropic` | Commented out, structure ready |
| Google Vertex AI | Post-MVP | `@artemis/adapter-google` | Future |
| Hugging Face | Post-MVP | `@artemis/adapter-huggingface` | Future |
| AWS Bedrock | Post-MVP | `@artemis/adapter-bedrock` | Future |
| Ollama (Local) | Post-MVP | `@artemis/adapter-ollama` | Future |

> **Development Note:** During initial development, Azure OpenAI credentials will be used for testing. This is purely for convenience and does not imply any lock-in. The system is designed from day one to support any provider.

### 1.4 Storage Strategy

Artemis uses **Supabase** for all storage needs:

| Feature | Supabase Service | Purpose |
|---------|------------------|---------|
| Run manifests | Supabase Storage (Buckets) | Store JSON artifacts |
| Run history | Supabase Database (PostgreSQL) | Query and filter runs |
| Reports | Supabase Storage | Store HTML/PDF reports |
| Metrics history | Supabase Database | Track metrics over time |
| User/Project data | Supabase Database | Multi-tenant support (future) |

---

## 2. Technology Stack

### 2.1 Core Technologies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Runtime | **Bun** | 1.1+ | JavaScript/TypeScript runtime, package manager, bundler, test runner |
| Language | TypeScript | 5.3+ | Type safety |
| Build Tool | Bun (native) | - | Fast TypeScript bundling |
| CLI Framework | Commander.js | 12.x | CLI argument parsing |
| Testing | Bun Test | - | Unit/integration tests (built into Bun) |
| Linting | Biome | 1.5+ | Fast linter and formatter |
| Database/Storage | **Supabase** | - | PostgreSQL + Storage + Auth |

### 2.2 Why Bun?

Bun provides significant advantages for Artemis:

1. **All-in-one toolchain** - Package manager, bundler, test runner, and runtime in one
2. **Native TypeScript** - No transpilation step needed during development
3. **Fast performance** - Significantly faster than Node.js for many operations
4. **Built-in testing** - `bun test` is Jest-compatible and extremely fast
5. **Workspace support** - Native monorepo support via `workspaces` in package.json
6. **Node.js compatibility** - Most npm packages work out of the box

### 2.3 Why Supabase?

Supabase provides a complete backend solution:

1. **PostgreSQL database** - Powerful queries, indexes, and full-text search for run history
2. **Storage buckets** - S3-compatible storage for artifacts without AWS complexity
3. **Real-time subscriptions** - Live updates for dashboard (future)
4. **Row Level Security** - Built-in multi-tenant security (future)
5. **Edge Functions** - Serverless functions if needed (future)
6. **Generous free tier** - Good for development and small teams
7. **Self-hostable** - Can run your own Supabase instance

### 2.4 Provider SDKs

| SDK | Version | Status | Purpose |
|-----|---------|--------|---------|
| `openai` | 4.x | **MVP** | Direct OpenAI SDK (supports Azure, OpenAI, compatible APIs) |
| `ai` (Vercel AI SDK) | 3.x | **MVP** | Unified interface to multiple providers |
| `@ai-sdk/openai` | 0.x | **MVP** | OpenAI provider for Vercel AI SDK |
| `@ai-sdk/azure` | 0.x | **MVP** | Azure OpenAI provider for Vercel AI SDK |
| `@ai-sdk/anthropic` | 0.x | Post-MVP | Anthropic provider for Vercel AI SDK |
| `@anthropic-ai/sdk` | 0.x | Post-MVP | Direct Anthropic SDK |

### 2.5 Supporting Libraries

| Library | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Supabase client for DB and Storage |
| `zod` | Schema validation (scenarios, configs) |
| `yaml` | YAML parsing for scenario files |
| `fastest-levenshtein` | Fuzzy string matching |
| `handlebars` | HTML report templating |
| `pino` | Structured JSON logging |
| `prom-client` | Prometheus metrics |
| `nanoid` | Unique ID generation |
| `chalk` | CLI output styling |
| `ora` | CLI spinners |
| `cli-table3` | CLI table output |

---

## 3. Provider Architecture & LLM SDK Discussion

### 3.1 The LLM SDK Landscape

There are several approaches to integrating LLM providers:

#### Option A: Direct SDK Integration (Per-Provider)
```
OpenAI SDK ──────┐
Anthropic SDK ───┼──> Artemis Adapter Interface
Google SDK ──────┘
```

**Pros:**
- Full control over each provider's features
- No abstraction overhead
- Access to provider-specific capabilities

**Cons:**
- More adapter code to maintain
- Each provider requires separate implementation
- Inconsistent APIs across adapters

#### Option B: Vercel AI SDK as Unified Layer
```
Vercel AI SDK ──> Artemis Adapter Interface
     │
     ├── @ai-sdk/openai
     ├── @ai-sdk/anthropic
     ├── @ai-sdk/azure
     └── @ai-sdk/google
```

**Pros:**
- Single adapter implementation covers many providers
- Consistent API across all providers
- Active maintenance by Vercel
- Built-in streaming, tools, structured output

**Cons:**
- Abstraction may hide provider-specific features
- Dependency on Vercel's SDK updates
- Some providers may have delayed support

#### Option C: Hybrid Approach (Recommended for Artemis) ✓

```
┌─────────────────────────────────────────────────────────┐
│                  Artemis ModelClient Interface           │
└─────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Vercel AI SDK   │  │ OpenAI SDK      │  │ Anthropic SDK   │
│ Adapter         │  │ Adapter         │  │ Adapter         │
│ (Multi-provider)│  │ (Direct)        │  │ (Direct)        │
│     [MVP]       │  │     [MVP]       │  │   [Post-MVP]    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   OpenAI, Azure,        OpenAI, Azure,        Anthropic
   Anthropic, Google     OpenAI-compatible     Claude models
   via AI SDK providers  endpoints
```

**Why Hybrid?**
1. **Vercel AI SDK** provides quick access to many providers with minimal code
2. **Direct SDKs** offer full control when needed (e.g., Azure-specific auth, Anthropic beta features)
3. Users can choose the adapter that best fits their needs
4. Community can contribute additional adapters

### 3.2 MVP Adapter Strategy

For the MVP, we implement **two adapters**:

| Adapter | SDK Used | Providers Covered | Status |
|---------|----------|-------------------|--------|
| `@artemis/adapter-openai` | OpenAI SDK | OpenAI, Azure OpenAI, any OpenAI-compatible API | **MVP** |
| `@artemis/adapter-vercel-ai` | Vercel AI SDK | OpenAI, Azure (via Vercel) | **MVP** |

Post-MVP adapters (code structure ready, implementation commented out):

| Adapter | SDK Used | Status |
|---------|----------|--------|
| `@artemis/adapter-anthropic` | Anthropic SDK | Commented out |
| `@artemis/adapter-google` | Google AI SDK | Future |
| `@artemis/adapter-ollama` | Ollama API | Future |

### 3.3 Extensibility for Community Adapters

The adapter interface is designed to be simple enough for community contributions:

```typescript
// Any adapter must implement this interface
export interface ModelClient {
  /** Provider identifier for logging/manifests */
  readonly provider: string;
  
  /** Generate a completion from the model */
  generate(options: GenerateOptions): Promise<GenerateResult>;
  
  /** Stream a completion (optional) */
  stream?(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string>;
  
  /** Generate embeddings (optional) */
  embed?(text: string): Promise<number[]>;
  
  /** Get model capabilities */
  capabilities(): Promise<ModelCapabilities>;
  
  /** Cleanup resources (optional) */
  close?(): Promise<void>;
}
```

Community adapters can be:
- Published to npm as `@artemis/adapter-*` (official) or `artemis-adapter-*` (community)
- Loaded dynamically via the adapter factory
- Configured in `artemis.config.yaml`

---

## 4. Project Structure

```
artemis/
├── packages/
│   ├── core/                     # Core library (@artemis/core)
│   │   ├── src/
│   │   │   ├── index.ts          # Public exports
│   │   │   ├── runner/
│   │   │   │   ├── index.ts
│   │   │   │   ├── runner.ts     # Main test runner
│   │   │   │   ├── executor.ts   # Case executor
│   │   │   │   └── context.ts    # Run context
│   │   │   ├── scenario/
│   │   │   │   ├── index.ts
│   │   │   │   ├── parser.ts     # YAML parser
│   │   │   │   ├── schema.ts     # Zod schemas
│   │   │   │   └── types.ts      # TypeScript types
│   │   │   ├── evaluators/
│   │   │   │   ├── index.ts
│   │   │   │   ├── exact.ts
│   │   │   │   ├── regex.ts
│   │   │   │   ├── fuzzy.ts
│   │   │   │   ├── contains.ts
│   │   │   │   ├── json-schema.ts
│   │   │   │   ├── llm-grader.ts
│   │   │   │   └── types.ts
│   │   │   ├── metrics/
│   │   │   │   ├── index.ts
│   │   │   │   ├── collector.ts
│   │   │   │   ├── calculator.ts
│   │   │   │   ├── prometheus.ts
│   │   │   │   └── types.ts
│   │   │   ├── storage/
│   │   │   │   ├── index.ts
│   │   │   │   ├── types.ts      # StorageAdapter interface
│   │   │   │   ├── supabase.ts   # Supabase implementation
│   │   │   │   ├── local.ts      # Local filesystem (fallback)
│   │   │   │   └── factory.ts    # Storage factory
│   │   │   ├── artifacts/
│   │   │   │   ├── index.ts
│   │   │   │   ├── manifest.ts   # run_manifest generation
│   │   │   │   └── types.ts
│   │   │   ├── adapters/
│   │   │   │   ├── index.ts
│   │   │   │   ├── types.ts      # ModelClient interface
│   │   │   │   ├── factory.ts    # Dynamic adapter loading
│   │   │   │   └── registry.ts   # Adapter registry
│   │   │   ├── provenance/
│   │   │   │   ├── index.ts
│   │   │   │   ├── git.ts
│   │   │   │   └── environment.ts
│   │   │   ├── redaction/
│   │   │   │   ├── index.ts
│   │   │   │   └── patterns.ts
│   │   │   └── utils/
│   │   │       ├── hash.ts
│   │   │       ├── logger.ts
│   │   │       └── errors.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── adapters/
│   │   ├── openai/               # Direct OpenAI SDK adapter [MVP]
│   │   │   ├── src/
│   │   │   │   ├── index.ts
│   │   │   │   ├── client.ts     # ModelClient implementation
│   │   │   │   └── types.ts
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   │
│   │   ├── vercel-ai/            # Vercel AI SDK adapter [MVP]
│   │   │   ├── src/
│   │   │   │   ├── index.ts
│   │   │   │   ├── client.ts     # ModelClient implementation
│   │   │   │   ├── providers.ts  # Provider factory
│   │   │   │   └── types.ts
│   │   │   ├── package.json
│   │   │   └── tsconfig.json
│   │   │
│   │   └── anthropic/            # Direct Anthropic SDK adapter [Post-MVP]
│   │       ├── src/
│   │       │   ├── index.ts      # Exports NotImplementedError
│   │       │   ├── client.ts     # Commented out implementation
│   │       │   └── types.ts
│   │       ├── package.json
│   │       └── tsconfig.json
│   │
│   ├── cli/                      # CLI package (@artemis/cli)
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point
│   │   │   ├── cli.ts            # Commander setup
│   │   │   ├── commands/
│   │   │   │   ├── init.ts
│   │   │   │   ├── run.ts
│   │   │   │   ├── compare.ts
│   │   │   │   ├── report.ts
│   │   │   │   ├── redteam.ts
│   │   │   │   ├── stress.ts
│   │   │   │   └── history.ts    # View run history from Supabase
│   │   │   ├── config/
│   │   │   │   ├── loader.ts
│   │   │   │   └── schema.ts
│   │   │   └── output/
│   │   │       ├── console.ts
│   │   │       └── progress.ts
│   │   ├── bin/
│   │   │   └── artemis.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── reports/                  # Report generation (@artemis/reports)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── html/
│   │   │   │   ├── generator.ts
│   │   │   │   └── templates/
│   │   │   │       ├── report.hbs
│   │   │   │       ├── comparison.hbs
│   │   │   │       └── styles.css
│   │   │   └── json/
│   │   │       └── generator.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── redteam/                  # Red-team module (@artemis/redteam)
│       ├── src/
│       │   ├── index.ts
│       │   ├── mutations/
│       │   │   ├── index.ts
│       │   │   ├── typo.ts
│       │   │   ├── role-spoof.ts
│       │   │   ├── instruction-flip.ts
│       │   │   └── cot-injection.ts
│       │   ├── generator.ts      # LLM-based prompt generator
│       │   ├── detector.ts       # Unsafe response detection
│       │   └── severity.ts       # Severity mapping
│       ├── package.json
│       └── tsconfig.json
│
├── supabase/                     # Supabase configuration
│   ├── migrations/               # Database migrations
│   │   ├── 001_initial_schema.sql
│   │   └── 002_indexes.sql
│   ├── seed.sql                  # Seed data for development
│   └── config.toml               # Supabase local config
│
├── samples/                      # Example files
│   ├── scenarios/
│   │   ├── basic.yaml
│   │   ├── instruction-following.yaml
│   │   └── adversarial.yaml
│   ├── configs/
│   │   └── artemis.config.yaml
│   └── outputs/
│       ├── run_manifest.json
│       └── report.html
│
├── .github/
│   └── workflows/
│       ├── ci.yml                # Internal CI
│       └── artemis-example.yml   # Example for users
│
├── docs/
│   ├── prd.md
│   ├── implementation-plan.md    # This document
│   ├── adapters.md               # Adapter development guide
│   ├── api-reference.md
│   └── quickstart.md
│
├── scripts/
│   ├── build.ts
│   ├── release.ts
│   └── setup-supabase.ts         # Initialize Supabase project
│
├── package.json                  # Root workspace
├── bunfig.toml                   # Bun configuration
├── tsconfig.json                 # Base TypeScript config
├── biome.json                    # Linting configuration
└── README.md
```

---

## 5. Phase 0: Foundation & Setup

### 5.1 Repository Initialization

**Tasks:**

1. Initialize git repository
2. Create root `package.json` with Bun workspace configuration
3. Configure Bun via `bunfig.toml`
4. Set up TypeScript configuration
5. Configure Biome for linting/formatting
6. Set up Supabase project
7. Create initial CI workflow

**Root package.json:**

```json
{
  "name": "artemis",
  "version": "0.0.1",
  "private": true,
  "description": "Agent Reliability Toolkit",
  "type": "module",
  "workspaces": [
    "packages/*",
    "packages/adapters/*"
  ],
  "scripts": {
    "build": "bun run --filter '*' build",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "lint": "biome check .",
    "lint:fix": "biome check --apply .",
    "format": "biome format --write .",
    "typecheck": "bun run --filter '*' typecheck",
    "clean": "bun run --filter '*' clean",
    "dev": "bun run --filter '@artemis/cli' dev",
    "db:migrate": "bunx supabase db push",
    "db:generate-types": "bunx supabase gen types typescript --local > packages/core/src/storage/database.types.ts"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.5.0",
    "@types/bun": "^1.1.0",
    "typescript": "^5.3.0",
    "supabase": "^1.130.0"
  },
  "engines": {
    "bun": ">=1.1.0"
  }
}
```

**bunfig.toml:**

```toml
[install]
# Use exact versions for reproducibility
exact = true

[install.lockfile]
# Generate lockfile
save = true

[test]
# Test configuration
coverage = true
coverageDir = "coverage"
coverageThreshold = { lines = 80, functions = 80, branches = 70 }

[run]
# Bun run configuration
silent = false
```

**tsconfig.json (root):**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "types": ["bun-types"]
  },
  "exclude": ["node_modules", "dist"]
}
```

**biome.json:**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.5.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noForEach": "off"
      },
      "style": {
        "noNonNullAssertion": "warn"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingComma": "es5",
      "semicolons": "always"
    }
  }
}
```

### 5.2 Supabase Setup

**supabase/config.toml:**

```toml
[api]
port = 54321

[db]
port = 54322

[studio]
port = 54323

[storage]
file_size_limit = "50MB"
```

**Initialize Supabase:**

```bash
# Install Supabase CLI
bun add -D supabase

# Initialize Supabase project
bunx supabase init

# Start local Supabase (Docker required)
bunx supabase start

# Create project on Supabase cloud (optional)
# Go to https://supabase.com and create a project
```

### 5.3 Package Scaffolding

Create the following packages with their own `package.json` and `tsconfig.json`:

1. `@artemis/core` (packages/core)
2. `@artemis/adapter-openai` (packages/adapters/openai) - **MVP**
3. `@artemis/adapter-vercel-ai` (packages/adapters/vercel-ai) - **MVP**
4. `@artemis/adapter-anthropic` (packages/adapters/anthropic) - **Post-MVP (commented)**
5. `@artemis/cli` (packages/cli)
6. `@artemis/reports` (packages/reports)
7. `@artemis/redteam` (packages/redteam)

**Example package.json (packages/core):**

```json
{
  "name": "@artemis/core",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "bun build ./src/index.ts --outdir ./dist --target bun",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "test": "bun test"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "zod": "^3.22.0",
    "yaml": "^2.3.0",
    "fastest-levenshtein": "^1.0.16",
    "nanoid": "^5.0.0",
    "pino": "^8.17.0",
    "prom-client": "^15.1.0"
  },
  "devDependencies": {
    "@types/bun": "^1.1.0",
    "typescript": "^5.3.0"
  }
}
```

### 5.4 Deliverables

- [ ] Git repository with `.gitignore`
- [ ] Bun workspace configuration
- [ ] TypeScript configuration
- [ ] Biome linting configuration
- [ ] Supabase project setup (local + cloud)
- [ ] Database migrations
- [ ] GitHub Actions CI workflow (with Bun)
- [ ] All package scaffolds with empty `src/index.ts`
- [ ] Environment variables template (`.env.example`)

---

## 6. Phase 1: Core Libraries

### 6.1 Core Types & Interfaces

**File: `packages/core/src/adapters/types.ts`**

```typescript
/**
 * Chat message format compatible with OpenAI/Anthropic
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Options for generating a completion
 */
export interface GenerateOptions {
  /** The prompt - either a string or chat messages */
  prompt: string | ChatMessage[];
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus-20240229') */
  model?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
  /** Top-p sampling */
  topP?: number;
  /** Random seed for reproducibility */
  seed?: number;
  /** Stop sequences */
  stop?: string[];
  /** Function definitions (deprecated, use tools) */
  functions?: FunctionDefinition[];
  /** Tool definitions */
  tools?: ToolDefinition[];
  /** Response format */
  responseFormat?: { type: 'text' | 'json_object' };
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Function/Tool definitions for function calling
 */
export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/**
 * Result from a generation request
 */
export interface GenerateResult {
  /** Unique response ID */
  id: string;
  /** Model that generated the response */
  model: string;
  /** Generated text */
  text: string;
  /** Token usage */
  tokens: TokenUsage;
  /** Response latency in milliseconds */
  latencyMs: number;
  /** Why generation stopped */
  finishReason?: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter';
  /** Function call (if any) */
  functionCall?: {
    name: string;
    arguments: string;
  };
  /** Tool calls (if any) */
  toolCalls?: ToolCall[];
  /** Raw provider response */
  raw?: unknown;
}

/**
 * Model capabilities
 */
export interface ModelCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  toolUse: boolean;
  maxContext: number;
  vision?: boolean;
  jsonMode?: boolean;
}

/**
 * ModelClient interface - All adapters must implement this
 * 
 * This is the core abstraction that allows Artemis to work with any LLM provider.
 * Implement this interface to create a custom adapter.
 * 
 * @example
 * ```typescript
 * class MyAdapter implements ModelClient {
 *   readonly provider = 'my-provider';
 *   
 *   async generate(options: GenerateOptions): Promise<GenerateResult> {
 *     // Implementation
 *   }
 *   
 *   async capabilities(): Promise<ModelCapabilities> {
 *     return { streaming: true, functionCalling: false, toolUse: false, maxContext: 4096 };
 *   }
 * }
 * ```
 */
export interface ModelClient {
  /** Provider identifier for logging/manifests */
  readonly provider: string;
  
  /** Generate a completion from the model */
  generate(options: GenerateOptions): Promise<GenerateResult>;
  
  /** Stream a completion (optional) */
  stream?(
    options: GenerateOptions,
    onChunk: (chunk: string) => void
  ): AsyncIterable<string>;
  
  /** Generate embeddings (optional) */
  embed?(text: string): Promise<number[]>;
  
  /** Get model capabilities */
  capabilities(): Promise<ModelCapabilities>;
  
  /** Cleanup resources (optional) */
  close?(): Promise<void>;
}

/**
 * Provider types - all supported providers
 */
export type ProviderType = 
  | 'openai'           // MVP
  | 'azure-openai'     // MVP
  | 'vercel-ai'        // MVP
  | 'anthropic'        // Post-MVP
  | 'google'           // Post-MVP
  | 'mistral'          // Post-MVP
  | 'cohere'           // Post-MVP
  | 'huggingface'      // Post-MVP
  | 'ollama'           // Post-MVP
  | 'custom';          // User-defined

/**
 * Base adapter configuration
 */
export interface BaseAdapterConfig {
  provider: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * OpenAI-specific configuration
 */
export interface OpenAIAdapterConfig extends BaseAdapterConfig {
  provider: 'openai';
  organization?: string;
}

/**
 * Azure OpenAI-specific configuration
 */
export interface AzureOpenAIAdapterConfig extends BaseAdapterConfig {
  provider: 'azure-openai';
  resourceName: string;
  deploymentName: string;
  apiVersion: string;
}

/**
 * Vercel AI SDK configuration (supports multiple providers)
 */
export interface VercelAIAdapterConfig extends BaseAdapterConfig {
  provider: 'vercel-ai';
  /** The underlying provider to use with Vercel AI SDK */
  underlyingProvider: 'openai' | 'azure' | 'anthropic' | 'google' | 'mistral';
  /** Provider-specific configuration */
  providerConfig?: Record<string, unknown>;
}

/**
 * Anthropic-specific configuration (Post-MVP)
 */
export interface AnthropicAdapterConfig extends BaseAdapterConfig {
  provider: 'anthropic';
}

/**
 * Union type for all adapter configs
 */
export type AdapterConfig =
  | OpenAIAdapterConfig
  | AzureOpenAIAdapterConfig
  | VercelAIAdapterConfig
  | AnthropicAdapterConfig
  | BaseAdapterConfig;
```

### 6.2 Adapter Registry & Factory

**File: `packages/core/src/adapters/registry.ts`**

```typescript
import type { ModelClient, AdapterConfig, ProviderType } from './types';

type AdapterFactory = (config: AdapterConfig) => Promise<ModelClient>;

/**
 * Registry for adapter factories
 * Allows dynamic registration and lookup of adapters
 */
class AdapterRegistry {
  private adapters: Map<ProviderType, AdapterFactory> = new Map();
  private unavailable: Set<ProviderType> = new Set();

  /**
   * Register an adapter factory for a provider type
   */
  register(provider: ProviderType, factory: AdapterFactory): void {
    this.adapters.set(provider, factory);
    this.unavailable.delete(provider);
  }

  /**
   * Mark a provider as unavailable (post-MVP)
   */
  markUnavailable(provider: ProviderType, reason: string): void {
    this.unavailable.add(provider);
  }

  /**
   * Get an adapter factory by provider type
   */
  get(provider: ProviderType): AdapterFactory | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Check if a provider is registered
   */
  has(provider: ProviderType): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Check if a provider is marked as unavailable
   */
  isUnavailable(provider: ProviderType): boolean {
    return this.unavailable.has(provider);
  }

  /**
   * List all registered providers
   */
  list(): ProviderType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * List unavailable providers
   */
  listUnavailable(): ProviderType[] {
    return Array.from(this.unavailable);
  }
}

// Global adapter registry
export const adapterRegistry = new AdapterRegistry();

/**
 * Register built-in adapters
 * This is called during initialization
 */
export async function registerBuiltInAdapters(): Promise<void> {
  // ============================================
  // MVP ADAPTERS - Fully implemented
  // ============================================
  
  // OpenAI adapter (also handles Azure via config)
  adapterRegistry.register('openai', async (config) => {
    const { OpenAIAdapter } = await import('@artemis/adapter-openai');
    return new OpenAIAdapter(config);
  });

  adapterRegistry.register('azure-openai', async (config) => {
    const { OpenAIAdapter } = await import('@artemis/adapter-openai');
    return new OpenAIAdapter(config);
  });

  // Vercel AI SDK adapter (multi-provider)
  adapterRegistry.register('vercel-ai', async (config) => {
    const { VercelAIAdapter } = await import('@artemis/adapter-vercel-ai');
    return new VercelAIAdapter(config);
  });

  // ============================================
  // POST-MVP ADAPTERS - Not yet available
  // ============================================
  
  // Anthropic adapter - Coming soon
  adapterRegistry.markUnavailable('anthropic', 'Anthropic adapter coming in v0.2.0');
  
  // Google adapter - Coming soon
  adapterRegistry.markUnavailable('google', 'Google adapter coming in v0.3.0');
  
  // Mistral adapter - Coming soon
  adapterRegistry.markUnavailable('mistral', 'Mistral adapter coming in v0.3.0');
  
  // Ollama adapter - Coming soon
  adapterRegistry.markUnavailable('ollama', 'Ollama adapter coming in v0.3.0');
  
  // Hugging Face adapter - Coming soon
  adapterRegistry.markUnavailable('huggingface', 'Hugging Face adapter coming in v0.4.0');
  
  /*
  // UNCOMMENT WHEN IMPLEMENTING ANTHROPIC ADAPTER:
  adapterRegistry.register('anthropic', async (config) => {
    const { AnthropicAdapter } = await import('@artemis/adapter-anthropic');
    return new AnthropicAdapter(config);
  });
  */
}
```

**File: `packages/core/src/adapters/factory.ts`**

```typescript
import { adapterRegistry, registerBuiltInAdapters } from './registry';
import type { ModelClient, AdapterConfig, ProviderType } from './types';
import { ArtemisError } from '../utils/errors';

let initialized = false;

/**
 * Create a model adapter from configuration
 * 
 * @throws ArtemisError if provider is unknown or unavailable
 * 
 * @example
 * // OpenAI
 * const client = await createAdapter({
 *   provider: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY,
 *   defaultModel: 'gpt-4',
 * });
 * 
 * @example
 * // Azure OpenAI
 * const client = await createAdapter({
 *   provider: 'azure-openai',
 *   apiKey: process.env.AZURE_OPENAI_API_KEY,
 *   resourceName: 'my-resource',
 *   deploymentName: 'gpt-4',
 *   apiVersion: '2024-02-15-preview',
 * });
 * 
 * @example
 * // Vercel AI SDK with OpenAI
 * const client = await createAdapter({
 *   provider: 'vercel-ai',
 *   underlyingProvider: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 */
export async function createAdapter(config: AdapterConfig): Promise<ModelClient> {
  // Initialize built-in adapters on first use
  if (!initialized) {
    await registerBuiltInAdapters();
    initialized = true;
  }

  // Check if provider is marked as unavailable
  if (adapterRegistry.isUnavailable(config.provider)) {
    throw new ArtemisError(
      `Provider '${config.provider}' is not yet available. ` +
      `It will be implemented in a future release. ` +
      `Available providers: ${adapterRegistry.list().join(', ')}`,
      'PROVIDER_UNAVAILABLE'
    );
  }

  const factory = adapterRegistry.get(config.provider);
  
  if (!factory) {
    const available = adapterRegistry.list().join(', ');
    const unavailable = adapterRegistry.listUnavailable().join(', ');
    throw new ArtemisError(
      `Unknown provider: ${config.provider}. ` +
      `Available: ${available}. ` +
      `Coming soon: ${unavailable}`,
      'UNKNOWN_PROVIDER'
    );
  }

  return factory(config);
}

/**
 * Register a custom adapter
 * 
 * @example
 * // Register a custom adapter
 * registerAdapter('my-provider', async (config) => {
 *   return new MyCustomAdapter(config);
 * });
 */
export function registerAdapter(
  provider: ProviderType | string,
  factory: (config: AdapterConfig) => Promise<ModelClient>
): void {
  adapterRegistry.register(provider as ProviderType, factory);
}

/**
 * List available adapters
 */
export function listAdapters(): { available: string[]; unavailable: string[] } {
  return {
    available: adapterRegistry.list(),
    unavailable: adapterRegistry.listUnavailable(),
  };
}
```

### 6.3 Scenario Schema & Parser

**File: `packages/core/src/scenario/schema.ts`**

```typescript
import { z } from 'zod';

/**
 * Provider schema - supports all providers (including future ones)
 */
export const ProviderSchema = z.enum([
  'openai',
  'azure-openai',
  'vercel-ai',
  'anthropic',
  'google',
  'mistral',
  'cohere',
  'huggingface',
  'ollama',
  'custom',
]);

/**
 * Expected result types - how to evaluate responses
 */
export const ExpectedSchema = z.discriminatedUnion('type', [
  // Exact match
  z.object({
    type: z.literal('exact'),
    value: z.string(),
    caseSensitive: z.boolean().optional().default(true),
  }),
  
  // Regex pattern match
  z.object({
    type: z.literal('regex'),
    pattern: z.string(),
    flags: z.string().optional(),
  }),
  
  // Fuzzy match with Levenshtein distance
  z.object({
    type: z.literal('fuzzy'),
    value: z.string(),
    threshold: z.number().min(0).max(1).default(0.8),
  }),
  
  // LLM-based grading
  z.object({
    type: z.literal('llm_grader'),
    rubric: z.string(),
    model: z.string().optional(),
    provider: ProviderSchema.optional(),
    threshold: z.number().min(0).max(1).default(0.7),
  }),
  
  // Contains specific values
  z.object({
    type: z.literal('contains'),
    values: z.array(z.string()),
    mode: z.enum(['all', 'any']).default('all'),
  }),
  
  // JSON schema validation
  z.object({
    type: z.literal('json_schema'),
    schema: z.record(z.unknown()),
  }),
  
  // Custom evaluator
  z.object({
    type: z.literal('custom'),
    evaluator: z.string(), // Path to custom evaluator module
    config: z.record(z.unknown()).optional(),
  }),
]);

/**
 * Chat message schema
 */
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

/**
 * Test case schema
 */
export const TestCaseSchema = z.object({
  /** Unique identifier for the test case */
  id: z.string(),
  /** Human-readable name */
  name: z.string().optional(),
  /** Description of what this test validates */
  description: z.string().optional(),
  /** The prompt to send - string or chat messages */
  prompt: z.union([z.string(), z.array(ChatMessageSchema)]),
  /** Expected result and how to evaluate */
  expected: ExpectedSchema,
  /** Tags for filtering/grouping */
  tags: z.array(z.string()).optional().default([]),
  /** Additional metadata */
  metadata: z.record(z.unknown()).optional().default({}),
  /** Timeout in milliseconds */
  timeout: z.number().optional(),
  /** Number of retries on failure */
  retries: z.number().optional().default(0),
  /** Override provider for this case */
  provider: ProviderSchema.optional(),
  /** Override model for this case */
  model: z.string().optional(),
});

/**
 * Scenario schema - a collection of test cases
 */
export const ScenarioSchema = z.object({
  /** Scenario name */
  name: z.string(),
  /** Description */
  description: z.string().optional(),
  /** Version string */
  version: z.string().optional().default('1.0'),
  /** Default provider for all cases */
  provider: ProviderSchema.optional(),
  /** Default model for all cases */
  model: z.string().optional(),
  /** Random seed for reproducibility */
  seed: z.number().optional(),
  /** Default temperature */
  temperature: z.number().min(0).max(2).optional(),
  /** Default max tokens */
  maxTokens: z.number().optional(),
  /** Tags for filtering */
  tags: z.array(z.string()).optional().default([]),
  /** Setup configuration */
  setup: z.object({
    systemPrompt: z.string().optional(),
    functions: z.array(z.unknown()).optional(),
  }).optional(),
  /** Test cases */
  cases: z.array(TestCaseSchema).min(1),
  /** Teardown configuration */
  teardown: z.object({
    cleanup: z.boolean().optional(),
  }).optional(),
});

// Export types
export type Expected = z.infer<typeof ExpectedSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
```

**File: `packages/core/src/scenario/parser.ts`**

```typescript
import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { ScenarioSchema, type Scenario } from './schema';
import { ArtemisError } from '../utils/errors';

/**
 * Parse a scenario from a YAML file
 */
export async function parseScenarioFile(filePath: string): Promise<Scenario> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return parseScenarioString(content, filePath);
  } catch (error) {
    if (error instanceof ArtemisError) {
      throw error;
    }
    throw new ArtemisError(
      `Failed to read scenario file: ${filePath}`,
      'SCENARIO_READ_ERROR',
      { cause: error as Error }
    );
  }
}

/**
 * Parse a scenario from a YAML string
 */
export function parseScenarioString(content: string, source?: string): Scenario {
  try {
    const raw = parseYaml(content);
    const result = ScenarioSchema.safeParse(raw);
    
    if (!result.success) {
      const issues = result.error.issues.map(i => 
        `  - ${i.path.join('.')}: ${i.message}`
      ).join('\n');
      
      throw new ArtemisError(
        `Invalid scenario${source ? ` in ${source}` : ''}:\n${issues}`,
        'SCENARIO_VALIDATION_ERROR',
        { zodError: result.error }
      );
    }
    
    return result.data;
  } catch (error) {
    if (error instanceof ArtemisError) {
      throw error;
    }
    throw new ArtemisError(
      `Failed to parse scenario YAML${source ? ` from ${source}` : ''}`,
      'SCENARIO_PARSE_ERROR',
      { cause: error as Error }
    );
  }
}

/**
 * Validate a scenario object
 */
export function validateScenario(scenario: unknown): Scenario {
  const result = ScenarioSchema.safeParse(scenario);
  
  if (!result.success) {
    const issues = result.error.issues.map(i => 
      `  - ${i.path.join('.')}: ${i.message}`
    ).join('\n');
    
    throw new ArtemisError(
      `Invalid scenario:\n${issues}`,
      'SCENARIO_VALIDATION_ERROR',
      { zodError: result.error }
    );
  }
  
  return result.data;
}
```

### 6.4 Evaluators

**File: `packages/core/src/evaluators/types.ts`**

```typescript
import type { Expected, TestCase } from '../scenario/schema';
import type { ModelClient } from '../adapters/types';

/**
 * Context provided to evaluators
 */
export interface EvaluatorContext {
  /** The model client (for LLM-based evaluation) */
  client?: ModelClient;
  /** The test case being evaluated */
  testCase?: TestCase;
}

/**
 * Result from an evaluation
 */
export interface EvaluatorResult {
  /** Whether the evaluation passed */
  passed: boolean;
  /** Score from 0-1 */
  score: number;
  /** Human-readable reason */
  reason?: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Evaluator interface - implement to create custom evaluators
 */
export interface Evaluator {
  /** Evaluator type identifier */
  readonly type: string;
  
  /**
   * Evaluate a response against expected criteria
   */
  evaluate(
    response: string,
    expected: Expected,
    context?: EvaluatorContext
  ): Promise<EvaluatorResult>;
}
```

**File: `packages/core/src/evaluators/exact.ts`**

```typescript
import type { Evaluator, EvaluatorResult } from './types';
import type { Expected } from '../scenario/schema';

/**
 * Exact match evaluator
 */
export class ExactEvaluator implements Evaluator {
  readonly type = 'exact';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'exact') {
      throw new Error('Invalid expected type for ExactEvaluator');
    }

    const normalize = (s: string) => 
      expected.caseSensitive ? s.trim() : s.trim().toLowerCase();
    
    const passed = normalize(response) === normalize(expected.value);

    return {
      passed,
      score: passed ? 1 : 0,
      reason: passed 
        ? 'Exact match' 
        : `Expected "${expected.value}", got "${response.slice(0, 100)}${response.length > 100 ? '...' : ''}"`,
      details: {
        expected: expected.value,
        actual: response,
        caseSensitive: expected.caseSensitive,
      },
    };
  }
}
```

**File: `packages/core/src/evaluators/regex.ts`**

```typescript
import type { Evaluator, EvaluatorResult } from './types';
import type { Expected } from '../scenario/schema';

/**
 * Regex pattern evaluator
 */
export class RegexEvaluator implements Evaluator {
  readonly type = 'regex';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'regex') {
      throw new Error('Invalid expected type for RegexEvaluator');
    }

    try {
      const regex = new RegExp(expected.pattern, expected.flags);
      const match = regex.exec(response);
      const passed = match !== null;

      return {
        passed,
        score: passed ? 1 : 0,
        reason: passed 
          ? `Matched pattern: ${expected.pattern}` 
          : `Did not match pattern: ${expected.pattern}`,
        details: {
          pattern: expected.pattern,
          flags: expected.flags,
          match: match ? match[0] : null,
          groups: match ? match.groups : null,
        },
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Invalid regex pattern: ${(error as Error).message}`,
        details: { error: (error as Error).message },
      };
    }
  }
}
```

**File: `packages/core/src/evaluators/fuzzy.ts`**

```typescript
import { distance } from 'fastest-levenshtein';
import type { Evaluator, EvaluatorResult } from './types';
import type { Expected } from '../scenario/schema';

/**
 * Fuzzy match evaluator using Levenshtein distance
 */
export class FuzzyEvaluator implements Evaluator {
  readonly type = 'fuzzy';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'fuzzy') {
      throw new Error('Invalid expected type for FuzzyEvaluator');
    }

    const normalizedResponse = response.trim().toLowerCase();
    const normalizedExpected = expected.value.trim().toLowerCase();
    
    const maxLen = Math.max(normalizedResponse.length, normalizedExpected.length);
    const dist = distance(normalizedResponse, normalizedExpected);
    const similarity = maxLen > 0 ? 1 - dist / maxLen : 1;
    
    const passed = similarity >= expected.threshold;

    return {
      passed,
      score: similarity,
      reason: `Similarity: ${(similarity * 100).toFixed(1)}% (threshold: ${(expected.threshold * 100).toFixed(1)}%)`,
      details: {
        levenshteinDistance: dist,
        similarity,
        threshold: expected.threshold,
        expected: expected.value,
        actual: response,
      },
    };
  }
}
```

**File: `packages/core/src/evaluators/contains.ts`**

```typescript
import type { Evaluator, EvaluatorResult } from './types';
import type { Expected } from '../scenario/schema';

/**
 * Contains evaluator - checks if response contains specific values
 */
export class ContainsEvaluator implements Evaluator {
  readonly type = 'contains';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'contains') {
      throw new Error('Invalid expected type for ContainsEvaluator');
    }

    const normalizedResponse = response.toLowerCase();
    const results = expected.values.map(value => ({
      value,
      found: normalizedResponse.includes(value.toLowerCase()),
    }));

    const foundCount = results.filter(r => r.found).length;
    const passed = expected.mode === 'all' 
      ? foundCount === expected.values.length
      : foundCount > 0;

    const score = expected.values.length > 0 
      ? foundCount / expected.values.length 
      : 1;

    return {
      passed,
      score,
      reason: passed
        ? `Found ${foundCount}/${expected.values.length} values (mode: ${expected.mode})`
        : `Missing required values (mode: ${expected.mode})`,
      details: {
        mode: expected.mode,
        results,
        foundCount,
        totalCount: expected.values.length,
      },
    };
  }
}
```

**File: `packages/core/src/evaluators/json-schema.ts`**

```typescript
import { z } from 'zod';
import type { Evaluator, EvaluatorResult } from './types';
import type { Expected } from '../scenario/schema';

/**
 * JSON Schema evaluator - validates response against a JSON schema
 */
export class JsonSchemaEvaluator implements Evaluator {
  readonly type = 'json_schema';

  async evaluate(response: string, expected: Expected): Promise<EvaluatorResult> {
    if (expected.type !== 'json_schema') {
      throw new Error('Invalid expected type for JsonSchemaEvaluator');
    }

    // Try to parse JSON from response
    let parsed: unknown;
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();
      parsed = JSON.parse(jsonStr);
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Failed to parse JSON: ${(error as Error).message}`,
        details: { parseError: (error as Error).message },
      };
    }

    // Create Zod schema from JSON schema (simplified)
    // For full JSON Schema support, consider using ajv
    try {
      const zodSchema = this.jsonSchemaToZod(expected.schema);
      const result = zodSchema.safeParse(parsed);
      
      if (result.success) {
        return {
          passed: true,
          score: 1,
          reason: 'Response matches JSON schema',
          details: { parsed },
        };
      } else {
        const issues = result.error.issues.map(i => 
          `${i.path.join('.')}: ${i.message}`
        );
        return {
          passed: false,
          score: 0,
          reason: `Schema validation failed: ${issues.join(', ')}`,
          details: { 
            parsed, 
            errors: issues,
            zodError: result.error,
          },
        };
      }
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Schema error: ${(error as Error).message}`,
        details: { error: (error as Error).message },
      };
    }
  }

  /**
   * Convert a simple JSON schema to Zod (basic implementation)
   * For production, consider using a proper JSON Schema validator
   */
  private jsonSchemaToZod(schema: Record<string, unknown>): z.ZodTypeAny {
    const type = schema.type as string;
    
    switch (type) {
      case 'string':
        return z.string();
      case 'number':
        return z.number();
      case 'integer':
        return z.number().int();
      case 'boolean':
        return z.boolean();
      case 'null':
        return z.null();
      case 'array':
        if (schema.items) {
          return z.array(this.jsonSchemaToZod(schema.items as Record<string, unknown>));
        }
        return z.array(z.unknown());
      case 'object':
        if (schema.properties) {
          const shape: Record<string, z.ZodTypeAny> = {};
          const required = (schema.required as string[]) || [];
          
          for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
            const fieldSchema = this.jsonSchemaToZod(value as Record<string, unknown>);
            shape[key] = required.includes(key) ? fieldSchema : fieldSchema.optional();
          }
          return z.object(shape);
        }
        return z.record(z.unknown());
      default:
        return z.unknown();
    }
  }
}
```

**File: `packages/core/src/evaluators/llm-grader.ts`**

```typescript
import type { Evaluator, EvaluatorResult, EvaluatorContext } from './types';
import type { Expected } from '../scenario/schema';

const GRADER_PROMPT = `You are an evaluator grading an AI response based on a rubric.

## RUBRIC
{{rubric}}

## RESPONSE TO EVALUATE
{{response}}

## INSTRUCTIONS
Score the response from 0.0 to 1.0 based on the rubric.
Be objective and consistent in your scoring.

Respond with ONLY a JSON object in this exact format:
{"score": <number between 0 and 1>, "reason": "<brief explanation of score>"}

Do not include any other text, markdown, or formatting.`;

/**
 * LLM-based grader evaluator
 * Uses an LLM to evaluate responses based on a rubric
 */
export class LLMGraderEvaluator implements Evaluator {
  readonly type = 'llm_grader';

  async evaluate(
    response: string,
    expected: Expected,
    context?: EvaluatorContext
  ): Promise<EvaluatorResult> {
    if (expected.type !== 'llm_grader') {
      throw new Error('Invalid expected type for LLMGraderEvaluator');
    }

    if (!context?.client) {
      throw new Error('LLM grader requires a ModelClient in context');
    }

    const prompt = GRADER_PROMPT
      .replace('{{rubric}}', expected.rubric)
      .replace('{{response}}', response);

    try {
      const result = await context.client.generate({
        prompt,
        model: expected.model,
        temperature: 0,
        maxTokens: 200,
      });

      // Parse the grader's response
      const parsed = this.parseGraderResponse(result.text);
      const passed = parsed.score >= expected.threshold;

      return {
        passed,
        score: parsed.score,
        reason: parsed.reason || `Score: ${parsed.score.toFixed(2)}`,
        details: { 
          graderResponse: result.text,
          rubric: expected.rubric,
          threshold: expected.threshold,
          model: result.model,
        },
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Grader failed: ${(error as Error).message}`,
        details: { error: (error as Error).message },
      };
    }
  }

  private parseGraderResponse(text: string): { score: number; reason?: string } {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in grader response');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Number(parsed.score);
      
      if (isNaN(score) || score < 0 || score > 1) {
        throw new Error(`Invalid score: ${parsed.score}`);
      }

      return {
        score,
        reason: parsed.reason,
      };
    } catch (error) {
      throw new Error(`Failed to parse grader response: ${(error as Error).message}`);
    }
  }
}
```

**File: `packages/core/src/evaluators/index.ts`**

```typescript
import type { Evaluator } from './types';
import { ExactEvaluator } from './exact';
import { RegexEvaluator } from './regex';
import { FuzzyEvaluator } from './fuzzy';
import { ContainsEvaluator } from './contains';
import { JsonSchemaEvaluator } from './json-schema';
import { LLMGraderEvaluator } from './llm-grader';

// Registry of evaluators
const evaluators: Map<string, Evaluator> = new Map([
  ['exact', new ExactEvaluator()],
  ['regex', new RegexEvaluator()],
  ['fuzzy', new FuzzyEvaluator()],
  ['contains', new ContainsEvaluator()],
  ['json_schema', new JsonSchemaEvaluator()],
  ['llm_grader', new LLMGraderEvaluator()],
]);

/**
 * Get an evaluator by type
 */
export function getEvaluator(type: string): Evaluator {
  const evaluator = evaluators.get(type);
  if (!evaluator) {
    const available = Array.from(evaluators.keys()).join(', ');
    throw new Error(`Unknown evaluator type: ${type}. Available: ${available}`);
  }
  return evaluator;
}

/**
 * Register a custom evaluator
 */
export function registerEvaluator(type: string, evaluator: Evaluator): void {
  evaluators.set(type, evaluator);
}

/**
 * List available evaluator types
 */
export function listEvaluators(): string[] {
  return Array.from(evaluators.keys());
}

// Export types and classes
export * from './types';
export { ExactEvaluator } from './exact';
export { RegexEvaluator } from './regex';
export { FuzzyEvaluator } from './fuzzy';
export { ContainsEvaluator } from './contains';
export { JsonSchemaEvaluator } from './json-schema';
export { LLMGraderEvaluator } from './llm-grader';
```

### 6.5 Error Handling

**File: `packages/core/src/utils/errors.ts`**

```typescript
/**
 * Error codes used throughout Artemis
 */
export type ArtemisErrorCode =
  | 'UNKNOWN_PROVIDER'
  | 'PROVIDER_UNAVAILABLE'
  | 'SCENARIO_READ_ERROR'
  | 'SCENARIO_PARSE_ERROR'
  | 'SCENARIO_VALIDATION_ERROR'
  | 'ADAPTER_ERROR'
  | 'GENERATION_ERROR'
  | 'EVALUATION_ERROR'
  | 'STORAGE_ERROR'
  | 'CONFIG_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Custom error class for Artemis
 */
export class ArtemisError extends Error {
  readonly code: ArtemisErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: ArtemisErrorCode = 'UNKNOWN_ERROR',
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ArtemisError';
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Check if error is an ArtemisError
 */
export function isArtemisError(error: unknown): error is ArtemisError {
  return error instanceof ArtemisError;
}

/**
 * Wrap unknown errors in ArtemisError
 */
export function wrapError(
  error: unknown, 
  code: ArtemisErrorCode = 'UNKNOWN_ERROR',
  context?: string
): ArtemisError {
  if (error instanceof ArtemisError) {
    return error;
  }
  
  const message = error instanceof Error 
    ? error.message 
    : String(error);
  
  return new ArtemisError(
    context ? `${context}: ${message}` : message,
    code,
    { originalError: error }
  );
}
```

### 6.6 Logger

**File: `packages/core/src/utils/logger.ts`**

```typescript
import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const level = process.env.ARTEMIS_LOG_LEVEL || 'info';

const baseLogger = pino({
  level,
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

/**
 * Logger class for consistent logging across Artemis
 */
export class Logger {
  private logger: pino.Logger;

  constructor(name: string) {
    this.logger = baseLogger.child({ name });
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(data, message);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(data, message);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(data, message);
  }

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData = error instanceof Error 
      ? { error: { message: error.message, stack: error.stack, name: error.name } }
      : { error };
    this.logger.error({ ...data, ...errorData }, message);
  }

  child(bindings: Record<string, unknown>): Logger {
    const childLogger = new Logger('');
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger('artemis');
```

### 6.7 Deliverables

- [ ] Core types and interfaces (`types.ts`)
- [ ] Adapter registry and factory with MVP/Post-MVP separation
- [ ] Scenario schema with Zod validation (multi-provider support)
- [ ] YAML scenario parser with good error messages
- [ ] Evaluators: exact, regex, fuzzy, contains, json_schema, llm_grader
- [ ] Custom error class with error codes
- [ ] Structured logger utility
- [ ] Unit tests for all components (80%+ coverage)

---

## 7. Phase 2: Provider Adapters

### 7.1 OpenAI SDK Adapter (MVP)

Supports: OpenAI, Azure OpenAI, and any OpenAI-compatible API

**File: `packages/adapters/openai/src/client.ts`**

```typescript
import OpenAI from 'openai';
import type {
  ModelClient,
  GenerateOptions,
  GenerateResult,
  ModelCapabilities,
  OpenAIAdapterConfig,
  AzureOpenAIAdapterConfig,
  AdapterConfig,
} from '@artemis/core';
import { nanoid } from 'nanoid';

/**
 * OpenAI SDK Adapter
 * 
 * Supports:
 * - OpenAI API
 * - Azure OpenAI API
 * - Any OpenAI-compatible API (via baseUrl)
 */
export class OpenAIAdapter implements ModelClient {
  private client: OpenAI;
  private config: OpenAIAdapterConfig | AzureOpenAIAdapterConfig;
  readonly provider: string;

  constructor(config: AdapterConfig) {
    this.config = config as OpenAIAdapterConfig | AzureOpenAIAdapterConfig;
    
    if (config.provider === 'azure-openai') {
      const azureConfig = config as AzureOpenAIAdapterConfig;
      this.provider = 'azure-openai';
      
      // Configure for Azure OpenAI
      this.client = new OpenAI({
        apiKey: azureConfig.apiKey,
        baseURL: `https://${azureConfig.resourceName}.openai.azure.com/openai/deployments/${azureConfig.deploymentName}`,
        defaultQuery: { 'api-version': azureConfig.apiVersion },
        defaultHeaders: { 'api-key': azureConfig.apiKey! },
        timeout: azureConfig.timeout ?? 60000,
        maxRetries: azureConfig.maxRetries ?? 2,
      });
    } else {
      const openaiConfig = config as OpenAIAdapterConfig;
      this.provider = 'openai';
      
      // Configure for OpenAI (or compatible API)
      this.client = new OpenAI({
        apiKey: openaiConfig.apiKey,
        baseURL: openaiConfig.baseUrl, // Allows OpenAI-compatible endpoints
        organization: openaiConfig.organization,
        timeout: openaiConfig.timeout ?? 60000,
        maxRetries: openaiConfig.maxRetries ?? 2,
      });
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const model = options.model || this.config.defaultModel || 'gpt-4';

    const messages = this.normalizePrompt(options.prompt);

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      seed: options.seed,
      stop: options.stop,
      tools: options.tools,
      response_format: options.responseFormat,
    });

    const latencyMs = Date.now() - startTime;
    const choice = response.choices[0];

    return {
      id: response.id || nanoid(),
      model: response.model,
      text: choice.message.content || '',
      tokens: {
        prompt: response.usage?.prompt_tokens ?? 0,
        completion: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      latencyMs,
      finishReason: this.mapFinishReason(choice.finish_reason),
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        type: tc.type as 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      raw: response,
    };
  }

  async *stream(
    options: GenerateOptions,
    onChunk: (chunk: string) => void
  ): AsyncIterable<string> {
    const model = options.model || this.config.defaultModel || 'gpt-4';
    const messages = this.normalizePrompt(options.prompt);

    const stream = await this.client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        onChunk(content);
        yield content;
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    const model = this.config.provider === 'azure-openai' 
      ? 'text-embedding-ada-002' 
      : 'text-embedding-3-small';
    
    const response = await this.client.embeddings.create({
      model,
      input: text,
    });
    return response.data[0].embedding;
  }

  async capabilities(): Promise<ModelCapabilities> {
    return {
      streaming: true,
      functionCalling: true,
      toolUse: true,
      maxContext: 128000,
      vision: true,
      jsonMode: true,
    };
  }

  async close(): Promise<void> {
    // No cleanup needed
  }

  private normalizePrompt(prompt: GenerateOptions['prompt']) {
    if (typeof prompt === 'string') {
      return [{ role: 'user' as const, content: prompt }];
    }
    return prompt.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));
  }

  private mapFinishReason(reason: string | null): GenerateResult['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'tool_calls': return 'tool_calls';
      case 'content_filter': return 'content_filter';
      default: return 'stop';
    }
  }
}
```

### 7.2 Vercel AI SDK Adapter (MVP)

**File: `packages/adapters/vercel-ai/src/client.ts`**

```typescript
import { generateText, streamText, embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAzure } from '@ai-sdk/azure';
import type {
  ModelClient,
  GenerateOptions,
  GenerateResult,
  ModelCapabilities,
  VercelAIAdapterConfig,
  AdapterConfig,
} from '@artemis/core';
import { nanoid } from 'nanoid';

type AIProvider = ReturnType<typeof createOpenAI> | ReturnType<typeof createAzure>;

/**
 * Vercel AI SDK Adapter
 * 
 * Provides a unified interface to multiple providers via Vercel's AI SDK.
 * MVP supports: openai, azure
 * Post-MVP: anthropic, google, mistral
 */
export class VercelAIAdapter implements ModelClient {
  private aiProvider: AIProvider;
  private config: VercelAIAdapterConfig;
  readonly provider: string;

  constructor(config: AdapterConfig) {
    this.config = config as VercelAIAdapterConfig;
    this.provider = `vercel-ai:${this.config.underlyingProvider}`;
    this.aiProvider = this.createProvider();
  }

  private createProvider(): AIProvider {
    const { underlyingProvider, apiKey, baseUrl, providerConfig } = this.config;

    switch (underlyingProvider) {
      case 'openai':
        return createOpenAI({
          apiKey,
          baseURL: baseUrl,
          ...providerConfig,
        });

      case 'azure':
        return createAzure({
          apiKey,
          resourceName: providerConfig?.resourceName as string,
          ...providerConfig,
        });

      // ============================================
      // POST-MVP PROVIDERS - Uncomment when ready
      // ============================================
      
      /*
      case 'anthropic':
        // Requires: @ai-sdk/anthropic
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({
          apiKey,
          baseURL: baseUrl,
          ...providerConfig,
        });

      case 'google':
        // Requires: @ai-sdk/google
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        return createGoogleGenerativeAI({
          apiKey,
          baseURL: baseUrl,
          ...providerConfig,
        });

      case 'mistral':
        // Requires: @ai-sdk/mistral
        const { createMistral } = await import('@ai-sdk/mistral');
        return createMistral({
          apiKey,
          baseURL: baseUrl,
          ...providerConfig,
        });
      */

      default:
        throw new Error(
          `Unsupported Vercel AI provider: ${underlyingProvider}. ` +
          `MVP supports: openai, azure. ` +
          `Coming soon: anthropic, google, mistral.`
        );
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const model = options.model || this.config.defaultModel;
    
    if (!model) {
      throw new Error('Model must be specified');
    }

    const messages = this.normalizePrompt(options.prompt);

    const result = await generateText({
      model: this.aiProvider(model),
      messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      seed: options.seed,
      stopSequences: options.stop,
    });

    const latencyMs = Date.now() - startTime;

    return {
      id: nanoid(),
      model,
      text: result.text,
      tokens: {
        prompt: result.usage?.promptTokens ?? 0,
        completion: result.usage?.completionTokens ?? 0,
        total: result.usage?.totalTokens ?? 0,
      },
      latencyMs,
      finishReason: this.mapFinishReason(result.finishReason),
      raw: result,
    };
  }

  async *stream(
    options: GenerateOptions,
    onChunk: (chunk: string) => void
  ): AsyncIterable<string> {
    const model = options.model || this.config.defaultModel;
    
    if (!model) {
      throw new Error('Model must be specified');
    }

    const messages = this.normalizePrompt(options.prompt);

    const result = await streamText({
      model: this.aiProvider(model),
      messages,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      seed: options.seed,
    });

    for await (const chunk of result.textStream) {
      onChunk(chunk);
      yield chunk;
    }
  }

  async embed(text: string): Promise<number[]> {
    const result = await embed({
      model: this.aiProvider.embedding('text-embedding-3-small'),
      value: text,
    });
    return result.embedding;
  }

  async capabilities(): Promise<ModelCapabilities> {
    // Capabilities vary by underlying provider
    const caps: Record<string, Partial<ModelCapabilities>> = {
      openai: { streaming: true, functionCalling: true, toolUse: true, maxContext: 128000, vision: true, jsonMode: true },
      azure: { streaming: true, functionCalling: true, toolUse: true, maxContext: 128000, vision: true, jsonMode: true },
      anthropic: { streaming: true, functionCalling: true, toolUse: true, maxContext: 200000, vision: true, jsonMode: false },
      google: { streaming: true, functionCalling: true, toolUse: true, maxContext: 128000, vision: true, jsonMode: false },
    };

    return {
      streaming: true,
      functionCalling: true,
      toolUse: true,
      maxContext: 128000,
      ...caps[this.config.underlyingProvider],
    } as ModelCapabilities;
  }

  async close(): Promise<void> {
    // No cleanup needed
  }

  private normalizePrompt(prompt: GenerateOptions['prompt']) {
    if (typeof prompt === 'string') {
      return [{ role: 'user' as const, content: prompt }];
    }
    return prompt.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));
  }

  private mapFinishReason(reason: string | undefined): GenerateResult['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'tool-calls': return 'tool_calls';
      case 'content-filter': return 'content_filter';
      default: return 'stop';
    }
  }
}
```

### 7.3 Anthropic Adapter (Post-MVP - Commented Out)

**File: `packages/adapters/anthropic/src/index.ts`**

```typescript
import { ArtemisError } from '@artemis/core';

/**
 * Anthropic Adapter - Coming in v0.2.0
 * 
 * This adapter is planned for a future release.
 * For now, you can use the Vercel AI SDK adapter with Anthropic
 * once we enable that provider.
 */
export class AnthropicAdapter {
  constructor() {
    throw new ArtemisError(
      'Anthropic adapter is not yet available. Coming in v0.2.0. ' +
      'For now, use the OpenAI adapter or Vercel AI SDK adapter.',
      'PROVIDER_UNAVAILABLE'
    );
  }
}

/*
// ============================================
// UNCOMMENT WHEN IMPLEMENTING ANTHROPIC ADAPTER
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import type {
  ModelClient,
  GenerateOptions,
  GenerateResult,
  ModelCapabilities,
  AnthropicAdapterConfig,
  AdapterConfig,
} from '@artemis/core';
import { nanoid } from 'nanoid';

export class AnthropicAdapter implements ModelClient {
  private client: Anthropic;
  private config: AnthropicAdapterConfig;
  readonly provider = 'anthropic';

  constructor(config: AdapterConfig) {
    this.config = config as AnthropicAdapterConfig;
    
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout ?? 60000,
      maxRetries: this.config.maxRetries ?? 2,
    });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    const model = options.model || this.config.defaultModel || 'claude-3-opus-20240229';

    const { systemPrompt, messages } = this.normalizePrompt(options.prompt);

    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      top_p: options.topP,
      stop_sequences: options.stop,
      system: systemPrompt,
      messages,
    });

    const latencyMs = Date.now() - startTime;
    const textContent = response.content.find(c => c.type === 'text');

    return {
      id: response.id || nanoid(),
      model: response.model,
      text: textContent?.type === 'text' ? textContent.text : '',
      tokens: {
        prompt: response.usage.input_tokens,
        completion: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      latencyMs,
      finishReason: this.mapStopReason(response.stop_reason),
      raw: response,
    };
  }

  async *stream(
    options: GenerateOptions,
    onChunk: (chunk: string) => void
  ): AsyncIterable<string> {
    const model = options.model || this.config.defaultModel || 'claude-3-opus-20240229';
    const { systemPrompt, messages } = this.normalizePrompt(options.prompt);

    const stream = await this.client.messages.stream({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        onChunk(text);
        yield text;
      }
    }
  }

  async capabilities(): Promise<ModelCapabilities> {
    return {
      streaming: true,
      functionCalling: true,
      toolUse: true,
      maxContext: 200000,
      vision: true,
      jsonMode: false,
    };
  }

  async close(): Promise<void> {}

  private normalizePrompt(prompt: GenerateOptions['prompt']): {
    systemPrompt?: string;
    messages: Anthropic.MessageParam[];
  } {
    if (typeof prompt === 'string') {
      return { messages: [{ role: 'user', content: prompt }] };
    }

    let systemPrompt: string | undefined;
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of prompt) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    return { systemPrompt, messages };
  }

  private mapStopReason(reason: string | null): GenerateResult['finishReason'] {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'max_tokens': return 'length';
      case 'tool_use': return 'tool_calls';
      default: return 'stop';
    }
  }
}
*/
```

### 7.4 Deliverables

- [ ] OpenAI SDK adapter (OpenAI + Azure OpenAI + compatible APIs) - **MVP**
- [ ] Vercel AI SDK adapter (OpenAI, Azure via Vercel) - **MVP**
- [ ] Anthropic adapter (commented out with implementation ready) - **Post-MVP**
- [ ] Adapter registry with MVP/Post-MVP separation
- [ ] Streaming support in all MVP adapters
- [ ] Embedding support in all MVP adapters
- [ ] Unit tests with mocked responses
- [ ] Integration tests with recorded fixtures
- [ ] Documentation for creating custom adapters

---

## 8-13. Remaining Phases

Due to length, I'll summarize the remaining phases. Full implementations are available in the codebase.

---

## 10. Phase 5: Artifacts & Storage (Supabase)

### 10.1 Supabase Storage Adapter

**File: `packages/core/src/storage/supabase.ts`**

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { StorageAdapter, RunManifest } from './types';
import type { Database } from './database.types';

export interface SupabaseStorageConfig {
  url: string;
  anonKey: string;
  bucket?: string;
}

/**
 * Supabase Storage Adapter
 * 
 * Uses Supabase for:
 * - Storage: Run manifests and reports (JSON/HTML files)
 * - Database: Run metadata, metrics history, queries
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  private client: SupabaseClient<Database>;
  private bucket: string;

  constructor(config: SupabaseStorageConfig) {
    this.client = createClient<Database>(config.url, config.anonKey);
    this.bucket = config.bucket || 'artemis-runs';
  }

  /**
   * Save a run manifest to Supabase
   * - Stores JSON in Storage bucket
   * - Inserts metadata into database for querying
   */
  async save(manifest: RunManifest): Promise<string> {
    const filePath = `${manifest.project}/${manifest.run_id}.json`;
    
    // Upload to Storage
    const { error: uploadError } = await this.client.storage
      .from(this.bucket)
      .upload(filePath, JSON.stringify(manifest, null, 2), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload manifest: ${uploadError.message}`);
    }

    // Insert metadata into database
    const { error: dbError } = await this.client
      .from('runs')
      .upsert({
        run_id: manifest.run_id,
        project: manifest.project,
        scenario: manifest.config.scenario,
        provider: manifest.config.provider,
        model: manifest.config.model,
        success_rate: manifest.metrics.success_rate,
        total_cases: manifest.cases.length,
        passed_cases: manifest.cases.filter(c => c.ok).length,
        failed_cases: manifest.cases.filter(c => !c.ok).length,
        median_latency_ms: manifest.metrics.median_latency_ms,
        total_tokens: manifest.metrics.total_tokens,
        git_commit: manifest.git.commit,
        git_branch: manifest.git.branch,
        run_by: manifest.provenance.run_by,
        started_at: manifest.start_time,
        ended_at: manifest.end_time,
        manifest_path: filePath,
      });

    if (dbError) {
      throw new Error(`Failed to save run metadata: ${dbError.message}`);
    }

    return filePath;
  }

  /**
   * Load a run manifest by ID
   */
  async load(runId: string): Promise<RunManifest> {
    // Get file path from database
    const { data: run, error: dbError } = await this.client
      .from('runs')
      .select('manifest_path')
      .eq('run_id', runId)
      .single();

    if (dbError || !run) {
      throw new Error(`Run not found: ${runId}`);
    }

    // Download from Storage
    const { data, error: downloadError } = await this.client.storage
      .from(this.bucket)
      .download(run.manifest_path);

    if (downloadError || !data) {
      throw new Error(`Failed to download manifest: ${downloadError?.message}`);
    }

    const text = await data.text();
    return JSON.parse(text);
  }

  /**
   * List runs with optional filters
   */
  async list(options?: {
    project?: string;
    scenario?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ runId: string; scenario: string; successRate: number; createdAt: string }[]> {
    let query = this.client
      .from('runs')
      .select('run_id, scenario, success_rate, started_at')
      .order('started_at', { ascending: false });

    if (options?.project) {
      query = query.eq('project', options.project);
    }
    if (options?.scenario) {
      query = query.eq('scenario', options.scenario);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list runs: ${error.message}`);
    }

    return (data || []).map(r => ({
      runId: r.run_id,
      scenario: r.scenario,
      successRate: r.success_rate,
      createdAt: r.started_at,
    }));
  }

  /**
   * Delete a run
   */
  async delete(runId: string): Promise<void> {
    // Get file path
    const { data: run } = await this.client
      .from('runs')
      .select('manifest_path')
      .eq('run_id', runId)
      .single();

    if (run) {
      // Delete from Storage
      await this.client.storage
        .from(this.bucket)
        .remove([run.manifest_path]);
    }

    // Delete from database
    await this.client
      .from('runs')
      .delete()
      .eq('run_id', runId);
  }

  /**
   * Get comparison between two runs
   */
  async compare(baselineId: string, currentId: string): Promise<{
    baseline: RunManifest;
    current: RunManifest;
    delta: {
      successRate: number;
      latency: number;
      tokens: number;
    };
  }> {
    const [baseline, current] = await Promise.all([
      this.load(baselineId),
      this.load(currentId),
    ]);

    return {
      baseline,
      current,
      delta: {
        successRate: current.metrics.success_rate - baseline.metrics.success_rate,
        latency: current.metrics.median_latency_ms - baseline.metrics.median_latency_ms,
        tokens: current.metrics.total_tokens - baseline.metrics.total_tokens,
      },
    };
  }
}
```

### 10.2 Local Storage Fallback

**File: `packages/core/src/storage/local.ts`**

```typescript
import { mkdir, writeFile, readFile, readdir, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import type { StorageAdapter, RunManifest } from './types';

/**
 * Local filesystem storage adapter
 * Used as fallback when Supabase is not configured
 */
export class LocalStorageAdapter implements StorageAdapter {
  private basePath: string;

  constructor(basePath: string = './artemis-runs') {
    this.basePath = resolve(basePath);
  }

  async save(manifest: RunManifest): Promise<string> {
    const dir = join(this.basePath, manifest.project);
    await mkdir(dir, { recursive: true });
    
    const filePath = join(dir, `${manifest.run_id}.json`);
    await writeFile(filePath, JSON.stringify(manifest, null, 2));
    
    return filePath;
  }

  async load(runId: string): Promise<RunManifest> {
    // Search for the file in all project directories
    const projects = await readdir(this.basePath);
    
    for (const project of projects) {
      const filePath = join(this.basePath, project, `${runId}.json`);
      try {
        const content = await readFile(filePath, 'utf-8');
        return JSON.parse(content);
      } catch {
        continue;
      }
    }
    
    throw new Error(`Run not found: ${runId}`);
  }

  async list(options?: {
    project?: string;
    limit?: number;
  }): Promise<{ runId: string; scenario: string; successRate: number; createdAt: string }[]> {
    const results: { runId: string; scenario: string; successRate: number; createdAt: string }[] = [];
    
    const projects = options?.project 
      ? [options.project] 
      : await readdir(this.basePath).catch(() => []);
    
    for (const project of projects) {
      const projectDir = join(this.basePath, project);
      const files = await readdir(projectDir).catch(() => []);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const content = await readFile(join(projectDir, file), 'utf-8');
          const manifest: RunManifest = JSON.parse(content);
          results.push({
            runId: manifest.run_id,
            scenario: manifest.config.scenario,
            successRate: manifest.metrics.success_rate,
            createdAt: manifest.start_time,
          });
        } catch {
          continue;
        }
      }
    }
    
    // Sort by date descending
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return options?.limit ? results.slice(0, options.limit) : results;
  }

  async delete(runId: string): Promise<void> {
    const projects = await readdir(this.basePath);
    
    for (const project of projects) {
      const filePath = join(this.basePath, project, `${runId}.json`);
      try {
        await unlink(filePath);
        return;
      } catch {
        continue;
      }
    }
  }
}
```

---

## 18. Database Schema (Supabase)

### 18.1 Initial Migration

**File: `supabase/migrations/001_initial_schema.sql`**

```sql
-- Artemis Database Schema
-- Run history and metrics storage

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Runs table: stores metadata for each test run
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id TEXT UNIQUE NOT NULL,
  project TEXT NOT NULL DEFAULT 'default',
  scenario TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  
  -- Metrics
  success_rate DECIMAL(5, 4) NOT NULL,
  total_cases INTEGER NOT NULL,
  passed_cases INTEGER NOT NULL,
  failed_cases INTEGER NOT NULL,
  median_latency_ms INTEGER,
  p95_latency_ms INTEGER,
  total_tokens INTEGER,
  
  -- Git provenance
  git_commit TEXT,
  git_branch TEXT,
  git_dirty BOOLEAN DEFAULT false,
  
  -- Audit
  run_by TEXT,
  run_reason TEXT,
  
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Storage reference
  manifest_path TEXT NOT NULL
);

-- Case results table: stores individual test case results
CREATE TABLE case_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  
  -- Result
  passed BOOLEAN NOT NULL,
  score DECIMAL(5, 4),
  matcher_type TEXT NOT NULL,
  
  -- Performance
  latency_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  
  -- Error (if failed)
  error_message TEXT,
  
  -- Tags for filtering
  tags TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(run_id, case_id)
);

-- Baselines table: track baseline runs for comparison
CREATE TABLE baselines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  
  UNIQUE(project, scenario)
);

-- Metrics history: aggregate metrics over time
CREATE TABLE metrics_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  
  -- Aggregated metrics (daily)
  date DATE NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  avg_success_rate DECIMAL(5, 4),
  avg_latency_ms INTEGER,
  total_tokens_used BIGINT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(project, scenario, provider, model, date)
);

-- Row Level Security (for future multi-tenant support)
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_history ENABLE ROW LEVEL SECURITY;

-- For now, allow all access (will add policies for auth later)
CREATE POLICY "Allow all access to runs" ON runs FOR ALL USING (true);
CREATE POLICY "Allow all access to case_results" ON case_results FOR ALL USING (true);
CREATE POLICY "Allow all access to baselines" ON baselines FOR ALL USING (true);
CREATE POLICY "Allow all access to metrics_history" ON metrics_history FOR ALL USING (true);
```

### 18.2 Indexes Migration

**File: `supabase/migrations/002_indexes.sql`**

```sql
-- Indexes for common queries

-- Runs table indexes
CREATE INDEX idx_runs_project ON runs(project);
CREATE INDEX idx_runs_scenario ON runs(scenario);
CREATE INDEX idx_runs_started_at ON runs(started_at DESC);
CREATE INDEX idx_runs_project_scenario ON runs(project, scenario);
CREATE INDEX idx_runs_success_rate ON runs(success_rate);
CREATE INDEX idx_runs_git_branch ON runs(git_branch);

-- Case results indexes
CREATE INDEX idx_case_results_run_id ON case_results(run_id);
CREATE INDEX idx_case_results_passed ON case_results(passed);
CREATE INDEX idx_case_results_tags ON case_results USING GIN(tags);

-- Metrics history indexes
CREATE INDEX idx_metrics_history_project_date ON metrics_history(project, date DESC);
CREATE INDEX idx_metrics_history_scenario ON metrics_history(scenario);

-- Full-text search on scenario names (optional)
CREATE INDEX idx_runs_scenario_search ON runs USING GIN(to_tsvector('english', scenario));
```

---

## Appendix A: Environment Variables

**.env.example:**

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key  # For admin operations

# Provider API Keys (use the ones you need)
OPENAI_API_KEY=sk-...
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_RESOURCE=your-resource-name
AZURE_OPENAI_DEPLOYMENT=gpt-4
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Future providers (Post-MVP)
# ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_API_KEY=...

# Artemis Configuration
ARTEMIS_PROJECT=my-project
ARTEMIS_LOG_LEVEL=info
```

---

## Appendix B: Dependency List

### Core Dependencies

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "zod": "^3.22.0",
    "yaml": "^2.3.0",
    "fastest-levenshtein": "^1.0.16",
    "nanoid": "^5.0.0",
    "pino": "^8.17.0",
    "pino-pretty": "^10.3.0",
    "prom-client": "^15.1.0"
  }
}
```

### Adapter Dependencies

```json
{
  "@artemis/adapter-openai": {
    "openai": "^4.28.0"
  },
  "@artemis/adapter-vercel-ai": {
    "ai": "^3.0.0",
    "@ai-sdk/openai": "^0.0.10",
    "@ai-sdk/azure": "^0.0.10"
  },
  "@artemis/adapter-anthropic (Post-MVP)": {
    "@anthropic-ai/sdk": "^0.17.0"
  }
}
```

### CLI Dependencies

```json
{
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "cli-table3": "^0.6.3",
    "inquirer": "^9.2.0"
  }
}
```

### Reports Dependencies

```json
{
  "dependencies": {
    "handlebars": "^4.7.8"
  }
}
```

### Dev Dependencies

```json
{
  "devDependencies": {
    "@biomejs/biome": "^1.5.0",
    "@types/bun": "^1.1.0",
    "typescript": "^5.3.0",
    "supabase": "^1.130.0"
  }
}
```

---

*Document Version: 3.0*
*Last Updated: January 2026*
*Author: Artemis Team*
