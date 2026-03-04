# Configuration Examples

This folder contains example `artemis.config.yaml` files for different use cases.

## Files

| File | Description |
|------|-------------|
| `basic.config.yaml` | Minimal configuration for getting started |
| `multi-provider.config.yaml` | Multiple provider setup (OpenAI + Anthropic) |
| `ci-optimized.config.yaml` | Optimized settings for CI/CD pipelines |
| `supabase.config.yaml` | Cloud storage with Supabase |

## Usage

Copy the appropriate config file to your project root and rename it:

```bash
# Copy and use as your project config
cp examples/08-configuration/basic.config.yaml ./artemis.config.yaml

# Or reference it directly
akit run scenarios/ --config examples/08-configuration/ci-optimized.config.yaml
```

## Config File Location

ArtemisKit looks for configuration in this order:

1. `--config` flag (explicit path)
2. `artemis.config.yaml` in current directory
3. `artemis.config.yml` in current directory
4. `.artemisrc.yaml` in current directory
5. Environment variables

## Environment Variables

All config values can be overridden with environment variables:

```bash
# Provider settings
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Azure OpenAI
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_RESOURCE=...
export AZURE_OPENAI_DEPLOYMENT=...

# Supabase storage
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_ANON_KEY=...
```

## Config Schema

```yaml
# Provider configuration
provider: openai | anthropic | azure-openai | vercel-ai | langchain | deepagents
model: gpt-4o-mini

# Provider-specific settings
providerConfig:
  apiKey: ${OPENAI_API_KEY}
  baseUrl: https://api.openai.com/v1
  timeout: 30000

# Multiple providers
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}

# Output settings
output:
  dir: ./artemis-output
  format: json | html | both

# Storage settings
storage:
  type: local | supabase
  supabase:
    url: ${SUPABASE_URL}
    anonKey: ${SUPABASE_ANON_KEY}

# Redaction settings
redaction:
  enabled: true
  patterns:
    - email
    - phone
    - credit_card
    - ssn
    - api_key
```
