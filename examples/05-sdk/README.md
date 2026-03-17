# ArtemisKit SDK Usage Examples

This directory contains comprehensive examples demonstrating the `@artemiskit/sdk` programmatic API for integrating LLM testing into your Node.js applications, CI/CD pipelines, and test frameworks.

## What's New in v0.3.2

- **`kit.validate()`** - Validate scenario files without execution (pre-flight checks)
- **`kit.compare()`** - Compare test runs for regression detection
- **Guardian Mode Normalization** - Unified mode names with deprecation warnings
- **Semantic Validation** - LLM-based content validation (default strategy)
- **Enhanced Builder API** - Programmatic scenario construction with expectation helpers

## Installation

```bash
# Using bun (recommended)
bun add @artemiskit/sdk

# Using npm
npm install @artemiskit/sdk

# Using pnpm
pnpm add @artemiskit/sdk
```

## Environment Setup

```bash
# Required: Set your API key for your provider
export OPENAI_API_KEY=your-api-key

# Or for other providers:
export ANTHROPIC_API_KEY=your-api-key
export AZURE_OPENAI_API_KEY=your-api-key

# Optional: Storage configuration
export ARTEMIS_STORAGE_PATH=./artemis-runs
```

## Directory Structure

```
examples/05-sdk/
├── README.md                          # This file
├── scenarios/                         # Example YAML scenarios
│   └── example.yaml
├── validation/                        # Scenario validation examples
│   ├── validate-scenario.ts           # Basic validation with kit.validate()
│   └── validate-programmatic.ts       # Validating builder-created scenarios
├── comparison/                        # Run comparison examples
│   └── compare-runs.ts                # Regression detection with kit.compare()
├── builders/                          # Programmatic scenario construction
│   └── programmatic-scenarios.ts      # Builder API with all expectation types
├── guardian/                          # Runtime protection examples
│   ├── mode-normalization.ts          # Mode mapping and deprecation warnings
│   └── semantic-validation.ts         # LLM-based content validation
├── storage/                           # Storage configuration
│   └── local-storage.ts               # Local and Supabase storage setup
├── workflows/                         # Complete workflow examples
│   └── ci-cd-quality-gate.ts          # Full CI/CD quality gate pipeline
└── test-framework/                    # Test framework integration
    ├── jest-integration.test.ts
    └── vitest-integration.test.ts
```

## Examples by Feature

### Validation (v0.3.2)

Pre-flight validation for CI/CD pipelines:

```typescript
import { ArtemisKit } from '@artemiskit/sdk';

const kit = new ArtemisKit({ project: 'my-project' });

// Validate single scenario
const result = await kit.validate({
  scenario: './scenarios/example.yaml',
});

// Validate all scenarios with strict mode
const strictResult = await kit.validate({
  scenario: './scenarios/*.yaml',
  strict: true,  // Warnings become errors
});

if (!strictResult.valid) {
  console.error('Validation failed:', strictResult.errors);
  process.exit(1);
}
```

**Examples:**
- `validation/validate-scenario.ts` - Single files, glob patterns, strict mode
- `validation/validate-programmatic.ts` - Validating dynamically built scenarios

### Comparison (v0.3.2)

Regression detection between test runs:

```typescript
const comparison = await kit.compare({
  baseline: 'baseline-run-001',  // or 'latest'
  current: 'current-run-002',
  threshold: 0.05,  // 5% regression threshold
});

if (comparison.hasRegression) {
  console.error(`Regression detected: ${comparison.comparison.successRateDelta * 100}% drop`);
  console.error('New failures:', comparison.comparison.newFailures);
  process.exit(1);
}
```

**Examples:**
- `comparison/compare-runs.ts` - Full regression detection workflow

### Builder API

Programmatic scenario construction:

```typescript
import {
  scenario,
  testCase,
  contains,
  exact,
  jsonSchema,
  llmGrade,
  allOf,
  anyOf,
} from '@artemiskit/sdk';

const myScenario = scenario('Customer Support Bot')
  .provider('openai')
  .model('gpt-4')
  .systemPrompt('You are a helpful customer support agent.')
  .addCase(
    testCase('greeting-test')
      .prompt('Hello, I need help')
      .expect(contains(['hello', 'hi', 'help'], { mode: 'any' }))
      .tags(['smoke', 'greeting'])
      .build()
  )
  .addCase(
    testCase('json-response')
      .prompt('List my orders in JSON format')
      .expect(jsonSchema({
        type: 'object',
        required: ['orders'],
        properties: {
          orders: { type: 'array' }
        }
      }))
      .build()
  )
  .build();
```

