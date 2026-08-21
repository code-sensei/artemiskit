# Scenario repair agent evaluation

This deterministic task measures whether a tool-using agent can diagnose and repair one invalid
ArtemisKit expectation type without changing unrelated files. It is harness-neutral: an adapter
only needs to copy `fixture/` into a disposable workspace, present `task.yaml` to the agent, and
return normalized ArtemisKit outcome evidence.

## Task contract

- The only writable path is `scenario.yaml`.
- The intended repair is the one-line change shown by `expected/scenario.yaml`.
- The public in-workspace acceptance command is `akit validate scenario.yaml`.
- A failed validation attempted before the repair is recovery evidence, not an automatic task
  failure. The final acceptance result must still pass.

## Adapter flow

1. Copy the contents of `fixture/` into a fresh isolated workspace.
2. Configure only the tools and budgets listed in `task.yaml`.
3. Give the agent the `instructions` value and collect its normalized outcome and trace.
4. Run every `acceptanceCommands` entry after the agent terminates.
5. Call `scoreAgentOutcome(task, outcome, evidence)` from `@artemiskit/core`.

Adapters can additionally call `checkScenarioRepair(workspacePath)` from `acceptance.ts` after
artifact collection. It uses ArtemisKit's authoritative validator and parser; it does not duplicate
the scenario schema.

## Local fixture proof

From the repository root:

```bash
# Exits 1 because `includes` is not a valid expectation type.
bun examples/agent-evaluation/scenario-repair/acceptance.ts \
  examples/agent-evaluation/scenario-repair/fixture

# Exits 0 after the one-line repair to `contains`.
bun examples/agent-evaluation/scenario-repair/acceptance.ts \
  examples/agent-evaluation/scenario-repair/expected

bun test examples/agent-evaluation/scenario-repair/acceptance.test.ts
```

The model API is the only optional network dependency of a real run. Fixture validation and
scoring are local and deterministic.
