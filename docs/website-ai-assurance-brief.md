# ArtemisKit website direction: AI Assurance

**Audience:** website implementation agent, product/design reviewer, and maintainer
**Source of truth:** [ROADMAP.md](../ROADMAP.md) and [AI_ASSURANCE.md](../AI_ASSURANCE.md)
**Reviewed:** 7 September 2026

## Objective

Reposition ArtemisKit from a general LLM reliability toolkit toward an open-source,
scenario-based AI assurance test runner.

The primary conversion is a qualified AI Assurance assessment request. The secondary conversion
is open-source adoption: documentation, GitHub, contributions, and scenario-pack work.

## Current-site observations

The current homepage leads with “Stop Hoping Your AI Is Secure. Start Proving It.” It emphasizes
red teaming, quality evaluation, stress testing, and a future ArtemisKit Cloud. Keep those current
capabilities visible, but make scenario-specific assurance the organizing story.

## Public positioning

### Primary message

> **Prove how your AI works in the scenarios that matter.**

ArtemisKit is an open-source AI assurance test runner for evaluating model capability, reliability,
security, tool use, policy adherence, and operational behavior against real workflows.

### Supporting message

Move beyond generic model scores. Define the workflow, run controlled scenarios, capture evidence,
and see where an AI system passes, fails, is unavailable, or cannot be validly measured.

### Claims available now

- Open source and self-hosted under Apache-2.0.
- Scenario-based evaluation, multi-turn testing, red teaming, stress testing, reports, and CI/CD.
- Multiple evaluators and provider integrations.
- Bounded real-agent evaluation with controlled Docker/MCP tooling and independently observed outcomes.

### Planned or in-development claims

- Stable provider-neutral native agent harness.
- Versioned assessment profiles and policy/control packs.
- Public scenario-specific leaderboard.
- Framework-mapped technical evidence packs.
- Hosted service, dashboard, or commercial SaaS capability.

### Prohibited claims

- Legal certification or compliance claims for GDPR, Nigerian data protection, NIST AI RMF, NAIS, or any framework.
- “Safest,” “best model,” guaranteed outcomes, or a universal model ranking.
- Fabricated customer logos, results, compliance badges, benchmarks, or testimonials.
- Any claim that Loki or a separate commercial product is part of ArtemisKit.

## Homepage architecture

### Hero

**Headline:** Prove how your AI works in the scenarios that matter.

**Subheadline:** ArtemisKit is the open-source AI assurance test runner for evaluating models and
AI systems against real workflows, organizational rules, controlled tools, and operational requirements.

**Primary CTA:** Request an AI Assurance assessment → /apply
**Secondary CTA:** Explore the toolkit → documentation or GitHub

Use an evidence-card visual, not an invented leaderboard:

| Field | Example label |
| --- | --- |
| Workflow | Customer service: disputed payment |
| Requirement | Escalate high-risk cases; do not disclose account data |
| Outcome | Valid pass / valid fail / measurement unavailable |
| Evidence | Policy trace, independent check, latency |
| Limitation | Synthetic data; English only |

### Problem: flat scores do not answer deployment questions

Show questions customers actually ask:

- Can our customer-service AI follow escalation and privacy rules?
- Can a logistics agent use approved tools without inventing operational state?
- Can this model serve our language, latency, security, and cost needs?

| Flat benchmark | Scenario-based assurance |
| --- | --- |
| One general score | Evidence by workflow and requirement |
| Hidden trade-offs | Critical failures and limitations visible |
| One-off samples | Versioned, repeatable scenarios |
| “Did it answer?” | “Did it complete the task safely and correctly?” |

### Assurance dimensions

Use six cards: capability, reliability, security, policy adherence, operational behavior, and
evidence quality. Mark planned enhancements clearly.

### How it works

1. Define workflow, requirements, rules, and success criteria.
2. Run versioned scenarios in a controlled environment.
3. Capture sanitized outcomes, traces, operational measurements, and validity status.
4. Review strengths, weaknesses, evidence gaps, and next steps.

### Conversion section

Use the headline **Bring your real workflow. Leave with evidence.**

Link to /apply and show a short readiness list: workflow, target system, rules, risks, authorized
test data/access, success criteria, stakeholders, and constraints.

## Use-case pages

Create a use-case index and individual pages. Use hypothetical examples unless publication is
explicitly authorized.

### High-regulation sectors

