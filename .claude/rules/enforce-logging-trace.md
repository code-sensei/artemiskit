AI Trace Usage Guidelines (Enforcement for the @ai-trace Folder)
Purpose
The AI MUST use the ai-trace directory (git ignore it) to record a complete, auditable trace for every task it performs that affects the codebase, CI/CD, project configuration, or any external system. Traces must be written as Markdown, appended to the appropriate log files, and kept up-to-date so humans can review decisions, actions, errors, and rollback points.

Scope

- All automated actions executed by the AI that interact with repositories, infra, or production-like systems.
- All migration, extraction, refactor, or release activities.
- Any decision that impacts repo structure, versioning, or team responsibilities.
- Any error, failure, or partial result encountered by the AI.

Primary Files (required targets)

- README.md — high-level trace system documentation (update if procedures change)
- migration-log.md — detailed chronological action trace (append each action)
- errors.md — record of errors, root causes, and resolutions (create an entry for each error)
- decisions.md — recording of decisions, rationale, and implications
- rollback-points.md — checkpoints with exact commit hashes and restoration instructions

Entry Requirements (always present)
Every action or decision entry MUST contain the following fields and follow the existing log format style:

- Timestamp: ISO 8601 (UTC) e.g., 2026-01-03T09:21:00Z
- Action Title: short descriptive headline
- Status: Success | Failed | Partial
- Component: Affected component (repo path or service)
- Command: Exact command(s) run (if any). If none, describe the API or internal action.
- Agent: AI identity and version (e.g., Argus-AI v1.2.3) and operator (if human-assisted)
- Action ID: a unique id (UUID or prefixed timestamp) for cross-referencing
- Files Changed: list of files created/modified/deleted and commit hash(es)
- Result: concise output or end-state
- Effects: bullet list of codebase or system changes (including PR links and commit SHAs)
- Notes: any follow-ups, required human approvals, risk/impact, or sensitive data redaction

Template (must be used for each action)
Use the same structure as existing logs. Example template:

## [TIMESTAMP] Action Title

**Status:** Success | Failed | Partial  
**Component:** <component>  
**Agent:** <ai-id>  
**Action ID:** <uuid-or-timestamp>  
**Command:** <command or API call>

### Details

Describe what was done, why, and any prerequisites.

### Result

Output or outcome summary (include key stdout/stderr excerpts if relevant).

### Files Changed

- path/to/file — description — commit: <SHA> — PR: <url>

### Effects

- High-level consequences (deployment, config drift, version bump, etc.)

### Notes

- Follow-ups, human approvals required, sensitive data handling.

Example entry (short)

## [2026-01-03T09:21:00Z] Initialize shadcn/ui in frontend/irp

**Status:** Success  
**Component:** frontend/irp  
**Agent:** Argus-AI v1.2.0  
**Action ID:** ai-20260103-092100  
**Command:** bunx --bun shadcn@latest init --base-color gray --defaults --force --css-variables

### Details

Initialized shadcn/ui and added base components without overwriting pages.

### Result

20 components added, tailwind.config.js updated.

### Files Changed

- src/components/ui/\* — new shadcn components — commit: abc123 — PR: https://github.com/VIS-HQ/argus-frontend-irp/pull/42

### Effects

- Frontend theme extended; no pages overwritten.

### Notes

- Removed react-server-dom-webpack due to React 17 conflict.

Filing Decisions and Errors

- decisions.md: When a new policy or irreversible design choice is made, append a decision entry with Rationale, Decided By (AI or human), and Implications.
- errors.md: On any failure or partial action, create an error entry that includes root-cause analysis, attempted remediation steps, and whether human intervention is needed.

Rollback Points

- Create a rollback-point entry for any change that requires a rollback capability. Include exact commit SHAs, tags, and a one-command rollback snippet. Mark whether the rollback was tested.

Operational Rules (must be enforced)

1. Mandatory Logging: The AI must create or update an entry in migration-log.md (or the appropriate ref file) immediately after any action. If an action spans multiple steps, create intermediate entries with incremental timestamps.
2. Atomic Commits: For every log update, commit the change to the ai-trace folder in the same commit or in an immediately adjacent commit that references the action’s commit hash. Include Action ID in commit message for correlation.
3. Redaction & Secrets: NEVER include secrets or raw tokens. If logs need to reference sensitive outputs, redact them and indicate where the raw secure artifact is stored (vault path). Follow company security policy.
4. Linking: Always include links to PRs, commits, GitHub Issues, and GitHub Project items when relevant. Use absolute URLs and include the action id.
5. Validation: CI workflow will validate that new entries contain required fields. The AI MUST ensure entries pass the validator before pushing.
6. Access Control: ai-trace is authoritative—only authorized agents and humans may modify historical entries. New entries by the AI are allowed; altering past entries requires a new appended correction entry with reference to the earlier Action ID (do not delete or rewrite history).
7. Retention & Archival: Keep full trace history in the repo; when archiving, create an archive/ subfolder with a summary index and retain original files per retention policy.

Automation & Enforcement Suggestions

- Pre-commit Hook: Validate required fields and timestamp format for any change under ai-trace.
- GitHub Action: On push to any main branch, run an ai-trace-ci check ensuring:
  - For each non-trivial repo change by AI, there’s a corresponding trace entry.
  - Entries include Action ID, Agent, and Files Changed.
- PR Checklist: PRs created by the AI must include the Action ID and a pointer to the ai-trace entry in the PR description.
- Template Linter: A simple script (node/python) to assert presence of required headers and fields.
- Central Index: Keep an index.md in ai-trace that auto-updates (or is updated by AI) listing latest actions with quick links.

Review & Audit

- Human reviewers use migration-log.md and decisions.md for signoff. The AI must mark entries that require human signoff with “Approval required” in Notes and reference the GitHub Project task.
- For high-impact changes, produce a short human-readable executive summary at the top of the action entry.

Ownership & Accountability

- The AI logs its identity and version in each entry. If a human intervenes, they must append their identity and change description to the entry.
- When an automated remediation is applied, the AI should record success/failure of remediation as a subsequent log entry under the same Action ID.

Conformance Example Checklist (for the AI to verify before pushing)

- [ ] Create the trace log file for the task as needed
- [ ] Entry created or updated in migration-log.md / decisions.md / errors.md / rollback-points.md as appropriate
- [ ] All required metadata fields present (Timestamp, Status, Component, Agent, Action ID, Command)
- [ ] Files Changed listed with commit SHAs and PR links (if any)
- [ ] Sensitive data redacted
- [ ] Commit message references Action ID
- [ ] CI validator passes for ai-trace format

Failure Handling

- If a logging attempt fails (e.g., push/pre-commit error), create a local draft entry at ai-trace/drafts/<action-id>.md and retry. The AI must notify a human via the configured channel and include the draft location.

References

- Path to use for all traces: file:///Users/babangida/Desktop/Vorbtech/products/Argus/ai-trace
- Follow the existing log format and examples in migration-log.md and decisions.md.

By following these rules the AI will ensure traceability, auditability, and human-reviewability for every action it performs.
