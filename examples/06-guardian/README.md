# Guardian Mode Examples

This directory demonstrates ArtemisKit Guardian Mode - runtime protection for AI/LLM applications.

## Overview

Guardian Mode provides comprehensive guardrails to prevent AI agents from performing harmful or unauthorized actions. It supports three operating modes:

| Mode | Behavior | Use Case |
|------|----------|----------|
| **testing** | Records violations, never blocks | Development, evaluation, tuning |
| **guardian** | Blocks all violations | Production with strict protection |
| **hybrid** | Blocks critical/high, warns medium/low | Production with observability |

## Prerequisites

Set these environment variables:

```bash
export AZURE_OPENAI_API_KEY=your-api-key
export AZURE_OPENAI_RESOURCE=your-resource-name
export AZURE_OPENAI_DEPLOYMENT=your-deployment-name
export AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

Or for OpenAI:
```bash
export OPENAI_API_KEY=your-api-key
```

## Examples

### 1. Basic Guardian (`basic-guardian.ts`)

Demonstrates core Guardian features in `guardian` mode (blocking):

- Creating a guardian with default policy
- Protecting an LLM client
- Detecting prompt injection attempts
- Action validation
- Intent classification
- PII detection and redaction
- Viewing metrics

```bash
bun examples/06-guardian/basic-guardian.ts
```

### 2. Testing Mode (`testing-mode.ts`)

Demonstrates `testing` mode for evaluation and development:

- Recording violations without blocking
- Measuring false positive rates
- Tuning guardrail sensitivity
- Analyzing detection patterns
- Benchmarking performance

```bash
bun examples/06-guardian/testing-mode.ts
```

### 3. Hybrid Mode (`hybrid-mode.ts`)

Demonstrates `hybrid` mode for balanced production protection:

- Blocking critical/high severity violations
- Warning on medium/low severity violations
- Custom policy configuration
- Circuit breaker protection
- Rate limiting
- Continuous improvement workflow

```bash
bun examples/06-guardian/hybrid-mode.ts
```

### 4. Agent Guardian (`agent-guardian.ts`)

Demonstrates protecting AI agents that can execute tools:

- Defining allowed/blocked actions
- Validating tool parameters
- Blocking dangerous actions
- Requiring approval for high-risk actions
- Rate limiting tool calls
- Inter-agent message validation

```bash
bun examples/06-guardian/agent-guardian.ts
```

## Guardian Features

### Operating Modes

```typescript
// Testing mode - record only
const guardian = createGuardian({ mode: 'testing' });

// Guardian mode - block all violations
const guardian = createGuardian({ mode: 'guardian' });

// Hybrid mode - block critical/high, warn medium/low
const guardian = createGuardian({ mode: 'hybrid' });
```

### Input/Output Guardrails

- **Injection Detection**: Detects prompt injection, jailbreaks, role hijacking
- **PII Detection**: Detects and redacts emails, phone numbers, SSNs, API keys
- **Content Filtering**: Blocks harmful content (violence, hate speech, etc.)
- **Intent Classification**: Classifies and blocks high-risk intents

### Action Validation

```typescript
// Validate a tool call
const result = await guardian.validateAction('delete_file', { path: '/etc/passwd' });
if (!result.valid) {
  console.log('Blocked:', result.violations);
}
```

- **Tool Allowlisting**: Only allow specific tools to be called
- **Parameter Validation**: Validate tool arguments against schemas
- **Risk Assessment**: Block high-risk actions automatically
- **Rate Limiting**: Limit how often actions can be called

### Circuit Breaker

Protects against attack bursts:

```typescript
const guardian = createGuardian({
  policy: {
    circuitBreaker: {
      enabled: true,
      threshold: 5,        // Open after 5 violations
      windowMs: 60000,     // In 1 minute window
      cooldownMs: 300000,  // 5 minute cooldown
    }
  }
});
```

### Metrics Collection

```typescript
const metrics = guardian.getMetrics();
console.log('Blocked:', metrics.blockedRequests);
console.log('By type:', metrics.violationsByType);
console.log('By severity:', metrics.violationsBySeverity);
```

## Policy Configuration

You can customize Guardian behavior using YAML policy files or inline configuration:

### YAML Policy File

```yaml
name: production-policy
version: "1.0"
mode: hybrid

rules:
  - id: injection-detection
    name: Prompt Injection Detection
    type: injection_detection
    enabled: true
    severity: critical
    action: block

  - id: pii-detection
    name: PII Detection
    type: pii_detection
    enabled: true
    severity: medium
    action: transform
    config:
      redact: true

  - id: content-filter
    name: Content Filter
    type: content_filter
    enabled: true
    severity: high
    action: block

circuitBreaker:
  enabled: true
  threshold: 5
  windowMs: 60000
  cooldownMs: 300000

rateLimits:
  enabled: true
  requestsPerMinute: 100
  requestsPerHour: 1000
```

### Loading Policy

```typescript
// From file
const guardian = createGuardian({
  policy: './path/to/policy.yaml',
});

// Inline
const guardian = createGuardian({
  policy: {
    name: 'my-policy',
    mode: 'hybrid',
    rules: [...],
  },
});
```

## Mode Selection Guide

| Scenario | Recommended Mode |
|----------|------------------|
| Development/testing | `testing` |
| Evaluating new guardrails | `testing` |
| Production (strict compliance) | `guardian` |
| Production (balanced) | `hybrid` |
| High-security environments | `guardian` |
| Consumer-facing apps | `hybrid` |
| Internal tools | `hybrid` or `testing` |

## Integration with ArtemisKit

Guardian Mode integrates with ArtemisKit's evaluation features:

```typescript
import { ArtemisKit, createGuardian } from '@artemiskit/sdk';

// Create guardian
const guardian = createGuardian({ mode: 'hybrid' });

// Run evaluations with guardian protection
const kit = new ArtemisKit({
  provider: 'openai',
  model: 'gpt-4o-mini',
  guardian, // Attach guardian to all evaluations
});

const results = await kit.run({ scenario: './scenario.yaml' });
```

## Related Examples

- [07-agentic/](../07-agentic/) - LangChain and DeepAgents integration with Guardian
- [05-sdk/](../05-sdk/) - SDK usage examples

## Security Note

This directory may contain examples with real API keys for testing. Never commit sensitive data to version control.
