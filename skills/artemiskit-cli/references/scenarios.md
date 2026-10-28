# Scenario guidance

Use this reference for scenario-based model evaluation, not as the separate agent-workflow contract. The examples reflect the scenario schema in the 0.6.4 release milestone. Check the installed version's `akit validate --help` and the [scenario format guide](https://www.artemiskit.dev/docs/cli/scenarios/format/) for version-specific detail.

```yaml
name: response-check
description: Check a small response against a declared expectation
provider: openai
model: gpt-4o
cases:
  - id: basic-math
    prompt: "What is 2 + 2? Reply with just the number."
    expected:
      type: exact
      value: "4"
  - id: greeting
    prompt: "Say hello in a friendly way."
    expected:
      type: contains
      values: ["hello", "hi"]
      mode: any
```

Each case needs an ID, a `prompt` and an `expected` value. Provider and model can be supplied via scenario or configuration. A `prompt` can be a string or an array of chat messages; do not replace it with a top-level case `messages` field. Include a description to avoid a strict-validation warning.

Common expectations include `exact` (`value`), `contains`/`not_contains` (`values`, with `mode: all` or `any`), `regex` (`pattern`), `fuzzy` (`value`, `threshold`), `json_schema` (`schema`), and `combined` (`operator` and `expectations`). In this release, `contains` and `not_contains` default to `all`. A combined expectation contains base expectations, not nested combined expectations. `llm_grader` uses a `rubric` and `threshold`; model-based judging requires an appropriate configured judge. `similarity`, `inline`, `custom` and `tool_trace` have additional configuration and limitations; check their current implementation and docs before relying on them.

```bash
akit validate scenario.yaml --strict
```

Validation is useful before a model call but does not establish that a provider can execute the case or that an expectation measures the intended real-world outcome. Select and review assertions for the task, and preserve observed evidence, invalid measurements and limitations when reporting.
