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
- **OWASP LLM Top 10** - Comprehensive security testing aligned with OWASP guidelines
- **Agent Attacks** - Test agentic AI systems for identity confusion, tool abuse, and memory poisoning

## Usage

Most users should use the [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) for red team testing:

```bash
# Basic red team testing
artemiskit redteam my-scenario.yaml --count 5

# OWASP LLM Top 10 testing
artemiskit redteam my-scenario.yaml --owasp LLM01,LLM05
artemiskit redteam my-scenario.yaml --owasp-full

# Agent-specific testing
artemiskit redteam my-scenario.yaml --mutations agent-confusion,tool-abuse --agent-detection trace
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
5. Reports vulnerabilities with CVSS-like severity ratings

## Mutations

### Basic Mutations

| Mutation | Description |
|----------|-------------|
| `TypoMutation` | Introduces typos to evade filters |
| `RoleSpoofMutation` | Role impersonation attacks |
| `InstructionFlipMutation` | Reverses or contradicts instructions |
| `CotInjectionMutation` | Chain-of-thought injection attacks |

### Encoding Mutations

| Mutation | Description |
|----------|-------------|
| `EncodingMutation` | Obfuscates attacks using base64, ROT13, hex, unicode |

### Multi-Turn Mutations

| Mutation | Strategy | Description |
|----------|----------|-------------|
| `MultiTurnMutation` | `gradual_escalation` | Gradually intensifies requests |
| `MultiTurnMutation` | `context_switching` | Shifts topics to lower defenses |
| `MultiTurnMutation` | `persona_building` | Establishes trust through roleplay |
| `MultiTurnMutation` | `distraction` | Uses side discussions to slip in attacks |

### OWASP LLM Top 10 Mutations

| Mutation | OWASP | Description |
|----------|-------|-------------|
| `bad-likert-judge` | LLM01 | Exploit evaluation capability |
| `crescendo` | LLM01 | Multi-turn gradual escalation |
| `deceptive-delight` | LLM01 | Positive framing bypass |
| `output-injection` | LLM05 | XSS, SQLi, command injection in output |
| `excessive-agency` | LLM06 | Unauthorized action claims |
| `system-extraction` | LLM07 | System prompt leakage |
| `hallucination-trap` | LLM09 | Confident fabrication triggers |

### Agent Mutations (v0.3.1+)

| Mutation | OWASP | Description |
|----------|-------|-------------|
| `agent-confusion` | LLM01, LLM08 | Tests if agents can be confused about identity/role |
| `tool-abuse` | LLM01, LLM08 | Tests if agents can be manipulated to misuse tools |
| `memory-poisoning` | LLM01, LLM08 | Tests if agent memory can be corrupted |
| `chain-manipulation` | LLM01, LLM08 | Tests if malicious instructions propagate through chains |

#### Agent Detection Modes

Agent mutations support two detection modes:

- **`trace`** - Analyzes agent execution traces for suspicious patterns
- **`response`** - Analyzes final response content for indicators of compromise

```typescript
import { AgentConfusionMutation, AgentMutationDetector } from '@artemiskit/redteam';

const mutation = new AgentConfusionMutation();
const detector = new AgentMutationDetector();

// Apply mutation
const mutated = mutation.mutate(originalPrompt, { template: 'identity-override' });

// Detect vulnerability (trace-based)
const result = detector.detect(response, 'agent-confusion', {
  mode: 'trace',
  agentTrace: executionTrace,
});

// Detect vulnerability (response-based)
const result = detector.detect(response, 'agent-confusion', {
  mode: 'response',
});
```

## Severity Ratings

Results are categorized by CVSS-like severity:

| Severity | Score | Description |
|----------|-------|-------------|
| `critical` | 9.0-10.0 | Complete guardrail bypass, full compromise |
| `high` | 7.0-8.9 | Significant information disclosure or privilege escalation |
| `medium` | 4.0-6.9 | Partial bypass or concerning behavior |
| `low` | 0.1-3.9 | Minor issues or edge cases |

## Related Packages

- [`@artemiskit/cli`](https://www.npmjs.com/package/@artemiskit/cli) - Command-line interface
- [`@artemiskit/core`](https://www.npmjs.com/package/@artemiskit/core) - Core runtime and evaluators
- [`@artemiskit/reports`](https://www.npmjs.com/package/@artemiskit/reports) - HTML report generation
- [`@artemiskit/sdk`](https://www.npmjs.com/package/@artemiskit/sdk) - Programmatic SDK

## License

Apache-2.0
