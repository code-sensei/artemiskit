# @artemiskit/adapter-ling

Native ArtemisKit adapter for Ant Ling's OpenAI-compatible Studio API.

Set `LING_API_KEY` and use `provider: ling` with `Ling-3.0-flash` or `Ling-3.0-tiny`. The default endpoint is `https://api.ant-ling.com/v1`.

Flash supports the Ling `thinking`, search, JSON, streaming, and tool-call request fields. ArtemisKit CLI tool loops execute only declared static fixtures; use the SDK's explicit `toolExecutor` for real tools.

Run the public examples with `examples/11-ling-api/`. Live calls require explicit opt-in through `LING_LIVE_TESTS=1`.