| Route | Audience and assurance focus |
| --- | --- |
| /use-cases/financial-services | Banking, payments, lending, insurance: sensitive data, escalation, approval limits, regulated communications, fraud/exception handling, audit evidence, and language coverage. |
| /use-cases/healthcare | Providers, payers, life sciences, health operations: safe information handling, source boundaries, escalation, harmful-advice refusal, workflow accuracy, and human-review needs. |
| /use-cases/public-sector | Citizen support and government operations: accessibility, language inclusion, consistency, policy boundaries, sensitive-data treatment, and transparent escalation. |
| /use-cases/telecommunications | Customer support and network operations: privacy, account verification boundaries, outage communication, escalations, and tool authority. |
| /use-cases/critical-infrastructure | Energy, transport, utilities: authorization, safe failure, human approval, traceability, and restricted tool use. |

### Moderate-regulation and operational sectors

| Route | Audience and assurance focus |
| --- | --- |
| /use-cases/logistics | Shipment-state integrity, exception management, approvals, tool selection, incomplete data, and safe recovery. |
| /use-cases/commerce | Product/support assistants, refunds, returns, pricing/availability boundaries, privacy, and escalation. |
| /use-cases/education | Learner support, content quality, accessibility, age-appropriate controls, privacy, and regional/language needs. |
| /use-cases/hr-and-recruitment | Candidate communication, privacy, escalation, fairness/bias review support, and no automated employment-decision claims. |
| /use-cases/enterprise-operations | Knowledge operations, structured workflows, approved source use, access boundaries, and tool-using agents. |
| /use-cases/model-providers | Controlled scenario assessments for providers seeking evidence of strengths, gaps, and agent behavior. |

Every use-case page needs: problem, workflow, risks, what gets tested, example evidence,
limitations, readiness list, FAQ, and a CTA to /apply.

## Required routes

| Route | Purpose | Primary CTA |
| --- | --- | --- |
| / | Scenario-based assurance overview and open-source foundation | /apply and docs |
| /ai-assurance | Detailed service explanation, process, deliverables, and boundaries | /apply |
| /apply | Qualification and application page | GitHub AI_ASSURANCE.md and assessment-request flow |
| /leaderboard | Future public, scenario-specific results—not a flat rank | Methodology until verified data exists |
| /use-cases | Index of regulated and operational scenarios | Individual use cases |
| /agent-evaluation | Controlled agent environments, tool traces, and independent outcome checks | Docs and /apply |
| /roadmap | Public release themes and contribution direction | GitHub ROADMAP.md |
| /docs | Existing technical documentation | Get started |

Replace every link and navigation reference for /results with /leaderboard. Do not launch a
leaderboard with invented data. Before verified public entries exist, publish methodology, required
entry fields, and a transparent “not yet published” state.

## Apply page and GitHub handoff

The apply page should:

- explain who should apply and what the service evaluates;
- show the eight readiness items in AI_ASSURANCE.md;
- warn against submitting credentials, personal data, or proprietary files publicly;
- link to https://github.com/code-sensei/artemiskit/blob/main/AI_ASSURANCE.md;
- link requests to https://github.com/code-sensei/artemiskit/issues/new;
- state that submission does not authorize testing or create an engagement.

When a private application system exists, replace the public GitHub route only after privacy,
retention, contact ownership, and review processes are approved.

## SEO requirements

### Technical SEO for every indexable page

- Unique title, meta description, canonical URL, Open Graph title/description/image, and Twitter card.
- One descriptive H1 and logical H2/H3 hierarchy; no keyword stuffing.
- Server-rendered or pre-rendered primary content; essential copy cannot be client-only.
- XML sitemap includes canonical public pages. Robots rules exclude previews, internal pages,
  duplicate filters, and private application endpoints.
- Descriptive internal links between assurance, use cases, agent evaluation, roadmap, docs, apply,
  and leaderboard pages.
- Responsive images, meaningful alt text, accessible contrast, stable layout, and fast mobile rendering.
- Use Organization, SoftwareApplication, WebSite, BreadcrumbList, Article, Service, and FAQPage
  structured data only when the visible page content supports it.

### Entity and keyword strategy

Use natural language around AI assurance, AI model evaluation, AI agent evaluation, LLM testing,
AI reliability, AI red teaming, AI governance evidence, scenario-based evaluation, tool-use
testing, and workflow-specific AI assessment.

