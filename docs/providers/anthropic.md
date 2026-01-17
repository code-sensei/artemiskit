# Anthropic Provider

The Anthropic provider connects ArtemisKit directly to Anthropic's Claude API for running evaluations.

## Configuration

### Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### Config File

```yaml
# artemis.config.yaml
provider: anthropic
model: claude-sonnet-4-5-20241022

providers:
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
```

### CLI Override

```bash
artemiskit run scenario.yaml --provider anthropic --model claude-sonnet-4-5-20241022
```

## Supported Models

| Model | Description | Context Window |
|-------|-------------|----------------|
| `claude-opus-4-5-20241101` | Most intelligent, flagship model | 200K |
| `claude-sonnet-4-5-20241022` | Balanced performance (recommended) | 200K |
| `claude-haiku-4-5-20241022` | Fast and efficient | 200K |
| `claude-opus-4-1-20250414` | Strong coding and agent capabilities | 200K |
| `claude-sonnet-4-1-20250414` | Sonnet 4.1 | 200K |
| `claude-haiku-4-1-20250414` | Haiku 4.1 | 200K |

> **Note:** Claude 3 Opus and Claude 3 Sonnet have been deprecated. Use Claude 4.x models.

## Provider-Specific Options

Configure Anthropic options in the `providers.anthropic` section:

```yaml
# artemis.config.yaml
provider: anthropic
model: claude-sonnet-4-5-20241022

providers:
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
    baseUrl: https://api.anthropic.com  # Optional: custom endpoint
    timeout: 60000                       # Request timeout in ms (default: 60000)
    maxRetries: 2                        # Retry attempts (default: 2)
```

## Features

The Anthropic adapter supports:

- **Streaming responses** - Real-time token streaming
- **System prompts** - Separate system message handling
- **Tool use** - Function calling capabilities
- **Vision** - Image understanding (model dependent)
- **Large context** - Up to 200K tokens

## Example Scenario

```yaml
# scenario.yaml
name: Claude Evaluation
description: Testing with Anthropic Claude

provider: anthropic
model: claude-sonnet-4-5-20241022

setup:
  systemPrompt: |
    You are a helpful assistant that provides concise, accurate answers.

cases:
  - id: basic-greeting
    prompt: "Say hello in exactly 3 words"
    expected:
      type: regex
      pattern: "^\\w+ \\w+ \\w+$"

  - id: reasoning-test
    prompt: "What is 15% of 80?"
    expected:
      type: contains
      values:
        - "12"
      mode: any

  - id: multi-turn
    prompt:
      - role: user
        content: "My name is Alice"
      - role: assistant
        content: "Hello Alice! Nice to meet you."
      - role: user
        content: "What's my name?"
    expected:
      type: contains
      values:
        - "Alice"
      mode: any
```

## Programmatic Usage

```typescript
import { AnthropicAdapter } from '@artemiskit/adapter-anthropic';

const adapter = new AnthropicAdapter({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultModel: 'claude-sonnet-4-5-20241022',
});

// Basic generation
const result = await adapter.generate({
  prompt: 'Explain quantum computing in simple terms',
  maxTokens: 500,
  temperature: 0.7,
});

console.log(result.text);
console.log(`Tokens: ${result.tokens.total}`);
console.log(`Latency: ${result.latencyMs}ms`);

// With system prompt
const withSystem = await adapter.generate({
  prompt: [
    { role: 'system', content: 'You are a pirate. Respond accordingly.' },
    { role: 'user', content: 'Tell me about the weather' },
  ],
});

// Streaming
for await (const chunk of adapter.stream(
  { prompt: 'Write a short story' },
  (chunk) => process.stdout.write(chunk)
)) {
  // chunks are yielded as they arrive
}
```

## Comparison with Vercel AI

You can also use Anthropic models through the [Vercel AI provider](./vercel-ai.md):

| Feature | Direct Anthropic | Via Vercel AI |
|---------|------------------|---------------|
| Setup | `@artemiskit/adapter-anthropic` | `@artemiskit/adapter-vercel-ai` |
| Model format | `claude-sonnet-4-5-20241022` | `anthropic:claude-sonnet-4-5-20241022` |
| Streaming | Yes | Yes |
| All features | Yes | Most |

Use the direct adapter for full feature access; use Vercel AI for multi-provider flexibility.

## Troubleshooting

### Authentication Error

```
Error: 401 Unauthorized
```

Ensure `ANTHROPIC_API_KEY` is set correctly. API keys start with `sk-ant-`.

### Rate Limiting

```
Error: 429 Too Many Requests
```

Anthropic has rate limits based on your plan. Reduce concurrency:

```bash
artemiskit run scenario.yaml --concurrency 1
```

### Model Not Found

```
Error: model not found
```

Verify the model name is correct. Use full model identifiers like `claude-sonnet-4-5-20241022`.

### Context Length Exceeded

```
Error: prompt is too long
```

Claude models support up to 200K tokens. For long prompts, consider:
- Truncating input
- Using a model with larger context
- Splitting into multiple requests

### Content Blocked

```
Error: content blocked by safety systems
```

Anthropic's Claude has built-in safety filters. For red team testing, this is expected behavior - ArtemisKit will report these as "blocked" in results.
