# Enforcing Maintainable Code Throughout the Codebase

## Purpose

This document establishes mandatory standards for writing maintainable, readable, and sustainable code. All code contributions must adhere to these principles to ensure the codebase remains understandable, modifiable, and scalable over time. Maintainability is not optional—it is a core requirement for every change.

---

## Scope

Applies to:

- All new code (features, bug fixes, utilities, scripts).
- Refactors and modifications to existing code.
- Configuration files, build scripts, and infrastructure-as-code.
- Tests and test utilities.
- Documentation that accompanies code.

---

## Core Principles

### 1. Readability First

- **Write code for humans, not just machines.** Code is read far more often than it is written. Prioritize clarity over cleverness.
- **Use meaningful names.** Variables, functions, classes, and files should have descriptive names that convey intent.
  - Bad: `const d = getData();`
  - Good: `const activeUserAccounts = fetchActiveUserAccounts();`
- **Avoid abbreviations** unless they are universally understood within the domain (e.g., `id`, `url`, `api`).
- **Keep lines reasonably short.** Aim for 80-120 characters; break long lines logically.

### 2. Single Responsibility

- **Functions should do one thing.** If a function name requires "and" to describe it, split it.
- **Classes/modules should have one reason to change.** Group related functionality; separate unrelated concerns.
- **Files should have a clear, focused purpose.** Avoid "utils.ts" dumping grounds; create specific utility modules.

### 3. DRY (Don't Repeat Yourself) — With Judgment

- **Eliminate true duplication** where the same logic serves the same purpose.
- **Avoid premature abstraction.** Two or three similar code blocks are acceptable if they serve different contexts. Abstract only when you have three or more genuine duplicates with identical intent.
- **Prefer explicit over implicit.** Sometimes a little repetition is clearer than a complex abstraction.

### 4. KISS (Keep It Simple, Stupid)

- **Choose the simplest solution that works.** Complexity should be justified by requirements, not anticipated needs.
- **Avoid over-engineering.** Do not add configurability, extensibility, or abstraction layers for hypothetical future requirements.
- **Flatten nested structures.** Deep nesting (>3 levels) harms readability; use early returns, guard clauses, or extraction.

### 5. Explicit Over Implicit

- **Make dependencies visible.** Use explicit imports, dependency injection, and clear parameter passing.
- **Avoid magic values.** Use named constants or enums instead of hardcoded numbers or strings.
- **Document non-obvious behavior.** If code does something surprising or has important constraints, add a comment explaining why.

---

## Code Organization

### File and Folder Structure

- **Group by feature or domain**, not by file type (prefer `features/auth/` over `controllers/`, `services/`, `models/` scattered).
- **Keep related files close.** Tests should live near the code they test. Styles should live near components.
- **Use index files sparingly.** Barrel exports can obscure dependencies and hurt tree-shaking; use them only for public APIs.

### Naming Conventions

- **Files:** Use kebab-case for files (`user-service.ts`, `auth-controller.ts`). Match the primary export name.
- **Components:** Use PascalCase for React/Vue components (`UserProfile.tsx`).
- **Functions/Variables:** Use camelCase (`getUserById`, `isActive`).
- **Constants:** Use SCREAMING_SNAKE_CASE for true constants (`MAX_RETRY_COUNT`, `API_BASE_URL`).
- **Types/Interfaces:** Use PascalCase (`UserAccount`, `ApiResponse`).
- **Booleans:** Prefix with `is`, `has`, `can`, `should` (`isLoading`, `hasPermission`).

### Module Boundaries

- **Define clear public APIs.** Export only what other modules need; keep internals private.
- **Avoid circular dependencies.** If two modules import each other, refactor to extract shared code or invert dependencies.
- **Respect layer boundaries.** UI should not directly access database; services should not know about HTTP frameworks.

---

## Function and Method Design

### Parameters

- **Limit parameters to 3-4 maximum.** Use an options object for more.
- **Use destructuring** to make parameter usage clear at call sites.
- **Provide sensible defaults** where appropriate.
- **Order parameters** from most to least important; required before optional.

### Return Values

