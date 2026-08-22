# Ling benchmark suite

This suite runs five deterministic ArtemisKit authoring, repair, and diagnosis tasks through
TrueForge. Every configured task-and-model pair runs three times in serial, with a fresh disposable
workspace for every attempt.

The committed matrix contains 24 attempts:

- `Ling-3.0-flash`: all five tasks, for 15 attempts;
- `Ling-3.0-tiny`: scenario repair, scenario authoring, and validation diagnosis, for 9 attempts.

Run it from the repository root after completing the TrueForge and Docker setup in the
[operator guide](../../../docs/agent-evaluation/trueforge.md):

```bash
export LING_API_KEY="your-studio-key"
LING_REAL_AGENT_TESTS=1 bun run eval:agent:trueforge:suite
```

Without both `LING_REAL_AGENT_TESTS=1` and a non-empty `LING_API_KEY`, the command exits
successfully without contacting Ling or TrueForge. The runner continues after task and
infrastructure failures so every configured coordinate gets a record, then exits nonzero unless
all attempts passed.

Sanitized per-attempt evidence and a compact aggregate are written beneath
`agent-evaluation-runs/trueforge-ling-suite/<timestamp>/`. This directory is gitignored. Review all
artifacts before sharing them because task prompts and model output can still contain
task-specific information.
