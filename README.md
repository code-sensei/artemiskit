# ArtemisKit

**Agent Reliability Toolkit for LLMs** - Test, evaluate, stress-test, and red-team your AI applications with scenario-based testing, multiple evaluators, and multi-provider support.

> **Work in Progress** - This project is under active development. APIs may change.

## Status

![Status](https://img.shields.io/badge/status-alpha-orange)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

## What's Done

### Core
- [x] Scenario-based test runner with YAML configuration
- [x] Multiple evaluators (exact, regex, contains, fuzzy, json_schema, llm_grader)
- [x] Test result artifacts and manifest generation
- [x] Local filesystem storage
- [x] Configurable concurrency, timeout, and retries

### Adapters
- [x] OpenAI adapter (GPT-4, GPT-3.5, etc.)
- [x] Azure OpenAI adapter
- [x] Anthropic Claude adapter
- [x] Vercel AI SDK adapter (v6)

### CLI
- [x] `artemis init` - Project initialization
- [x] `artemis run` - Execute test scenarios
- [x] `artemis report` - Generate HTML/JSON reports
- [x] `artemis redteam` - Adversarial testing
- [x] `artemis stress` - Load testing

### Red Team
- [x] Typo mutation
- [x] Role spoof mutation
- [x] Instruction flip mutation
- [x] Chain-of-thought injection

### Infrastructure
- [x] Monorepo with Bun workspaces
- [x] TypeScript with declaration files
- [x] Changesets for versioning

## Roadmap

### v0.1.0 (Current)
- [ ] Publish to npm
- [ ] Supabase storage integration testing
- [ ] Increase test coverage (target: 80%)
- [ ] CI/CD pipeline (GitHub Actions)

### v0.2.0
- [ ] Google Gemini adapter
- [ ] Mistral adapter
- [ ] Ollama adapter (local models)
- [ ] Watch mode for CLI
- [ ] Diff reports between runs
- [ ] Documentation website

### v0.3.0
- [ ] Web dashboard for results visualization
- [ ] Scheduled test runs
- [ ] Webhook notifications
- [ ] Custom evaluator plugins
- [ ] Framework starter templates (Next.js, Express, etc.)

### v0.4.0 - Agent Framework Adapters
- [ ] **LangChain adapter** (`@artemiskit/adapter-langchain`)
  - Callback handler for capturing agent steps, tool calls, and LLM responses
  - Chain execution tracing and evaluation
  - Tool/function call validation
  - Agent reasoning step assessment
- [ ] **CrewAI adapter** (`@artemiskit/adapter-crewai`)
  - Event listener for crew execution
  - Individual agent output evaluation within crews
  - Agent role adherence testing
  - Task delegation and collaboration metrics
- [ ] **LlamaIndex adapter** (`@artemiskit/adapter-llamaindex`)
  - Query engine response evaluation
  - RAG pipeline quality testing
  - Citation/attribution accuracy evaluation
  - Hallucination detection for RAG applications

### Future
- [ ] VS Code extension
- [ ] GitHub Action for CI integration
- [ ] Prompt regression detection
- [ ] Cost tracking and optimization suggestions
- [ ] Multi-turn conversation testing
- [ ] Example repos for popular frameworks

## Installation

```bash
# Not yet published - install from source
git clone https://github.com/code-sensei/artemiskit.git
cd artemiskit
bun install
bun run build
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
      rubric: |
        The response should:
        - Use simple, child-friendly language
        - Avoid technical jargon
        - Include a relatable analogy
        - Be encouraging and positive
      threshold: 0.8
```

## Configuration

Artemis uses a layered configuration system with clear precedence rules.

### Configuration Precedence

Settings are resolved in the following order (highest priority first):

```
1. CLI options (--provider, --model, etc.)
2. Scenario file (providerConfig section)
3. artemis.config.yaml (providers section)
4. Environment variables
5. Default values
```

**Example:** If you specify `--provider openai` on the CLI, it overrides whatever is in the scenario or config file.

### Configuration Files

#### artemis.config.yaml (Project Config)

This is the main project configuration file, typically at your project root:

```yaml
# artemis.config.yaml
project: my-project

# Default provider and model (used when not specified elsewhere)
provider: openai
model: gpt-4

# Provider-specific configurations
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
    defaultModel: gpt-4
    organization: ${OPENAI_ORGANIZATION}

  azure-openai:
    apiKey: ${AZURE_OPENAI_API_KEY}
    resourceName: ${AZURE_OPENAI_RESOURCE}
    deploymentName: ${AZURE_OPENAI_DEPLOYMENT}
    apiVersion: "2024-02-15-preview"

  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
    defaultModel: claude-3-sonnet-20240229

# Storage configuration
storage:
  type: local
  basePath: ./artemis-runs

# Output settings
output:
  format: json
  dir: ./artemis-output
```

#### Scenario Files

Scenarios can include provider configuration that overrides the project config:

```yaml
# scenarios/azure-test.yaml
name: Azure OpenAI Test
provider: azure-openai
model: GPT-4o Mini  # Display name (for reports/logs)

# Override provider settings for this scenario
providerConfig:
  deploymentName: ${MY_CUSTOM_DEPLOYMENT:-gpt-4o-mini-prod}
  resourceName: my-azure-resource
  apiVersion: "2024-06-01"

cases:
  - id: test-1
    prompt: "Hello, world!"
    expected:
      type: contains
      values: ["Hello"]
```

### Environment Variable Expansion

Both `artemis.config.yaml` and scenario files support environment variable expansion:

| Syntax | Description |
|--------|-------------|
| `${VAR}` | Use value of VAR (empty if not set) |
| `${VAR:-default}` | Use VAR if set, otherwise use "default" |

**Example:**
```yaml
providerConfig:
  deploymentName: ${AZURE_DEPLOYMENT:-my-default-deployment}
  apiKey: ${AZURE_OPENAI_API_KEY}
```

### Provider Configuration

#### OpenAI

```yaml
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
    baseUrl: https://api.openai.com/v1  # Optional: custom endpoint
    organization: ${OPENAI_ORGANIZATION}  # Optional
    defaultModel: gpt-4
    timeout: 60000  # Optional: request timeout in ms
    maxRetries: 2   # Optional: retry count
```

#### Azure OpenAI

```yaml
providers:
  azure-openai:
    apiKey: ${AZURE_OPENAI_API_KEY}
    resourceName: ${AZURE_OPENAI_RESOURCE}
    deploymentName: ${AZURE_OPENAI_DEPLOYMENT}
    apiVersion: "2024-02-15-preview"
```

**Note:** For Azure OpenAI, the `model` field in scenarios is for display/identification only. The actual model used is determined by your Azure deployment. Use `providerConfig.deploymentName` to specify which deployment to use.

#### Anthropic

```yaml
providers:
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
    baseUrl: https://api.anthropic.com  # Optional
    defaultModel: claude-3-sonnet-20240229
```

#### Vercel AI SDK

```yaml
providers:
  vercel-ai:
    underlyingProvider: openai  # or 'anthropic'
    apiKey: ${OPENAI_API_KEY}
    defaultModel: gpt-4
```

### Configuration Examples

#### Using Different Deployments per Scenario

```yaml
# scenarios/prod-test.yaml
name: Production Model Test
provider: azure-openai
model: GPT-4 Production
providerConfig:
  deploymentName: gpt4-prod
  resourceName: prod-resource

---

# scenarios/staging-test.yaml
name: Staging Model Test
provider: azure-openai
model: GPT-4 Staging
providerConfig:
  deploymentName: gpt4-staging
  resourceName: staging-resource
```

#### CLI Override

```bash
# Override provider from scenario
artemis run scenario.yaml --provider openai

# Override model
artemis run scenario.yaml --model gpt-4-turbo

# Use custom config file
artemis run scenario.yaml --config ./custom-config.yaml
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

## Contributing

Contributions welcome! This project is in early development - please open an issue to discuss before submitting PRs.

## License

Apache-2.0
