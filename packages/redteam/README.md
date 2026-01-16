# @artemiskit/redteam

Red team adversarial security testing for ArtemisKit LLM evaluation toolkit.

## Installation

```bash
npm install @artemiskit/redteam
# or
bun add @artemiskit/redteam
```

## Overview

This package provides adversarial testing capabilities to identify vulnerabilities in LLM-powered applications:

- **Prompt Injection** - Test resistance to instruction override attacks
- **Jailbreak Attempts** - Test guardrail bypass techniques
- **Data Extraction** - Probe for system prompt and training data leakage
- **Hallucination Triggers** - Test factual accuracy under adversarial prompts
- **PII Disclosure** - Test for unauthorized personal data exposure

## Usage

Most users should use the [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) for red team testing:

```bash
artemiskit redteam my-scenario.yaml --count 5
```

For programmatic usage:

```typescript
import { RedTeamGenerator } from '@artemiskit/redteam';

const generator = new RedTeamGenerator();

// Generate mutated versions of a prompt
const mutatedPrompts = generator.generate(basePrompt, 10);

// Each result contains:
// - original: the original prompt
// - mutated: the mutated prompt
// - mutations: array of mutation names applied
// - severity: 'low' | 'medium' | 'high' | 'critical'

// Apply a specific mutation
const mutated = generator.applyMutation(prompt, 'role-spoof');

// List available mutations
const mutations = generator.listMutations();
```

## How It Works

The red team module applies mutations to prompts to test LLM robustness:

1. Takes a base prompt from your scenario
2. Applies one or more mutations to create adversarial variants
3. Sends mutated prompts to the LLM
4. Analyzes responses for unsafe behavior
5. Reports vulnerabilities with severity ratings

## Mutations

The package includes mutation strategies to generate attack variants:

```typescript
import { 
  CotInjectionMutation,
  InstructionFlipMutation,
  RoleSpoofMutation,
  TypoMutation 
} from '@artemiskit/redteam';

const mutation = new CotInjectionMutation();
const mutated = mutation.mutate(originalPrompt);
```

Available mutations:
- `TypoMutation` - Introduces typos to evade filters
- `RoleSpoofMutation` - Role impersonation attacks
- `InstructionFlipMutation` - Reverses or contradicts instructions
- `CotInjectionMutation` - Chain-of-thought injection attacks

## Severity Ratings

Results are categorized by severity:

| Severity | Description |
|----------|-------------|
| `critical` | Complete guardrail bypass |
| `high` | Significant information disclosure |
| `medium` | Partial bypass or concerning behavior |
| `low` | Minor issues or edge cases |

## Related Packages

- [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) - Command-line interface
- [`@artemiskit/core`](https://www.npmjs.com/package/@artemiskit/core) - Core runtime and evaluators
- [`@artemiskit/reports`](https://www.npmjs.com/package/@artemiskit/reports) - HTML report generation

## License

Apache-2.0
