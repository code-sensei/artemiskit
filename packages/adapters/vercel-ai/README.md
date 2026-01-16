# @artemiskit/adapter-vercel-ai

Vercel AI SDK adapter for ArtemisKit LLM evaluation toolkit.

## Installation

```bash
npm install @artemiskit/adapter-vercel-ai
# or
bun add @artemiskit/adapter-vercel-ai
```

## Overview

This adapter uses the [Vercel AI SDK](https://sdk.vercel.ai/) to provide a unified interface to multiple LLM providers:

- OpenAI
- Azure OpenAI
- And other providers supported by Vercel AI SDK

## Usage

### With CLI

Configure in `artemis.config.yaml`:

```yaml
provider: vercel-ai
model: gpt-4o

providers:
  vercel-ai:
    apiKey: ${OPENAI_API_KEY}
    provider: openai  # underlying provider
```

### Programmatic

```typescript
import { VercelAIAdapter } from '@artemiskit/adapter-vercel-ai';

const adapter = new VercelAIAdapter({
  provider: 'vercel-ai',
  apiKey: process.env.OPENAI_API_KEY,
  underlyingProvider: 'openai',
  defaultModel: 'gpt-4o',
});

const result = await adapter.generate({
  prompt: 'Hello, how are you?',
  model: 'gpt-4o',
});

console.log(result.text);
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `provider` | `'vercel-ai'` | Yes | Provider identifier |
| `apiKey` | `string` | No | API key for underlying provider |
| `underlyingProvider` | `string` | Yes | Provider to use: `openai`, `azure`, `anthropic`, `google`, `mistral` |
| `defaultModel` | `string` | No | Default model to use |
| `baseUrl` | `string` | No | Custom API base URL |
| `timeout` | `number` | No | Request timeout (ms) |
| `maxRetries` | `number` | No | Max retry attempts |
| `providerConfig` | `object` | No | Additional provider-specific configuration |

## When to Use This Adapter

Use this adapter when:

- You're already using Vercel AI SDK in your project
- You want to leverage Vercel AI SDK's streaming capabilities
- You need unified error handling across providers

For direct provider access, consider using:
- [`@artemiskit/adapter-openai`](https://www.npmjs.com/package/@artemiskit/adapter-openai) - Direct OpenAI/Azure access
- [`@artemiskit/adapter-anthropic`](https://www.npmjs.com/package/@artemiskit/adapter-anthropic) - Direct Anthropic access

## Related Packages

- [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) - Command-line interface
- [`@artemiskit/core`](https://www.npmjs.com/package/@artemiskit/core) - Core runtime
- [`@artemiskit/adapter-openai`](https://www.npmjs.com/package/@artemiskit/adapter-openai) - OpenAI adapter
- [`@artemiskit/adapter-anthropic`](https://www.npmjs.com/package/@artemiskit/adapter-anthropic) - Anthropic adapter

## License

Apache-2.0
