---
"@artemiskit/adapter-openai": minor
---

Add opt-in generation settings for OpenAI-compatible targets. `reasoningEffort` (`none`, `minimal`, `low`, `medium` or `high`; `none` turns thinking off on servers such as Ollama) is sent as `reasoning_effort` only when configured, and `presencePenalty` is sent as `presence_penalty` when requested. Requests to loopback endpoints always send the token limit as `max_tokens`, because local servers ignore `max_completion_tokens` and local model names could otherwise match OpenAI's newer-model patterns and lose the cap. Remote endpoints keep the existing name-based selection.
