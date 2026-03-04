# Guardian Mode Demo

This directory contains examples demonstrating the ArtemisKit Guardian Mode - runtime protection for AI/LLM applications.

## Prerequisites

Set these environment variables (from your Azure OpenAI setup):

```bash
export AZURE_OPENAI_API_KEY=your-api-key
export AZURE_OPENAI_RESOURCE=your-resource-name
export AZURE_OPENAI_DEPLOYMENT=your-deployment-name
export AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

## Examples

### 1. Basic Guardian (`basic-guardian.ts`)

Demonstrates:
- Creating a guardian with default policy
- Protecting an LLM client
- Detecting prompt injection attempts
- Action validation
- Intent classification
- PII detection and redaction
- Viewing metrics

```bash
bun examples/guardian-demo/basic-guardian.ts
```

### 2. Agent Guardian (`agent-guardian.ts`)

Demonstrates:
- Protecting an agent that can execute tools
- Defining allowed/blocked actions
- Validating tool parameters
- Blocking dangerous actions
- Requiring approval for high-risk actions
- Rate limiting tool calls

```bash
bun examples/guardian-demo/agent-guardian.ts
```

## Features Demonstrated

### Input/Output Guardrails

- **Injection Detection**: Detects prompt injection, jailbreaks, role hijacking
- **PII Detection**: Detects and redacts emails, phone numbers, SSNs, API keys
- **Content Filtering**: Blocks harmful content (violence, hate speech, etc.)

### Action Validation

- **Tool Allowlisting**: Only allow specific tools to be called
- **Parameter Validation**: Validate tool arguments against schemas
- **Risk Assessment**: Block high-risk actions automatically
- **Rate Limiting**: Limit how often actions can be called

### Intent Classification

- **Pattern Matching**: Detect risky intents using regex patterns
- **Risk Categories**: Classify intents by risk level (low/medium/high/critical)
- **Blocking**: Automatically block high-risk intents

### Circuit Breaker

- **Threshold-based**: Opens after N violations in time window
- **Cooldown**: Waits before allowing requests again
- **Half-open State**: Gradually allows requests to test recovery

### Metrics

- Total requests, blocked requests, warned requests
- Violations by type and severity
- Average latency
- Circuit breaker state

## Policy Configuration

You can customize the guardian behavior using YAML policy files:

```yaml
name: my-policy
version: "1.0"
mode: guardian

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
    severity: high
    action: transform
    config:
      redact: true

circuitBreaker:
  enabled: true
  threshold: 5
  windowMs: 60000
  cooldownMs: 300000

rateLimits:
  enabled: true
  requestsPerMinute: 100
```

Load with:

```typescript
const guardian = createGuardian({
  policy: './path/to/policy.yaml',
})
```

## Note

This directory is gitignored because it may contain examples with real API keys for testing. Do not commit sensitive data.
