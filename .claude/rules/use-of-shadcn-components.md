Purpose
This document is the single authoritative guideline for UI implementation in this project: all UI must be built with and derived from the shadcn/ui component library (referred to below as "shadcn" or "the library"). The goal is consistency, accessibility, maintainability, and predictable theming across the codebase. No other component libraries or raw UI primitives (Material, Chakra, Ant, plain Bootstrap components, etc.) should be introduced without following the Exceptions procedure (see Enforcement & Exceptions).

Scope
Applies to:

- New components, pages, and layouts.
- Updates or refactors of existing UI.
- Visual/interaction prototyping that will ship to production.
  Does not apply to:
- Non-UI assets (images, raw data).
- Back-end-only code or server-side utilities.

Core Principles

- Composition over reinvention: Prefer composing and extending shadcn components rather than building new UI primitives from raw HTML/CSS.
- Consistency: Use library components for identical or similar UI to ensure uniform behavior and visuals.
- Accessibility-first: Respect and extend the built-in accessibility features; if you must change behavior, document rationale and testing.
- Theming and tokens: Use global design tokens and Tailwind theme variables (or the project's token system) so styles remain consistent.
- Minimal surface API: Surface only the props your team needs; avoid duplicating the entire library API unless required.

Permitted and Required Usage

- Required: All interactive and visible UI should be implemented using shadcn components or components that are direct compositions/wrappers around shadcn components.
- Allowed: Small styled wrappers that only adapt look/props to application-specific needs (e.g., linking a Button to your router).
- Not allowed: Importing other UI libraries for components that shadcn already provides (modals, buttons, inputs, dropdowns, tooltips, etc.). Recreate functionality only by composing shadcn primitives.

Import conventions

- Prefer the central UI export defined by the project (for example: import { Button } from "@/components/ui") so we can swap or augment implementations in one place.
- If no central barrel exists, import directly from the project's shadcn component path but submit a follow-up PR to add a centralized export.

Component Creation & Modification Guidelines

1. Try composition first
   - Build new components by composing shadcn components rather than writing new markup/styling from scratch.
   - Example: create a ConfirmDialog that composes shadcn Dialog, DialogTrigger, DialogContent, DialogHeader.

2. Keep adaptations thin
   - If you need a project-specific Button variant, create a small wrapper that sets defaults (size, variant) and forwards className and additional props.
   - Export wrappers from the central ui entry point.

3. When modifying library components
   - Changes to core shadcn components must maintain (or improve) accessibility and not break existing usages.
   - Prefer adding optional props over breaking changes.
   - Document behavioral changes and update Storybook examples.

4. Creating new base primitives
   - Only introduce new base primitives if the required behavior cannot be achieved by composition.
   - New primitives must follow the project’s naming conventions and live under the shared ui directory.

Styling and Theming

- Tailwind-first
  - Use Tailwind utility classes and the project Tailwind config. Do not add inline styles unless absolutely necessary and documented.
- Theme tokens
  - Use design tokens (colors, spacing, radii) provided by the project. If a token is missing, open a design tokens PR rather than hardcoding values.
- className handling
  - Use the canonical merge utility (e.g., cn/clsx/twMerge used in the project) when composing className to avoid specificity issues.
- Variants
  - Prefer variant APIs exposed by shadcn components. If you need new variants, add them at the component wrapper level and keep the implementation minimal.

Accessibility

- Default to shadcn’s accessibility features. They provide keyboard handling, ARIA, and focus management—do not remove these.
- If you must change a11y behavior:
  - Provide a clear rationale in the PR description.
  - Add automated tests for keyboard/focus behavior where applicable.
  - Add or update Storybook stories demonstrating keyboard usage and screen reader labels.
- Auditing: use axe, cypress-axe, or the project's chosen tools in CI to catch regressions.

Testing & QA

- Unit tests: include focused tests for any added logic in new wrappers/components.
- Visual regression: add Storybook snapshots or Chromatic tests for components that change visuals.
- Integration testing: components that handle complex interaction (dialogs, popovers, nested menus) should have interaction tests (Cypress/Testing Library).

Documentation & Storybook

- Every new or modified component should have at least one Storybook story showing:
  - Default usage.
  - Common variants.
  - Accessibility attributes if relevant.
- Stories are the canonical examples for usage by designers and other developers.

Developer Workflow & Patterns

- API design:
  - Keep props minimal and intuitive. Accept children for layout/composition and forward refs when exposing interactive DOM nodes.
  - Use explicit prop names for intent (e.g., confirmLabel instead of label when it's a confirm button) to avoid ambiguity.
- Folder structure (recommended)
  - src/components/ui/\* -> shadcn-sourced or composed components
  - src/components/_ -> page-specific or feature-level components that compose ui/_
- Expose central UI barrel:
  - src/components/ui/index.tsx exports the project’s curated set of components and wrappers.
- Migration:
  - When refactoring older UI to shadcn, convert incrementally. Replace like-for-like and run visual tests to ensure parity.

PR Checklist (must be completed before merge)

- [ ] UI uses shadcn components or approved wrappers only.
- [ ] No raw alternative UI libraries included.
- [ ] Accessibility checks added/verified.
- [ ] Storybook story added or updated.
- [ ] Unit and visual tests added/updated where appropriate.
- [ ] PR description documents any deviations from the library’s defaults.
- [ ] Code follows naming and folder conventions.

Enforcement & Exceptions

- Automated checks:
  - Lint rules should detect direct imports from disallowed UI libraries; ensure these rules are present and enabled in CI.
- Exceptions:
  - If a use-case cannot be implemented using shadcn composition, create an Exception RFC describing:
    - Why shadcn cannot cover the need.
    - Proposed alternative and its implications (bundle size, accessibility).
    - Migration plan if the exception is temporary.
  - Exceptions require approval from the tech lead and UI/Design lead.

Versioning & Upgrades

- When upgrading shadcn:
  - Test all components in Storybook and run visual testing.
  - Pay attention to breaking changes in the upstream library and update wrappers to isolate the rest of the codebase.
  - Document upgrade outcomes in the PR.

Examples (short)

1. Simple wrapper
   - Purpose: set default variant for project use.
   - Pattern:
     import { Button as ShadcnButton } from "@/components/ui/base";
     export function Button(props) {
     return <ShadcnButton variant="secondary" {...props} />;
     }

2. Composed component (ConfirmDialog)
   - Compose Dialog, DialogTrigger, DialogContent. Surface only what the app needs (open, onConfirm).

3. Adding a variant
   - Add a variant at the wrapper level using className + merge utility; do not alter the upstream library asset unless you submit a shared-library update and tests.

Final notes

- Treat the shadcn library as the canonical source for UI primitives. Use wrappers to codify project conventions. Keep changes minimal, documented, accessible, and test-covered. When in doubt, prefer composition and consult the UI lead before adding exceptions.
