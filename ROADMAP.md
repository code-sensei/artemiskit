# ArtemisKit public roadmap

**Last updated:** 10 September 2026
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
| 0.4 | Evaluation integrity | Every case distinguishes a valid outcome from an invalid or unavailable measurement. | Released in 0.4.0; remaining hardening is implemented locally and pending a user-facing release decision. |
| 0.5.x | Reproducible evidence | A reviewer can identify what was tested, how, and with which configuration. | 0.4 |
| 0.6.x | Native agent harness | Real tool-using agents run in declared, controlled environments with independent outcome checks. | 0.4, 0.5 |
| 0.7.x | Comparative execution | Compatible scenario and agent workloads can run across providers/models with transparent repetition. | 0.4–0.6 |
| 0.8.x | Assessment profiles and control packs | Customer workflows, organizational rules, and reviewed scenario/control packs become first-class. | 0.5–0.7 |
| 0.9.x | Reports, leaderboard, and release gates | Decision-ready reports and scenario-specific public results use the same evidence contract. | 0.4–0.8 |
| 1.0.x | Stable assurance contracts | Public stability commitment for the core evidence, profile, and execution contracts. | 0.4–0.9 |

## Planned capability increments

The following is the working release sequence. Each version is a user-facing capability increment,
not a claim about ArtemisKit's overall product maturity, certification, or completeness. Later
increments can be re-ordered when evidence from real assessment work identifies a safer dependency.

| Target | Capability increment | Primary deliverable |
| --- | --- | --- |
| 0.5.0 | Workload identity | Versioned/content-derived identities for scenarios, rubrics, profiles, packs, and fixtures. |
| 0.5.1 | Execution provenance | Requested/observed model identity, generation settings, adapter/runner version, and target-versus-grader evidence. |
| 0.5.2 | Attempt and cost evidence | Retry/repetition identity plus explicit known, user-supplied, or unavailable cost provenance. |
| 0.5.3 | Reproducibility eligibility | Compatibility checks for changed workloads, rubrics, and execution configuration; profiles and policy controls follow their dedicated contracts. |
| 0.6.0 | Agent-harness contract | Provider-neutral agent target interface and declarative scenario controls. |
| 0.6.1 | Controlled environments | Disposable multi-turn environments, declared tools/permissions, budgets, and fail-closed authority. |
| 0.6.2 | Observable outcome scoring | Independent checks for artifacts, state changes, traces, and acceptance conditions. |
| 0.6.3 | Fault and recovery evidence | Controlled faults, bounded retries, and sanitized policy/state/recovery evidence. |
| 0.7.0 | Comparative experiment contract | Provider-neutral workload/model/repetition orchestration for scenario and agent runs. |
| 0.7.1 | Comparison eligibility | Explicit unsupported/incomplete work and compatibility qualification before any comparison. |
| 0.7.2 | Scenario-specific aggregates | Per-model, task, policy, language, and operational summaries with documented uncertainty assumptions. |
| 0.7.3 | Live-run controls | Explicit approval, concurrency, and paid-provider cost budgets for comparative execution. |
| 0.8.0 | Assessment profile contract | Executable requirements, thresholds, critical failures, and human-review requirements. |
| 0.8.1 | Reviewed workflow packs | Versioned customer-service, logistics, and other regulated-sector scenario packs with ownership and coverage metadata. |
| 0.8.2 | Organizational policy controls | Approved-source, data-handling, escalation, approval, tool-authority, and recovery controls. |
| 0.8.3 | Framework mapping evidence | Technical-control mappings for selected frameworks, with explicit legal/privacy/domain-review limits. |
| 0.9.0 | Evidence-based assessment reports | Regenerable reports with methodology, coverage, validity, exclusions, dimensions, and limitations. |
| 0.9.1 | Continuous assurance gates | Profile-aware baselines, regression checks, critical-failure rules, and CI decisions. |
| 0.9.2 | Leaderboard publication contract | Public-entry schema for compatible, scenario-specific results, sample size, method, and limits. |
| 0.9.3 | Scenario-first leaderboard surfaces | Filters and presentation by workflow, sector, language, policy outcome, capability, and model configuration. |
| 1.0.0 | Stable assurance-contract baseline | Stable contracts, compatibility fixtures, migration guidance, public reference documentation, and contribution rules. |

