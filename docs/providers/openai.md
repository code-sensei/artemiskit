# OpenAI Provider

The OpenAI provider connects ArtemisKit to OpenAI's API for running evaluations.

## Configuration

### Environment Variables

```bash
OPENAI_API_KEY=sk-...
```

### Config File

```yaml
# artemis.config.yaml
provider: openai
model: gpt-4o  # The model to use for evaluations
```

### CLI Override

```bash
artemiskit run scenario.yaml --provider openai --model gpt-4o-mini
```

## Supported Models

Any model available through the OpenAI API:

- `gpt-4o` - Latest GPT-4o
- `gpt-4o-mini` - Smaller, faster GPT-4o
- `gpt-4-turbo` - GPT-4 Turbo
- `gpt-3.5-turbo` - GPT-3.5 Turbo
- Custom fine-tuned models (use the model ID)

## Provider-Specific Options

```yaml
# artemis.config.yaml
provider: openai
model: gpt-4o

providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
    timeout: 60000        # Request timeout in milliseconds
    maxRetries: 2         # Number of retries on failure
```

## Example

```yaml
# scenario.yaml
name: OpenAI Test
description: Testing with OpenAI GPT-4o

provider: openai
model: gpt-4o

cases:
  - id: basic-greeting
    prompt: "Say hello"
    expected:
      type: contains
      values:
        - "hello"
      mode: any
```

## Troubleshooting

### Authentication Error

```
Error: 401 Unauthorized
```

Ensure `OPENAI_API_KEY` is set correctly in your environment.

### Rate Limiting

```
Error: 429 Too Many Requests
```

OpenAI has rate limits. Use the `concurrency` option to limit parallel requests:

```bash
artemiskit run scenario.yaml --concurrency 1
```

### Model Not Found

```
Error: The model 'xxx' does not exist
```

Check that the model name is correct and available in your OpenAI account.
