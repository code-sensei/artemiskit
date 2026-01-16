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

- **OpenAI API** - GPT-5.2, GPT-4.1, GPT-4o, and more
- **Azure OpenAI Service** - Azure-hosted OpenAI models

## Usage

### With CLI

Configure in `artemis.config.yaml`:

```yaml
# OpenAI
provider: openai
model: gpt-4.1

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

### Programmatic - OpenAI

```typescript
import { OpenAIAdapter } from '@artemiskit/adapter-openai';

const adapter = new OpenAIAdapter({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: 'gpt-4.1',
});

const result = await adapter.generate({
  prompt: 'Hello, how are you?',
  model: 'gpt-4.1',
});

console.log(result.text);
```

### Programmatic - Azure OpenAI

```typescript
import { OpenAIAdapter } from '@artemiskit/adapter-openai';

const azureAdapter = new OpenAIAdapter({
  provider: 'azure-openai',
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  resourceName: 'my-openai-resource',
  deploymentName: 'gpt-4o-deployment',
  apiVersion: '2024-02-15-preview',
});

const result = await azureAdapter.generate({
  prompt: 'Hello, how are you?',
  model: 'gpt-4o-deployment', // Use your deployment name
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

| Model | Description |
|-------|-------------|
| `gpt-5.2` | Latest flagship model for professional work |
| `gpt-5.1` | Previous flagship in GPT-5 series |
| `gpt-4.1` | High performance with 1M token context |
| `gpt-4.1-mini` | Smaller, faster version of GPT-4.1 |
| `gpt-4.1-nano` | Fastest, most cost-efficient |
| `gpt-4o` | Multimodal model (text + vision) |
| `gpt-4o-mini` | Smaller multimodal model |

### Azure OpenAI

Any model deployed to your Azure OpenAI resource. Common deployments include GPT-4o, GPT-4, and GPT-3.5-turbo.

## Related Packages

- [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) - Command-line interface
- [`@artemiskit/core`](https://www.npmjs.com/package/@artemiskit/core) - Core runtime
- [`@artemiskit/adapter-anthropic`](https://www.npmjs.com/package/@artemiskit/adapter-anthropic) - Anthropic adapter
- [`@artemiskit/adapter-vercel-ai`](https://www.npmjs.com/package/@artemiskit/adapter-vercel-ai) - Vercel AI SDK adapter

## License

Apache-2.0
