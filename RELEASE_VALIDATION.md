# Release validation suite

This document defines the reusable, scenario-based validation suite for ArtemisKit releases.
It complements unit, integration, typecheck, lint, and build checks. A release is not ready merely
because its individual tests pass: its result and evidence contracts must also work across realistic
AI-assurance workflows.

The suite is fixture-first and deterministic by default. It must not require production credentials,
customer data, paid model calls, or live side effects. Live-provider checks are optional, separately
authorized, budgeted, and reported as non-deterministic supplementary evidence.

## When to run it

Run the applicable cases before every release candidate. Re-run all cases when a change affects the
core result contract, scenario schema, executor, evaluator, artifact/manifest format, reports, CLI,
SDK, adapters, agent harness, policy controls, or comparison logic.

Each case should be represented by committed scenarios, fixtures, and automated assertions when the
underlying feature exists. Until then, this document is the acceptance specification; it is not a
substitute for automation.

## Release gates

| Gate | Required outcome |
| --- | --- |
| Deterministic suite | Every applicable fixture-backed case passes from a clean local checkout. |
| Result integrity | Invalid, unavailable, unsupported, and execution-error measurements never count as normal passes or failures. |
| Cross-surface consistency | CLI, SDK, JSON artifacts, reports, and JUnit outputs agree on case status, counts, and denominators where they support the run. |
| Evidence protection | Evidence follows its bounded schema and redaction policy; no secrets, raw protected inputs, or raw judge output leak. |
| Reproducibility | Commands, fixture versions, environment prerequisites, and any exclusions are recorded with the release candidate. |
| Standard engineering checks | Build, typecheck, lint, relevant package tests, and full test suite pass. |

No release may hide a failed gate by omitting the affected measurement. Any approved exception must
identify the omitted case, reason, risk owner, and planned follow-up.

## Core use-case catalog

| ID | Scenario | Primary proof | Mandatory from |
| --- | --- | --- | --- |
| RV-01 | Policy-bound customer service | A valid response can pass or fail content and organization-policy criteria without an invalid measurement being miscounted. | 0.4 |
| RV-02 | Logistics tool workflow | Multi-step tool traces, schema checks, and outcome assertions retain bounded, reviewable evidence. | 0.4; expanded in 0.6 |
| RV-03 | Security and prompt injection | Refusal and policy compliance evaluate correctly; blocked or unavailable tools remain distinct from a normal outcome failure. | 0.4 |
| RV-04 | Regional or language-specific workflow | Localized/non-English scenarios preserve case status, evidence, and summary semantics. | 0.4 |
| RV-05 | Structured extraction or decision | Malformed target output is a valid failed outcome when the evaluator itself successfully runs. | 0.4 |
| RV-06 | Malformed LLM-judge output | Strict assurance grading rejects malformed JSON, coercion, missing fields, non-finite scores, and out-of-range boundary scores as invalid measurements. | 0.4 |
| RV-07 | Target/provider failure | Timeout, transport failure, unsupported capability, or unavailable target is visible as an error/invalid/unavailable measurement and excluded from outcome-rate denominators. | 0.4 |
| RV-08 | Evaluator failure | A rubric/judge failure remains distinguishable from a valid target response that failed the rubric. | 0.4 |
| RV-09 | Mixed-run artifact and report | Attempts, valid evaluations, invalid/error counts, denominators, and sanitized evidence agree across supported output formats. | 0.4 |
| RV-10 | Historical artifact replay | Supported historical manifests load under the documented legacy mapping, without pretending they contain newer evidence/status fields. | 0.4 |
| RV-11 | Reproducible workload identity | Changing a scenario, rubric, profile, or generation configuration changes or qualifies workload identity and comparison eligibility. | 0.5 |
| RV-12 | Controlled native agent | Declared tools, permissions, budgets, fixtures, faults, final state, and independent outcome checks govern a multi-turn agent workflow. | 0.6 |
| RV-13 | Cross-provider comparison | Identical compatible workloads execute across configured targets; retries, repetitions, unsupported capabilities, and incomplete experiments stay visible. | 0.7 |
| RV-14 | Profile/control assessment | A customer-service or logistics profile enforces policy, approval, data-handling, escalation, and critical-failure rules. | 0.8 |
| RV-15 | Decision-ready report and leaderboard entry | A saved run regenerates a report and, where public data is approved, a scenario-specific entry with method, limitations, and validity counts. | 0.9 |

## Case design requirements

Every automated release-validation case must declare:

- Stable case ID and title.
- Applicable release milestone and component(s) under test.
- Scenario/profile/rubric fixture version and target capability assumptions.
- Expected case status and expected aggregate contribution.
- Expected sanitized evidence fields and explicitly prohibited retained content.
- Deterministic fixture setup, including controlled target, evaluator, tool, and fault behavior.
- The assertion target for each supported output surface.

Do not depend on an LLM self-report for a pass condition. Use independently observable state,
validated artifacts, tool traces, schemas, policy checks, or deterministic evaluator fixtures.

## Release-candidate record

For each candidate, add a short release-validation record to the pull request or release notes:

| Field | Record |
| --- | --- |
| ArtemisKit revision/version | Commit and proposed package version(s) |
| Date and operator | When and by whom the suite was run |
| Environment | Bun version, operating system, and relevant configuration |
| Cases run | IDs, fixture versions, and commands |
| Result | Pass/fail/skipped count, with reasons for every skipped case |
| Evidence review | Artifact/report locations and redaction verification |
| Optional live checks | Provider, budget approval, model configuration, and clear non-deterministic label |
| Exceptions | Risk owner, expiry, and follow-up issue |

## Current implementation status

RV-01 through RV-10 define the release-validation bar for the Evaluation Integrity milestone. They
are automated across fixture-backed workflow, executor, evaluator, artifact, and report tests for
the 0.4 release candidate. RV-11 through RV-15 are retained now so future releases extend the same
suite rather than reinventing release confidence criteria.
