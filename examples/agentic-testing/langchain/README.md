# Testing LangChain Applications with ArtemisKit

This guide covers testing LangChain.js chains, agents, and LCEL pipelines using the `@artemiskit/adapter-langchain` adapter.

## Installation

```bash
# ArtemisKit packages
bun add @artemiskit/core @artemiskit/cli @artemiskit/adapter-langchain

# LangChain dependencies
bun add @langchain/openai @langchain/core
```

## Adapter Overview

The LangChain adapter wraps any LangChain `Runnable` interface, including:

- **LLM Models** (`ChatOpenAI`, `ChatAnthropic`, etc.)
- **Chains** (LCEL pipelines with `.pipe()`)
- **Agents** (`AgentExecutor` with tools)
- **Custom Runnables** (anything implementing `invoke()`)

## Basic Usage

### Wrapping a Chain

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { LangChainAdapter, createLangChainAdapter } from '@artemiskit/adapter-langchain';

// 1. Create your LangChain chain
const model = new ChatOpenAI({ model: 'gpt-4' });
const prompt = ChatPromptTemplate.fromTemplate('Answer briefly: {input}');
const outputParser = new StringOutputParser();

const chain = prompt.pipe(model).pipe(outputParser);

// 2. Wrap with ArtemisKit adapter
const adapter = createLangChainAdapter(chain, {
  name: 'qa-chain',
  runnableType: 'chain',
});

// 3. Use the adapter
const result = await adapter.generate({
  prompt: 'What is the capital of Japan?',
});

console.log(result.text); // "Tokyo"
```

### Wrapping an Agent

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { Calculator } from '@langchain/community/tools/calculator';
import { LangChainAdapter } from '@artemiskit/adapter-langchain';

// 1. Create your agent
const model = new ChatOpenAI({ model: 'gpt-4' });
const tools = [new Calculator()];
const agent = createToolCallingAgent({ llm: model, tools, prompt });
const executor = new AgentExecutor({
  agent,
  tools,
  returnIntermediateSteps: true, // Required for step capture
});

// 2. Wrap with ArtemisKit adapter
const adapter = new LangChainAdapter(
  {
    provider: 'langchain',
    name: 'math-agent',
    runnableType: 'agent',
    captureIntermediateSteps: true,
  },
  executor
);

// 3. Run tests
const result = await adapter.generate({
  prompt: 'What is 15% of 340?',
});

console.log(result.text); // "51"
console.log(result.raw.metadata.toolsUsed); // ["calculator"]
```

## Configuration Options

```typescript
interface LangChainAdapterConfig {
  // Required
  provider: 'langchain';
  
  // Optional
  name?: string;                  // Identifier for reports
  runnableType?: 'chain' | 'agent' | 'llm' | 'runnable';  // Auto-detected if not set
  captureIntermediateSteps?: boolean;  // Capture tool calls (default: true)
  inputKey?: string;              // Custom input key (default: 'input')
  outputKey?: string;             // Custom output key (default: 'output')
}
```

## Runnable Types

The adapter auto-detects the type, but you can specify it explicitly:

| Type | Description | Example |
|------|-------------|---------|
| `llm` | Direct model calls | `ChatOpenAI` |
| `chain` | LCEL pipelines | `prompt.pipe(model).pipe(parser)` |
| `agent` | Agents with tools | `AgentExecutor` |
| `runnable` | Generic runnable | Custom implementations |

## Writing Test Scenarios

### Basic Chain Scenario

```yaml
# scenarios/chain-eval.yaml
name: QA Chain Evaluation
description: Test question-answering chain accuracy

provider: langchain
model: gpt-4

cases:
  - id: capital-cities
    name: Capital city questions
    prompt: "What is the capital of France?"
    expected:
      type: contains
      values: ["Paris"]

  - id: math-word-problem
    name: Simple math
    prompt: "If I have 5 apples and buy 3 more, how many do I have?"
    expected:
      type: regex
      pattern: "\\b8\\b"
```

### Agent Evaluation Scenario

