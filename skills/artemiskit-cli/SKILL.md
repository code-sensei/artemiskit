---
name: artemiskit-cli
description: Use the ArtemisKit CLI to create or validate scenarios, run model evaluations or authorized red-team and stress tests, inspect evidence, and generate or compare reports.
---

# ArtemisKit CLI

Use this skill when working with the ArtemisKit command-line toolkit. Start from the user's intended test, target and permissions; a generated scenario or CLI invocation does not authorize testing a system or sending its data to a model provider. Provider calls can incur charges, and stress or adversarial runs can affect the target.

## Establish the environment

- Check `bun --version` and `akit --version`. The CLI executable requires Bun on PATH even when installed with npm. Release milestone 0.6.4 qualified CLI 0.6.3 with Bun 1.3.10; the milestone and package versions need not match. Check the installed version and its `akit <command> --help` before relying on flags or behavior from another version.
- Install the CLI only if appropriate for the task: `bun add -g @artemiskit/cli` or `npm install -g @artemiskit/cli`. Installation and live provider calls have their own authorization boundaries. Verify provider/model access and use environment variables or local secret management; never print, commit or request users' secrets.
- In the qualified 0.6.3 CLI, `openai`, `azure-openai`, `ling`, and `vercel-ai` adapters are registered. Direct `anthropic` and native `ollama` adapters are marked unavailable. An OpenAI-compatible endpoint can be configured through the `openai` adapter, subject to endpoint compatibility; it is not a native Ollama provider. LangChain and DeepAgents require runtime instances and are not ordinary standalone provider configuration. See [provider configuration](references/providers.md).

## Start with a small reproducible scenario

Create a scenario for the user's actual requirements. This example illustrates a text check; its result is not a general measure of correctness.

```yaml
name: hello-world
description: Check one simple response
provider: openai
model: gpt-4o
cases:
  - id: math-test
    prompt: "What is 2 + 2?"
    expected:
      type: contains
      values: ["4"]
```

```bash
akit validate hello-world.yaml --strict
akit run hello-world.yaml --ci --export junit --export-output ./test-results
```

Validation checks the scenario without a model call; strict mode also treats warnings as errors. The run requires a configured provider, credentials when applicable, and access to the named model. The model name is an example, not a promise of availability. Inspect errors, input scope and evidence before interpreting the result. A passing text check means only that this response met this expectation in this run.

For syntax, supported expectations and examples, read [scenario guidance](references/scenarios.md). For command choices and output locations, read [command guidance](references/commands.md).

## Choose the operation

- `akit run`: evaluate declared cases; `--ci` supports automation and `--export junit` writes an export when the run reaches that stage.
- `akit redteam`: exercise declared adversarial cases and selected mutations against an authorized target. OWASP mappings are scoped technical checks, not compliance or certification.
- `akit stress`: measure behavior under the explicitly authorized request volume, concurrency and duration. Do not describe cost estimates from a local OpenAI-compatible endpoint as actual local spend without a supported pricing basis.
- `akit history`, `akit report` and `akit compare`: inspect stored runs, generate reports and compare compatible runs. A comparison is meaningful only when scope, configuration and evidence are comparable.
- `akit workflow`: for supported agent-workflow versions, use `--help` and the [workflow documentation](https://www.artemiskit.dev/docs/workflows/contract/) for controlled execution, independent outcomes, recovery and offline reporting. Execution completion is not proof of task success.

Local run manifests use the configured storage adapter, which defaults to `./artemis-runs` when no other storage is configured; paths and filenames are determined by the adapter and project. `akit report` writes generated reports to `./artemis-output` by default, and `--export-output` controls separate run exports. Check actual output instead of assuming a fixed manifest filename.

When reporting, retain the scenario, version, target/model, configuration and evidence. Separate valid failures from invalid, unavailable and unsupported measurements; do not invent outcomes, silently count missing evidence as passing, or present a bounded test as certification.
