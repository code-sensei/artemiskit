# ArtemisKit public roadmap

**Last updated:** 7 September 2026
**Status:** Active development
**License:** Apache-2.0

ArtemisKit is an open-source, scenario-based AI assurance test runner. It helps teams and model
providers produce inspectable evidence of how an AI system performs in a defined workflow—not a
single, context-free score.

This roadmap describes public product direction, not delivery dates, legal advice, regulatory
certification, or a guarantee that every listed item will ship in a particular release.

## Product direction

The central question ArtemisKit is being built to answer is:

> Is this AI system fit for this workflow, under these requirements and operating rules?

An assessment should identify both strengths and weaknesses across capability, reliability,
security, tool use, language, latency, cost, and organizational-policy requirements. Its result
must identify the model configuration, scenario or profile, methodology, evidence, exclusions,
and unresolved risks.

Public comparison results will be benchmark-like but scenario-specific. ArtemisKit will not present
a universal “best model” score that hides trade-offs between customer service, logistics, coding,
security, language, or regulated workflows.

## Product principles

| Principle | What it means in ArtemisKit |
| --- | --- |
| Scenario first | Evaluate a named workflow and its requirements, not a generic prompt sample. |
| Evidence before claims | Preserve inspectable, sanitized evidence and expose limitations. |
| Independent verification | Score observed outcomes, tool traces, state changes, and acceptance checks—not an agent's self-report. |
| Validity is visible | Separate valid passes/failures from invalid, unavailable, unsupported, or incomplete measurements. |
| Safe by default | Use bounded tools, declared permissions, fixtures, and disposable environments. |
| Comparable only when compatible | Do not compare runs that use incompatible workloads, policies, or rubrics without qualification. |
| Context over a flat rank | Show results by scenario, profile, language, policy, and operational dimension. |
| Human judgment where needed | Technical evidence can support governance work; it does not replace legal, privacy, security, or domain review. |

## Released foundation

The 0.1–0.3 release line established the current toolkit foundation. Detailed historical changes
remain in [CHANGELOG.md](CHANGELOG.md).

| Area | Available foundation |
| --- | --- |
| Scenario evaluation | YAML scenarios, multi-turn cases, variables, tags, combined expectations, and SDK builders. |
| Evaluators | Exact, contains, regex, fuzzy, JSON schema, similarity, LLM grading, tool traces, and custom evaluators. |
| Security | Red teaming, OWASP-oriented mutations, Guardian runtime protections, and policy-oriented controls. |
| Operations | Stress testing, latency/token metrics, local and Supabase storage, baselines, comparisons, CLI, SDK, and reports. |
| Providers and agents | Provider adapters, safe fixture tool loops, and bounded real-agent evaluation with Docker/MCP tooling. |
| Reproducibility foundations | Git/environment/configuration provenance, redaction controls, and local run artifacts. |

## Release plan

Release numbers below organize the assurance work into independently reviewable public increments.
They are targets, not committed dates. A release moves only when its contract, documentation, and
verification checklist are complete.

| Target release | Theme | Primary outcome | Depends on |
| --- | --- | --- | --- |
| 0.4 | Evaluation integrity | Every case distinguishes a valid outcome from an invalid or unavailable measurement. | Existing foundation |
| 0.5 | Reproducible evidence | A reviewer can identify what was tested, how, and with which configuration. | 0.4 |
| 0.6 | Native agent harness | Real tool-using agents run in declared, controlled environments with independent outcome checks. | 0.4, 0.5 |
| 0.7 | Comparative execution | Compatible scenario and agent workloads can run across providers/models with transparent repetition. | 0.4–0.6 |
| 0.8 | Assessment profiles and control packs | Customer workflows, organizational rules, and reviewed scenario/control packs become first-class. | 0.5–0.7 |
| 0.9 | Reports, leaderboard, and release gates | Decision-ready reports and scenario-specific public results use the same evidence contract. | 0.4–0.8 |
| 1.0 | Stable assurance contracts | Public stability commitment for the core evidence, profile, and execution contracts. | 0.4–0.9 |

## 0.4 — Evaluation integrity

**Status:** Release candidate
**Goal:** prevent invalid or incomplete measurements from looking like ordinary failed cases or
improving reported rates.

### Scope

