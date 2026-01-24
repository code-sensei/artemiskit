---
"@artemiskit/cli": minor
"@artemiskit/core": minor
"@artemiskit/redteam": minor
---

## v0.2.0 - Enhanced Evaluation Features

### CLI (`@artemiskit/cli`)

#### New Features
- **Multi-turn mutations**: Added `--mutations multi_turn` flag for red team testing with 4 built-in strategies:
  - `gradual_escalation`: Gradually intensifies requests over conversation turns
  - `context_switching`: Shifts topics to lower defenses before attack
  - `persona_building`: Establishes trust through roleplay
  - `distraction`: Uses side discussions to slip in harmful requests
- **Custom multi-turn conversations**: Support for array prompts in red team scenarios (consistent with `run` command format). The last user message becomes the attack target, preceding messages form conversation context.
- **Custom attacks**: Added `--custom-attacks` flag to load custom attack patterns from YAML files with template variables and variations.
- **Encoding mutations**: Added `--mutations encoding` for obfuscation attacks (base64, ROT13, hex, unicode).
- **Directory scanning**: Run all scenarios in a directory with `akit run scenarios/`
- **Glob pattern matching**: Use patterns like `akit run scenarios/**/*.yaml`
- **Parallel execution**: Added `--parallel` flag for concurrent scenario execution
- **Scenario tags**: Filter scenarios with `--tags` flag

### Core (`@artemiskit/core`)

#### New Features
- **Combined matchers**: New `type: combined` expectation with `operator: and|or` for complex assertion logic
- **`not_contains` expectation**: Negative containment check to ensure responses don't include specific text
- **p90 latency metric**: Added p90 percentile to stress test latency metrics
- **Token usage tracking**: Monitor token consumption per request in stress tests
- **Cost estimation**: Estimate API costs with model pricing data

### Red Team (`@artemiskit/redteam`)

#### New Features
- **MultiTurnMutation class**: Full implementation with strategy support and custom conversation prefixes
- **Custom attack loader**: Parse and load custom attack patterns from YAML
- **Encoding mutation**: Obfuscate attack payloads using various encoding schemes
- **CVSS-like severity scoring**: Detailed attack severity scoring with:
  - `CvssScore` interface with attack vector, complexity, impact metrics
  - `CvssCalculator` class for score calculation and aggregation
  - Predefined scores for all mutations and detection categories
  - Human-readable score descriptions and vector strings

### Documentation
- Updated all CLI command documentation
- Added comprehensive examples for custom multi-turn scenarios
- Documented combined matchers and `not_contains` expectations
- Added mutation strategy reference tables