- **Be consistent.** A function should return the same type in all code paths (avoid returning `string | undefined | null`).
- **Prefer returning values over mutating parameters.**
- **Use Result/Either types** for operations that can fail in expected ways rather than throwing exceptions for control flow.

### Function Length

- **Aim for functions under 30 lines.** If a function exceeds 50 lines, strongly consider splitting it.
- **Extract helper functions** for distinct logical steps within a larger operation.

### Side Effects

- **Isolate side effects.** Pure functions are easier to test and reason about.
- **Document side effects** in function comments when they exist.
- **Prefer immutability.** Avoid mutating input parameters or shared state.

---

## Error Handling

### General Principles

- **Handle errors at the appropriate level.** Don't catch errors just to re-throw them without adding value.
- **Fail fast.** Validate inputs early and fail immediately with clear messages.
- **Provide context.** Error messages should explain what went wrong and, if possible, how to fix it.

### Patterns

- **Use typed errors** or error codes for programmatic handling.
- **Log errors with context** (user ID, request ID, input values) without exposing sensitive data.
- **Avoid silent failures.** If an operation fails, it should either throw, return an error type, or log a warning.

### Avoid

- **Empty catch blocks.** If you must swallow an error, add a comment explaining why.
- **Catching generic exceptions** unless at the top-level boundary (API handler, event loop).
- **Using exceptions for control flow** in expected scenarios (use Result types instead).

---

## Comments and Documentation

### When to Comment

- **Explain why, not what.** Code shows what; comments explain non-obvious reasoning.
- **Document public APIs.** Exported functions, classes, and modules need JSDoc/TSDoc describing purpose, parameters, return values, and exceptions.
- **Mark technical debt.** Use `TODO:` with a ticket reference or explanation. Avoid orphan TODOs.
- **Explain complex algorithms.** If implementing a non-trivial algorithm, link to resources or explain the approach.

### When Not to Comment

- **Obvious code.** `// increment counter` before `counter++` adds noise.
- **Outdated information.** Wrong comments are worse than no comments. Update or remove stale comments during changes.

### Documentation Files

- **Keep README files current.** Each significant module or service should have a README explaining purpose, setup, and usage.
- **Document architecture decisions.** Use ADRs (Architecture Decision Records) or the project's `decisions.md` for significant choices.

---

## Testing for Maintainability

### Test Quality

- **Tests are code too.** Apply the same maintainability standards to tests.
- **Use descriptive test names.** `it('should return null when user is not found')` over `it('test1')`.
- **One assertion per test** (logical assertion; multiple `expect` calls for the same behavior are fine).
- **Avoid test interdependence.** Each test should be able to run in isolation.

### Test Organization

- **Mirror source structure.** `src/services/user-service.ts` → `tests/services/user-service.test.ts` or co-locate as `user-service.test.ts`.
- **Separate unit, integration, and e2e tests** with clear naming or folders.
- **Use test utilities and factories** to reduce setup boilerplate, but keep them simple.

### What to Test

- **Test behavior, not implementation.** Tests should not break when refactoring internals.
- **Cover edge cases and error paths.** Happy path alone is insufficient.
- **Avoid testing third-party code.** Mock external dependencies at boundaries.

---

## Dependencies and Imports

### Import Hygiene

- **Order imports consistently:** external packages → internal modules → relative imports → types/interfaces.
- **Avoid deep imports** into other modules' internals (`import { x } from '../other-module/internal/helper'`).
- **Remove unused imports.** Configure linting to catch these automatically.

### Dependency Management

- **Minimize dependencies.** Each dependency is a maintenance burden. Evaluate necessity before adding.
- **Pin versions** in lock files; review dependency updates carefully.
- **Prefer well-maintained packages** with active communities and clear security practices.
- **Wrap third-party libraries** at boundaries so they can be replaced if needed.

---

## Code Review Checklist (Maintainability Focus)

Before approving or merging, verify:

- [ ] Names are clear and descriptive.
- [ ] Functions are focused and reasonably sized.
- [ ] No unnecessary complexity or over-engineering.
- [ ] Error handling is appropriate and informative.
- [ ] Public APIs are documented.
- [ ] Non-obvious code has explanatory comments.
- [ ] Tests are clear, focused, and maintainable.
- [ ] No dead code, unused imports, or commented-out code.
- [ ] Consistent formatting and style (enforced by linter/formatter).
- [ ] No hardcoded magic values; constants are named and documented.
- [ ] Dependencies are justified and minimal.

