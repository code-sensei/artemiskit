# @artemiskit/cli

Command-line interface for ArtemisKit - the LLM evaluation toolkit.

## Installation

```bash
npm install -g @artemiskit/cli
# or
bun add -g @artemiskit/cli
```

## Quick Start

```bash
# Initialize configuration
artemiskit init

# Run a test scenario
artemiskit run my-scenario.yaml

# Run red team security tests
artemiskit redteam my-scenario.yaml

# Run stress tests
artemiskit stress my-scenario.yaml --iterations 100 --concurrency 10
```

## Commands

### `artemiskit run <scenario>`

Execute scenario-based evaluations against LLM providers.

```bash
artemiskit run tests/auth-flow.yaml --provider openai --model gpt-4o
```

Options:
- `--provider <name>` - LLM provider (openai, azure-openai, anthropic)
- `--model <name>` - Model to use
- `--redact` - Enable PII/sensitive data redaction
- `--redact-patterns <patterns...>` - Custom redaction patterns
- `--config <path>` - Path to config file

### `artemiskit redteam <scenario>`

Run adversarial security tests including prompt injection, jailbreak attempts, and data extraction probes.

```bash
artemiskit redteam tests/chatbot.yaml --count 5
```

Options:
- `-c, --count <n>` - Number of mutated prompts per case (default: 5)
- `--mutations <types...>` - Mutations to apply (typo, role-spoof, instruction-flip, cot-injection)
- `--redact` - Enable PII/sensitive data redaction

### `artemiskit stress <scenario>`

Perform load and stress testing with detailed latency metrics.

```bash
artemiskit stress tests/api.yaml --requests 100 --concurrency 10
```

Options:
- `-n, --requests <n>` - Total number of requests to make
- `-c, --concurrency <n>` - Number of concurrent requests (default: 10)
- `-d, --duration <seconds>` - Duration to run the test (default: 30)
- `--ramp-up <seconds>` - Ramp-up time (default: 5)
- `--redact` - Enable PII/sensitive data redaction

### `artemiskit report <manifest>`

Regenerate HTML reports from saved run manifests.

```bash
artemiskit report artemis-runs/my-project/abc123.json
```

### `artemiskit history`

View past test runs.

```bash
artemiskit history --limit 10
```

### `artemiskit compare <run1> <run2>`

Compare results between two test runs.

```bash
artemiskit compare abc123 def456
```

### `artemiskit init`

Initialize ArtemisKit configuration in your project.

```bash
artemiskit init
```

## Scenario File Format

```yaml
name: my-test-scenario
description: Test user authentication flow

config:
  provider: openai
  model: gpt-4o

cases:
  - id: login-success
    prompt: "How do I log in to my account?"
    expect:
      - type: contains
        value: "password"
      - type: contains
        value: "username"

  - id: password-reset
    prompt: "I forgot my password"
    expect:
      - type: contains
        value: "reset"
```

## Configuration

Create `artemis.config.yaml` in your project root:

```yaml
project: my-project

provider: openai
model: gpt-4o

providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
  
  azure-openai:
    apiKey: ${AZURE_OPENAI_API_KEY}
    resourceName: ${AZURE_OPENAI_RESOURCE}
    deploymentName: ${AZURE_OPENAI_DEPLOYMENT}
    apiVersion: "2024-02-15-preview"

storage:
  type: local
  basePath: ./artemis-runs
```

## Environment Variables

- `OPENAI_API_KEY` - OpenAI API key
- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key
- `AZURE_OPENAI_RESOURCE` - Azure resource name
- `AZURE_OPENAI_DEPLOYMENT` - Azure deployment name
- `ANTHROPIC_API_KEY` - Anthropic API key

## Aliases

The CLI is also available as `akit`:

```bash
akit run my-scenario.yaml
```

## Related Packages

- [`@artemiskit/core`](https://www.npmjs.com/package/@artemiskit/core) - Core runtime and evaluators
- [`@artemiskit/adapter-openai`](https://www.npmjs.com/package/@artemiskit/adapter-openai) - OpenAI/Azure adapter
- [`@artemiskit/adapter-anthropic`](https://www.npmjs.com/package/@artemiskit/adapter-anthropic) - Anthropic Claude adapter
- [`@artemiskit/redteam`](https://www.npmjs.com/package/@artemiskit/redteam) - Security testing
- [`@artemiskit/reports`](https://www.npmjs.com/package/@artemiskit/reports) - HTML report generation

## License

Apache-2.0
