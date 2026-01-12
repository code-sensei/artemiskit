# Artemis

**Agent Reliability Toolkit for LLMs** - A comprehensive testing framework for evaluating, stress-testing, and red-teaming Large Language Model applications.

## Features

- **Scenario-based Testing**: Define test scenarios in YAML with multiple test cases
- **Multiple Evaluators**: Exact match, regex, fuzzy matching, JSON schema validation, and LLM-based grading
- **Multi-Provider Support**: OpenAI, Azure OpenAI, Anthropic, and Vercel AI SDK adapters
- **Red Team Testing**: Built-in adversarial testing with mutation strategies
- **Stress Testing**: Concurrent load testing with configurable parameters
- **Flexible Storage**: Local filesystem or Supabase for results persistence
- **Rich Reports**: HTML and JSON report generation with detailed metrics

## Installation

```bash
# Install CLI globally
npm install -g @artemiskit/cli

# Or use with npx
npx @artemiskit/cli run scenario.yaml
```

## Quick Start

### 1. Initialize a project

```bash
artemis init
```

This creates:
- `artemis.config.yaml` - Project configuration
- `scenarios/` - Directory for test scenarios
- `artemis-runs/` - Storage for test results

### 2. Create a scenario

```yaml
# scenarios/example.yaml
name: My First Scenario
description: Basic LLM testing scenario
provider: openai
model: gpt-4

cases:
  - id: greeting
    name: Simple Greeting
    prompt: "Say hello in exactly 3 words."
    expected:
      type: regex
      pattern: "^\\w+\\s+\\w+\\s+\\w+$"

  - id: math
    name: Basic Math
    prompt: "What is 2 + 2? Reply with just the number."
    expected:
      type: exact
      value: "4"
```

### 3. Run tests

```bash
# Set your API key
export OPENAI_API_KEY=your-key

# Run the scenario
artemis run scenarios/example.yaml
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `artemis init` | Initialize Artemis in current directory |
| `artemis run <scenario>` | Run a test scenario |
| `artemis report <run-id>` | Generate reports from a test run |
| `artemis redteam <scenario>` | Run adversarial red-team tests |
| `artemis stress <scenario>` | Run stress/load tests |

## Evaluator Types

| Type | Description |
|------|-------------|
| `exact` | Exact string match |
| `regex` | Regular expression pattern match |
| `contains` | Substring check |
| `fuzzy` | Fuzzy string matching with threshold |
| `json_schema` | JSON schema validation |
| `llm_grader` | LLM-based semantic evaluation |

### LLM Grader Example

```yaml
cases:
  - id: helpful-response
    prompt: "Explain quantum computing to a 5 year old"
    expected:
      type: llm_grader
      criteria: |
        The response should:
        - Use simple, child-friendly language
        - Avoid technical jargon
        - Include a relatable analogy
        - Be encouraging and positive
      threshold: 0.8
```

## Provider Configuration

### OpenAI

```yaml
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
    defaultModel: gpt-4
```

### Azure OpenAI

```yaml
providers:
  azure-openai:
    apiKey: ${AZURE_OPENAI_API_KEY}
    resourceName: ${AZURE_OPENAI_RESOURCE}
    deploymentName: ${AZURE_OPENAI_DEPLOYMENT}
    apiVersion: "2024-02-15-preview"
```

## Packages

| Package | Description |
|---------|-------------|
| `@artemiskit/core` | Core runner, evaluators, and storage |
| `@artemiskit/cli` | Command-line interface |
| `@artemiskit/reports` | Report generation (HTML, JSON) |
| `@artemiskit/redteam` | Red-team mutation strategies |
| `@artemiskit/adapter-openai` | OpenAI/Azure OpenAI adapter |
| `@artemiskit/adapter-vercel-ai` | Vercel AI SDK adapter |
| `@artemiskit/adapter-anthropic` | Anthropic Claude adapter |

## Programmatic Usage

```typescript
import {
  parseScenarioFile,
  runScenario,
  createAdapter,
  createStorageFromEnv,
} from '@artemiskit/core';

// Load scenario
const scenario = await parseScenarioFile('scenario.yaml');

// Create adapter
const client = await createAdapter({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: 'gpt-4',
});

// Run tests
const result = await runScenario({
  scenario,
  client,
  project: 'my-project',
  onCaseComplete: (caseResult) => {
    console.log(`${caseResult.id}: ${caseResult.ok ? 'PASS' : 'FAIL'}`);
  },
});

console.log(`Success rate: ${result.manifest.metrics.success_rate * 100}%`);
```

## Development

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT
