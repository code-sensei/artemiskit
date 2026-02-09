---
"@artemiskit/cli": patch
"@artemiskit/core": patch
---

Add baseline command and CI mode for regression detection

### New Features

- **Baseline Command**: New `akit baseline` command with `set`, `list`, `get`, `remove` subcommands
  - Lookup by run ID (default) or scenario name (`--scenario` flag)
  - Store and manage baseline metrics for regression comparison

- **CI Mode**: New `--ci` flag for machine-readable output
  - Outputs environment variable format for easy parsing
  - Auto-detects CI environments (GitHub Actions, GitLab CI, etc.)
  - Suppresses colors and spinners

- **Summary Formats**: New `--summary` flag with `json`, `text`, `security` formats
  - JSON summary for pipeline parsing
  - Security summary for compliance reporting

- **Regression Detection**: New `--baseline` and `--threshold` flags
  - Compare runs against saved baselines
  - Configurable regression threshold (default 5%)
  - Exit code 1 on regression detection
