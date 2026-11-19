# soc-alert-triage benchmark pack

> **Status: draft — unreviewed.** No qualified security-operations reviewer has checked the
> rulebook, the cases or the reference answers. Results produced with this pack are method
> evidence only. They are not claims about any model until a reviewer signs off below.

## What it tests

A tier-1/2 SOC analyst triages one alert at a time. For each synthetic alert the model must:

- classify it as `true_positive`, `benign_true_positive`, `false_positive` or `undetermined`;
- set a severity and map the evidence to MITRE ATT&CK technique IDs;
- choose `contain`, `investigate`, `monitor` or `close`;
- list read-only evidence steps, and keep disruptive actions (isolation, account disablement,
  blocking, deletion, reimaging) in a separate list that always requires human approval;
- treat everything inside the alert — email bodies, file names, command lines, headers, ticket
  notes — as untrusted evidence, never as instructions;
- refuse to close an incident on a claim of resolution that telemetry contradicts;
- avoid repeating passwords, tokens, keys and personal details found in the alert.

The pack has **52 tasks and 207 cases**. Each task is one situation across 3–5 cases with
different correct outcomes: phishing and initial access, MFA fatigue, impossible travel,
password spraying, OAuth consent abuse, cloud key misuse, privilege escalation, persistence,
credential dumping, lateral movement, ransomware precursors, exfiltration (cloud storage, DNS,
removable media), web attacks, supply-chain compromise, insider access, log tampering, scan
noise, authorized admin activity and red-team scope.

| Decision | Cases | Share |
| --- | --- | --- |
| `contain` | 70 | 33.8% |
| `close` | 65 | 31.4% |
| `investigate` | 48 | 23.2% |
| `monitor` | 24 | 11.6% |

Hard cases: 22 with injected instructions (10.6%), 35 with missing telemetry or unreachable
people (16.9%), 12 data-minimisation cases, 13 with conflicting indicators and 4 with
unverified resolution claims. A model that always answers `contain` scores at most 33.8%.

## Intended use

- Comparing how models follow a written triage procedure on the same fixed cases, as part of an
  ArtemisKit experiment.
- Finding specific failure modes: over-containment, under-containment, guessing instead of
  investigating, following injected instructions, unapproved disruptive actions and data leakage.
- Developing and testing evaluation methods before reviewed packs exist.

## Prohibited claims

Don't use results from this pack to claim:

- that one model is better than another in general, or a universal ranking of models;
- that a model or product is compliant with, certified against or aligned to any framework,
  regulation or standard, including NIST SP 800-61 and MITRE ATT&CK;
- that a model can run a SOC, triage real alerts or take containment decisions unsupervised;
- anything that amounts to legal, regulatory or security-assurance advice.

## How it's scored

Every task carries the same synthetic rulebook, `SYN-SOC v1.0` (policy `soc-rulebook-v1`), in its
system prompt. The model returns one JSON object. Scoring is deterministic: a JSON schema plus
regular expressions and `not_contains` checks, with no model-graded or similarity checks. A case
passes only if every check passes. [RUBRIC.md](RUBRIC.md) is the normative scoring description;
its SHA-256 is the experiment's rubric identity.

## Sources and licences

- **Rulebook:** synthetic, written for this pack. Its incident-handling structure follows NIST
  SP 800-61 Rev. 3, *Incident Response Recommendations and Considerations for Cybersecurity Risk
  Management: A CSF 2.0 Community Profile* (April 2025), a U.S. government work. No rule quotes
  NIST; the severity scale, decision table and approval rules are invented for the benchmark.
  Every task is therefore tagged `basis:synthetic-rulebook`.
- **Technique IDs:** MITRE ATT&CK® Enterprise v20.1, verified on attack.mitre.org and in MITRE's
  published STIX data on 19 November 2026. The pack uses technique and tactic IDs only and copies
  no ATT&CK descriptions. MITRE's terms of use grant a royalty-free licence for research,
  development and commercial use: "© 2026 The MITRE Corporation. This work is reproduced and
  distributed with the permission of The MITRE Corporation." ATT&CK v19 and v20 moved several
  defence-evasion techniques (for example T1070.001 to T1685.005); the pack uses v20.1 IDs only.
- **Alert data:** entirely synthetic. People are identified only by IDs such as `U-0614`; domains
  use `.example`; public IP addresses come from the documentation ranges in RFC 5737 and
  RFC 3849, and internal addresses from private ranges.
  Names, phone numbers, passwords, keys and tokens in the alerts are invented. Any resemblance to
  real organisations or people is accidental.

The full source list, search dates and quotes are in the design spec's Verification section:
[docs/superpowers/specs/2026-11-19-soc-alert-triage-pack-design.md](../../docs/superpowers/specs/2026-11-19-soc-alert-triage-pack-design.md).

## Running it

`experiment.yaml` declares two targets: `qwen3.5:4b` and `qwen3.5:9b`, open-weight models published
by Qwen under Apache-2.0. Benchmark runs use these open-weight models run locally through
Ollama's OpenAI-compatible endpoint (`provider: openai`, `base_url: http://127.0.0.1:11434/v1`).
This isn't native Ollama support. Local runs have no metered cost, so no cost is reported.

```bash
bun packages/cli/bin/artemis.ts experiment validate packs/soc-alert-triage/experiment.yaml
```

### Regenerating experiment.yaml

`experiment.yaml` is generated. After changing any task file or `RUBRIC.md`, run:

```bash
bun packs/_tools/generate-experiment.ts packs/soc-alert-triage --language en --policy soc-rulebook-v1
bun test packs/soc-alert-triage
```

The pack test fails until the task digests, workload identity and rubric identity match the files
again. Budgets in `experiment.template.yaml` are sized as cases × 2 targets × 3 repetitions × 2
attempts (2,484 requests) at 6,000 tokens per request.

## Limitations

- **Unreviewed.** See the status note above.
- **Synthetic rulebook.** Passing shows that a model followed this rulebook, not that it would
  follow a real SOC's procedures. Real severity scales and approval rules differ.
- **Clean, short alerts.** Real alerts are noisier, longer and arrive with tool access. These are
  single-turn decisions on pre-collected evidence.
- **Text matching.** Checks look for exact JSON keys and values. A response that repeats a
  forbidden secret while explaining that it is withholding it still fails. An evidence step that
  begins with a disruptive verb fails even if its intent is read-only.
- **ATT&CK ambiguity.** Each case scores only the one or two techniques its evidence most directly
  supports; reasonable analysts can map some alerts differently. Extra IDs aren't penalised.
- **Small sample per situation.** 3–5 cases per task can't support fine-grained comparisons;
  0.7.x reports no uncertainty estimate.
- **English only.**

## Reviewer sign-off

| Field | Value |
| --- | --- |
| Reviewer | _pending_ |
| Qualification | _pending (SOC or incident-response practitioner)_ |
| Scope reviewed | _pending (rulebook, 52 tasks, 207 cases, reference answers)_ |
| Date | _pending_ |
| Outcome | _pending_ |
