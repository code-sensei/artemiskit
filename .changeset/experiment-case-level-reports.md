---
"@artemiskit/reports": minor
"@artemiskit/sdk": minor
"@artemiskit/cli": minor
---

Experiment reports now show a case-level summary beside the coordinate-level summary. A scenario coordinate (task × target × repetition) passes only when all of its cases pass, so coordinate counts alone understate how many individual cases passed. The case level counts planned, recorded, valid, passed, failed, invalid and unmeasured cases overall and per target, task, language and policy, read from each coordinate's terminal attempt evidence. Each saved evidence file must hash to the SHA-256 recorded in the result, parse as a run manifest and agree with the saved coordinate status; otherwise the whole case level is withheld with its reason instead of showing partial counts. Agent-workflow coordinates have no scenario cases and are counted separately. Results saved without an evidence directory still report, with case level marked unavailable.

- `@artemiskit/reports`: `createExperimentReport` and `generateExperimentReport` accept `caseEvidence` (evidence bytes keyed by recorded digest) and add `caseLevel` to the report; new `createExperimentCaseSummary` and `listExperimentCaseEvidenceDigests`. Technical, executive and comprehensive views (HTML and Markdown) label both levels and make no ranking claim; technical and comprehensive views add a per-task, language and policy table.
- `@artemiskit/sdk`: new `summarizeExperimentCases` and `formatExperimentCaseSummary`; `reportExperimentResult` reads `evidence/` beside a result file or an explicit `evidenceDir`; `runExperimentFile` returns `caseLevel`; `formatExperimentRunSummary` accepts `caseLevel`.
- `@artemiskit/cli`: `akit experiment run` and `akit experiment report` print the case level after the coordinate counts; `report` gains `--evidence-dir`.
