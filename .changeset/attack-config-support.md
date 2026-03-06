---
"@artemiskit/redteam": minor
"@artemiskit/cli": minor
---

Add attack configuration file support for fine-grained mutation control

- Add `--attack-config <path>` CLI flag to redteam command
- Support YAML-based attack configuration files with Zod validation
- Enable per-mutation configuration (enable/disable, options)
- Support OWASP category overrides with min severity
- Support global defaults (severity, iterations, timeout)