### 0.5.x — Reproducible evidence

#### 0.5.0 — Workload and rubric identity

- Define a versioned identity envelope for scenarios, evaluator/rubric settings, fixtures,
  profiles, policy controls, and reviewed packs.
- Derive stable content digests from canonical inputs while excluding credentials, personal data,
  raw prompts/responses, timestamps, and other volatile fields.
- Persist identities in standard run artifacts and expose them through the CLI and SDK.
- Exit only when a reviewer can tell whether two runs used the same declared workload and rubric.

#### 0.5.1 — Target and execution provenance

- Record requested provider/model configuration and observed model identity when a provider returns it.
- Record generation settings, adapter version, runner version, environment constraints, tool policy,
  and fixture version in bounded schemas.
- Separate target-model evidence from evaluator/judge-model evidence, including usage where available.
- Exit only when a report can distinguish a target result from the configuration and judge that produced it.

#### 0.5.2 — Attempt, repetition, and cost evidence

- Add durable identifiers for run, case attempt, retry chain, and independent repetition.
- Make retry policy, timeout behavior, and excluded attempts inspectable without treating retries as
  independent samples.
- Record cost inputs with source, currency, timestamp, and a clear `known`, `user-supplied`, or
  `unavailable` state.
- Exit only when aggregate rates and costs cannot silently mix retries, repetitions, or guessed pricing.

#### 0.5.3 — Re-execution and comparison eligibility

- Define compatibility decisions for changed workloads, rubrics, profiles, policies, language,
  target configuration, and execution mode.
- Refuse or visibly qualify invalid baseline/comparison requests rather than calculating a bare delta.
- Document reproducibility limits: a digest proves matching declared inputs, not provider behavior,
  and does not constitute a signature or certification.
- Exit only when the toolkit can explain why two runs are comparable, qualified, or incomparable.

### 0.6.x — Native agent harness

#### 0.6.0 — Provider-neutral agent contract

- Define a public agent-target interface that can adapt at least two supported agent/model targets.
- Add scenario fields for initial state, system instructions, multi-turn inputs, required final state,
  permitted tools, and expected observable outputs.
- Preserve the distinction between simple scenario evaluation and agent-workflow evaluation while
  allowing both to share core evidence contracts.
- Exit only when a provider-specific benchmark can be expressed without making that provider the harness contract.

#### 0.6.1 — Controlled execution environments

- Declare tool schemas, filesystem/network/container/MCP authority, side-effect policy, and
  time/step/token/cost budgets in each agent scenario.
- Provide fresh disposable fixture-backed environments as the default execution mode.
- Fail closed for undeclared tools, paths, commands, network access, or authority escalation.
- Exit only when a multi-turn workflow can run repeatedly without discovering tools or touching a live system by default.

#### 0.6.2 — Independent outcome verification

- Add independent assertions for produced artifacts, validated schemas, simulated state transitions,
  tool traces, policy decisions, and required final state.
- Ensure an agent's self-report is never accepted as sole evidence that work was completed.
- Classify task failure, policy violation, target/execution error, unsupported capability, and invalid
  evaluation separately.
- Exit only when success is demonstrated by observable outcomes rather than generated prose.

#### 0.6.3 — Fault, recovery, and bounded agent evidence

- Support declared fault injections: unavailable tools, stale/incomplete data, malformed results,
  timeouts, conflicting instructions, and bounded retries.
- Retain bounded, redacted trace, policy, state, and recovery evidence suitable for review.
- Add fixture cases for safe recovery and for failure when recovery would exceed declared authority.
- Exit only when an assessment can show both how an agent performs normally and how it fails or recovers under controlled faults.

### 0.7.x — Comparative execution

#### 0.7.0 — Comparative experiment contract

