Purpose
This guide explains how and when to make Git commits so history stays clear, reviewable, and safe. Important: pushes to any shared remote require explicit authorization from me. Do not push to shared remotes (origin, upstream, main, master, production, staging, etc.) without that authorization.

When to commit
- Commit frequently enough that each commit represents a single logical change (an "atomic" change).
- Commit when:
  - You finish a small unit of work (fix a bug, add a small feature, update docs).
  - You reach a stable checkpoint and want to save progress.
  - You add tests for behavior you implemented or fixed.
- Avoid committing:
  - Partially completed features that break tests or build unless saved to a local WIP branch for personal work.
  - Generated build artifacts or secrets (use .gitignore).

How to commit (recommended workflow)
1. Default branch workflow:
   - For now, commit to main by default. Create a branch only when a task is large or complex and you believe a branch will make the work safer or easier to review — ask for approval if unsure.
   - If approved, create a branch: git checkout -b feature/description
2. Stage only related changes:
   - git add path/to/file1 path/to/file2
   - Or interactively: git add -p
3. Run linters, formatters, and tests locally.
4. Commit with a clear message using the standard format below.
5. Repeat until the unit of work is complete.

Standard commit message format (explicit)
- Template:
  <type>(<scope>): Short imperative summary

  Detailed description of what and why. Explain reasoning, side effects,
  migration steps, and any testing done. Wrap at ~72 chars per line.

  Footer: reference issues or tickets, e.g., "Fixes #123" or "Refs #456".
- Common types: feat, fix, docs, chore, refactor, test, perf, ci, revert, build.
- Example:
  feat(auth): add token refresh on 401 responses

  Automatically refresh the access token when a 401 response is received to
  reduce user disruptions. Retry the original request once the token is
  refreshed. Added unit tests and an integration test for the refresh flow.

  Fixes #456

Commit message tips
- Use the imperative present tense: "Add", "Fix", "Refactor".
- Keep the summary <= 50 characters when possible.
- Separate summary and body with a blank line.
- Put references or breaking change notes in the footer.

Branching and naming
- Default: keep work on main for small, routine changes to avoid branch proliferation.
- Use a branch when a task is large/long-lived or when isolation is beneficial — ask for approval when in doubt.
- If a branch is used, use descriptive names: feature/<short-desc>, fix/<short-desc>, chore/<short-desc>, hotfix/<short-desc>.
- Keep branches focused on a single concern.

Testing and pre-commit checks
- Run unit tests and integration tests relevant to your change before committing.
- Use pre-commit hooks (formatters, linters) to avoid style-only commits.
- If a change fails CI locally, fix it before creating a pull request.

Push and merge policy (authorization required)
- Do not push to shared remotes without explicit authorization from me.
- Preferred flow before asking to push:
  1. Commit locally on main or on an approved branch, following this guide.
  2. Push to a personal or feature fork/branch only if the repo rules allow it; otherwise keep changes local.
  3. Prepare a concise PR description including changes, testing done, and CI status.
  4. Request authorization to push (provide the target branch name or note that the change is for main, a summary, and CI/local test results).
- How to request authorization:
  - Provide the branch name (or state "main"), a one-paragraph summary of changes, list of tests run and results, and any reviewers you suggest.
  - Wait for explicit approval. Once approved, push using the agreed remote/branch (e.g., git push origin feature/description or git push origin main).
- Emergency hotfixes also require authorization; if an emergency process exists, follow it and notify me immediately.

When to amend, squash, rebase, or revert
- Amend small, recent commits before they are shared:
  - git commit --amend
- Squash logically related fixup commits before merging to keep history clean (typically during PR preparation).
- Rebase locally to keep a linear history when appropriate, but avoid rebasing published commits shared with others.
- Use git revert for reverting commits that have already been pushed to shared branches.

Code review and PRs
- Open a Pull Request (or merge request) with clear description and tests.
- Request at least one reviewer, include links to related issues and design notes.
- Respond to review comments with small, focused commits or amend/squash as directed.

Checklist before requesting push authorization
- [ ] Commits are atomic and well described.
- [ ] Linters and formatters run clean.
- [ ] Unit/integration tests pass locally.
- [ ] If using a branch, branch name follows conventions.
- [ ] PR description prepared (what, why, testing).
- [ ] CI passes (if already pushed to a fork/branch allowed by policy).

Handling mistakes
- If you accidentally commit sensitive data, notify immediately and follow repository incident procedures (do not just force-push history without coordination).
- If an accidental push occurs, contact me right away for remediation instructions.

Final notes
- The goal is clarity and minimal friction: short, logical commits that make history useful.
- Remember: pushing to shared remotes is gated — explicit authorization from me is required every time.
