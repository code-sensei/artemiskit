# ArtemisKit Examples

This directory contains example configurations, scenarios, and integrations for ArtemisKit.

## Directory Structure

```
examples/
├── scenarios/           # Test scenario examples
│   ├── evaluators/      # Examples for each evaluator type
│   ├── redteam/         # Red-team/adversarial testing scenarios
│   └── use-cases/       # Domain-specific scenario suites
│       ├── customer-support/
│       ├── code-generation/
│       ├── data-extraction/
│       └── rag-agent/
├── configs/             # Configuration file examples
├── integrations/        # CI/CD integration examples
│   ├── github-actions/
│   ├── gitlab-ci/
│   └── jenkins/
├── hooks/               # Pre/post run hook examples
└── adapters/            # Custom adapter examples
```

## Quick Start

1. Copy the relevant example to your project
2. Modify the scenario/config for your use case
3. Run with ArtemisKit CLI

```bash
# Run an evaluator example
bun run artemis run examples/scenarios/evaluators/json-schema.yaml

# Run a use-case suite
bun run artemis run examples/scenarios/use-cases/customer-support/intent-classification.yaml
```

## Scenarios

### Evaluators

Examples demonstrating each evaluator type:
- `exact.yaml` - Exact string matching
- `regex.yaml` - Regular expression patterns
- `contains.yaml` - Keyword presence checking
- `fuzzy.yaml` - Semantic similarity matching
- `json-schema.yaml` - Structured output validation
- `llm-grader.yaml` - AI-powered response grading

### Red-team

Adversarial testing scenarios:
- `prompt-injection.yaml` - Injection attack resistance
- `jailbreak-attempts.yaml` - Safety guardrail testing
- `role-spoofing.yaml` - Authority impersonation tests
- `data-exfiltration.yaml` - Sensitive data leak prevention

### Use Cases

Domain-specific test suites:
- **Customer Support** - Intent, sentiment, escalation
- **Code Generation** - Syntax, security, style
- **Data Extraction** - Schema compliance, edge cases
- **RAG Agent** - Attribution, hallucination, citations

## Configs

Example `artemis.config.yaml` files:
- `basic.yaml` - Minimal configuration
- `multi-provider.yaml` - Multiple provider setup
- `ci-optimized.yaml` - CI/CD optimized settings
- `supabase.yaml` - Supabase storage configuration

## Integrations

CI/CD pipeline examples:
- GitHub Actions workflow
- GitLab CI pipeline
- Jenkins pipeline

## Hooks

Custom hook examples:
- Slack notification on failure
- Custom metrics collection
- Result post-processing
