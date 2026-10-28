# Agent workflow guidance

These capabilities are published in milestone 0.6.4 and CLI package 0.6.3. Check the installed CLI and its help before use. Later 0.7 work may be present on a development branch; do not describe it as published solely because it appears in source.

## Author and preflight

`akit init agent-workflow` creates a validated workflow YAML without executing it. It can be interactive or accept explicit options; inspect `akit init agent-workflow --help`. Pick a new output path and review its tools, target, prompt, policy, budgets and outcomes before running. `--force` overwrites an existing output and should be used only when authorized. A generated example is not evidence that a task was tested.

Use `akit tools list` and `akit tools describe <id>` to inspect the simulated tool catalog, and `akit scenario validate <workflow.yaml>` to validate without executing the workflow. Validation does not establish provider access or perform preflight.

`akit workflow preflight <workflow.yaml> --config <config.yaml> --output <new-record.json>` probes structured tool support without executing workflow turns. It can still call the target provider and consume resources. Preflight success is not a verified task pass. The workflow's declared capabilities and the host's trusted transport configuration are separate; configure an authorized provider and model before preflight or execution.

## Run, inspect and recover

`akit workflow run <workflow.yaml> --config <config.yaml> --output <new-record.json>` runs the declared workflow. Confirm the intended target, authorization, environment, permissions, side-effect rules and limits first. A normal saved record is metadata-oriented evidence; `--state-output` is a separate explicit sensitive final-state export. Output files must not already exist. Use `akit workflow run --help` for supported flags.

`--checkpoint-dir` explicitly enables private recovery state; it may contain conversation content, tool arguments and results, state and file contents. Keep it out of shared artifacts and version control, and apply appropriate access and retention controls. A paused run can be continued with `akit workflow resume <workflow.yaml> --config <config.yaml> --checkpoint-dir <private-directory> --output <new-record.json>`. Resume requires a compatible workflow, transport and original authority and budgets; it does not start a new independent trial or reset limits. Interrupted or ambiguous operations can be refused rather than replayed. Pause exit code 10 is not a verified pass. See the [recovery guide](https://www.artemiskit.dev/docs/workflows/recovery/).

Read the actual record: execution, policy, task verification, assertion coverage, usage and cleanup are distinct. A completed conversation is not necessarily a verified task outcome; invalid, unavailable or unsupported evidence is not a pass. Do not claim exactly-once behavior for external systems or infer missing evidence.

## Generate an offline assessment

```bash
akit workflow report evidence.json --output assessment.html
akit workflow report evidence.json --view executive --format markdown --output executive.md
```

This command reads saved V1, V2 or V3 workflow records and generates technical, executive or comprehensive HTML/Markdown without a provider call. Inputs must be regular files (not symlinks), up to 50 records, 1 MiB per input and 8 MiB total; output must be a new file. Reports are derived from retained evidence, not a fresh test or model ranking. Exit 0 means the report was generated, even if it describes a failed task. Use `akit report` for legacy scenario-run reports instead. See the [workflow report guide](https://www.artemiskit.dev/docs/workflows/reports/).