```yaml
# scenarios/agent-eval.yaml
name: Math Agent Evaluation
description: Test agent tool usage and accuracy

provider: langchain
model: gpt-4

cases:
  - id: calculator-usage
    name: Should use calculator for complex math
    prompt: "Calculate 17 * 23 + 456 / 12"
    expected:
      type: llm_grader
      rubric: |
        The agent should:
        1. Use a calculator tool (not mental math)
        2. Return the correct result: 429
        Score based on accuracy and tool usage.
      threshold: 0.9

  - id: step-by-step
    name: Multi-step calculation
    prompt: "What is 20% of 350, then add 15?"
    expected:
      type: contains
      values: ["85"]
```

## Running Tests

### From Command Line

```bash
# Run chain tests
bun packages/cli/bin/artemis.ts run examples/agentic-testing/langchain/scenarios/chain-eval.yaml --provider langchain

# Run with verbose logging
bun packages/cli/bin/artemis.ts run scenarios/chain-eval.yaml --provider langchain --verbose

# Generate JSON report
bun packages/cli/bin/artemis.ts run scenarios/chain-eval.yaml --report json --output results.json
```

### Programmatic Testing

```typescript
import { ArtemisRunner } from '@artemiskit/core';
import { createLangChainAdapter } from '@artemiskit/adapter-langchain';

// Setup
const adapter = createLangChainAdapter(myChain);
const runner = new ArtemisRunner({ adapter });

// Run scenarios
const results = await runner.runScenario('./scenarios/chain-eval.yaml');

// Analyze results
console.log(`Pass rate: ${results.passRate}%`);
results.cases.forEach(c => {
  console.log(`${c.id}: ${c.passed ? '✅' : '❌'}`);
});
```

## Accessing Execution Details

The adapter captures rich execution metadata:

```typescript
const result = await adapter.generate({ prompt: '...' });

// Access metadata
const metadata = result.raw.metadata;

console.log(metadata.runnableType);       // 'agent'
console.log(metadata.intermediateSteps);  // Array of tool calls
console.log(metadata.toolsUsed);          // ['calculator', 'search']
console.log(metadata.totalToolCalls);     // 3
```

### Intermediate Steps Structure

```typescript
interface IntermediateStep {
  action: {
    tool: string;       // Tool name
    toolInput: unknown; // Input to the tool
    log?: string;       // Agent's reasoning
  };
  observation: string;  // Tool output
}
```

## Streaming Support

The adapter supports streaming for compatible runnables:

```typescript
const adapter = createLangChainAdapter(streamableChain);

for await (const chunk of adapter.stream({ prompt: 'Tell me a story' }, console.log)) {
  // Chunks are also passed to the callback
}
```

## Common Patterns

### Testing RAG Chains

```typescript
const ragChain = RunnableSequence.from([
  retriever,
  formatDocs,
  prompt,
  model,
  parser,
]);

const adapter = createLangChainAdapter(ragChain, {
  name: 'rag-chain',
  inputKey: 'question',
});
```

### Testing Conversation Chains

```typescript
const conversationChain = createConversationChain({
  llm: model,
  memory: new BufferMemory(),
});

const adapter = createLangChainAdapter(conversationChain, {
  name: 'chat-chain',
  inputKey: 'input',
  outputKey: 'response',
});
```

## Troubleshooting

### "Cannot find invoke method"

Ensure your runnable implements the `Runnable` interface:

```typescript
// ✅ Works - LCEL chain
const chain = prompt.pipe(model);

// ✅ Works - AgentExecutor
const executor = new AgentExecutor({ agent, tools });

// ❌ Doesn't work - plain function
const fn = async (input) => model.call(input);
```

### Missing Tool Calls in Metadata

Enable `returnIntermediateSteps` on your agent:

```typescript
const executor = new AgentExecutor({
  agent,
  tools,
  returnIntermediateSteps: true, // This is required!
});
```

### Output Extraction Issues

If the adapter can't extract output, specify the output key:

```typescript
const adapter = createLangChainAdapter(chain, {
  outputKey: 'text',  // Match your chain's output structure
});
```

## Example Files

- [`test-chain.ts`](./test-chain.ts) - Basic chain testing example
- [`test-agent.ts`](./test-agent.ts) - Agent with tools testing example
- [`scenarios/chain-eval.yaml`](./scenarios/chain-eval.yaml) - Chain evaluation scenarios

## See Also

- [LangChain.js Documentation](https://js.langchain.com/)
- [ArtemisKit Evaluators](../../../packages/core/README.md)
- [Scenario Reference](../../scenarios/README.md)