Introduce an explicit, versioned result-status contract across evaluator, executor, artifact, CLI,
SDK, and report paths. Harden the strict assurance path for LLM judge output, retain bounded
evaluator evidence, and document a compatibility mapping for historical artifacts.

### Release checklist

| Work item | Status |
| --- | --- |
| Case status distinguishes valid `passed`/`failed` from invalid or execution-error measurements | ✅ |
| Strict LLM judge mode rejects malformed JSON, coercion, and invalid boundary scores | ✅ |
| Evaluator failures remain distinct from a valid target response that fails a rubric | ✅ |
| Sanitized, bounded evaluator evidence reaches artifacts without raw judge output or arbitrary details | ✅ |
| Run metrics disclose attempts, valid/invalid counts, and the success-rate denominator | ✅ |
| Historical manifests remain readable under a documented legacy mapping | ✅ |
| CLI, SDK, JSON, HTML, Markdown, and JUnit consumers agree on status and metrics | ✅ |
| Focused unit tests, typecheck, lint, and report rendering verification pass | ✅ |
| Fixture-backed release validation covers RV-01 through RV-10 in [RELEASE_VALIDATION.md](RELEASE_VALIDATION.md) | ✅ |

## 0.5 — Reproducible evidence and workload identity

**Status:** Planned
**Goal:** let a reviewer understand precisely what was tested, how it was judged, and what
execution configuration produced the result.

### Scope

Add versioned identities or content digests for scenarios, rubrics, profiles, and reviewed packs.
Record requested and observed model identity where available, generation settings, target versus
grader usage, repetition identity, execution constraints, and explicit price-data provenance.

### Release checklist

| Work item | Status |
| --- | --- |
| Versioned workload, rubric, and profile identities | 📋 |
| Requested and observed provider/model configuration evidence | 📋 |
| Attempt, retry, and independent-repetition identities | 📋 |
| Target and grader usage separated in artifacts | 📋 |
| Cost evidence identifies known, user-supplied, or unavailable pricing | 📋 |
| Secrets excluded from artifact and digest inputs | 📋 |
| Compatibility checks reject or qualify changed workloads and rubrics | 📋 |
| Re-execution limits documented; digests are not presented as signatures | 📋 |

## 0.6 — Native agent harness and controlled workflow execution

**Status:** Planned
**Goal:** run real tool-using agents inside declared, reproducible environments and independently
verify what they did.

The existing Ling/TrueForge work is a valuable reference implementation. This release promotes
the underlying pattern into a provider-neutral public harness contract rather than making a
particular provider, model ID, or agent framework the contract.

### Scope

Scenarios should declare the agent target, multi-turn state, system instructions, fixtures,
permitted tools, schemas, policy rules, budgets, controlled fault conditions, required final state,
and independent acceptance checks. Fixture-backed execution remains the safe default; live or
customer-system integration requires explicit authorization and bounded credentials.

### Release checklist

| Work item | Status |
| --- | --- |
| Provider-neutral agent-execution interface supports at least two configured targets | 📋 |
| Scenario contract declares tools, permissions, schemas, time/step/token budgets, and side-effect boundaries | 📋 |
| Undeclared tool authority fails closed | 📋 |
| Fresh disposable environments support multi-turn workflows | 📋 |
| Controlled faults cover unavailable tools, incomplete data, conflicting instructions, and bounded retries | 📋 |
| Independent checks verify artifacts, state changes, traces, and acceptance conditions | 📋 |
| Task failure, policy violation, infrastructure error, unsupported capability, and invalid measurement remain distinct | 📋 |
| Sanitized trace, policy, state, and recovery evidence is retained under bounded schemas | 📋 |
| No default execution path discovers tools or performs live side effects | 📋 |

## 0.7 — Comparative benchmark execution

**Status:** Planned
**Goal:** run compatible workloads across models and providers with transparent repetition and
meaningful comparisons.

### Scope

Generalize the useful task/model/repetition pattern from the Ling benchmark suite. Keep one-shot
scenario evaluation and native-agent workflow execution distinct, while giving both compatible
experiment identities and comparison rules.

### Release checklist

| Work item | Status |
| --- | --- |
| Same declared workload can run against at least two configured adapters | 📋 |
| Unsupported capabilities are explicit rather than silently skipped | 📋 |
| Retries never masquerade as independent repetitions | 📋 |
| Incomplete experiments remain visible in aggregates | 📋 |
| Compatibility checks cover workloads, rubrics, policies, and profiles | 📋 |
| Per-model, task, policy, language, and operational summaries | 📋 |
| Any uncertainty method documents sample size and assumptions | 📋 |
| Live paid-provider evaluation has an explicit run budget and approval gate | 📋 |