---

## Refactoring Guidelines

### When to Refactor

- **Boy Scout Rule:** Leave code cleaner than you found it, but within reason for the scope of your change.
- **During feature work:** If you must modify unmaintainable code, improve it incrementally.
- **Dedicated refactoring:** For larger cleanups, create separate PRs to isolate risk.

### How to Refactor Safely

- **Ensure test coverage** before refactoring. If tests are missing, add them first.
- **Make small, incremental changes.** Each commit should leave the codebase in a working state.
- **Verify behavior preservation.** Run tests frequently; use snapshot or approval tests for complex outputs.
- **Document the refactoring rationale** in the PR description.

### What to Refactor

- **Long functions** → extract smaller functions.
- **Deep nesting** → early returns, guard clauses.
- **Duplicate code** → shared utilities (when appropriate).
- **Unclear names** → rename for clarity.
- **God classes/modules** → split by responsibility.
- **Tangled dependencies** → introduce interfaces, invert dependencies.

---

## Anti-Patterns to Avoid

| Anti-Pattern           | Problem                            | Solution                             |
| ---------------------- | ---------------------------------- | ------------------------------------ |
| God Object             | One class/module does everything   | Split by responsibility              |
| Spaghetti Code         | Tangled control flow, no structure | Extract functions, use clear flow    |
| Copy-Paste Programming | Duplicated code drifts apart       | Extract shared logic (judiciously)   |
| Magic Numbers/Strings  | Unclear intent, error-prone        | Use named constants                  |
| Premature Optimization | Complexity without measured need   | Profile first, optimize hot paths    |
| Premature Abstraction  | Abstraction before pattern emerges | Wait for 3+ genuine duplicates       |
| Dead Code              | Unused code causes confusion       | Delete it; version control remembers |
| Commented-Out Code     | Clutter and confusion              | Delete it; version control remembers |
| Inconsistent Naming    | Mental overhead, errors            | Follow conventions consistently      |
| Deep Nesting           | Hard to follow logic               | Early returns, extraction            |
| Long Parameter Lists   | Hard to use correctly              | Options objects, builder pattern     |
| Boolean Parameters     | Unclear at call site               | Use enums or options objects         |

---

## Enforcement

### Automated Checks

- **Linting:** ESLint/Biome rules for code style, complexity limits, and import order.
- **Formatting:** Prettier/Biome for consistent formatting.
- **Complexity metrics:** Configure max cyclomatic complexity and function length warnings.
- **Type checking:** Strict TypeScript settings (`strict: true`, `noImplicitAny`, etc.).
- **Import analysis:** Tools to detect circular dependencies and unused exports.

### Code Review

- Reviewers must verify maintainability standards are met before approval.
- Maintainability concerns are valid grounds for requesting changes.

### Exceptions

- If a maintainability guideline cannot be followed, document the reason in a code comment and the PR description.
- Exceptions require reviewer acknowledgment.

---

## Metrics and Monitoring

Track these metrics to monitor codebase health:

- **Cyclomatic complexity** per function/file.
- **Lines of code** per function/file (with context).
- **Test coverage** (aim for meaningful coverage, not 100% vanity metrics).
- **Technical debt** items (tracked TODOs, known issues).
- **Dependency count** and update freshness.
- **Code churn** (files frequently modified may need refactoring).

---

## Summary

Maintainable code is:

1. **Readable** — Clear names, simple structure, appropriate comments.
2. **Focused** — Single responsibility, minimal scope, no unnecessary complexity.
3. **Consistent** — Follows conventions, predictable patterns, uniform style.
4. **Tested** — Adequate coverage with clear, maintainable tests.
5. **Documented** — Public APIs explained, non-obvious decisions recorded.
6. **Minimal** — No dead code, no unused dependencies, no premature abstraction.

Every contribution should leave the codebase in a better state than before. Maintainability is a shared responsibility and a continuous practice, not a one-time effort.
