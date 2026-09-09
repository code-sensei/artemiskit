# ArtemisKit agent instructions

## Local-model release validation

Before committing a user-facing improvement that changes the runner, executor, artifacts,
reports, SDK, adapters, or CLI—and again before any push or release—run the applicable
deterministic test, typecheck, lint, and build gates. When Ollama is installed and its local
service is available, also run a bounded real CLI smoke scenario against every locally installed
model through its OpenAI-compatible endpoint (`http://127.0.0.1:11434/v1`).

- Use the existing `openai` adapter configuration for this validation unless ArtemisKit has an
  explicitly supported native Ollama adapter. Do not record or describe compatibility-path runs as
  native Ollama-provider support.
- Use fixture-safe scenarios, a local-only endpoint, no customer data or secrets, and inspect the
  saved manifest plus requested/observed model identity, measurement counts, denominator, and any
  requested report export.
- Build workspace packages before invoking the CLI smoke test so it exercises release-like bundles,
  rather than stale workspace output.
- Treat costs returned through an OpenAI-compatible local endpoint as unavailable for assurance
  reporting unless a deliberate, provider-neutral local pricing contract supplies them. Do not
  report those estimates as local spend.
- If Ollama is absent or unavailable, record the reason and retain the deterministic gates; do not
  silently claim local-model validation.
