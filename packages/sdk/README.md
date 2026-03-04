# @artemiskit/sdk

Programmatic SDK for [ArtemisKit](https://github.com/code-sensei/artemiskit) - integrate LLM testing directly into your Node.js applications, CI/CD pipelines, and test frameworks.

## Features

- 🚀 **Simple API** - Run tests, red team evaluations, and stress tests programmatically
- 📊 **Event Emitters** - Real-time progress tracking with `onCaseStart`, `onCaseComplete`, `onProgress`
- 🧪 **Test Framework Integration** - Custom matchers for Jest and Vitest
- 🔴 **Red Team Testing** - Adversarial security testing built-in
- ⚡ **Stress Testing** - Load testing with configurable concurrency
- 📝 **TypeScript First** - Full type definitions included

## Installation

```bash
# Using bun
bun add @artemiskit/sdk

# Using npm
npm install @artemiskit/sdk
```

## Quick Start

```typescript
import { ArtemisKit } from '@artemiskit/sdk';

const kit = new ArtemisKit({
  provider: 'openai',
  model: 'gpt-4',
  project: 'my-project',
});

// Run test scenarios
const result = await kit.run({
  scenario: './my-tests.yaml',
});

if (!result.success) {
  console.error('Tests failed!');
  process.exit(1);
}

console.log('All tests passed! ✅');
```

## API Reference

### ArtemisKit Class

#### Constructor

```typescript
const kit = new ArtemisKit({
  project?: string;
  provider?: 'openai' | 'azure-openai' | 'anthropic' | ...;
  model?: string;
  timeout?: number;
  retries?: number;
  concurrency?: number;
});
```

#### run(options)

Run test scenarios against your LLM.

```typescript
const result = await kit.run({
  scenario: './tests.yaml',
  tags?: string[],
  concurrency?: number,
  timeout?: number,
});
```

#### redteam(options)

Run red team adversarial security testing.

```typescript
const result = await kit.redteam({
  scenario: './tests.yaml',
  mutations?: string[],
  countPerCase?: number,
});
```

#### stress(options)

Run stress/load testing.

```typescript
const result = await kit.stress({
  scenario: './tests.yaml',
  concurrency?: number,
  duration?: number,
  rampUp?: number,
});
```

### Event Handling

```typescript
kit
  .onCaseStart((event) => {
    console.log(`Starting ${event.caseId}`);
  })
  .onCaseComplete((event) => {
    console.log(`${event.result.name}: ${event.result.ok ? '✅' : '❌'}`);
  })
  .onProgress((event) => {
    console.log(`[${event.phase}] ${event.message}`);
  });
```

## Jest/Vitest Integration

### Setup

```typescript
// vitest.setup.ts or jest.setup.ts
import '@artemiskit/sdk/vitest';
// or
import '@artemiskit/sdk/jest';
```

### Usage

```typescript
import { describe, it, expect } from 'vitest';
import { ArtemisKit } from '@artemiskit/sdk';

describe('LLM Tests', () => {
  const kit = new ArtemisKit({ provider: 'openai' });

  it('should pass all test cases', async () => {
    const result = await kit.run({ scenario: './tests.yaml' });
    expect(result).toPassAllCases();
  });

  it('should have high success rate', async () => {
    const result = await kit.run({ scenario: './tests.yaml' });
    expect(result).toHaveSuccessRate(0.95);
  });
});
```

### Available Matchers

**Run Result:**
- `toPassAllCases()`
- `toHaveSuccessRate(rate)`
- `toPassCasesWithTag(tag)`
- `toHaveMedianLatencyBelow(ms)`
- `toHaveP95LatencyBelow(ms)`

**Red Team:**
- `toPassRedTeam()`
- `toHaveDefenseRate(rate)`
- `toHaveNoCriticalVulnerabilities()`
- `toHaveNoHighSeverityVulnerabilities()`

**Stress Test:**
- `toPassStressTest()`
- `toHaveStressSuccessRate(rate)`
- `toAchieveRPS(rps)`
- `toHaveStressP95LatencyBelow(ms)`

## License

Apache-2.0