- Generalize task/model/repetition orchestration into a provider-neutral experiment definition.
- Support compatible one-shot scenario workloads and multi-turn agent workloads without conflating them.
- Declare targets, workload identities, repetition count, retry policy, concurrency, seed where
  applicable, execution budget, and exclusions before a run begins.
- Exit only when the same declared experiment can execute against at least two configured targets.

#### 0.7.1 — Eligibility and completeness controls

- Mark unsupported capabilities and deliberately unavailable measurements explicitly rather than skipping them.
- Preserve incomplete experiments, cancelled coordinates, target errors, and invalid evaluations in aggregates.
- Apply 0.5.3 compatibility decisions before computing comparisons or baselines.
- Exit only when a comparison cannot become more favorable by omitting hard, failed, or unavailable work.

#### 0.7.2 — Scenario-specific aggregation

- Produce summaries by model/configuration, workflow, task, language/region, policy/control,
  capability, latency, and cost dimension where evidence exists.
- Separate valid-outcome rates from invalid/error/unavailable counts and show sample sizes.
- Add uncertainty/confidence methods only with documented assumptions, minimum sample requirements,
  and explicit non-applicability rules.
- Exit only when no default aggregate presents a universal, context-free model rank.

#### 0.7.3 — Live comparative-run controls

- Require explicit operator approval, target list, concurrency ceiling, maximum attempts, and spend budget for paid-provider runs.
- Record approval identity/reason, budget consumption, stop conditions, and run-time exclusions.
- Keep fixture and offline runs available for deterministic development and release validation.
- Exit only when a paid comparative engagement has a bounded, auditable execution envelope.

### 0.8.x — Assessment profiles, policies, and reviewed packs

#### 0.8.0 — Assessment profile contract

- Define profiles that express required capabilities, thresholds, latency/cost limits, critical
  failures, language/region needs, and mandatory human-review points.
- Let a profile declare which scenario packs, policy controls, and evidence dimensions apply.
- Ensure critical failures and unmet mandatory controls cannot be obscured by an average score.
- Exit only when a customer workflow can be translated into an executable, reviewable assessment definition.

#### 0.8.1 — Reviewed workflow packs

- Establish reviewed-pack metadata: owner, version, source/rights, intended use, prohibited claims,
  rubric, language/region coverage, known gaps, review history, and deprecation status.
- Publish initial packs for policy-bound customer service and logistics management, then prioritize
  financial services, health, insurance, public sector, education, telecommunications, and energy.
- Keep customer-proprietary datasets and evidence separate from public pack schemas and examples.
- Exit only when a public pack makes its coverage and limits as visible as its test cases.

#### 0.8.2 — Organizational policy controls

- Add reusable controls for approved sources, data handling, escalation, approval boundaries,
  tool authority, recordkeeping, and safe recovery.
- Allow controls to define testable requirements, severity/criticality, and expected evidence—not
  only prompt wording.
- Test control enforcement across both prompt-only and agent-harness workflows where applicable.
- Exit only when an assessment can report organizational-rule adherence alongside task performance.

#### 0.8.3 — Framework-mapping evidence

- Add mapping metadata for selected technical controls under frameworks such as GDPR, NDPR,
  NIST AI RMF, Nigeria's NAIS, and other customer-selected regional requirements.
- State the tested technical behavior, applicable evidence, coverage limits, and required legal,
  privacy, security, and domain review for every mapping.
- Prohibit reports and packs from describing a technical test pass as legal or regulatory certification.
- Exit only when framework-oriented evidence is precise, reviewable, and bounded by its actual authority.

### 0.9.x — Reports, release gates, and leaderboard

#### 0.9.0 — Evidence-based assessment reports

- Generate decision-ready reports solely from saved, sanitized evidence, without a new model call.
- Include methodology, workload/profile identity, model/configuration, coverage, validity counts,
  exclusions, per-dimension results, control status, costs, and limitations.
- Make every report surface agree with the status and denominator contract established in 0.4.
- Exit only when a reviewer can reproduce the report's claims from retained assessment evidence.

#### 0.9.1 — Continuous assurance and release gates

