# Ling Studio API evaluation

Copy `artemis.config.example.yaml` to a local ignored config, ensure `LING_API_KEY` is set, and run:

```bash
akit run examples/11-ling-api/scenarios/flash-core.yaml --config examples/11-ling-api/artemis.config.yaml --redact
akit run examples/11-ling-api/scenarios/tiny-core.yaml --config examples/11-ling-api/artemis.config.yaml --redact
```

These scenarios are intentionally small smoke checks. Do not commit local configs, API keys, or generated artifacts.

For the guarded Flash/Tiny/tool-loop smoke gate, opt in explicitly:

```bash
LING_LIVE_TESTS=1 bun run examples/11-ling-api/scripts/live-smoke.ts
```

The CLI executes only static fixture tools. Use the SDK's explicit `toolExecutor` option for real tools, and keep side-effecting workflows out of stress and red-team runs.
