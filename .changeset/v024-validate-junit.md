---
"@artemiskit/cli": patch
"@artemiskit/core": patch
"@artemiskit/reports": patch
---

## New Features

### Validate Command

New `artemiskit validate` command for validating scenario files without running them:

- **YAML syntax validation** - Catches formatting errors
- **Schema validation** - Validates against ArtemisKit schema using Zod
- **Semantic validation** - Detects duplicate case IDs, undefined variables
- **Warnings** - Identifies deprecated fields, missing descriptions, performance hints

Options:
- `--json` - Output results as JSON
- `--strict` - Treat warnings as errors
- `--quiet` - Only show errors
- `--export junit` - Export to JUnit XML for CI integration

### JUnit XML Export

Added JUnit XML export support for CI/CD integration with Jenkins, GitHub Actions, GitLab CI, and other systems:

- `akit run scenarios/ --export junit` - Export run results
- `akit redteam scenarios/chatbot.yaml --export junit` - Export security test results
- `akit validate scenarios/ --export junit` - Export validation results

JUnit reports include:
- Test suite metadata (run ID, provider, model, success rate)
- Individual test cases with pass/fail status
- Failure details with matcher type and expected values
- Timing information for each test
