# ArtemisKit

**Open-source LLM evaluation toolkit** - Test, evaluate, stress-test, and red-team your AI applications with scenario-based testing and multi-provider support.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@artemiskit/cli.svg)](https://www.npmjs.com/package/@artemiskit/cli)

## Features

- **Scenario-Based Testing** - Define test cases in YAML with multi-turn conversation support
- **Security Red Teaming** - Automatically test for prompt injection, jailbreaks, and data extraction
- **Stress Testing** - Measure latency, throughput, and reliability under load
- **Multi-Provider Support** - OpenAI, Azure OpenAI, Vercel AI SDK (20+ providers)
- **Rich Reports** - Interactive HTML reports with configuration traceability
- **CI/CD Ready** - Exit codes and JSON output for automation

## Installation

```bash
npm install -g @artemiskit/cli
# or
pnpm add -g @artemiskit/cli
# or
bun add -g @artemiskit/cli
```

## Quick Start (Basic Example)

This is the simplest way to get started with ArtemisKit.

### 1. Set up your API key

```bash
export OPENAI_API_KEY="your-api-key"
```

### 2. Create a simple scenario

```yaml
# scenarios/hello.yaml
name: hello-test
description: My first ArtemisKit test

cases:
  - id: greeting-test
    prompt: "Say hello"
    expected:
      type: contains
      values:
        - "hello"
      mode: any
```

### 3. Run it

```bash
artemiskit run scenarios/hello.yaml
# or use the short alias
akit run scenarios/hello.yaml
```

That's it! ArtemisKit will use OpenAI by default. See below for full configuration options.

---

## Configuration

### Config File (Full Reference)

Create `artemis.config.yaml` in your project root. Here's every available option:

```yaml
# artemis.config.yaml - Full Reference
# =====================================

# Project identifier (used in run storage and reports)
project: my-project

# Default provider to use when not specified in scenario or CLI
# Options: openai, azure-openai, vercel-ai
provider: openai

# Default model to use
# NOTE: For azure-openai, this is DISPLAY ONLY - the actual model
# is determined by your Azure deployment, not this value.
# See docs/providers/azure-openai.md for details.
model: gpt-4o

# Directory containing scenario files
scenariosDir: ./scenarios

# Provider-specific configuration
providers:
  openai:
    # API key (can use environment variable reference)
    apiKey: ${OPENAI_API_KEY}
    
  azure-openai:
    # API key for Azure OpenAI
    apiKey: ${AZURE_OPENAI_API_KEY}
    # Your Azure resource name (the subdomain in your endpoint URL)
    resourceName: ${AZURE_OPENAI_RESOURCE_NAME}
    # The deployment name you created in Azure Portal
    deploymentName: ${AZURE_OPENAI_DEPLOYMENT_NAME}
    # API version (optional, has sensible default)
    apiVersion: "2024-02-15-preview"

  vercel-ai:
    # Underlying provider for Vercel AI SDK
    underlyingProvider: openai
    apiKey: ${OPENAI_API_KEY}

# Storage configuration for run history
storage:
  # Storage type: "local" or "supabase"
  type: local
  # Base path for local storage (relative to project root)
  basePath: ./artemis-runs

# Output configuration for reports
output:
  # Output format: "json", "html", or "both"
  format: html
  # Directory for generated reports
  dir: ./artemis-output

# CI-specific settings (optional)
ci:
  # Fail if regression exceeds threshold
  failOnRegression: true
  # Regression threshold (0-1)
  regressionThreshold: 0.05
```

### Minimal Config File

If you just want to set defaults, a minimal config works too:

```yaml
# artemis.config.yaml - Minimal
project: my-project
provider: openai
model: gpt-4o
```

---

## Scenario Format

### Basic Scenario (Simple Prompts)

```yaml
# scenarios/basic.yaml
name: basic-test
description: Simple prompt-response tests

# Optional: Override provider/model for this scenario
provider: openai
model: gpt-4o

cases:
  - id: greeting
    prompt: "Say hello"
    expected:
      type: contains
      values:
        - "hello"
      mode: any
```

### Full Scenario Reference

Here's every available option for scenarios:

```yaml
# scenarios/full-reference.yaml - Complete Example
# =================================================

# Required: Unique name for this scenario
name: customer-support-eval

# Optional: Human-readable description
description: Evaluate customer support bot responses

# Optional: Scenario version
version: "1.0"

# Optional: Tags for filtering (use --tags flag)
tags:
  - support
  - production

# Optional: Provider override (defaults to config file, then "openai")
# Options: openai, azure-openai, vercel-ai
provider: openai

# Optional: Model override
# NOTE: For azure-openai, this is DISPLAY ONLY - actual model
# is determined by your Azure deployment. See docs/providers/azure-openai.md
model: gpt-4o

# Optional: Model parameters
temperature: 0.7
maxTokens: 1024
seed: 42

# Optional: System prompt prepended to all cases
setup:
  systemPrompt: |
    You are a helpful customer support assistant.
    Always be polite and professional.

# Optional: Scenario-level variables (available to all cases)
# Case-level variables override these. Use {{var_name}} syntax.
variables:
  company_name: "Acme Corp"
  default_greeting: "Hello"

# Required: Test cases to run
cases:
  # ---- Simple prompt/response case ----
  - id: simple-greeting
    name: Simple greeting test
    description: Test basic greeting response
    # The prompt to send to the model
    prompt: "Hello, I need help"
    # Expected result validation
    expected:
      type: contains
      values:
        - "help"
        - "assist"
      mode: any
    # Optional: Tags for this case
    tags:
      - basic

  # ---- Case with regex matching ----
  - id: order-number-check
    name: Order number extraction
    prompt: "My order number is #12345"
    expected:
      type: regex
      pattern: "12345"
      flags: "i"

  # ---- Case with exact match ----
  - id: yes-no-response
    name: Binary response test
    prompt: "Reply with only 'Yes' or 'No': Is the sky blue?"
    expected:
      type: exact
      value: "Yes"
      caseSensitive: false

  # ---- Case with fuzzy matching ----
  - id: fuzzy-match-test
    name: Fuzzy similarity test
    prompt: "What color is grass?"
    expected:
      type: fuzzy
      value: "green"
      threshold: 0.8

  # ---- Case with LLM grading ----
  - id: quality-check
    name: Response quality evaluation
    prompt: "Explain quantum computing in simple terms"
    expected:
      type: llm_grader
      rubric: |
        Score 1.0 if the explanation is clear and accurate.
        Score 0.5 if partially correct but confusing.
        Score 0.0 if incorrect or overly technical.
      threshold: 0.7

  # ---- Case with JSON schema validation ----
  - id: json-output-test
    name: Structured output test
    prompt: "Return a JSON object with name and age fields"
    expected:
      type: json_schema
      schema:
        type: object
        properties:
          name:
            type: string
          age:
            type: number
        required:
          - name
          - age

  # ---- Multi-turn conversation ----
  - id: multi-turn-support
    name: Multi-turn conversation
    # Use array of messages for multi-turn
    prompt:
      - role: user
        content: "I have a problem with my order"
      - role: assistant
        content: "I'd be happy to help. What's your order number?"
      - role: user
        content: "Order number is #99999"
    expected:
      type: contains
      values:
        - "99999"
      mode: any

  # ---- Case with variables ----
  - id: dynamic-content
    name: Variable substitution test
    # Case-level variables override scenario-level
    variables:
      product_name: "Widget Pro"
      order_id: "ORD-789"
    prompt: "What's the status of my {{product_name}} order {{order_id}}?"
    expected:
      type: contains
      values:
        - "ORD-789"
      mode: any

  # ---- Case with timeout and retries ----
  - id: slow-response-test
    name: Timeout handling test
    prompt: "Generate a detailed report"
    expected:
      type: contains
      values:
        - "report"
      mode: any
    timeout: 30000
    retries: 2
```

### Variables

Variables let you create dynamic, reusable scenarios. Use `{{variable_name}}` syntax in prompts.

```yaml
name: customer-support
description: Test with dynamic content

# Scenario-level variables - available to all cases
variables:
  company_name: "Acme Corp"
  support_email: "support@acme.com"

cases:
  # Uses scenario-level variables
  - id: contact-info
    prompt: "What is the email for {{company_name}}?"
    expected:
      type: contains
      values:
        - "support@acme.com"
      mode: any

  # Case-level variables override scenario-level
  - id: different-company
    variables:
      company_name: "TechCorp"  # Overrides "Acme Corp"
      product: "Widget"
    prompt: "Tell me about {{product}} from {{company_name}}"
    expected:
      type: contains
      values:
        - "TechCorp"
      mode: any
```

Variable precedence: **case-level > scenario-level**

### Expectation Types

| Type | Description | Key Fields |
|------|-------------|------------|
| `contains` | Response contains string(s) | `values: [...]`, `mode: all\|any` |
| `exact` | Response exactly equals value | `value: "..."`, `caseSensitive: bool` |
| `regex` | Response matches regex pattern | `pattern: "..."`, `flags: "i"` |
| `fuzzy` | Fuzzy string similarity | `value: "..."`, `threshold: 0.8` |
| `llm_grader` | LLM-based evaluation | `rubric: "..."`, `threshold: 0.7` |
| `json_schema` | Validate JSON structure | `schema: {...}` |

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `artemiskit run <scenario>` | Run scenario-based evaluations |
| `artemiskit redteam <scenario>` | Run security red team tests |
| `artemiskit stress <scenario>` | Run load/stress tests |
| `artemiskit report <run-id>` | Regenerate report from saved run |
| `artemiskit history` | View run history |
| `artemiskit compare <id1> <id2>` | Compare two runs |
| `artemiskit init` | Initialize configuration |

Use `akit` as a shorter alias for `artemiskit`.

### Run Command Options

```bash
artemiskit run <scenario> [options]

Options:
  -p, --provider <provider>   Provider: openai, azure-openai, vercel-ai
  -m, --model <model>         Model to use
  -o, --output <dir>          Output directory for results
  -v, --verbose               Verbose output
  -t, --tags <tags...>        Filter test cases by tags
  -c, --concurrency <n>       Number of concurrent test cases (default: 1)
  --timeout <ms>              Timeout per test case in milliseconds
  --retries <n>               Number of retries per test case
  --config <path>             Path to config file
  --save                      Save results to storage (default: true)
```

---

## Providers

ArtemisKit supports multiple LLM providers. See the [provider documentation](docs/providers/) for detailed setup guides.

| Provider | Use Case | Docs |
|----------|----------|------|
| `openai` | Direct OpenAI API | [docs/providers/openai.md](docs/providers/openai.md) |
| `azure-openai` | Azure OpenAI Service | [docs/providers/azure-openai.md](docs/providers/azure-openai.md) |
| `vercel-ai` | 20+ providers via Vercel AI SDK | [docs/providers/vercel-ai.md](docs/providers/vercel-ai.md) |

### Quick Setup

**OpenAI:**
```bash
export OPENAI_API_KEY="sk-..."
akit run scenario.yaml --provider openai --model gpt-4o
```

**Azure OpenAI:**
```bash
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_RESOURCE_NAME="my-resource"
export AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4o-deployment"
akit run scenario.yaml --provider azure-openai --model gpt-4o
# Note: --model is for display only; actual model is your deployment
```

**Vercel AI (any provider):**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
akit run scenario.yaml --provider vercel-ai --model anthropic:claude-3-5-sonnet-20241022
```

---

## Security Testing (Red Team)

Test your LLM for vulnerabilities:

```bash
akit redteam scenarios/my-bot.yaml --mutations typo,role-spoof,cot-injection
```

### Available Mutations

| Mutation | Description |
|----------|-------------|
| `typo` | Introduce typos to bypass filters |
| `role-spoof` | Attempt role/identity spoofing |
| `instruction-flip` | Reverse or negate instructions |
| `cot-injection` | Chain-of-thought injection attacks |

---

## Packages

ArtemisKit is a monorepo with the following packages:

| Package | Description |
|---------|-------------|
| `@artemiskit/cli` | Command-line interface |
| `@artemiskit/core` | Core runner, types, and storage |
| `@artemiskit/reports` | HTML and JSON report generation |
| `@artemiskit/redteam` | Red team mutation strategies |
| `@artemiskit/adapter-openai` | OpenAI/Azure provider adapter |
| `@artemiskit/adapter-vercel-ai` | Vercel AI SDK adapter |
| `@artemiskit/adapter-anthropic` | Anthropic provider adapter |

---

## Development

```bash
# Clone the repository
git clone https://github.com/artemiskit/artemiskit.git
cd artemiskit

# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the full development roadmap.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

## License

Apache-2.0 - See [LICENSE](LICENSE) for details.
