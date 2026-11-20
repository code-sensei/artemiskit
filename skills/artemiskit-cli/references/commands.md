# CLI command guidance

These examples are based on the CLI included with the 0.6.4 milestone (CLI package 0.6.3). Use `akit --version` and `akit <command> --help` for the installed version. Only run provider-backed, adversarial or load tests against an authorized target with an agreed scope and budget.

## Validate and run

```bash
akit validate scenario.yaml --strict
akit validate scenarios/ --export junit --export-output ./validation-results
akit run scenario.yaml
akit run scenarios/ --ci --export junit --export-output ./test-results
```

Validation does not run the model. Run saves to configured storage by default in CLI 0.6.3; `--export` produces a separate Markdown or JUnit export. The run exits nonzero for failed scenarios, detected regressions, exceeded budgets or execution errors. Do not assume every error has a distinct exit code or that a report exists after an early failure.

## Red-team and stress

```bash
akit redteam scenario.yaml --mutations typo role-spoof encoding --save
akit redteam scenario.yaml --owasp LLM01 LLM05 --export junit --export-output ./security-results
akit stress scenario.yaml --requests 100 --concurrency 10 --save
```

Agree on the scenario, target, request volume and cost in advance. `--owasp-full` runs applicable mappings and is not a compliance certification. Metrics, errors and pricing depend on the adapter and evidence available. In particular, a local-compatible endpoint's estimated cost is not evidence of real spend.

## Retrieve and compare

```bash
akit history --limit 20
akit report <run-id> --format html --output ./reports
akit baseline set <run-id>
akit compare <baseline-id> <current-id> --threshold 0.10 --html comparison.html
```

Use run IDs returned by the actual storage and confirm both runs are compatible before drawing conclusions. Do not assume filenames like `run_manifest.json`. Local storage defaults to `./artemis-runs` unless overridden; `akit report` defaults to `./artemis-output`, and run exports default to `./artemis-exports`. Keep prompts, responses and other potentially sensitive artifacts within the intended access and retention boundary.

`akit init` creates configuration and may write environment-template files; inspect the destination and options before running. `--force` can overwrite existing configuration. Run `akit init --help` and choose the least intrusive mode.

For agent workflow authoring, execution, recovery and offline assessments, see [agent workflow guidance](workflows.md) and `akit workflow --help`. Keep execution, policy status, verified outcomes and unavailable measures distinct.
