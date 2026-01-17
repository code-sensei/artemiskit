# Provider Documentation

ArtemisKit supports multiple LLM providers. Choose the one that fits your infrastructure.

## Available Providers

| Provider | Description | Documentation |
|----------|-------------|---------------|
| `openai` | Direct OpenAI API | [openai.md](./openai.md) |
| `azure-openai` | Azure OpenAI Service | [azure-openai.md](./azure-openai.md) |
| `anthropic` | Anthropic Claude API | [anthropic.md](./anthropic.md) |
| `vercel-ai` | Vercel AI SDK (20+ providers) | [vercel-ai.md](./vercel-ai.md) |

## Quick Comparison

| Feature | OpenAI | Azure OpenAI | Anthropic | Vercel AI |
|---------|--------|--------------|-----------|-----------|
| Setup complexity | Simple | Moderate | Simple | Simple |
| Model selection | Direct | Via deployment | Direct | Via prefix |
| Multi-provider | No | No | No | Yes |
| Enterprise features | Limited | Full | Limited | Varies |
| Max context | 128K | 128K | 200K | Varies |

## Choosing a Provider

- **OpenAI** - Best for quick setup and direct OpenAI access
- **Azure OpenAI** - Best for enterprise deployments with Azure infrastructure
- **Anthropic** - Best for Claude models with large context windows (200K tokens)
- **Vercel AI** - Best for comparing models across providers or using multiple providers

## Provider Priority

ArtemisKit resolves the provider in this order:

1. CLI flag (`--provider`)
2. Scenario file (`provider:` field)
3. Config file (`artemis.config.yaml`)
4. Default: `openai`

The same priority applies to model selection.

## Quick Setup

### OpenAI
```bash
export OPENAI_API_KEY="sk-..."
artemiskit run scenario.yaml --provider openai --model gpt-4o
```

### Azure OpenAI
```bash
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_RESOURCE_NAME="my-resource"
export AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4o-deployment"
artemiskit run scenario.yaml --provider azure-openai
```

### Anthropic
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
artemiskit run scenario.yaml --provider anthropic --model claude-sonnet-4-5-20241022
```

### Vercel AI (any provider)
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
artemiskit run scenario.yaml --provider vercel-ai --model anthropic:claude-sonnet-4-5-20241022
```
