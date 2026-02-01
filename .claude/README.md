# Claude Config

Reusable Claude Code configuration files for consistent AI assistant behavior across projects.

## Structure

```
.
├── rules/          # Enforcement rules for Claude Code
└── skills/         # Claude Code skills
```

## Usage

### Option 1: Clone as .claude folder

```bash
git clone git@github.com:code-sensei/claude-config.git .claude
```

### Option 2: Add as Git submodule

```bash
git submodule add git@github.com:code-sensei/claude-config.git .claude
```

## Rules

| Rule | Purpose |
|------|---------|
| enforce-logging-trace.md | Audit trail for AI actions |
| enforce-maintainable-code.md | Code quality standards |
| git-strategy.md | Git commit and push guidelines |
| outdated-knowledgebase-guidelines.md | Verification workflow |
| terminal-use-guidelines.md | Safe terminal usage |
| use-of-github-projects.md | GitHub Projects guidelines |
| use-of-shadcn-components.md | shadcn/ui enforcement |

## Skills

| Skill | Purpose |
|-------|---------|
| agent-browser | Browser automation for web testing |
| baoyu-image-gen | Image generation utilities |
| frontend-design | Frontend design guidelines |
| next-best-practices | Next.js development patterns |
| pdf | PDF form filling and manipulation |
| remotion-best-practices | Remotion video creation patterns |
| seo-audit | SEO analysis and recommendations |
| seo-geo | SEO/GEO/AEO optimization |
| skill-creator | Helper for creating new skills |
| social-content | Social media content creation |
| web-design-guidelines | Web design best practices |
