# @artemiskit/adapter-openai

OpenAI and Azure OpenAI adapter for ArtemisKit LLM evaluation toolkit.

## Installation

```bash
npm install @artemiskit/adapter-openai
# or
bun add @artemiskit/adapter-openai
```

## Overview

This adapter provides connectivity to:

- **OpenAI API** - GPT-4, GPT-4o, GPT-3.5-turbo, etc.
- **Azure OpenAI Service** - Azure-hosted OpenAI models

## Usage

### With CLI

Configure in `artemis.config.yaml`:

```yaml
# OpenAI
provider: openai
model: gpt-4o

providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
```

```yaml
# Azure OpenAI
provider: azure-openai
model: gpt-4o

providers:
  azure-openai:
    apiKey: ${AZURE_OPENAI_API_KEY}
    resourceName: my-openai-resource
    deploymentName: gpt-4o-deployment
    apiVersion: "2024-02-15-preview"
```

### Programmatic

```typescript
import { OpenAIAdapter } from '@artemiskit/adapter-openai';

// OpenAI
const adapter = new OpenAIAdapter({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: 'gpt-4o',
});

// Azure OpenAI
const azureAdapter = new OpenAIAdapter({
  provider: 'azure-openai',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  resourceName: 'my-openai-resource',
  deploymentName: 'gpt-4o-deployment',
  apiVersion: '2024-02-15-preview',
});

// Generate response
const result = await adapter.generate({
  prompt: 'Hello, how are you?',
  model: 'gpt-4o',
});

console.log(result.text);
```

## Configuration Options

### OpenAI

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `provider` | `'openai'` | Yes | Provider identifier |
| `apiKey` | `string` | Yes | OpenAI API key |
| `defaultModel` | `string` | No | Default model to use |
| `baseUrl` | `string` | No | Custom API base URL |
| `organization` | `string` | No | OpenAI organization ID |
| `timeout` | `number` | No | Request timeout (ms) |
| `maxRetries` | `number` | No | Max retry attempts |

### Azure OpenAI

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `provider` | `'azure-openai'` | Yes | Provider identifier |
| `apiKey` | `string` | Yes | Azure OpenAI API key |
| `resourceName` | `string` | Yes | Azure resource name |
| `deploymentName` | `string` | Yes | Model deployment name |
| `apiVersion` | `string` | Yes | API version |
| `timeout` | `number` | No | Request timeout (ms) |
| `maxRetries` | `number` | No | Max retry attempts |

## Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Azure OpenAI
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_RESOURCE=my-resource
AZURE_OPENAI_DEPLOYMENT=my-deployment
AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

## Supported Models

### OpenAI
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`

### Azure OpenAI
Any model deployed to your Azure OpenAI resource.

## Related Packages

- [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) - Command-line interface
- [`@artemiskit/core`](https://www.npmjs.com/package/@artemiskit/core) - Core runtime
- [`@artemiskit/adapter-anthropic`](https://www.npmjs.com/package/@artemiskit/adapter-anthropic) - Anthropic adapter
- [`@artemiskit/adapter-vercel-ai`](https://www.npmjs.com/package/@artemiskit/adapter-vercel-ai) - Vercel AI SDK adapter

## License

Apache-2.0
