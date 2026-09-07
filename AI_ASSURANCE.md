# Apply for an AI Assurance Assessment

## Know whether your AI is ready for the work you want it to do

An impressive demo does not prove that an AI system will handle your customer conversations,
operational decisions, sensitive data, tools, and organizational rules reliably in production.

ArtemisKit AI Assurance is a scoped technical assessment service for teams and model providers
that need evidence—not a generic model score—before they deploy, select, improve, or compare an
AI system.

We test AI systems against the scenarios that matter to your organization. You receive a clear
view of what the system does well, where it fails, which evidence is incomplete, and what needs
human, legal, privacy, security, or domain review.

## Why request an assessment

Request an assessment when you need to answer questions such as:

- Can our customer-service assistant follow escalation, privacy, and approved-answer rules?
- Can a logistics agent use our tools correctly without inventing shipment status or taking an
  unauthorized action?
- Which candidate model is most suitable for our actual workload, language, latency, and cost
  requirements?
- Does our AI system fail safely when information is incomplete, a tool is unavailable, or a user
  attempts to bypass policy?
- What technical evidence can we bring to our internal risk, security, privacy, audit, or
  governance review?

The result is not a flat “best model” ranking. It is an evidence-led assessment of your system in
your declared context.

## What we assess

| Assessment area | What we examine |
| --- | --- |
| Workflow capability | Whether the system completes defined tasks and meets independently checked success criteria. |
| Reliability | Repeated attempts, controlled failure conditions, recovery behavior, and incomplete measurements. |
| Security | Prompt injection, jailbreak, data-exposure, unsafe tool-use, and policy-bypass risks relevant to scope. |
| Organizational rules | Escalation, approval limits, data handling, approved knowledge sources, tool authority, and safe recovery. |
| Operational behavior | Relevant latency, availability, token use, and cost evidence where the environment makes it available. |
| Governance evidence | Technical controls and evidence that support your selected internal or external review frameworks. |

## Who this is for

AI Assurance is designed for organizations and providers building or deploying AI in high- and
moderate-regulation environments, including:

- banking, payments, insurance, and other financial services;
- healthcare, life sciences, and health operations;
- public sector and citizen-facing services;
- telecommunications and critical infrastructure;
- logistics, supply chain, transport, and mobility;
- education, HR, recruitment, commerce, and enterprise operations.

We also work with model providers that want credible, scenario-specific evidence of how their
models perform in controlled agentic and workflow evaluations.

## What you receive

A scoped assessment can include:

- an agreed workflow and scenario scope;
- defined requirements, organizational rules, critical failures, and acceptance checks;
- controlled execution records and sanitized evidence where applicable;
- valid pass/fail outcomes separated from invalid, unavailable, and unsupported measurements;
- findings by capability, reliability, security, policy, language, and operational dimension;
- explicit limitations, coverage gaps, and recommended next validation steps;
- a report suitable for technical, risk, product, and governance stakeholders.

The exact deliverable depends on the agreed scope. We do not publish customer scenarios, data, or
artifacts without written approval.

## What to prepare before you apply

The strongest applications describe a real workflow rather than a general request to “test our
model.” Please prepare as much of the following as you can:

1. **The workflow:** who uses the system, what it must accomplish, and what a successful outcome
   looks like.
2. **The target:** model/provider, application or agent architecture, current configuration, and
   relevant environments.
3. **Rules and boundaries:** actions the system must never take, approval or escalation rules,
   data-handling requirements, allowed knowledge sources, and tool permissions.
4. **Risk priorities:** the failures that matter most—financial loss, privacy exposure, unsafe
   actions, incorrect advice, language coverage, service quality, or operational disruption.
5. **Data and access:** what test data, fixtures, sandbox access, or documentation can be shared;
   confirm that you are authorized to provide it.
6. **Success measures:** the thresholds, acceptance checks, service expectations, or internal
   decision criteria you want evidence against.
7. **Stakeholders:** technical, product, security, privacy, legal, operations, and domain owners
   who should review scope or findings.
8. **Timing and constraints:** desired assessment window, prohibited systems/actions, budget
   constraints, and any procurement or confidentiality requirements.

Do not submit production credentials, personal data, sensitive customer records, or proprietary
documents through a public GitHub issue.

## How to apply

1. Review the public [roadmap](ROADMAP.md) to understand the open-source direction and current
   capability boundaries.
2. Open an [AI Assurance assessment request](https://github.com/code-sensei/artemiskit/issues/new).
3. Use the title **“AI Assurance assessment request”** and include the preparation items above at a
   high level. Mark sensitive material as unavailable for public sharing.
4. We will confirm whether the request is a fit, identify the appropriate private channel for
   sensitive scoping, and agree the assessment boundaries before any testing begins.

Submitting a request does not create an engagement or authorize testing. Scope, data handling,
access, timing, and commercial terms must be agreed separately.

## Important boundaries

ArtemisKit can produce technical testing evidence. It does not provide legal advice, certify
regulatory compliance, guarantee safety, or replace the decisions of your legal, privacy, security,
risk, or domain experts. A responsible assessment makes its assumptions, exclusions, and unresolved
risks visible.

## Open source, controlled evidence

ArtemisKit is Apache-2.0 licensed and can be run in controlled environments. Assessment work uses
declared scenarios, bounded tools, authorized data, and redaction-aware evidence handling. Public
benchmark-like results will be scenario-specific and transparent about methodology and limitations.
