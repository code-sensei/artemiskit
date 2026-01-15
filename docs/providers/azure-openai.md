# Azure OpenAI Provider

The Azure OpenAI provider connects ArtemisKit to Azure's OpenAI Service.

## Important: Model vs Deployment

**The `model` field in your scenario/config is for display purposes only when using Azure OpenAI.**

Unlike standard OpenAI, Azure OpenAI uses deployments. The actual model is determined by what you deployed in Azure, not by what you specify in ArtemisKit. The `model` field is used for:

- Display in reports and logs
- Metadata in run manifests
- Human readability

The actual model inference happens on whatever model your Azure deployment is configured to use.

## Configuration

### Environment Variables

```bash
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_RESOURCE_NAME=your-resource-name
AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
AZURE_OPENAI_API_VERSION=2024-02-15-preview  # Optional, has default
```

### Config File

```yaml
# artemis.config.yaml
provider: azure-openai
model: gpt-4o  # Display only - actual model is your Azure deployment

azure:
  resourceName: my-resource        # Or use AZURE_OPENAI_RESOURCE_NAME
  deploymentName: my-deployment    # Or use AZURE_OPENAI_DEPLOYMENT_NAME
  apiVersion: 2024-02-15-preview   # Optional
```

### CLI Override

```bash
artemiskit run scenario.yaml --provider azure-openai --model gpt-4o
```

## Provider-Specific Options

```yaml
# artemis.config.yaml
provider: azure-openai
model: gpt-4o  # Display only

azure:
  resourceName: my-resource
  deploymentName: my-deployment
  apiVersion: 2024-02-15-preview

providerOptions:
  temperature: 0.7      # Sampling temperature (0-2)
  maxTokens: 4096       # Maximum tokens in response
  timeout: 60000        # Request timeout in milliseconds
  maxRetries: 2         # Number of retries on failure
```

## Example

```yaml
# scenario.yaml
name: Azure OpenAI Test
description: Testing with Azure OpenAI

provider: azure-openai
model: gpt-4o  # For display - actual model is determined by your deployment

cases:
  - name: Basic greeting
    prompt: "Say hello"
    assert:
      - type: contains
        value: "hello"
```

## Setting Up Azure OpenAI

1. Create an Azure OpenAI resource in the Azure Portal
2. Deploy a model (e.g., gpt-4o) and note the deployment name
3. Get your API key from the Azure Portal
4. Set the environment variables or config file

## Troubleshooting

### Authentication Error

```
Error: 401 Unauthorized
```

Check that:
- `AZURE_OPENAI_API_KEY` is correct
- `AZURE_OPENAI_RESOURCE_NAME` matches your Azure resource
- The API key has access to the resource

### Deployment Not Found

```
Error: 404 DeploymentNotFound
```

Ensure `AZURE_OPENAI_DEPLOYMENT_NAME` matches an existing deployment in your Azure resource.

### Content Filter Blocked

```
Error: Content filter blocked the request
```

Azure OpenAI has content filtering enabled by default. The request or response triggered a content policy. This is expected behavior for red team testing - ArtemisKit will mark these as "blocked" in results.

### API Version Issues

```
Error: Invalid API version
```

Try a different API version. Common versions:
- `2024-02-15-preview`
- `2023-12-01-preview`
- `2023-05-15`
