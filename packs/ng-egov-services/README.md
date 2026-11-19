# ng-egov-services benchmark pack

**Status: draft, unreviewed.** Results produced with this pack aren't claims about any model, agency
or law until a qualified reviewer of Nigerian public administration and data protection has
reviewed and signed off the rulebook, the cases and the reference answers.

| Sign-off | Name | Role and qualification | Date | Scope reviewed |
| --- | --- | --- | --- | --- |
| Domain reviewer | _pending_ | _pending_ | _pending_ | _pending_ |

## What the pack tests

The pack asks a model to act as an assistant to an officer in a fictional Nigerian public agency.
Each case is one synthetic case file: an application, claim, registration, procurement bid, appeal,
complaint, freedom-of-information request or personal-data request. The model must return one JSON
object with the decision the rulebook requires, the rule IDs that determine it, any missing
documents, whether human review is required, and, when asked, a minimal notice.

- 52 `scenario_evaluation` tasks, 183 cases, 3 to 5 cases per task.
- Services: social protection (a fictional Household Support Grant), education finance (a fictional
  Tuition Support Loan), community health insurance enrolment, business name registration, Tax ID
  and tax clearance, land title searches and transfers, pensions, birth and death registration,
  public procurement vendor checks, freedom-of-information requests, citizen complaints, appeals,
  inter-agency data sharing, identity mismatches and fraud indicators, accessibility and fair access,
  and vulnerable applicants.
- Decisions: `approve`, `deny`, `request_documents`, `escalate_human_review`, `release`,
  `release_redacted`, `transfer`, `decline`, `escalate_to_dpo`.
- Scoring is deterministic (`json_schema` and `regex` inside a `combined` expectation). See
  [RUBRIC.md](RUBRIC.md).

The design, coverage matrix, balance statistics and source verification are in
[the pack design spec](../../docs/superpowers/specs/2026-11-19-ng-egov-services-pack-design.md).

## Intended use

- Developing and testing ArtemisKit's comparative-experiment path on consequential, rule-bound
  public-service decisions.
- Comparing how models follow a written rulebook, ask for missing information instead of guessing,
  route adverse or uncertain decisions to a human, ignore instructions planted in case data, and keep
  personal data out of notices and disclosures.
- Local qualification runs on open-weight models.

## Prohibited claims

Don't use results from this pack to claim:

- a universal or general ranking of models;
- that a model, product or agency complies with any Nigerian law, regulation or standard, or is
  certified, approved or safe for public-service use;
- what Nigerian law requires in any real case. The pack isn't legal advice.

## Rulebook and sources

Every task carries the same rulebook, **SYNTHETIC RULEBOOK SYN-EGOV v1.0** (policy
`ng-egov-rulebook-v1`), in its system prompt.

- **Synthetic (Parts A and B).** The programmes, eligibility criteria, thresholds, fees, document
  codes and agency procedures are invented. Some resemble published Nigerian rules (for example on
  pensions or student loans); those resemblances were not verified against primary text for this
  pack and must not be relied on. 44 tasks carry the tag `basis:synthetic-rulebook`.
- **Paraphrased published law (Parts C to E).** Rules marked [PPA], [FOIA] and [NDPA] paraphrase, in
  simplified form, the Public Procurement Act 2007 (sections 16 and 35), the Freedom of Information
  Act 2011 (sections 1 to 8, 14, 15 and 18) and the Nigeria Data Protection Act 2023 (sections 24,
  25, 30, 31, 34 to 37 and 40). The text was read from the gazetted NDPA and from
  government-hosted copies of the two other Acts on 19 November 2026. 8 tasks, whose scored rules
  are all paraphrases of verified Act text, carry the tag `basis:published-rule`.
- **Licences and provenance.** Nigerian Acts are public legislation; the pack paraphrases and cites
  them and doesn't reproduce them. Source URLs, file hashes, quotes and cross-checks are listed in
  the design spec's Verification section. The pack itself is distributed under the repository's
  Apache-2.0 licence.

## Synthetic data

All people, households, businesses, references, identity numbers (`SYN-NIN-...`), account numbers
(`SYN-ACCT-...`), phone numbers (`+234 000 555 ...`) and events are synthetic and deliberately
invalid. Any resemblance to a real person or case is coincidental. Every task description contains
the word "synthetic" and every task carries the `data:synthetic` tag.

## Running

Benchmark runs use open-weight models run locally through Ollama's OpenAI-compatible endpoint
(`provider: openai`, `base_url: http://127.0.0.1:11434/v1`). This isn't native Ollama support.
Local runs have no metered cost, so no cost is reported. The draft experiment
([experiment.yaml](experiment.yaml)) declares two targets published by Qwen under Apache-2.0:
`qwen3.5:4b` and `qwen3.5:9b`, with 3 repetitions, one retry on infrastructure failure only, and
budgets of 2,196 requests and 13,176,000 tokens.

## Regenerating experiment.yaml

`experiment.yaml` records the SHA-256 of every task file, the workload digest and the SHA-256 of
`RUBRIC.md`. After any change to a task file or to `RUBRIC.md`, run:

```sh
bun packs/_tools/generate-experiment.ts packs/ng-egov-services --language en-NG --policy ng-egov-rulebook-v1
bun test packs/ng-egov-services
bun packages/cli/bin/artemis.ts validate packs/ng-egov-services/tasks
```

If you add or remove cases, update the budgets in `experiment.template.yaml` first
(cases x 2 targets x 3 repetitions x 2 attempts requests; 6,000 tokens per request).

## Limitations

- **Unreviewed.** No Nigerian public-administration or data-protection reviewer has signed off.
- **Synthetic rules.** Most rules are invented. Passing doesn't show that a model would apply a real
  agency's procedures, and the published-law rules are simplified paraphrases, not the statutes.
- **Short, clean cases.** Real case files are longer, noisier and often contradictory.
- **English only.** The `en-NG` tag marks Nigerian context, not coverage of Hausa, Yoruba, Igbo or
  Nigerian Pidgin.
- **Text matching.** Checks look for exact keys, values and phrases. A notice that quotes a forbidden
  identifier to explain why it was withheld still fails.
- **Single turn, no tools.** Real casework queries registers and contacts people before deciding.
- **Small samples.** 3 to 5 cases per task support only coarse comparisons; no uncertainty estimate
  is reported.
