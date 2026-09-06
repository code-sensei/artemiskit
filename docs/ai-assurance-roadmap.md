# ArtemisKit AI assurance roadmap

Status: proposed implementation sequence, based on a local source review on 5 September 2026 at `191e2de`.

ArtemisKit should provide reproducible, inspectable evidence that an AI model or system meets a defined use case's capability, security, language, cost, and performance requirements. This roadmap connects the existing open-source toolkit to the AI Assurance offering described in the owner's proposal. It does not establish delivery dates, commercial guarantees, or regulatory certification.

## Product boundary and sources

The owner's AI Assurance proposal defines the business direction: individual assessments, comparative benchmarks, security assessments, continuous assurance, and institutional assurance programmes. Other products in that proposal are outside this roadmap.

ArtemisKit owns local and CI evaluation capabilities, reusable evaluation contracts, adapters, benchmark execution, scoring, and exportable evidence. Loki is developed separately and owns its commercial SaaS experience and operating model. The recent "Loki Main" session and Loki's baseline source review establish that Loki currently inherits concepts and engineering experience; direct ArtemisKit package imports and automatic schema compatibility must not be assumed. A future integration requires an explicit compatibility/import design.

The ArtemisKit source code is authoritative for current implementation. The existing [roadmap](../ROADMAP.md) remains the broader feature inventory; this document proposes assurance priorities without replacing it. The proposal's prices and commercial targets are business assumptions, not engine acceptance criteria. Private proposal material and proprietary benchmark datasets are not included here.

## Current foundation and observed gaps

| Assurance requirement | Existing implementation | Improvement supported by this review |
| --- | --- | --- |
| Assess a defined workflow | YAML scenarios, multiple evaluators, tool traces, CLI and SDK | Add explicit assessment objectives, acceptance criteria, coverage, and limitations |
| Distinguish system failure from invalid measurement | Agent scorer separates task and infrastructure failures; standard cases expose `ok`, score, and optional error | Make evaluation validity explicit across the standard evaluation path and its consumers |
| Explain a grading decision | Evaluators return optional `details` | Standard executor retains pass/score/reason but drops `details`; introduce a bounded, sanitized evidence contract |
| Verify grader output | LLM grader requests JSON, with permissive extraction and numeric coercion fallbacks | Define strict validated grading behavior and an explicit compatibility policy |
| Compare candidate systems | Stored-run deltas and SDK case comparisons | Check workload compatibility and support repeatable experiments with transparent denominators |
| Repeat agent benchmarks | Ling example runs a task/model/repetition matrix | Generalize into supported core/SDK/CLI contracts without depending on Ling-specific model IDs |
| Attribute results | Manifests include configuration, Git provenance, environment, and tokens | Add workload/evaluator identity and documented reproducibility limits |
| Support Nigerian use cases | Custom scenarios, variables, tags, and extensible evaluators | Define reviewed benchmark-pack metadata, language slices, licensing, and provenance |
| Supply customer evidence | HTML/JSON/Markdown/JUnit reports | Surface validity, exclusions, coverage, per-dimension outcomes, and limitations consistently |

Relevant implementation sources:

- [Evaluator contracts](../packages/core/src/evaluators/types.ts) and [LLM grader](../packages/core/src/evaluators/llm-grader.ts)
- [Standard executor](../packages/core/src/runner/executor.ts) and [runner](../packages/core/src/runner/runner.ts)
- [Artifact contracts](../packages/core/src/artifacts/types.ts) and [manifest generation](../packages/core/src/artifacts/manifest.ts)
- [Local comparison](../packages/core/src/storage/local.ts) and [SDK comparison](../packages/sdk/src/artemiskit.ts)
- [Agent scoring](../packages/core/src/agent-evaluation/scorer.ts)
- [Ling benchmark orchestration](../examples/agent-evaluation/ling-benchmark/run-suite.ts)

These are targeted observations, not an exhaustive audit of every package or a claim that all proposed features are absent everywhere.

## Milestone 1 Evaluation integrity

Objective: every reported assessment outcome distinguishes a valid measurement from a measurement that could not be completed.

Define the result contract before changing behavior. Account for target errors, evaluator errors, malformed judge output, unsupported capabilities, and successful evaluations that fail their rubric. Preserve existing manifest readers through an explicit versioning and compatibility policy. Do not silently reinterpret historical results.

Expected scope: core evaluator, executor, and artifact contracts; dependent SDK, CLI, report consumers, tests, and documentation where required. Storage schema changes are not assumed and require separate scoping if needed.

Acceptance criteria:

- Malformed or invalid judge output cannot become a valid passing assessment through numeric coercion or incidental text extraction in the strict assessment path.
- A judge failure remains distinguishable from a target response that was successfully evaluated and failed.
- Summaries disclose total attempts, valid evaluations, invalid evaluations, and the denominator used for each rate. Missing measurements cannot improve an assurance decision silently.
- Necessary evaluator evidence survives execution and serialization under a bounded schema and explicit redaction policy; arbitrary raw `details` are not copied into public artifacts.
- Existing manifest fixtures remain readable under the agreed compatibility policy, and CLI, SDK, JSON, and rendered reports agree on the same results.
- Tests cover invalid and boundary scores, malformed judge responses, provider/judge failures, evidence redaction, mixed result summaries, and historical artifacts.