Pair broad terms with sector entities only where the page meaning supports them: financial
services, healthcare, public sector, telecommunications, logistics, education, HR, commerce, and
enterprise operations. Do not claim endorsement or certification.

## AEO requirements

AEO means answer-engine optimization: pages should answer user questions clearly enough for search
and answer systems to quote accurately.

For every core page:

- Put a direct 40–70 word answer immediately below the H1.
- Use question-led headings such as “What is AI Assurance?”, “What does ArtemisKit test?”,
  “How do I apply?”, and “What does a leaderboard entry mean?”
- Include a visible FAQ with concise, non-duplicative answers.
- Add FAQPage schema only for FAQs rendered visibly on the page.
- Define terms once, use consistent language, and link to deeper explanations.
- Cite first-party documentation for product claims and primary sources for framework statements.
- State dates, versions, scope, and limitations beside results rather than in footnotes.

Required FAQ topics: definition of AI Assurance, difference from a benchmark, application
requirements, legal-certification boundary, invalid/unavailable measurement, and tool-using agents.

## AIO requirements

AIO means AI optimization for assistants and retrieval systems. The aim is faithful retrieval, not
manipulating answers.

- Maintain stable public Markdown sources: README.md, ROADMAP.md, AI_ASSURANCE.md, and relevant docs.
- Use short, atomic factual statements before longer marketing copy.
- Give each page a clear purpose, audience, status, and last-updated date.
- Keep terminology exact: scenario-based AI assurance, valid measurement, invalid measurement,
  controlled agent evaluation, and scenario-specific leaderboard.
- Publish methodology and limitations alongside any future leaderboard entry.
- Keep URLs, canonical titles, organization name, license, and product description consistent.
- Do not allow AI-generated site copy to introduce unsourced performance numbers, customer claims,
  legal interpretations, or unreleased capabilities.
- Make core explanations retrievable as text, not only images, video, or interactive widgets.

## Page metadata and structured-content map

| Route | Title pattern | Primary query/answer | Structured data |
| --- | --- | --- | --- |
| / | ArtemisKit — Scenario-Based AI Assurance | What is ArtemisKit and why do flat scores fall short? | Organization, SoftwareApplication, WebSite, FAQPage if visible |
| /ai-assurance | AI Assurance Assessments with ArtemisKit | What does an assessment test and deliver? | Service only if accurate and public; FAQPage |
| /apply | Apply for an AI Assurance Assessment | How do I apply and what must I prepare? | FAQPage, BreadcrumbList |
| /leaderboard | ArtemisKit Leaderboard — Scenario-Specific Model Evidence | What does a leaderboard entry mean? | Dataset only when genuine public data exists; FAQPage |
| /use-cases/* | AI Assurance for [Sector] | How can AI be assessed for this workflow? | BreadcrumbList, FAQPage |
| /agent-evaluation | Controlled AI Agent Evaluation | How are tool-using agents tested safely? | BreadcrumbList, FAQPage |
| /roadmap | ArtemisKit Public Roadmap | What is ArtemisKit building next? | BreadcrumbList |
| /docs/* | [Topic] — ArtemisKit Docs | How do I use this capability? | TechArticle or Article where appropriate |

## Design and data rules

- Replace generic scorecards with a scenario evidence card: workflow, requirement, model/config,
  valid outcome rate, invalid measurements, policy status, latency, and limitations.
- Use a flow visual: scenario contract → controlled execution → independent checks → evidence report.
- Add leaderboard filters only after real public data exists: scenario, profile, language,
  capability, policy outcome, model, and provider.
- Never invent benchmark data, customer testimonials, certifications, model logos, or sector claims.

## Implementation acceptance checklist

- [ ] First screenful explains scenario-based assurance and has an /apply CTA.
- [ ] Existing security, quality, performance, and open-source capabilities remain visible.
- [ ] Use-case coverage includes all high- and moderate-regulation sectors listed above.
- [ ] /apply links to GitHub AI_ASSURANCE.md and uses a safe public request path.
- [ ] /results is fully replaced by /leaderboard.
- [ ] Leaderboard uses no fabricated results and explains methodology/limitations before launch.
- [ ] Every public page meets the SEO, AEO, and AIO requirements in this brief.
- [ ] Every visible FAQ has an accurate answer and matching FAQ schema only where appropriate.
- [ ] No page claims legal certification, universal safety, or a universal “best model.”
- [ ] No private roadmap, private Ling artifact, customer data, credential, or Loki claim is published.
