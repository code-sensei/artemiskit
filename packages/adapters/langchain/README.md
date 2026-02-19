# @artemiskit/adapter-langchain

LangChain.js adapter for ArtemisKit - Test and evaluate LangChain chains, agents, and runnables.

## Installation

```bash
bun add @artemiskit/adapter-langchain
# or
npm install @artemiskit/adapter-langchain
```

## Quick Start

### Testing a Simple Chain

```typescript
import { createLangChainAdapter } from '@artemiskit/adapter-langchain';
import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';

// Create your LangChain chain
const model = new ChatOpenAI({ model: 'gpt-4' });
const prompt = ChatPromptTemplate.fromTemplate('Answer concisely: {input}');
const chain = prompt.pipe(model).pipe(new StringOutputParser());

// Wrap with ArtemisKit adapter
const adapter = createLangChainAdapter(chain, {
  name: 'qa-chain',
  runnableType: 'chain',
});

// Use in ArtemisKit tests
const result = await adapter.generate({ prompt: 'What is 2+2?' });
console.log(result.text); // "4"
```

### Testing an Agent

```typescript
import { createLangChainAdapter } from '@artemiskit/adapter-langchain';
import { AgentExecutor, createReactAgent } from 'langchain/agents';
import { ChatOpenAI } from '@langchain/openai';
import { Calculator } from '@langchain/community/tools/calculator';

// Create agent
const model = new ChatOpenAI({ model: 'gpt-4' });
const tools = [new Calculator()];
const agent = createReactAgent({ llm: model, tools, prompt: agentPrompt });
const agentExecutor = new AgentExecutor({ agent, tools });

// Wrap with ArtemisKit adapter
const adapter = createLangChainAdapter(agentExecutor, {
  name: 'calculator-agent',
  runnableType: 'agent',
  captureIntermediateSteps: true,
});

// Use in ArtemisKit tests
const result = await adapter.generate({ prompt: 'Calculate 25 * 4' });
console.log(result.text); // "100"

// Access agent execution metadata
console.log(result.raw.metadata.toolsUsed); // ['calculator']
console.log(result.raw.metadata.totalToolCalls); // 1
```

### Testing RAG Chains

```typescript
import { createLangChainAdapter } from '@artemiskit/adapter-langchain';
import { ChatOpenAI } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';

// Assume vectorstore is already set up
const retriever = vectorstore.asRetriever();
const chain = RetrievalQAChain.fromLLM(
  new ChatOpenAI({ model: 'gpt-4' }),
  retriever
);

const adapter = createLangChainAdapter(chain, {
  name: 'rag-qa',
  inputKey: 'query',
  outputKey: 'result',
});

const result = await adapter.generate({
  prompt: 'What does the document say about X?',
});
```

## Configuration Options

| Option                     | Type                                            | Default     | Description                              |
| -------------------------- | ----------------------------------------------- | ----------- | ---------------------------------------- |
| `name`                     | `string`                                        | -           | Identifier for the chain/agent           |
| `runnableType`             | `'chain' \| 'agent' \| 'llm' \| 'runnable'`     | auto-detect | Type of LangChain runnable               |
| `captureIntermediateSteps` | `boolean`                                       | `true`      | Capture agent intermediate steps         |
| `inputKey`                 | `string`                                        | `'input'`   | Custom input key for the runnable        |
| `outputKey`                | `string`                                        | `'output'`  | Custom output key for the runnable       |

## Supported Runnable Types

The adapter supports all LangChain runnables that implement `invoke()`:

- **Chains**: LCEL chains, RetrievalQA, ConversationalRetrievalQA, etc.
- **Agents**: ReAct agents, OpenAI Functions agents, Tool-calling agents
- **LLMs**: Direct ChatOpenAI, ChatAnthropic, etc.
- **Custom Runnables**: Any object with an `invoke()` method

## Streaming Support

If your runnable supports streaming via `stream()`, the adapter will use it:

```typescript
for await (const chunk of adapter.stream({ prompt: 'Tell me a story' }, console.log)) {
  // Process streaming chunks
}
```

## ArtemisKit Integration

Use with ArtemisKit scenarios:

```yaml
# scenario.yaml
name: langchain-qa-test
provider: langchain
scenarios:
  - name: Basic QA
    input: 'What is the capital of France?'
    expected:
      contains: 'Paris'
```

```typescript
// Register adapter in your test setup
import { adapterRegistry } from '@artemiskit/core';
import { LangChainAdapter } from '@artemiskit/adapter-langchain';

adapterRegistry.register('langchain', async (config) => {
  // Your chain/agent setup
  return new LangChainAdapter(config, myChain);
});
```

## License

Apache-2.0
