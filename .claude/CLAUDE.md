# NDRL-CBT Platform - Claude Code Reference

> **Purpose:** This file provides Claude Code with essential project context, conventions, and documentation links for effective assistance.

---

## Project Summary

**Name:** NDRL-CBT Platform (National Driver's License - Computer Based Test)  
**Client:** Federal Road Safety Corps (FRSC), Nigeria  
**Type:** Secure, accessible, AI-enhanced examination system  
**Status:** Phase 0 Complete - Ready for Phase 1 Development

### What This Project Does

A web-based examination platform for Nigerian driver's license testing featuring:

- Multiple-choice question (MCQ) exam engine with audio support
- Hazard perception testing with interactive video scenarios
- AI-powered proctoring (face detection, gaze tracking, tab focus)
- Multi-language support (English, Hausa, Igbo, Yoruba)
- WCAG AAA accessibility compliance
- Offline-capable PWA

---

## Tech Stack

| Category       | Technology                | Version | Notes                                   |
| -------------- | ------------------------- | ------- | --------------------------------------- |
| Framework      | Next.js                   | 16.1.4  | App Router with Turbopack               |
| Language       | TypeScript                | 5.x     | Strict mode enabled                     |
| React          | React                     | 19.2.3  | Latest concurrent features              |
| Styling        | Tailwind CSS              | v4      | CSS-first configuration                 |
| Components     | **shadcn/ui**             | Latest  | **EXCLUSIVE - no other UI libraries**   |
| State (Client) | Zustand                   | 5.x     | Simple, performant state                |
| State (Server) | TanStack Query            | 5.x     | Data fetching and caching               |
| Forms          | React Hook Form + Zod     | Latest  | Validation and form handling            |
| Animation      | Framer Motion             | 12.x    | Page transitions and micro-interactions |
| i18n           | next-intl                 | 4.x     | Multi-language support (App Router)     |
| Icons          | Lucide React              | Latest  | Consistent iconography                  |
| Testing        | Vitest + Playwright       | Latest  | Unit, integration, E2E                  |
| Mocking        | MSW                       | 2.x     | Mock Service Worker for API             |
| AI/ML          | TensorFlow.js + MediaPipe | —       | Client-side proctoring (Phase 2)        |

---

## Critical Rules

### 1. UI Components: shadcn/ui ONLY

**NEVER** use other component libraries (Material UI, Chakra, Ant Design, etc.)

```tsx
// ✓ CORRECT
import { Button } from '@/components/ui/button'

// ✗ WRONG - Do not do this
import { Button } from '@mui/material'
import { Button } from '@chakra-ui/react'
```

Reference: [.claude/rules/use-of-shadcn-components.md](.claude/rules/use-of-shadcn-components.md)

### 2. Accessibility: WCAG AAA Target

Every component must:

- Support keyboard navigation
- Work with screen readers
- Meet 7:1 contrast ratio (AAA)
- Have minimum 44x44px touch targets
- Include proper ARIA attributes

Reference: [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md)

### 3. Internationalization: 4 Languages

All user-facing text must be translatable using next-intl:

- English (en) - Primary
- Hausa (ha) - Required
- Igbo (ig) - Required
- Yoruba (yo) - Required

```tsx
// ✓ CORRECT
import { useTranslations } from 'next-intl';
const t = useTranslations('exam');
<Button>{t('submit.button')}</Button>

// ✗ WRONG - Hardcoded text
<Button>Submit Exam</Button>
```

Reference: [docs/INTERNATIONALIZATION.md](docs/INTERNATIONALIZATION.md)

### 4. Backend: Mock Everything

The backend is not yet available. Use MSW to mock all API calls.

Reference: [docs/API_MOCKING.md](docs/API_MOCKING.md)

### 5. Git: Authorization Required for Push

Do NOT push to shared remotes without explicit user authorization.

Reference: [.claude/rules/git-strategy.md](.claude/rules/git-strategy.md)

### 6. Logging: Trace All Actions

Log significant actions to the ai-trace directory.

Reference: [.claude/rules/enforce-logging-trace.md](.claude/rules/enforce-logging-trace.md)

### 7. Skill Selection: Infer and Use Skills When Relevant

Claude Code does not require explicit instructions to use available skills. For each task, todo item, or implementation step, reason about which .claude/skills (or other internal capabilities) are strictly relevant and select them automatically.

Guidelines:
- You may infer and invoke skills on your own; the user does not need to tell you which skill to use.
- Only invoke skills that materially help the task. Do not attach or run skills for trivial tasks that can be handled by reasoning alone.
- For each task where you do choose to use a skill, select the most appropriate skill(s) from .claude/skills and apply them to the specific task or subtask.
- When appropriate, briefly state which skill(s) you intend to use (or used) and why, and record that decision in ai-trace for auditability.
- Examples:
  - "Create unit tests for the exam store" → use testing skill (Vitest) and test-utils skill.
  - "Create MSW handlers for exam endpoints" → use mocking skill (MSW) and data-factory helpers.
  - "Build a new shadcn/ui component" → use component-generation or UI pattern skill.
  - "Write a short spec or plan" → may not require any external skill; prefer pure reasoning.
- When in doubt, prefer conservative selection: explain candidate skills, ask a clarifying question if necessary, then proceed.

Reference: .claude/skills/ and [.claude/rules/enforce-logging-trace.md](.claude/rules/enforce-logging-trace.md)

---

## Project Structure

```
NDRL-CBT-Platform/
├── .claude/                    # Claude Code configuration
│   ├── rules/                  # Enforcement rules (READ THESE)
│   └── skills/                 # Available skills
├── ai-trace/                   # AI action audit logs
│   └── migration-log.md
├── docs/                       # Project documentation
│   ├── README.md               # Documentation index
│   ├── PRD.md                  # Product requirements
│   ├── FEATURES.md             # Feature specifications
│   ├── ACCESSIBILITY.md        # WCAG AAA guidelines
│   ├── INTERNATIONALIZATION.md # i18n implementation
│   ├── COMPONENT_ARCHITECTURE.md # Component patterns
│   ├── API_MOCKING.md          # Mock backend strategy
│   ├── TESTING.md              # Testing guidelines
│   └── DEVELOPMENT_PHASES.md   # Implementation roadmap
├── dev-docs/                   # Design specifications
│   ├── FRSC_PROJECT_MASTER_SPEC.md
│   └── FRSC_DESIGN_SYSTEM.md
├── e2e/                        # Playwright E2E tests
│   └── home.spec.ts
├── public/                     # Static assets
│   └── mockServiceWorker.js    # MSW service worker
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── globals.css         # Tailwind + design tokens
│   │   ├── layout.tsx          # Root layout
│   │   └── [locale]/           # Locale-based routing
│   │       ├── layout.tsx      # Locale layout with providers
│   │       └── page.tsx        # Home page
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components (20 installed)
│   │   ├── layout/             # Layout components
│   │   ├── auth/               # Auth components
│   │   ├── exam/               # Exam components
│   │   └── common/             # Shared components
│   ├── hooks/                  # Custom React hooks
│   │   └── use-auth.ts
│   ├── i18n/                   # next-intl configuration
│   │   ├── config.ts           # Locale configuration
│   │   ├── navigation.ts       # i18n navigation helpers
│   │   ├── request.ts          # Server request config
│   │   └── routing.ts          # Routing definition
│   ├── lib/                    # Utilities
│   │   ├── api/client.ts       # API client
│   │   └── utils.ts            # Utility functions (cn, etc.)
│   ├── locales/                # Translation files
│   │   ├── en/common.json
│   │   ├── ha/common.json
│   │   ├── ig/common.json
│   │   └── yo/common.json
│   ├── mocks/                  # MSW mock handlers
│   │   ├── browser.ts          # Browser worker
│   │   ├── server.ts           # Node server
│   │   ├── index.ts            # Init helper
│   │   └── handlers/
│   │       ├── auth.ts
│   │       ├── exam.ts
│   │       ├── voucher.ts
│   │       └── index.ts
│   ├── stores/                 # Zustand stores
│   │   ├── auth-store.ts
│   │   └── exam-store.ts
│   ├── test/                   # Test utilities
│   │   ├── setup.ts            # Vitest setup
│   │   └── test-utils.tsx      # Testing helpers
│   └── types/                  # TypeScript types
│       └── index.ts
├── middleware.ts               # next-intl middleware
├── next.config.ts              # Next.js configuration
├── components.json             # shadcn/ui configuration
├── vitest.config.ts            # Vitest configuration
├── playwright.config.ts        # Playwright configuration
├── tsconfig.json               # TypeScript configuration
├── .prettierrc                 # Prettier configuration
├── .env.example                # Environment template
└── CLAUDE.md                   # This file
```

---

## Documentation Quick Reference

### When implementing features:

→ [docs/FEATURES.md](docs/FEATURES.md) - Acceptance criteria, user stories

### When creating components:

→ [docs/COMPONENT_ARCHITECTURE.md](docs/COMPONENT_ARCHITECTURE.md) - Patterns, structure

### When adding UI elements:

→ [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) - A11y requirements
→ [dev-docs/FRSC_DESIGN_SYSTEM.md](dev-docs/FRSC_DESIGN_SYSTEM.md) - Visual design

### When adding text/labels:

→ [docs/INTERNATIONALIZATION.md](docs/INTERNATIONALIZATION.md) - i18n patterns

### When calling APIs:

→ [docs/API_MOCKING.md](docs/API_MOCKING.md) - Mock handlers, data factories

### When writing tests:

→ [docs/TESTING.md](docs/TESTING.md) - Testing strategy, examples

### When planning work:

→ [docs/DEVELOPMENT_PHASES.md](docs/DEVELOPMENT_PHASES.md) - Phases, tasks, milestones

### For full product context:

→ [docs/PRD.md](docs/PRD.md) - Complete requirements

---

## Design System Tokens

### Colors (defined in globals.css)

```css
--cream: #faf9f6; /* Main background */
--black: #111111; /* Primary text */
--frsc-green: #006b3f; /* Primary actions, success */
--frsc-yellow: #fcd116; /* Warnings, accent */
--muted: #e8e7e4; /* Muted backgrounds */
--border: #e0dfdc; /* Borders */
```

### Typography

- Font: Inter, system-ui, sans-serif
- Base size: 1.125rem (18px) for accessibility
- Headings: Bold, tracking-tight

### Spacing & Rounding

- Cards: `rounded-lg` (0.5rem)
- Buttons: `rounded-md`
- Touch targets: minimum 44x44px

---

## Common Patterns

### Component with Accessibility & i18n

```tsx
import { useTranslations } from 'next-intl'

function ExampleComponent() {
  const t = useTranslations('common')

  return (
    <div role="region" aria-labelledby="section-heading">
      <h2 id="section-heading">{t('section.title')}</h2>
      <Button
        aria-label={t('action.description')}
        className="min-h-[44px] min-w-[44px]"
      >
        {t('action.label')}
      </Button>
    </div>
  )
}
```

### Page Component (App Router)

```tsx
import { useTranslations } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'

type Props = {
  params: Promise<{ locale: string }>
}

export default async function PageName({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  return <PageContent />
}

function PageContent() {
  const t = useTranslations('pageName')
  return <div>{t('title')}</div>
}
```

### Using Link with i18n

```tsx
import { Link } from '@/i18n/navigation'
;<Link href="/login">{t('nav.login')}</Link>
```

---

## Current Development Phase

**Phase 0: Project Setup** ✅ Complete

**Phase 1: MVP Core** ✅ Complete (100%)

### Completed:

- ✅ Sprint 1.1: Authentication (login, register, protected routes, password recovery)
- ✅ Sprint 1.2: Dashboard & Navigation (layout, mobile nav, language selector, profile)
- ✅ Sprint 1.3: Hardware Gate (browser, screen, camera, microphone checks)
- ✅ Sprint 1.4: MCQ Engine Core (exam store, questions, answers, timer)
- ✅ Sprint 1.5: MCQ Engine Complete (navigator, flags, TTS, submit dialog, results)
- ✅ Sprint 1.6: Proctoring & Polish (tab focus detection, violation overlay, translations)
- ✅ App mode system (development, presentation, production)
- ✅ MSW mock API with test accounts
- ✅ Docker containerization
- ✅ Viewport-fit UX for all exam pages (no scrolling on desktop)

### Ready for Phase 2:

- Hazard Perception Engine (video player, response capture)
- Full Proctoring (face detection, gaze tracking via MediaPipe)
- Admin Portal basics

See: [docs/DEVELOPMENT_PHASES.md](docs/DEVELOPMENT_PHASES.md)

---

## Available Scripts

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type checking
npm run test         # Run unit tests (Vitest)
npm run test:ui      # Run tests with UI
npm run test:e2e     # Run E2E tests (Playwright)
npm run format       # Format code (Prettier)
```

---

## Key Information

### Supported Browsers

- Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

### Supported Languages

| Code | Language | Locale Files    |
| ---- | -------- | --------------- |
| en   | English  | src/locales/en/ |
| ha   | Hausa    | src/locales/ha/ |
| ig   | Igbo     | src/locales/ig/ |
| yo   | Yoruba   | src/locales/yo/ |

### Exam Configuration

- MCQ: 50 questions, 45 minutes, 70% to pass
- Hazard: 14 clips, 20 minutes, 60% to pass

### User Roles

- `candidate` - Exam takers
- `admin` - Administrators
- `super_admin` - System administrators

---

## Reminders

1. **Always check accessibility** - Run keyboard navigation tests
2. **Always use translations** - No hardcoded user-facing strings
3. **Always use shadcn/ui** - Check if a component exists before creating
4. **Always mock APIs** - No real backend calls until Firebase is ready
5. **Always test keyboard navigation** - Tab through new components
6. **Log significant actions** - Use ai-trace for audit trail
7. **Use path aliases** - Import from `@/` not relative paths
