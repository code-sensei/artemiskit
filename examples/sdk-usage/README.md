# ArtemisKit SDK Usage Examples

This directory contains comprehensive examples demonstrating the `@artemiskit/sdk` programmatic API for integrating LLM testing into your Node.js applications, CI/CD pipelines, and test frameworks.

## Installation

```bash
# Using bun (recommended)
bun add @artemiskit/sdk

# Using npm
npm install @artemiskit/sdk

# Using pnpm
pnpm add @artemiskit/sdk
```

## Environment Setup

Before running examples, ensure you have the necessary environment variables:

```bash
# Copy the example env file
cp .env.example .env

# Required: Set your API key for your provider
export OPENAI_API_KEY=your-api-key
# Or for other providers:
export ANTHROPIC_API_KEY=your-api-key
export AZURE_OPENAI_API_KEY=your-api-key
```

## Examples Overview

| File | Description |
|------|-------------|
| `basic-run.ts` | Basic scenario evaluation - the simplest way to run tests |
| `with-events.ts` | Using event emitters for real-time progress tracking |
| `redteam-example.ts` | Red team adversarial security testing |
| `stress-example.ts` | Load/stress testing with configurable concurrency |
| `jest-integration.test.ts` | Jest test integration with custom matchers |
| `vitest-integration.test.ts` | Vitest test integration with custom matchers |

## Running the Examples

### Using Bun (Recommended)

```bash
# Run basic example
bun run basic-run.ts

# Run with events
bun run with-events.ts

# Run red team testing
bun run redteam-example.ts

# Run stress testing
bun run stress-example.ts
```

### Using tsx (Node.js)

```bash
# Install tsx globally
npm install -g tsx

# Run examples
tsx basic-run.ts
tsx with-events.ts
tsx redteam-example.ts
tsx stress-example.ts
```

### Running Test Framework Examples

```bash
# Jest tests
npx jest jest-integration.test.ts

# Vitest tests
npx vitest run vitest-integration.test.ts
```

### Using the Run Script

```bash
# Make executable
chmod +x run-examples.sh

# Run all examples
./run-examples.sh

# Run specific example
./run-examples.sh basic
```

## Example Scenarios

The `scenarios/` directory contains YAML scenario files used by the examples:

- `example.yaml` - Basic quality assurance scenario
- `chatbot.yaml` - Chatbot response quality tests (coming soon)
- `safety.yaml` - Safety and content moderation tests (coming soon)

## API Quick Reference

### Basic Usage

```typescript
import { ArtemisKit } from '@artemiskit/sdk';

const kit = new ArtemisKit({
  provider: 'openai',
  model: 'gpt-4',
  project: 'my-project',
});

// Run tests
const result = await kit.run({
  scenario: './scenarios/example.yaml',
});

console.log(result.success); // true/false
```

### With Event Handlers

```typescript
kit
  .onCaseStart((event) => {
    console.log(`Starting ${event.caseId}`);
  })
  .onCaseComplete((event) => {
    console.log(`${event.result.name}: ${event.result.ok ? '✅' : '❌'}`);
  })
  .onProgress((event) => {
    console.log(`[${event.phase}] ${event.message} (${event.progress}%)`);
  });
```

### Red Team Testing

```typescript
const redteamResult = await kit.redteam({
  scenario: './scenarios/example.yaml',
  mutations: ['typo', 'role-spoof', 'instruction-flip'],
  countPerCase: 5,
});

console.log(`Defense rate: ${(redteamResult.defenseRate * 100).toFixed(1)}%`);
```

### Stress Testing

```typescript
const stressResult = await kit.stress({
  scenario: './scenarios/example.yaml',
  concurrency: 10,
  duration: 30,
  rampUp: 5,
});

console.log(`RPS: ${stressResult.rps.toFixed(1)}`);
console.log(`P95 Latency: ${stressResult.p95LatencyMs}ms`);
```

### Test Framework Matchers

```typescript
// Jest/Vitest
expect(result).toPassAllCases();
expect(result).toHaveSuccessRate(0.95);
expect(redteamResult).toHaveDefenseRate(0.9);
expect(stressResult).toAchieveRPS(10);
```

## Integration with CI/CD

### GitHub Actions

```yaml
- name: Run ArtemisKit Tests
  run: |
    bun run examples/sdk-usage/basic-run.ts
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### GitLab CI

```yaml
test:
  script:
    - bun run examples/sdk-usage/basic-run.ts
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
```

## Troubleshooting

### Common Issues

1. **API Key not found**: Ensure your provider's API key is set in environment variables
2. **Scenario file not found**: Check the path is relative to your working directory
3. **Timeout errors**: Increase the `timeout` option for slower models

### Getting Help

- [ArtemisKit Documentation](https://artemiskit.vercel.app)
- [GitHub Issues](https://github.com/code-sensei/artemiskit/issues)
- [Discord Community](https://discord.gg/artemiskit)

## License

Apache-2.0