## 0.8 — Assessment profiles, policy controls, and reviewed packs

**Status:** Planned
**Goal:** answer whether a system meets the requirements of a real customer workflow.

### Scope

Define reusable profiles for capabilities, security, language, latency, cost, organizational rules,
approval limits, and escalation. Add reviewed scenario packs and policy/control packs with clear
ownership, provenance, rights, coverage, intended use, and prohibited claims.

This work can map testable technical controls to customer-selected privacy, AI-governance, and
risk-management frameworks. ArtemisKit reports technical evidence and coverage; it does not
certify compliance or replace legal, privacy, security, or domain review.

### Release checklist

| Work item | Status |
| --- | --- |
| Profile contract for requirements, thresholds, critical failures, and human-review needs | 📋 |
| Policy controls for approved sources, data handling, escalation, approval, tool authority, and recovery | 📋 |
| Reviewed pack metadata: owner, version, source, rights, language coverage, rubric, intended use | 📋 |
| Framework-mapping metadata with explicit technical-evidence and human-review boundaries | 📋 |
| Pilot profile for a policy-bound customer-service or logistics workflow | 📋 |
| Critical failure cannot disappear into an average score | 📋 |
| Representative and authorized regional/language data requirements documented | 📋 |
| Proprietary customer content remains separate from public pack schemas and examples | 📋 |

## 0.9 — Assessment reports, leaderboard, and continuous gates

**Status:** Planned
**Goal:** turn saved evidence into reports, CI decisions, and public scenario-specific discovery.

### Scope

Extend reports and baselines with methodology, coverage, validity, exclusions, model and workload
identity, per-dimension outcomes, control status, and limitations. Publish a public leaderboard
format that exposes compatible results by scenario and profile rather than assigning a universal
model rank.

### Release checklist

| Work item | Status |
| --- | --- |
| Reports regenerate from saved evidence without model calls | 📋 |
| CLI, SDK, JSON, HTML, Markdown, and JUnit agree on decisions and measurement status | 📋 |
| Baseline/regression checks qualify changed workloads and profiles | 📋 |
| Missing cost, coverage, or control evidence is visible | 📋 |
| Leaderboard entry identifies model/configuration, pack/profile, method, sample size, and limitations | 📋 |
| Leaderboard exposes valid-outcome denominator and invalid/unavailable measurements | 📋 |
| Filters support scenario, workflow, language, capability, policy outcome, and model where data exists | 📋 |
| CI release gates can enforce approved profile thresholds | 📋 |

## 1.0 — Stable assurance contracts

**Status:** Future
**Goal:** make the core public contracts dependable for contributors, assessment users, and
downstream tooling.

### Release checklist

| Work item | Status |
| --- | --- |
| Stable versioning policy for core result, evidence, profile, and harness contracts | 📋 |
| Migration guides and compatibility fixtures for supported manifest versions | 📋 |
| Public reference documentation and examples for scenario, agent, profile, and control contracts | 📋 |
| Full test, typecheck, lint, build, and documentation-release gates | 📋 |
| Published security, disclosure, redaction, and artifact-retention guidance | 📋 |
| Community contribution path for provider adapters and reviewed public packs | 📋 |

## Later considerations

These items are valuable but do not displace the evidence foundation above:

| Area | Direction |
| --- | --- |
| More providers and frameworks | Add adapters in response to demonstrated workflow coverage needs. |
| More attack and security packs | Expand through reviewed, versioned scenario and control packs. |
| Additional SDKs | Consider Python and other ecosystems once shared contracts are stable. |
| IDE and developer experience | Improve authoring, validation, local visualization, and CI ergonomics. |
| Loki interoperability | Design a separate, explicit compatibility contract only after ArtemisKit evidence contracts stabilize. |

## How to contribute

We welcome contributions to the public toolkit: evaluator improvements, provider adapters,
scenario examples, report improvements, documentation, and tests. See [CONTRIBUTING.md](CONTRIBUTING.md)
and the project's GitHub issues and discussions.

Customer-specific scenarios, private evaluation evidence, credentials, and proprietary datasets do
not belong in public contributions.
