# @artemiskit/core

Core runtime, evaluators, and storage for the ArtemisKit LLM evaluation toolkit.

## Installation

```bash
npm install @artemiskit/core
# or
bun add @artemiskit/core
```

## Overview

This package provides the foundational components for ArtemisKit:

- **Runner** - Execute test scenarios against LLM providers
- **Evaluators** - Built-in expectation matchers (contains, exact, regex, fuzzy, llm_grader, json_schema)
- **Storage** - Local filesystem and Supabase storage backends
- **Redaction** - PII/sensitive data filtering with built-in patterns
- **Schema** - YAML scenario parsing and validation

## Usage

Most users should use the [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) package for running evaluations. This package is primarily for programmatic usage or building custom integrations.

```typescript
import { 
  parseScenarioFile, 
  runScenario, 
  createAdapter 
} from '@artemiskit/core';

// Parse a scenario file
const scenario = await parseScenarioFile('./my-test.yaml');

// Create an adapter (requires adapter package to be registered)
const client = await createAdapter({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});

// Run the scenario
const result = await runScenario({
  scenario,
  client,
  project: 'my-project',
  onCaseComplete: (caseResult, index, total) => {
    console.log(`Completed ${index + 1}/${total}: ${caseResult.passed ? 'PASS' : 'FAIL'}`);
  },
});

console.log(`Success: ${result.success}`);
console.log(`Passed: ${result.manifest.metrics.passed_cases}/${result.manifest.metrics.total_cases}`);
```

**Note:** The `createAdapter` function requires adapter packages (like `@artemiskit/adapter-openai`) to be installed and registered. For standalone usage, import adapters directly:

```typescript
import { OpenAIAdapter } from '@artemiskit/adapter-openai';

const client = new OpenAIAdapter({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
});
```

## Evaluators

Built-in expectation types:

| Type | Description |
|------|-------------|
| `contains` | Check if response contains text |
| `exact` | Exact string match |
| `regex` | Regular expression match |
| `fuzzy` | Fuzzy string similarity (Levenshtein) |
| `llm_grader` | LLM-based response grading |
| `json_schema` | Validate JSON structure |

## Redaction

Built-in patterns for sensitive data:

- `email` - Email addresses
- `phone` - Phone numbers
- `ssn` - Social Security Numbers
- `credit_card` - Credit card numbers
- `api_key` - API keys (sk_, pk_, etc.)
- `jwt` - JWT tokens
- `aws_key` - AWS access keys
- `ipv4` - IPv4 addresses
- `secrets` - Password/secret assignments

```typescript
import { Redactor, BUILTIN_PATTERNS } from '@artemiskit/core';

const redactor = new Redactor({
  enabled: true,
  patterns: [BUILTIN_PATTERNS.EMAIL, BUILTIN_PATTERNS.PHONE],
});

const result = redactor.redact('Contact: user@example.com');
// result.text = 'Contact: [REDACTED]'
```

## Related Packages

- [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) - Command-line interface
- [`@artemiskit/adapter-openai`](https://www.npmjs.com/package/@artemiskit/adapter-openai) - OpenAI/Azure adapter
- [`@artemiskit/adapter-anthropic`](https://www.npmjs.com/package/@artemiskit/adapter-anthropic) - Anthropic Claude adapter
- [`@artemiskit/redteam`](https://www.npmjs.com/package/@artemiskit/redteam) - Security testing
- [`@artemiskit/reports`](https://www.npmjs.com/package/@artemiskit/reports) - HTML report generation

## License

Apache-2.0