**Expectation Helpers:**

| Helper | Description |
|--------|-------------|
| `exact(value)` | Exact string match |
| `contains(values, options?)` | Contains text(s) |
| `notContains(values)` | Excludes text(s) |
| `regex(pattern)` | Pattern match |
| `fuzzy(target, threshold?)` | Levenshtein similarity |
| `similarity(target, threshold?)` | Semantic similarity |
| `jsonSchema(schema)` | JSON structure validation |
| `llmGrade(rubric)` | LLM-as-judge evaluation |
| `inline(expression)` | Custom expression |
| `allOf(expectations)` | AND combinator |
| `anyOf(expectations)` | OR combinator |

**Quick Helpers:**

```typescript
import { containsCase, exactCase, jsonCase, gradedCase } from '@artemiskit/sdk';

// Quick case builders
containsCase('test-1', 'What is 2+2?', ['4', 'four']);
exactCase('test-2', 'Say hello', 'Hello!');
jsonCase('test-3', 'Return user', { type: 'object', required: ['name'] });
gradedCase('test-4', 'Explain gravity', 'Is the explanation accurate?');
```

**Examples:**
- `builders/programmatic-scenarios.ts` - Complete builder API demonstration

### Guardian Runtime Protection

**Mode Normalization (v0.3.2):**

```typescript
import { createGuardian, normalizeGuardianMode } from '@artemiskit/sdk';

// New canonical modes (recommended)
const guardian = createGuardian({
  mode: 'selective',  // 'observe' | 'selective' | 'strict'
  validateInput: true,
  validateOutput: true,
});

// Legacy modes still work (with deprecation warnings)
const legacyGuardian = createGuardian({
  mode: 'guardian',  // Maps to 'strict', shows warning
});

// Programmatic normalization
const canonical = normalizeGuardianMode('hybrid');  // Returns 'selective'
```

**Mode Mapping:**

| Legacy Mode | Canonical Mode | Behavior |
|-------------|----------------|----------|
| `testing` | `observe` | Log only, never block |
| `hybrid` | `selective` | Block high-confidence detections |
| `guardian` | `strict` | Block all detected issues |

**Semantic Validation (v0.3.2):**

```typescript
import { createGuardian, type ContentValidationConfig } from '@artemiskit/sdk';

const config: ContentValidationConfig = {
  strategy: 'semantic',  // 'semantic' | 'pattern' | 'hybrid' | 'off'
  semanticThreshold: 0.85,
  categories: ['prompt_injection', 'jailbreak', 'pii_disclosure'],
};

const guardian = createGuardian({
  mode: 'selective',
  contentValidation: config,
});
```

**Validation Strategies:**

| Strategy | Description |
|----------|-------------|
| `semantic` | LLM-based validation (default, highest accuracy) |
| `pattern` | Regex/string matching (fast, no LLM needed) |
| `hybrid` | Both semantic and pattern |
| `off` | Disable content validation |

**Examples:**
- `guardian/mode-normalization.ts` - Mode mapping with migration guide
- `guardian/semantic-validation.ts` - Content validation strategies

### Storage Configuration

```typescript
import { ArtemisKit } from '@artemiskit/sdk';

// Local storage (default)
const kit = new ArtemisKit({
  project: 'my-project',
  storage: {
    type: 'local',
    basePath: './artemis-runs',  // Default
  },
});

// Supabase storage
const cloudKit = new ArtemisKit({
  project: 'my-project',
  storage: {
    type: 'supabase',
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
});
```

**Local Storage Structure:**
```
artemis-runs/
└── {project}/
    ├── {run-id-1}.json
    ├── {run-id-2}.json
    └── ...
```

**Examples:**
- `storage/local-storage.ts` - Storage configuration options

### CI/CD Quality Gate

Complete workflow for production pipelines:

