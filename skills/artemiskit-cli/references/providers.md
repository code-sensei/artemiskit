# Provider configuration

This guidance reflects the CLI in release milestone 0.6.4 (CLI package 0.6.3). Provider IDs recognized by the scenario schema are not all executable adapters. Check `akit --version`, the current source or release notes and provider availability before making a run.

In this version, the CLI registers `openai`, `azure-openai`, `ling` and `vercel-ai`. The direct `anthropic`, `google`, `mistral`, `ollama`, `huggingface` and `cohere` adapters are marked unavailable. `langchain` and `deepagents` require runtime objects. Support and capabilities vary by adapter; an underlying provider via Vercel AI is not the same as a direct CLI adapter.

## OpenAI and compatible endpoints

Set `OPENAI_API_KEY` through a secure environment or secret manager when required. Example configuration:

```yaml
provider: openai
model: gpt-4o
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
    timeout: 60000
```

For a compatible endpoint, use the **`openai`** adapter with a `baseUrl` in its provider configuration, and the model and credential the endpoint requires. There is no `openai-compatible` provider ID in the qualified CLI. A local Ollama server may expose an OpenAI-compatible API, but that is a compatibility path, not native Ollama-provider support. Do not assume feature equivalence or actual cost from the adapter's estimates.

```yaml
provider: openai
model: local-model-name
providers:
  openai:
    baseUrl: http://127.0.0.1:11434/v1
    apiKey: ${OPENAI_API_KEY}
```

Only point a run at a server and model the user has authorized. Local endpoint behavior and whether a credential is needed vary; inspect the configuration without printing secrets.

## Azure, Ling and Vercel AI

The qualified CLI also registers `azure-openai`, `ling` and `vercel-ai`. Supply their required endpoint, deployment, credential and model details using the relevant current provider guide. For Vercel AI configuration the field is `underlyingProvider`, not `provider`; check actual supported combinations for the installed adapter. Never assume that a model name is available on a user's account.

See [provider concepts](https://www.artemiskit.dev/docs/concepts/providers/) and [CLI provider configuration](https://www.artemiskit.dev/docs/cli/providers/). Treat the source, installed `--help`, release notes and provider documentation as the authority if a guide and the installed version disagree. Do not echo credentials or include them in reports, logs, commits or prompts.
