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
  - name: greeting
    prompt: "Say hello"
    assert:
      - type: contains
        value: "hello"
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

Create `artemis.config.yaml` in your project root. Here's every available option with descriptions:

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
    
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}

# Model parameters (applied to all runs unless overridden)
modelParams:
  # Sampling temperature (0-2, lower = more deterministic)
  temperature: 0.7
  # Maximum tokens in response
  maxTokens: 4096

# Storage configuration for run history
storage:
  # Storage type: "local" or "supabase"
  type: local
  # Base path for local storage (relative to project root)
  basePath: ./artemis-runs

# Output configuration for reports
output:
  # Directory for generated reports
  dir: ./artemis-output
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
  - name: greeting
    prompt: "Say hello"
    assert:
      - type: contains
        value: "hello"
```

### Full Scenario Reference

Here's every available option for scenarios:

```yaml
# scenarios/full-reference.yaml - Complete Example
# =================================================

# Required: Unique name for this scenario
name: customer-support-eval

# Required: Human-readable description
description: Evaluate customer support bot responses

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

# Optional: System prompt prepended to all cases
system: |
  You are a helpful customer support assistant.
  Always be polite and professional.

# Required: Test cases to run
cases:
  # ---- Simple prompt/response case ----
  - name: simple-greeting
    # The prompt to send to the model
    prompt: "Hello, I need help"
    # Assertions to validate the response
    assert:
      - type: contains
        value: "help"

  # ---- Case with all options ----
  - name: refund-request
    # Optional: Tags for this specific case
    tags:
      - refunds
      - priority
    # The prompt
    prompt: "I want a refund for order #12345"
    # Optional: Override system prompt for this case only
    system: "You are a refund specialist."
    # Multiple assertions (all must pass)
    assert:
      # Response must contain this string (case-insensitive)
      - type: contains
        value: "refund"
      # Response must contain ALL of these strings
      - type: contains
        value:
          - "order"
          - "12345"
      # Response must NOT contain any of these
      - type: not-contains
        value:
          - "cannot"
          - "unable"
          - "sorry"
      # Response must match this regex pattern
      - type: regex
        pattern: "order.*#?12345"
      # Response must exactly equal this (rarely used)
      # - type: exact
      #   value: "Exact expected response"

  # ---- Multi-turn conversation ----
  - name: multi-turn-support
    # Use 'turns' instead of 'prompt' for conversations
    turns:
      - role: user
        content: "I have a problem with my order"
      - role: assistant
        # Assert on the model's response to this turn
        assert:
          - type: contains
            value: "order"
      - role: user
        content: "Order number is #99999"
      - role: assistant
        assert:
          - type: regex
            pattern: "99999"

  # ---- Case with variables ----
  - name: dynamic-content
    # Variables are substituted into prompt using {{variable}}
    vars:
      product_name: "Widget Pro"
      order_id: "ORD-789"
    prompt: "What's the status of my {{product_name}} order {{order_id}}?"
    assert:
      - type: contains
        value: "{{order_id}}"
```

### Assertion Types

| Type | Description | Example |
|------|-------------|---------|
| `contains` | Response contains string(s) | `value: "hello"` or `value: ["hi", "hello"]` |
| `not-contains` | Response does NOT contain string(s) | `value: ["error", "fail"]` |
| `exact` | Response exactly equals value | `value: "Yes"` |
| `regex` | Response matches regex pattern | `pattern: "order.*\\d+"` |

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `artemiskit run <scenario>` | Run scenario-based evaluations |
| `artemiskit redteam <scenario>` | Run security red team tests |
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
  -o, --output <dir>          Output directory for reports
  -v, --verbose               Verbose output
  -t, --tags <tags...>        Filter cases by tags
  -c, --concurrency <n>       Parallel test cases (default: 1)
  --timeout <ms>              Timeout per case in milliseconds
  --retries <n>               Retries per case on failure
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
