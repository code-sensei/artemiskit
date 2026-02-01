# GitHub Projects: Comprehensive Guide to Managing Tasks Consistently

This guide describes how to use GitHub Projects (classic and the newer "Projects" / "Projects Beta"/"Projects Next") to manage work consistently using proven best practices. It covers project design, workflows, automation, fields and views, triage, metrics, governance, and example patterns you can adopt.

---

## Goals and principles

- Make work visible and discoverable: every piece of work should be represented by an Issue, Pull Request, or a project card that links to them.
- Single source of truth: avoid duplicating status in multiple places; prefer linking issues/PRs to project cards rather than keeping separate copies.
- Keep work small and actionable: prioritize breaking large items (epics) into smaller issues with clear acceptance criteria.
- Automate routine movements and updates to reduce human error and keep boards accurate.
- Use consistent naming, labels, templates, and fields so everyone interprets metadata the same way.
- Periodically review and clean the project to avoid drift and stale items.

---

## Key concepts

- Issue: the primary unit of work (bug, feature, task).
- Pull Request (PR): code changes that implement work; should link to the issue(s) they close.
- Project: a board/view containing cards that represent issues, PRs, or notes.
- Column (Kanban): stages of work (Backlog → In Progress → Review → Done).
- Custom fields: structured metadata (Priority, Effort, Area).
- Automation: built-in rules or scripts that move cards, assign labels, set fields, etc.
- Views: filtered or grouped project views (by assignee, milestone, label, field).

---

## Project structure (recommended)

Use a single project per product-area or per-team, not one per sprint. Example columns for a Kanban workflow:

- Icebox / Ideas: things to consider (low-cost, low-priority, no schedule)
- Backlog: triaged work awaiting prioritization
- Ready / Next: ready to be worked on next (groomed, acceptance criteria defined)
- In Progress: actively being worked on
- Review / QA: PRs or testing in progress
- Blocked (optional): items that are blocked with a reason
- Done: completed (auto-moved when PR merged or issue closed)

Set explicit criteria for when cards move between columns (e.g., "Ready" must have an assignee, estimation, and acceptance criteria).

---

## Custom fields and labels

Use a small, consistent set of custom fields and labels. Example fields:

- Priority: P0 / P1 / P2 / P3
- Effort: XS / S / M / L / XL or estimated hours/stories points
- Type: bug / feature / chore / docs / spike
- Area / Component: UI / Backend / CI / API / Mobile
- Epic: reference to parent epic/initiative

Labels can be used for rapid filtering and automation but avoid turning labels into dozens of ad-hoc fields — prefer structured custom fields where available.

---

## Issue and PR discipline

- Create issues from user stories or bugs with:
  - Summary title
  - Clear description with reproducible steps or acceptance criteria
  - Linked PRs and related issues
  - Priority, effort, and area fields set during triage
- Use issue templates and PR templates to standardize content (context, how to test, screenshots).
- Reference issues in PR descriptions (e.g., "Closes #123") so GitHub automatically links and closes issues on merge.
- Assign a single owner (assignee) for work items; use reviewers on PRs for code review clarity.

---

## Automation patterns

Leverage built-in automation or GitHub Actions + GraphQL/REST API for advanced workflows.

Common automation rules:

- When an issue is added to Backlog, set "Type" and "Priority" if missing (or notify for triage).
- When an issue is assigned, move to "In Progress".
- When a PR is opened/linked to an issue, move the issue to "Review".
- When a PR is merged, close the issue and move card to "Done".
- When an issue is closed, archive or move to a "Done" column and set resolution metadata.

Examples:

- Auto-move card to "Review" when PR transitions to "Open/Ready for review".
- Auto-set Effort from label or estimate comment.

Note: keep automation readable and limited — too many complex rules make debugging hard.

---

## Workflows and lifecycle examples

1. Triage workflow (weekly)
   - Review new issues in the "Inbox".
   - Apply labels, priority, effort; add to Backlog or Icebox.
   - Remove duplicates and close invalid issues with a standardized comment.

2. Sprint/Iteration (if using sprints)
   - Create a sprint view or milestone; drag items from Backlog to Sprint / Next.
   - Aim for committed work < capacity.
   - Track progress using a board and a simple burndown.

