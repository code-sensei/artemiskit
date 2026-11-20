---
"@artemiskit/cli": patch
"@artemiskit/core": patch
"@artemiskit/adapter-openai": patch
---

Pass configured reasoning settings through `akit run`. The config loader previously stripped
`providers.openai.reasoningEffort` and `providers.ling.thinking`, so configured reasoning never
reached the provider. Both are now accepted in the config file and scenario `providerConfig`, sent
with every request, and recorded with their source in the run manifest. `reasoningEffort` also
accepts `xhigh`.