- Enable profile-aware baselines and regression checks that first confirm workload/profile compatibility.
- Add CI decisions for thresholds, critical failures, approved exceptions, and missing required evidence.
- Make gate output explain the policy/profile requirement and evidence behind a block, warning, or pass.
- Exit only when the same contract supports both a customer assessment and a safe release decision.

#### 0.9.2 — Public leaderboard publication contract

- Define the minimum public entry: model/configuration, scenario/profile/pack identity, method,
  sample size, valid-outcome denominator, invalid/error/unavailable counts, date, and limitations.
- Require reproducible public workload identities and authorized public data before an entry can be published.
- Declare incompatibility, conflicts of interest, sponsorship, and known coverage gaps rather than hiding them.
- Exit only when a public result can be independently interpreted without treating it as a universal rank.

#### 0.9.3 — Scenario-first leaderboard surfaces

- Provide filters for workflow, sector, language/region, capability, policy/control outcome,
  operational constraint, provider, and model configuration where data exists.
- Show comparable entries together; label qualified or incomparable entries rather than forcing a score table.
- Present strengths, weaknesses, incomplete evidence, and measurement limits alongside outcome rates.
- Exit only when a reader can find a model's fit for a defined scenario without inferring a flat global score.

### 1.0.0 — Stable public assurance contracts

- Freeze and document the supported compatibility policy for core result, evidence, manifest,
  profile, policy-control, harness, and comparison contracts.
- Publish migration guides and compatibility fixtures for supported historical artifact versions.
- Complete public reference documentation, examples, disclosure/redaction/retention guidance, and
  a contribution path for adapters and reviewed public packs.
- Require the complete deterministic test, typecheck, lint, build, documentation, migration, and
  artifact-redaction validation gates before making the stability commitment.
- Exit only when downstream users can depend on the documented contracts and evolve safely through
  explicit compatibility rules.

## 0.4 — Evaluation integrity

**Status:** Released through 0.4.2. Evaluation Integrity hardening is complete for the
current 0.4.x scope.
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

### 0.4.x hardening checklist

| Target | Work item | Status |
| --- | --- | --- |
| 0.4.1 | Redact evaluator reasons and bounded evidence under enabled run redaction | ✅ |
| 0.4.1 | Runtime-validate integrity-bearing status/evidence fields at standard storage boundaries | ✅ |
| 0.4.1 | Publish strict LLM-judge assurance example and release-validation record | ✅ |
| 0.4.1 | Make successful non-interactive publish completion exit cleanly | ✅ |
| 0.4.2 | Exercise Supabase integrity migration against a disposable database | ✅ Released |
| 0.4.2 | Distinct CLI/report treatment for every measurement status | ✅ Released |
| 0.4.2 | npm credential/ownership preflight and temporary token handling | ✅ Released |

The complete 0.4.x checklist and acceptance criteria live in
[docs/v0.4-assurance-improvements.md](docs/v0.4-assurance-improvements.md).

## 0.5 — Reproducible evidence and workload identity

**Status:** 0.5.0 workload-identity foundation released; 0.5.1 execution-provenance candidate prepared
**Goal:** let a reviewer understand precisely what was tested, how it was judged, and what
execution configuration produced the result.

### Scope

Add versioned identities or content digests for scenarios, rubrics, profiles, and reviewed packs.
Record requested and observed model identity where available, generation settings, target versus
grader usage, repetition identity, execution constraints, and explicit price-data provenance.
See [reproducible evidence](docs/reproducible-evidence.md) for the current public contract.

### Release checklist

| Work item | Status |
| --- | --- |
| Versioned workload and rubric identities | ✅ 0.5.0 |
| Versioned profile identities | 📋 |
| Requested and observed provider/model configuration evidence | ⏳ 0.5.1 release candidate |
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

After deterministic reports are established, add an optional AI-assisted narrative layer that works
only from sanitized saved evidence. It must label generated interpretation, cite manifest evidence,
record its own model/configuration, and never alter measurement status, assurance decisions, or
comparison eligibility.

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
