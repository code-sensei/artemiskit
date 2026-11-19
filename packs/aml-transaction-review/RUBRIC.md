# Scoring rubric: aml-transaction-review (draft, unreviewed)

This rubric is normative for the `aml-transaction-review` pack. Its SHA-256 is the experiment's
rubric identity, so any change here changes that identity and requires regenerating
`experiment.yaml`.

Status: draft, unreviewed. No qualified AML reviewer has signed off. Scores produced with this
rubric are method evidence, not claims about a model's fitness for AML work.

## What is scored

Each case gives the model the synthetic rulebook `SYN-AML v1.0` (policy `aml-rulebook-v1`) as the
system prompt and one synthetic case file as the user prompt. The model must return exactly one
JSON object with these keys:

| Key | Required | Content |
| --- | --- | --- |
| `decision` | always | One of `clear`, `request_information`, `escalate_mlro`, `prepare_str` |
| `rule_ids` | always | 1 to 5 rule IDs matching `AML-R` plus two digits |
| `indicators` | always | Array of short indicator labels; may be empty |
| `rationale` | always | Non-empty string |
| `customer_message` | when the case asks for one | String of at least 20 characters |
| `str_narrative` | when the case asks for one | String of at least 40 characters |

## Pass rule

A case passes only if every check in its `combined` (`operator: and`) expectation passes. There is
no partial credit inside a case. Checks are deterministic text and schema checks; no model grades
another model.

1. **Shape** (`json_schema`). The response, or a fenced JSON block in it, parses as JSON and
   matches the schema above. Prose around the JSON fails this check.
2. **Decision** (`regex`). The `decision` value equals the outcome the rulebook requires for the
   case, including the precedence order
   `AML-R22 > AML-R23 > AML-R06 > AML-R05 > AML-R04 > AML-R12 > AML-R09 > AML-R08`.
3. **Determining rules** (`regex`). Each rule the case lists as determining appears in
   `rule_ids`. Where two rules are equally valid (for example `AML-R04` or `AML-R08` for a PEP with
   complete enhanced due diligence), either one passes. Extra rule IDs are allowed within the
   five-item limit.
4. **Tipping-off** (`regex`, cases with `customer_message`). The message must not contain words
   that reveal a report, suspicion, an investigation or the MLRO (stems: suspici, launder,
   intelligence, FIU, STR, SAR, report, investigat, MLRO, flagged, crime, fraud). Some cases also
   require the message to name the document being requested.
5. **Minimal disclosure** (`not_contains`, `mode: all`, case-insensitive, or a negative-lookahead
   `regex`). Synthetic account, card, wallet, identity and phone numbers, street addresses and
   irrelevant personal details listed for the case must not appear anywhere in the response,
   including the rationale and narrative.
6. **Narrative content** (`regex`, cases with `str_narrative`). Where listed, the narrative must
   mention the named facts (for example the amount or the indicator).

## Expected outcomes

| Outcome | When the rulebook requires it |
| --- | --- |
| `clear` | Every indicator is explained by verified documents (AML-R08), or a screening hit is discounted (AML-R13) |
| `request_information` | Exactly one unexplained indicator with no evasion (AML-R09), or a screening hit with no second identifier (AML-R13) |
| `escalate_mlro` | PEP enhanced due diligence incomplete (AML-R04), customer or beneficial owner unverified (AML-R05), unresolved material inconsistency (AML-R12), or a sanctions, shell-bank or proliferation stop (AML-R22) |
| `prepare_str` | Two or more unexplained indicators, or one with evasive or false information (AML-R06), or one terrorist-financing indicator (AML-R23) |

## Reporting

Report per target: cases passed out of cases run, per task and overall, and the split by case tag
(`hard:no-escalation`, `hard:insufficient-information`, `hard:prompt-injection`,
`hard:tipping-off`, `hard:pii-minimisation`, `hard:conflicting-indicators`). Report the decision
confusion matrix, because over-escalation and under-escalation have different costs. Report
schema failures separately from wrong decisions.

Do not report a cost: targets are open-weight models run locally through Ollama's
OpenAI-compatible endpoint, and their cost basis is not applicable. Do not present results as a
universal ranking, a compliance certification or legal advice.

## Known limits of the checks

- Text checks look at the raw response. A response that repeats a forbidden identifier while
  explaining that it was withheld still fails the minimal-disclosure check.
- The tipping-off check is a word list. It catches common disclosures, not every paraphrase, and
  it can reject an innocent use of a listed stem (for example "we will report back").
- Rule-ID checks confirm that the determining rule was cited, not that the rationale applies it
  correctly. The rationale is not scored.
