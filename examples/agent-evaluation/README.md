# Real-agent evaluation examples

These examples evaluate agents by observing their tool use and independently checking the final
workspace, rather than grading only the agent's final message.

| Example | Harness | Environment | Outcome |
|---------|---------|-------------|---------|
| [scenario-repair](./scenario-repair/) | TrueForge with Ling Flash or Tiny | Disposable local Docker workspace | Repair and validate an exact ArtemisKit scenario artifact |
| [ling-benchmark](./ling-benchmark/) | TrueForge with a fixed Ling model matrix | Fresh disposable Docker workspace per attempt | Run five deterministic tasks three times per selected model and aggregate all 24 verdicts |

Real API execution is always opt-in. Each example documents its credentials, isolation boundary,
acceptance checks, and gitignored evidence output.