First implementation slice: settle the evaluation-validity contract and reproduce the current grader parsing and executor evidence-loss cases. This provides a small reviewable foundation before changing reports or adding benchmark breadth.

## Milestone 2 Reproducible evidence

Objective: a reviewer can identify what was tested, how it was judged, and which configuration produced the result.

Add versioned identities or content digests for selected workloads, evaluators/rubrics, and applicable benchmark packs. Record requested and observed model identity where providers expose them, generation settings, repetition/attempt identity, and declared execution constraints. Separate target usage from grading usage; distinguish known prices, user-supplied prices, and unavailable estimates.

Acceptance criteria: exports retain the same experiment identity; changed workload or rubric content changes the appropriate identity; secrets are excluded; fixtures demonstrate that recorded evidence is sufficient to reconstruct the test specification. Re-execution must not be described as guaranteed identical model output. Content digests alone must not be described as trusted signatures.

Dependencies: milestone 1 result/evidence contract.

## Milestone 3 Comparative benchmark execution

Objective: evaluate multiple candidate systems against the same declared workload with repeatable execution and meaningful comparisons.

Promote the useful task/model/repetition pattern from the Ling example into provider-neutral interfaces. Keep scenario evaluation and real-agent task execution distinct behind documented contracts. Support bounded execution, explicit retry accounting, and per-model, per-task, and per-language summaries.

Acceptance criteria: at least two configured adapters can run the same applicable suite; unsupported capabilities are reported explicitly; retries do not masquerade as independent repetitions; incomplete experiments remain visible; comparisons reject or explicitly qualify incompatible workloads/rubrics. Any uncertainty interval must document its method, sample size, and assumptions, including clustering of repeated attempts by task.

Dependencies: milestones 1 and 2. Live paid-provider validation requires a separately bounded run budget.

## Milestone 4 Use case assessment profiles and benchmark packs

Objective: answer whether a system satisfies a specific use case, with inspectable criteria and relevant data.

Define profiles for required capabilities, security checks, languages, latency limits, and cost constraints. Critical failures should remain visible independently of average scores. Define benchmark-pack metadata covering version, owner, source provenance, rights, review status, language coverage, rubric, and intended use.

Acceptance criteria: one reviewed pilot profile produces a dimension-by-dimension decision tied to its evidence; an unmet critical requirement cannot disappear inside an aggregate score; reports show untested requirements. Nigerian-context and language claims require representative, licensed or owner-authorized data and qualified review. Synthetic demonstrations must be labeled and cannot substitute for those datasets. Proprietary content stays separate from the open-source loader and schema.

Dependencies: milestones 2 and 3; owner-selected pilot workflow and authorized data.

## Milestone 5 Assessment reports and continuous release gates

Objective: produce an assessment package that technical reviewers can inspect and CI consumers can enforce consistently.

Extend existing reports and baselines with methodology, workload coverage, measurement validity, exclusions, configuration identity, per-dimension decisions, and limitations. Define baseline compatibility and thresholds for quality, security, latency, and cost where evidence is available.

Acceptance criteria: saved evidence can regenerate the report without model calls; CLI exit codes and SDK decisions agree; a changed workload is not silently treated as regression evidence; missing cost or coverage is explicit. Continuous execution can use existing CI scheduling. SaaS scheduling, tenant policy, approvals, billing, and evidence retention remain Loki responsibilities.

Dependencies: milestones 1 through 4 for a complete use case assessment.

## Milestone 6 Explicit Loki interoperability

Objective: let Loki consume a defined ArtemisKit artifact or execution capability without accidental architectural coupling.

First inventory the relevant Loki IR, evaluation, and evidence contracts in the separate Loki workstream. Choose artifact import, service execution, or package reuse through an explicit compatibility design. Map identity, status, versioning, redaction, error semantics, and provenance. Do not translate toolkit output into signed SaaS evidence without Loki's own verification process.

Acceptance criteria: independently maintained fixtures pass producer/consumer contract checks; unsupported versions and lossy mappings are rejected or explicitly surfaced; no tenant credentials enter local artifacts. This milestone does not authorize changes to the Loki repository.

Dependencies: milestone 2's stable evidence contract and agreement with the Loki workstream. Contract discovery may proceed earlier; implementation must follow that agreement.

## Validation and delivery discipline

For each implementation milestone, record affected contracts and downstream consumers, capture relevant baseline failures, then run focused tests plus applicable type checks, lint, build, and runtime checks. Inspect rendered reports when report behavior changes. Use isolated test data; no production migrations, paid model calls, publishing, or pushes are included in this roadmap step.

The initial read-only baseline used Bun 1.3.10:

```sh
bun test packages/core/src/agent-evaluation/scorer.test.ts packages/core/src/artifacts/manifest.test.ts packages/core/src/runner/executor.test.ts
```

Result: 225 tests passed, zero failed, 809 assertions. This covers those three test files only. Full-repository checks, live providers, Docker execution, Loki interoperability, grader adversarial robustness, and commercial benchmark validity were not verified in this planning step.

The proposed sequence prioritizes trustworthy measurements, then reproducible comparisons, then use-case decisions. More adapters and attack packs can follow demonstrated coverage needs rather than displacing the evidence foundation.
