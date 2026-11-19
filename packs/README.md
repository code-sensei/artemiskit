# ArtemisKit benchmark packs

Draft, unreviewed workload packs for comparative experiments (`akit experiment`). Each pack models a
consequential real-world decision workflow with synthetic case data, a versioned rulebook in every
task, and deterministic scoring. Results produced with a pack are not claims until a qualified
reviewer for that domain signs off in the pack's README.

| Pack | Workflow | Tasks | Cases | Language | Design |
| --- | --- | --- | --- | --- | --- |
| [aml-transaction-review](aml-transaction-review/README.md) | First-line AML alert review: clear, request information, escalate to the MLRO, prepare a suspicious transaction report | 50 | 177 | en | [spec](../docs/superpowers/specs/2026-11-19-aml-transaction-review-pack-design.md) |
| [soc-alert-triage](soc-alert-triage/README.md) | SOC alert triage: classify, map to MITRE ATT&CK, read-only evidence steps, approval-gated containment | 52 | 207 | en | [spec](../docs/superpowers/specs/2026-11-19-soc-alert-triage-pack-design.md) |
| [ng-egov-services](ng-egov-services/README.md) | Nigerian public-service decisions under published and synthetic rules, with data-protection handling | 52 | 183 | en-NG | [spec](../docs/superpowers/specs/2026-11-19-ng-egov-services-pack-design.md) |

## What a result means

A pack measures how a configured model handles one declared workflow under one rulebook. It does not
rank models in general, certify compliance, or give legal or regulatory advice. Reports show valid,
invalid, incomplete and unsupported outcomes separately; a response cut off at its token limit is an
invalid measurement, not a wrong answer.

Benchmark runs in this repository use open-weight models run locally through Ollama's
OpenAI-compatible endpoint. That is a compatibility path, not native Ollama support, and local runs
report no cost.

## Working with packs

```bash
# Check a pack's tasks, digests and identities (no model calls)
bun test packs/<pack-id>
bun packages/cli/bin/artemis.ts experiment validate packs/<pack-id>/experiment.yaml

# After editing a task file or RUBRIC.md, regenerate the manifest digests
bun packs/_tools/generate-experiment.ts packs/<pack-id> --language <lang> --policy <policy-id>
```

Shared checks live in [`_tools/pack-contract.ts`](_tools/pack-contract.ts): every pack must declare
exactly its task files with matching SHA-256 digests, recompute its workload and rubric identities,
use only deterministic evaluators, and prove that each case accepts its reference answer and rejects
every wrong decision.
