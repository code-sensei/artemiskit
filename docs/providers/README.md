# Provider Documentation

ArtemisKit supports multiple LLM providers. Choose the one that fits your infrastructure.

## Available Providers

| Provider | Description | Documentation |
|----------|-------------|---------------|
| `openai` | Direct OpenAI API | [openai.md](./openai.md) |
| `azure-openai` | Azure OpenAI Service | [azure-openai.md](./azure-openai.md) |
| `vercel-ai` | Vercel AI SDK (20+ providers) | [vercel-ai.md](./vercel-ai.md) |

## Quick Comparison

| Feature | OpenAI | Azure OpenAI | Vercel AI |
|---------|--------|--------------|-----------|
| Setup complexity | Simple | Moderate | Simple |
| Model selection | Direct | Via deployment | Via prefix |
| Multi-provider | No | No | Yes |
| Enterprise features | Limited | Full | Varies |

## Choosing a Provider

- **OpenAI** - Best for quick setup and direct OpenAI access
- **Azure OpenAI** - Best for enterprise deployments with Azure infrastructure
- **Vercel AI** - Best for comparing models across providers or using non-OpenAI models

## Provider Priority

ArtemisKit resolves the provider in this order:

1. CLI flag (`--provider`)
2. Scenario file (`provider:` field)
3. Config file (`artemis.config.yaml`)
4. Default: `openai`

The same priority applies to model selection.
