# Real-agent evaluation examples

These examples evaluate agents by observing their tool use and independently checking the final
workspace, rather than grading only the agent's final message.

| Example | Harness | Environment | Outcome |
|---------|---------|-------------|---------|
| [scenario-repair](./scenario-repair/) | TrueForge with Ling Flash or Tiny | Disposable local Docker workspace | Repair and validate an exact ArtemisKit scenario artifact |

Real API execution is always opt-in. Each example documents its credentials, isolation boundary,
acceptance checks, and gitignored evidence output.
