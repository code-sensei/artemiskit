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

### Controlled workflows

```bash
akit init agent-workflow
akit tools list
akit scenario validate workflow.yaml
akit workflow preflight workflow.yaml --config artemis.config.yaml --output probe.json
akit workflow run workflow.yaml --config artemis.config.yaml --output execution.json
```

Validation is offline. Preflight makes a bounded structured-tool round trip to the configured
provider; run executes the declared workflow in a fresh simulated or disposable Docker environment.
The workflow controls provider/model identity and tool authority. `--output` saves bounded metadata;
`--state-output` explicitly exports sensitive working state to a separate new file with mode `0600`.
SIGINT/SIGTERM preserves an interrupted record when output was requested.

The 0.6.3 recovery interface adds `--checkpoint-dir` and `--pause-after-actions` to a run,
and `akit workflow resume <file> --checkpoint-dir <directory>` for a compatible private checkpoint.
A confirmed pause exits `10`; budgets, tool-call cursor, configuration identity and the original
deadline survive restart. Operational checkpoints contain sensitive working data and stay separate
from saved public evidence. See the [fault and recovery guide](https://github.com/code-sensei/artemiskit/blob/main/docs/workflow-recovery.md)
for complete CLI/SDK examples, supported crash boundaries and qualification status.

For 0.6.2 workflow runs, exit `0` means verified task success, `8` means a valid task failure,
and `9` means invalid/unavailable outcome evaluation. Runtime/policy failures retain their existing
exits. Successful preflight still returns `0` without assessing the task. Optional semantic criteria
require `--judge-config <file>` with an explicit independent provider/model and bounded limits. See the
[outcome guide](https://github.com/code-sensei/artemiskit/blob/main/docs/workflow-outcomes.md) and
[execution guide](https://github.com/code-sensei/artemiskit/blob/main/docs/workflow-execution.md)
for the full exit map, budgets, sandbox requirements, and SDK equivalents. The CLI requires Bun.

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

Run adversarial security tests including prompt injection, jailbreak attempts, data extraction probes, and agent-specific attacks.

```bash
# Basic red team testing
artemiskit redteam tests/chatbot.yaml --count 5

# OWASP LLM Top 10 testing
artemiskit redteam tests/chatbot.yaml --owasp LLM01,LLM05
artemiskit redteam tests/chatbot.yaml --owasp-full

# Agent-specific testing
artemiskit redteam tests/agent.yaml --mutations agent-confusion,tool-abuse --agent-detection trace
```

Options:
- `-c, --count <n>` - Number of mutated prompts per case (default: 5)
- `--mutations <types...>` - Mutations to apply:
  - Basic: `typo`, `role-spoof`, `instruction-flip`, `cot-injection`
  - Encoding: `encoding` (base64, ROT13, hex, unicode)
  - Multi-turn: `multi_turn` (gradual escalation, context switching)
  - Agent: `agent-confusion`, `tool-abuse`, `memory-poisoning`, `chain-manipulation`
  - OWASP: `bad-likert-judge`, `crescendo`, `deceptive-delight`, `output-injection`, `excessive-agency`, `system-extraction`, `hallucination-trap`
- `--owasp <categories>` - Test by OWASP LLM category (e.g., `LLM01,LLM05`)
- `--owasp-full` - Full OWASP LLM Top 10 compliance scan
- `--agent-detection <mode>` - Detection mode for agent mutations (`trace` or `response`)
- `--min-severity <level>` - Filter attacks by severity (low, medium, high, critical)
- `--custom-attacks <path>` - Load custom attack patterns from YAML
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
- [`@artemiskit/adapter-vercel-ai`](https://www.npmjs.com/package/@artemiskit/adapter-vercel-ai) - Vercel AI SDK adapter (20+ providers)
- [`@artemiskit/adapter-anthropic`](https://www.npmjs.com/package/@artemiskit/adapter-anthropic) - Anthropic Claude adapter
- [`@artemiskit/redteam`](https://www.npmjs.com/package/@artemiskit/redteam) - Security testing
- [`@artemiskit/reports`](https://www.npmjs.com/package/@artemiskit/reports) - HTML report generation

## License

Apache-2.0