3. Kanban flow
   - Pull items when ready and capacity exists (WIP limit).
   - Keep columns concise and move cards as status changes.
   - Use the "Cycle time" metric to find bottlenecks.

---

## Prioritization and capacity

- Prioritize with a small set of priorities (P0/P1/P2) and enforce during triage.
- Use Effort estimates to plan capacity; prefer relative sizing (T-shirt or story points) over fine-grained hours.
- Set Work-in-Progress (WIP) limits for "In Progress" to reduce context switching and increase throughput.

---

## Epics, milestones, and releases

- Use Epics to group related issues; represent epics as issues themselves or as a parent field.
- Use milestones for time-based groupings (releases/sprints). Connect milestone to a project view for release planning.
- For long-lived initiatives, consider a separate "Initiatives" project with linked child issues across team projects.

---

## Views, filters, and saved queries

- Create saved views for common slices:
  - My work (assignee = me, status not Done)
  - Blocked (status = Blocked)
  - High priority (Priority = P0 or label "hotfix")
  - Release X scope (Milestone = v1.2)
- Use grouping (by assignee, by priority, by area) to support standups and planning sessions.

---

## Standups, planning, and reviews

- Use the project board during standups to surface blockers and in-progress items.
- For planning, prep the "Ready" column with items meeting the definition of ready.
- Post-mortem/retrospective: use custom fields or labels to tag root causes and track continuous improvements.

---

## Metrics and reporting

Track a few key metrics:

- Throughput: completed issues per week/sprint.
- Cycle time: time from "In Progress" to "Done".
- Lead time: time from issue creation to Done.
- Open vs closed trend (burn-up).
- Cumulative flow diagram (if your tooling supports it).

Use these metrics to identify bottlenecks, not to micromanage individuals.

---

## Governance and permissions

- Define who can edit projects, fields, and automation. Prefer limiting to project managers or repo admins for structural changes.
- Use contributor-friendly rules for creating issues/PRs to encourage reporting while keeping triage centralized.
- Document project rules and conventions in the repo's CONTRIBUTING.md and the project description.

---

## Maintenance and hygiene

- Weekly or bi-weekly triage ritual to process the "Inbox" and stale issues.
- Close or archive stale issues and cards older than a defined threshold (e.g., 90 days) after outreach.
- Periodically review automation rules and custom fields for relevance.

---

## Integrations and advanced automation

- GitHub Actions: use actions to update project cards, set fields, or sync statuses when events occur (issue opened, PR merged).
- External tools: integrate CI/CD, Slack, or project reporting tools for notifications and dashboards.
- API usage: use the GraphQL API for bulk updates, analytics, or custom workflows (e.g., auto-linking issues to epics).

---

## Sample templates and examples

Issue template checklist (trim to essentials):

- Summary
- Motivation / user value
- Acceptance criteria
- Steps to reproduce (for bugs)
- Suggested area/component
- Estimate (Effort)
- Priority

PR template essentials:

- Related issue(s) and "Closes #"
- Short description of change
- Testing instructions
- Checklist (lint, tests, docs)

Sample column touch rules:

- Move card to "Ready" only after an issue has acceptance criteria and an estimate.
- Move to "In Progress" when the assignee opens a branch and links the PR.
- Move to "Review" when a PR is opened and assigned reviewers.
- Move to "Done" automatically upon merge.

---

## Do's and Don'ts

Do:

- Keep issues small and actionable.
- Use templates and automation.
- Make the board the single source of truth for status.
- Periodically review and prune the board.

Don't:

- Use the board as the sole place for requirements (keep details in the issue body).
- Create hundreds of ad-hoc labels or fields without governance.
- Rely entirely on manual moves; automate obvious transitions.
- Let backlogs fill without triage — stale items reduce signal-to-noise.

---

## Onboarding checklist for new contributors

- Read CONTRIBUTING.md and project board rules.
- Learn how to file an issue: use templates and set minimal fields.
- Find "My work" view and claim work via assignment.
- Review project automation rules and accepted workflows.

---

## Closing advice

Start small: adopt a simple board and a few fields first. Iterate on naming, automation, and views as the team matures. Measure a couple of metrics (cycle time, throughput) and use them to drive conversations about process improvements — not to penalize people. With consistent conventions, disciplined triage, and light automation, GitHub Projects becomes a powerful single source of truth for team work.
