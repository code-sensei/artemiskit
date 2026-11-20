---
"@artemiskit/adapter-openai": patch
"@artemiskit/adapter-anthropic": patch
"@artemiskit/adapter-ling": patch
---

Stop Bun's fetch timeout from cutting long requests. Under Bun, fetch applies its own 5-minute
idle timeout, so a non-streaming request that waited longer for a response (for example, a local
thinking model) failed with "Connection error" after about 5–6 minutes, even when the adapter
`timeout` was much longer. The OpenAI, Anthropic and Ling adapters now turn Bun's timer off, so the
configured adapter `timeout` governs. Node is unchanged.
