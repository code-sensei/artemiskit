# aml-transaction-review benchmark pack

> **Status: draft, unreviewed.** No qualified AML reviewer has checked the rulebook, the cases or
> the expected outcomes. Results from this pack are method evidence, not claims about any model,
> until a reviewer signs off below.

| Sign-off | |
| --- | --- |
| Reviewer (name, role, AML qualification) | _pending_ |
| Date | _pending_ |
| Scope reviewed | _pending_ |
| Rulebook version reviewed | SYN-AML v1.0 (policy `aml-rulebook-v1`) |

## What the pack measures

Each task puts a model in the seat of a first-line transaction-monitoring analyst. The model gets a
written synthetic rulebook and one synthetic alert with its KYC context. It must return one JSON
object that picks the outcome the rulebook requires and cites the rules that require it:

- `clear`: every indicator is explained by verified information;
- `request_information`: ask the customer for a named document (enhanced due diligence);
- `escalate_mlro`: refer to the money laundering reporting officer;
- `prepare_str`: prepare a suspicious transaction report for the MLRO to submit.

Some cases also ask for a customer message, which must not tip off the customer, or an STR
narrative, which must not repeat identifiers or irrelevant personal data.

| | |
| --- | --- |
| Tasks | 50 `scenario_evaluation` tasks, one typology or rule interaction each |
| Cases | 177 (3 to 4 per task) |
| Language | English (`en`) |
| Scoring | Deterministic: `json_schema`, `regex` and `not_contains` only; see [RUBRIC.md](RUBRIC.md) |
| Rulebook | Synthetic `SYN-AML v1.0`, identical in every task's system prompt |

Typologies covered include structuring and smurfing, funnel and mule accounts, rapid pass-through,
authorised push payment and romance-fraud mules, trade-based laundering (over- and
under-invoicing, phantom shipments, third-party payments), shell and front companies,
beneficial-ownership opacity, trusts and nominees, PEPs and their family members and associates,
sanctions true and false positives, sanctions evasion and proliferation financing, virtual-asset
on- and off-ramps, mixers and peer-to-peer trading, correspondent banking and nested
relationships, shell banks, payment transparency, cash-intensive businesses, real estate, precious
metals and luxury goods, bulk cash, prepaid cards, unlicensed money transmission, investment
fraud, loan-back schemes, professional client accounts, dormant-account reactivation, higher-risk
jurisdictions, terrorist-financing indicators (including verified humanitarian work that must not
be de-risked), tipping-off, customer explanations that do and don't resolve an alert, and data
minimisation in narratives. The design spec has the full coverage matrix:
[docs/superpowers/specs/2026-11-19-aml-transaction-review-pack-design.md](../../docs/superpowers/specs/2026-11-19-aml-transaction-review-pack-design.md).

## Intended use

- Comparing how open-weight models follow a written AML rulebook in ArtemisKit 0.7.x
  comparative experiments.
- Developing evaluation method: deterministic scoring of structured decisions, injection
  resistance, tipping-off and minimisation checks.
- A starting point that a qualified reviewer can correct, extend and sign off.

## Prohibited claims

Don't use results from this pack to claim:

- a universal ranking of models, or that a model is "best" at AML work;
- compliance with, or certification against, the FATF Recommendations or any law or regulation;
- that a model is fit to make, or assist with, real AML decisions;
- legal or regulatory advice of any kind.

## Data and sources

**All case data is synthetic.** Customers, companies, people, identifiers, amounts, jurisdictions
("jurisdiction V", "district D") and documents are invented. Any resemblance to a real person or
organisation is coincidental. Identifiers use synthetic formats (for example `SYN-...`, `555`
phone numbers).

**The rulebook is synthetic.** Its indicator rules paraphrase principles from public FATF
material, cited in each task's description and in the design spec's Verification section. Its
decision tests, thresholds (for example the USD 10,000 review threshold), lists and precedence
order are written for this benchmark and aren't any institution's or regulator's procedure. Every
task is therefore tagged `basis:synthetic-rulebook`. The pack doesn't use a Nigerian STR filing
deadline, Nigerian section numbers or a Nigerian cash limit.

