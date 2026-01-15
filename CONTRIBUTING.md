# Contributing to ArtemisKit

Thank you for your interest in contributing to ArtemisKit! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Issues

Before creating an issue, please:

1. Search existing issues to avoid duplicates
2. Use the issue templates when available
3. Include as much detail as possible:
   - ArtemisKit version (`artemiskit --version`)
   - Node.js/Bun version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior

### Suggesting Features

Feature requests are welcome! Please:

1. Check the [ROADMAP.md](ROADMAP.md) to see if it's already planned
2. Open an issue with the "Feature Request" label
3. Describe the use case and expected behavior

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the coding standards** (see below)
3. **Write tests** for new functionality
4. **Update documentation** if needed
5. **Run all checks** before submitting

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 18+
- Git

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/artemiskit.git
cd artemiskit

# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint
```

### Project Structure

```
artemiskit/
├── packages/
│   ├── cli/              # @artemiskit/cli - Command-line interface
│   ├── core/             # @artemiskit/core - Core runtime and types
│   ├── reports/          # @artemiskit/reports - Report generation
│   ├── redteam/          # @artemiskit/redteam - Red team mutations
│   └── adapters/
│       ├── anthropic/    # @artemiskit/adapter-anthropic
│       ├── openai/       # @artemiskit/adapter-openai
│       └── vercel-ai/    # @artemiskit/adapter-vercel-ai
├── docs/                 # Documentation
├── examples/             # Example scenarios and configs
├── ROADMAP.md            # Development roadmap
├── CONTRIBUTING.md       # This file
└── README.md             # Project overview
```

### Package Dependencies

The packages have the following dependency order:

```
@artemiskit/core (no internal deps)
    ↓
@artemiskit/adapter-anthropic
@artemiskit/adapter-openai
@artemiskit/adapter-vercel-ai
@artemiskit/redteam
@artemiskit/reports
    ↓
@artemiskit/cli (depends on all above)
```

When making changes, ensure you rebuild dependent packages.

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Avoid `any` types - use `unknown` and type guards instead
- Export types from package index files
- Use descriptive variable and function names

### Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for issues
bun run lint

# Auto-fix issues
bun run lint:fix

# Format code
bun run format
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style (formatting, no logic change)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples:**
```
feat(cli): add --json flag for machine-readable output
fix(core): handle timeout errors gracefully
docs: update installation instructions
test(reports): add unit tests for HTML generator
```

### Branch Naming

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Refactoring

## Testing

### Running Tests

```bash
# Run all tests
bun test

# Run tests for a specific package
bun test --filter @artemiskit/core

# Run tests in watch mode
bun test --watch

# Run with coverage
bun test --coverage
```

### Writing Tests

- Place tests in `__tests__` directories or use `.test.ts` suffix
- Use descriptive test names
- Test both success and failure cases
- Mock external dependencies (API calls, file system)

```typescript
import { describe, expect, it } from 'bun:test';

describe('myFunction', () => {
  it('should return expected result', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should throw on invalid input', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

## Pull Request Process

### Before Submitting

1. **Ensure all checks pass:**
   ```bash
   bun run build
   bun run typecheck
   bun run lint
   bun test
   ```

2. **Update documentation** if your change affects:
   - CLI commands or options
   - Configuration options
   - Public APIs
   - README or other docs

3. **Add a changeset** for version bumping:
   ```bash
   bun changeset
   ```
   Follow the prompts to describe your change.

### PR Guidelines

- Keep PRs focused on a single change
- Write a clear description of what and why
- Link to related issues
- Request review from maintainers

### Review Process

1. Maintainers will review your PR
2. Address any requested changes
3. Once approved, a maintainer will merge

## Changesets

We use [Changesets](https://github.com/changesets/changesets) for version management.

### Adding a Changeset

```bash
bun changeset
```

1. Select the packages affected by your change
2. Choose the semver bump type:
   - `patch` - Bug fixes, minor changes
   - `minor` - New features (backward compatible)
   - `major` - Breaking changes
3. Write a summary of the change

### Changeset Guidelines

- One changeset per logical change
- Write user-facing descriptions
- Reference issue numbers when applicable

## Areas for Contribution

Check the [ROADMAP.md](ROADMAP.md) for planned features. Good first contributions include:

### Good First Issues
- Documentation improvements
- Additional test coverage
- Bug fixes with clear reproduction steps

### Feature Contributions
- New expectation matchers
- Additional provider adapters
- Report enhancements
- CLI improvements

### Documentation
- Usage examples
- Provider setup guides
- Tutorial content

## Getting Help

- Open an issue for questions
- Check existing issues and discussions
- Review the documentation

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.

---

Thank you for contributing to ArtemisKit!
