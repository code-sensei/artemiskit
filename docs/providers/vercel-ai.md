# Vercel AI Provider

The Vercel AI provider connects ArtemisKit to any model supported by the [Vercel AI SDK](https://sdk.vercel.ai/), giving you access to 20+ model providers through a unified interface.

## Configuration

### Environment Variables

Set the appropriate API key for your chosen provider:

```bash
# OpenAI models
OPENAI_API_KEY=sk-...

# Anthropic models
ANTHROPIC_API_KEY=sk-ant-...

# Google models
GOOGLE_GENERATIVE_AI_API_KEY=...

# And more - see Vercel AI SDK docs
```

### Config File

```yaml
# artemis.config.yaml
provider: vercel-ai
model: openai:gpt-4o  # Format: provider:model
```

### CLI Override

```bash
artemiskit run scenario.yaml --provider vercel-ai --model anthropic:claude-3-5-sonnet-20241022
```

## Model Format

The Vercel AI provider uses the format `provider:model`:

```
openai:gpt-4o
anthropic:claude-3-5-sonnet-20241022
google:gemini-1.5-pro
mistral:mistral-large-latest
```

## Supported Providers

Through Vercel AI SDK, you can access:

- **OpenAI** - `openai:gpt-4o`, `openai:gpt-4o-mini`
- **Anthropic** - `anthropic:claude-3-5-sonnet-20241022`, `anthropic:claude-3-haiku-20240307`
- **Google** - `google:gemini-1.5-pro`, `google:gemini-1.5-flash`
- **Mistral** - `mistral:mistral-large-latest`
- **Cohere** - `cohere:command-r-plus`
- **Amazon Bedrock** - `bedrock:anthropic.claude-3-sonnet`
- **Azure** - `azure:deployment-name`
- And many more...

See the [Vercel AI SDK documentation](https://sdk.vercel.ai/providers) for the full list.

## Provider-Specific Options

Configure Vercel AI options in the `providers.vercel-ai` section:

```yaml
# artemis.config.yaml
provider: vercel-ai
model: openai:gpt-4o

providers:
  vercel-ai:
    temperature: 0.7      # Sampling temperature
    maxTokens: 4096       # Maximum tokens in response
```

## Example

```yaml
# scenario.yaml
name: Multi-Provider Test
description: Testing with Vercel AI SDK

provider: vercel-ai
model: anthropic:claude-3-5-sonnet-20241022

cases:
  - id: basic-greeting
    prompt: "Say hello"
    expected:
      type: contains
      values:
        - "hello"
      mode: any
```

## Use Cases

The Vercel AI provider is ideal for:

- **Comparing models** - Run the same scenario across different providers
- **Provider flexibility** - Switch providers without code changes
- **Unified interface** - One configuration style for all providers

## Troubleshooting

### Provider Not Found

```
Error: Provider 'xxx' not found
```

Ensure the provider prefix is correct. Check the Vercel AI SDK docs for exact provider names.

### Missing API Key

```
Error: Missing API key for provider
```

Set the appropriate environment variable for your chosen provider.

### Model Not Available

```
Error: Model not available
```

Verify the model name is correct and available for your account/region.
