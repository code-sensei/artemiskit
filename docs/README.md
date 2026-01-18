# ArtemisKit Documentation

Welcome to the ArtemisKit documentation. This guide covers configuration, storage backends, and provider adapters for the LLM evaluation toolkit.

## Quick Links

| Section | Description |
|---------|-------------|
| [Providers](./providers/README.md) | LLM provider adapters (OpenAI, Azure, Anthropic, Vercel AI) |
| [Storage](./storage/README.md) | Storage backends for evaluation results |

## Getting Started

For installation and basic usage, see the main [README](../README.md).

### Basic Workflow

1. **Install ArtemisKit**
   ```bash
   npm install -g @artemiskit/cli
   ```

2. **Configure a Provider**
   ```bash
   export OPENAI_API_KEY="your-key"
   # or
   export ANTHROPIC_API_KEY="your-key"
   ```

3. **Create a Scenario**
   ```yaml
   # scenarios/math-test.yaml
   name: math-evaluation
   description: Simple math test
   
   cases:
     - id: addition
       prompt: "What is 2+2?"
       expected:
         type: contains
         values:
           - "4"
         mode: any
   ```

4. **Run Evaluation**
   ```bash
   artemiskit run scenario.yaml
   ```

## Documentation Structure

```
docs/
├── README.md              # This file
├── providers/
│   ├── README.md          # Provider overview and comparison
│   ├── openai.md          # OpenAI adapter
│   ├── azure-openai.md    # Azure OpenAI adapter
│   ├── anthropic.md       # Anthropic adapter
│   └── vercel-ai.md       # Vercel AI SDK adapter
└── storage/
    ├── README.md          # Storage overview and comparison
    ├── local.md           # Local filesystem storage
    └── supabase.md        # Supabase cloud storage
```

## Providers

ArtemisKit supports multiple LLM providers through adapters:

| Provider | Package | Best For |
|----------|---------|----------|
| [OpenAI](./providers/openai.md) | `@artemiskit/adapter-openai` | GPT models, production use |
| [Azure OpenAI](./providers/azure-openai.md) | `@artemiskit/adapter-openai` | Enterprise, compliance |
| [Anthropic](./providers/anthropic.md) | `@artemiskit/adapter-anthropic` | Claude models |
| [Vercel AI](./providers/vercel-ai.md) | `@artemiskit/adapter-vercel-ai` | Multi-provider apps |

## Storage

Evaluation results can be stored locally or in the cloud:

| Backend | Best For |
|---------|----------|
| [Local](./storage/local.md) | Development, single-user |
| [Supabase](./storage/supabase.md) | Teams, CI/CD, cloud deployments |

## Configuration

ArtemisKit uses a layered configuration system with the following precedence:

1. **CLI flags** (highest priority)
2. **Scenario file** settings
3. **Config file** (`artemis.config.yaml`)
4. **Environment variables**
5. **Defaults** (lowest priority)

### Config File Example

```yaml
# artemis.config.yaml
project: my-project
provider: openai
model: gpt-4o

storage:
  type: local
  basePath: ./artemis-runs

output:
  format: html
  dir: ./artemis-output
```

## Evaluators

Built-in evaluators for assessing LLM outputs:

| Evaluator | Description |
|-----------|-------------|
| `contains` | Check if output contains a string |
| `exact` | Exact string match |
| `regex` | Regular expression match |
| `fuzzy` | Fuzzy string matching with threshold |
| `llm_grader` | Use an LLM to grade the output |
| `json_schema` | Validate JSON against a schema |

## Related Resources

- [Main README](../README.md) - Installation and overview
- [Contributing Guide](../CONTRIBUTING.md) - Development setup
- [Roadmap](../ROADMAP.md) - Planned features
- [Examples](../examples/README.md) - Sample scenarios

## Package Documentation

- [@artemiskit/cli](../packages/cli/README.md) - Command-line interface
- [@artemiskit/core](../packages/core/README.md) - Core evaluation engine
- [@artemiskit/redteam](../packages/redteam/README.md) - Security testing
- [@artemiskit/reports](../packages/reports/README.md) - Report generation
