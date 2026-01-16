# @artemiskit/adapter-anthropic

Anthropic Claude adapter for ArtemisKit LLM evaluation toolkit.

## Installation

```bash
npm install @artemiskit/adapter-anthropic
# or
bun add @artemiskit/adapter-anthropic
```

## Overview

This adapter provides connectivity to Anthropic's Claude models:

- Claude 3.5 Sonnet
- Claude 3.5 Haiku
- Claude 3 Opus
- Claude 3 Sonnet
- Claude 3 Haiku

## Usage

### With CLI

Configure in `artemis.config.yaml`:

```yaml
provider: anthropic
model: claude-3-5-sonnet-20241022

providers:
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
```

Then run:

```bash
artemiskit run my-scenario.yaml --provider anthropic
```

### Programmatic

```typescript
import { AnthropicAdapter } from '@artemiskit/adapter-anthropic';

const adapter = new AnthropicAdapter({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultModel: 'claude-3-5-sonnet-20241022',
});

const result = await adapter.generate({
  prompt: 'Hello, how are you?',
  model: 'claude-3-5-sonnet-20241022',
});

console.log(result.text);
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `provider` | `'anthropic'` | Yes | Provider identifier |
| `apiKey` | `string` | No | Anthropic API key (or use ANTHROPIC_API_KEY env var) |
| `defaultModel` | `string` | No | Default model to use |
| `baseUrl` | `string` | No | Custom API base URL |
| `timeout` | `number` | No | Request timeout in ms (default: 60000) |
| `maxRetries` | `number` | No | Max retry attempts (default: 2) |

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## Supported Models

| Model | Description |
|-------|-------------|
| `claude-3-5-sonnet-20241022` | Latest Sonnet - balanced performance |
| `claude-3-5-haiku-20241022` | Latest Haiku - fast and efficient |
| `claude-3-opus-20240229` | Most capable model |
| `claude-3-sonnet-20240229` | Balanced performance |
| `claude-3-haiku-20240307` | Fast and efficient |

## Related Packages

- [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) - Command-line interface
- [`@artemiskit/core`](https://www.npmjs.com/package/@artemiskit/core) - Core runtime
- [`@artemiskit/adapter-openai`](https://www.npmjs.com/package/@artemiskit/adapter-openai) - OpenAI adapter
- [`@artemiskit/adapter-vercel-ai`](https://www.npmjs.com/package/@artemiskit/adapter-vercel-ai) - Vercel AI SDK adapter

## License

Apache-2.0