Sources (paraphrased, not reproduced; FATF publications are © FATF/OECD, all rights reserved):

- FATF, *International Standards on Combating Money Laundering and the Financing of Terrorism &
  Proliferation: The FATF Recommendations*, updated October 2025.
- FATF, *Virtual Assets Red Flag Indicators of Money Laundering and Terrorist Financing*,
  September 2020.
- FATF and Egmont Group, *Concealment of Beneficial Ownership*, July 2018.
- FATF, *Professional Money Laundering*, July 2018.
- FATF, *Guidance on Proliferation Financing Risk Assessment and Mitigation*, June 2021.
- FATF, *Guidance: Politically Exposed Persons (Recommendations 12 and 22)*, June 2013.
- FATF, INTERPOL and Egmont Group, *Illicit Financial Flows from Cyber-Enabled Fraud*,
  November 2023.
- FATF, *Detecting and Disrupting Terrorist Financing Activity through Social Media, Instant
  Messaging Applications and Streaming Platforms*, June 2026.

The pack's own files are licensed with the repository (Apache-2.0).

## Targets and how runs work

[experiment.yaml](experiment.yaml) declares two targets, `qwen3.5:4b` and `qwen3.5:9b`, published by
Qwen under Apache-2.0. Benchmark runs use these open-weight models run locally through Ollama's
OpenAI-compatible endpoint (`provider: openai`, `base_url: http://127.0.0.1:11434/v1`). This is
not native Ollama support. Local runs have no metered cost, so no cost is reported
(`cost_basis: not_applicable`).

The experiment runs in `fixture` mode with 3 repetitions, concurrency 1 and one retry only on
`infrastructure_failed`, so retries can't improve a score. Budgets: 177 cases × 2 targets × 3
repetitions = 1,062 requests, at most 2,124 with retries; `max_tokens` allows 6,000 tokens per
request.

## Scoring change

2026-11-19: optional answer keys (`customer_message`, `str_narrative` when the case doesn't ask for
them) now accept `null` as well as omission. Before, `"customer_message": null` failed the schema
check even when the decision and rules were right. Keys a case requires still fail on `null` or
omission. Re-scoring the first local think-off run's saved responses turned 193 of 1,062 case
results from fail to pass (Qwen3.5 4B 23.0% to 40.3%, 9B 33.3% to 52.4%) and none into failures.
The rubric identity changed, so earlier results aren't comparable. Details:
[RUBRIC.md](RUBRIC.md#changes).

## Regenerating experiment.yaml

Run this after any change to a task file, `RUBRIC.md` or `experiment.template.yaml`:

```bash
bun packs/_tools/generate-experiment.ts packs/aml-transaction-review --language en --policy aml-rulebook-v1
```

Update the budget lines in `experiment.template.yaml` first if the case count changes
(cases × 2 targets × 3 repetitions × 2 attempts; 6,000 tokens per request). Then check:

```bash
bun packages/cli/bin/artemis.ts validate packs/aml-transaction-review/tasks
bun test packs/aml-transaction-review
```

The pack test recomputes every task digest, the workload digest and the rubric digest, proves
that each case accepts its reference answer and rejects every wrong decision, checks that
optional answer keys accept `null`, and checks the balance targets. Every task carries the same
system prompt; a rulebook change must be applied to all 50 task files.

## Limitations

- **Unreviewed.** See the status note at the top.
- **Synthetic rules and cases.** Passing shows that a model follows this rulebook on short, clean
  case files. It doesn't show that a model would follow a real institution's procedures on real
  case files.
- **Single-turn decisions.** Real reviewers query systems, contact customers and revisit cases.
- **Text-matching limits.** The tipping-off check is a word list; the minimisation checks reject
  any mention of a listed identifier, even one explaining that it was withheld. Rationales aren't
  scored.
- **Small samples per typology.** Three or four cases per task can't support fine-grained claims
  about a typology; no uncertainty estimate is reported in 0.7.x.
- **English only**, with some Nigerian-context names and public offices. No Hausa, Yoruba, Igbo or
  Nigerian Pidgin cases.
- **Reasoning output.** Whether thinking text from reasoning models reaches the scored response
  depends on the executor and endpoint; record this in any run report.
