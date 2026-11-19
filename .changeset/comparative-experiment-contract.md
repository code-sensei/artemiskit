---
"@artemiskit/core": minor
---

Add the comparative experiment contract for the 0.7.0 milestone. `parseExperimentManifest` accepts a strict V1 manifest; `runExperiment` expands a deterministic task × target × repetition matrix and runs it through a caller-supplied attempt executor, keeping retries inside the original coordinate. Capability gaps, exclusions, invalid measurements, infrastructure failures and incomplete work stay visible and outside valid-outcome rates. Live runs require an explicit authorization with request, token and cost budgets; results record the authorization, budget consumption, stop reason and runtime exclusions, and summaries carry `uncertainty.method: none`. `assessExperimentCompatibility()` is exported but no comparison calls it yet.

A manifest may declare concurrency from 1 to 8 (1 is serial and unchanged). A live run above 1 needs an approval naming that level (`approved_concurrency`). Attempts are admitted against declared per-attempt reservations; with a budget sufficient for a serial run, concurrency never loses work. Cost is accounted in micro-units, and any positive cost is charged at least one. An under-declared demand can let a concurrent run overrun a budget by about one attempt's use per slot; every overrun halts as `budget_exceeded`, and attempts that settle afterwards are labelled `halted_in_flight`. Results record the declared level, per-pair reservations and the peak in flight.

Targets may declare publisher, weights availability and deployment (`locality`, `runtime`, `cost_basis`). A `cost_basis: not_applicable` local target needs token usage but no cost, and any cost it reports is rejected. `isLoopbackEndpoint()` accepts only http(s) endpoints on localhost, 127.0.0.0/8 or [::1].