```typescript
import { ArtemisKit } from '@artemiskit/sdk';

const kit = new ArtemisKit({
  project: 'ci-quality-gate',
  storage: { type: 'local', basePath: './artemis-runs' },
});

// Phase 1: Validate scenarios
const validation = await kit.validate({
  scenario: './scenarios/*.yaml',
  strict: true,
});
if (!validation.valid) process.exit(1);

// Phase 2: Run tests
const result = await kit.run({
  scenario: './scenarios',
  save: true,
});

// Phase 3: Check success rate
if (result.manifest.metrics.pass_rate < 0.95) {
  console.error('Success rate below 95%');
  process.exit(1);
}

// Phase 4: Regression check
const comparison = await kit.compare({
  baseline: 'latest',
  current: result.manifest.run_id,
  threshold: 0.05,
});
if (comparison.hasRegression) process.exit(1);

console.log('Quality gate passed!');
```

**Examples:**
- `workflows/ci-cd-quality-gate.ts` - Complete 4-phase pipeline

## Running Examples

```bash
# Validation examples
bun run examples/05-sdk/validation/validate-scenario.ts
bun run examples/05-sdk/validation/validate-programmatic.ts

# Comparison examples
bun run examples/05-sdk/comparison/compare-runs.ts

# Builder examples
bun run examples/05-sdk/builders/programmatic-scenarios.ts

# Guardian examples
bun run examples/05-sdk/guardian/mode-normalization.ts
bun run examples/05-sdk/guardian/semantic-validation.ts

# Storage examples
bun run examples/05-sdk/storage/local-storage.ts

# Workflow examples
bun run examples/05-sdk/workflows/ci-cd-quality-gate.ts
```

## API Quick Reference

### ArtemisKit Class

```typescript
import { ArtemisKit } from '@artemiskit/sdk';

const kit = new ArtemisKit({
  project: 'my-project',
  provider: 'openai',
  model: 'gpt-4',
  storage: { type: 'local' },
});

// Core methods
await kit.run(options);       // Run scenarios
await kit.validate(options);  // Validate scenarios (v0.3.2)
await kit.compare(options);   // Compare runs (v0.3.2)
await kit.redteam(options);   // Security testing
await kit.stress(options);    // Load testing

// Event handlers
kit.onCaseStart(handler);
kit.onCaseComplete(handler);
kit.onProgress(handler);
```

### Type Exports

```typescript
import type {
  // Configuration
  ArtemisKitConfig,
  RunOptions,
  ValidateOptions,
  CompareOptions,

  // Results
  RunResult,
  ValidationResult,
  CompareResult,

  // Scenarios
  Scenario,
  TestCase,
  Expected,

  // Guardian
  GuardianConfig,
  GuardianMode,
  ContentValidationConfig,

  // Storage
  StorageConfig,
} from '@artemiskit/sdk';
```

## Test Framework Integration

### Jest

```typescript
import { artemiskitMatchers } from '@artemiskit/sdk';

expect.extend(artemiskitMatchers);

test('all cases pass', async () => {
  const result = await kit.run({ scenario: './test.yaml' });
  expect(result).toPassAllCases();
  expect(result).toHaveSuccessRate(0.95);
});
```

### Vitest

```typescript
import { artemiskitMatchers } from '@artemiskit/sdk';

expect.extend(artemiskitMatchers);

it('all cases pass', async () => {
  const result = await kit.run({ scenario: './test.yaml' });
  expect(result).toPassAllCases();
});
```

## GitHub Actions Integration

```yaml
name: LLM Quality Gate

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Validate scenarios
        run: bun run validate-scenarios.ts
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Run LLM tests
        run: bun run test-llm.ts
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Check for regressions
        run: bun run check-regressions.ts
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Troubleshooting

### Common Issues

1. **API Key not found**: Ensure your provider's API key is set in environment variables
2. **Scenario file not found**: Check the path is relative to your working directory
3. **Validation errors**: Run `kit.validate()` to see detailed error messages
4. **Storage errors**: Ensure the storage directory exists and is writable

### Getting Help

- [ArtemisKit Documentation](https://artemiskit.vercel.app)
- [GitHub Issues](https://github.com/code-sensei/artemiskit/issues)

## License

Apache-2.0
