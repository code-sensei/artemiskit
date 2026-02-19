# @artemiskit/adapter-deepagents

DeepAgents.js adapter for ArtemisKit - Test and evaluate DeepAgents multi-agent systems.

## Installation

```bash
bun add @artemiskit/adapter-deepagents
# or
npm install @artemiskit/adapter-deepagents
```

## Quick Start

### Testing a Multi-Agent Team

```typescript
import { createDeepAgentsAdapter } from '@artemiskit/adapter-deepagents';
import { createTeam, Agent } from 'deepagents';

// Create your DeepAgents team
const researcher = new Agent({
  name: 'researcher',
  role: 'Research specialist',
  tools: [webSearchTool, documentReader],
});

const writer = new Agent({
  name: 'writer',
  role: 'Content writer',
});

const team = createTeam({
  agents: [researcher, writer],
  workflow: 'sequential',
});

// Wrap with ArtemisKit adapter
const adapter = createDeepAgentsAdapter(team, {
  name: 'content-team',
  captureTraces: true,
  captureMessages: true,
});

// Use in ArtemisKit tests
const result = await adapter.generate({
  prompt: 'Write an article about AI testing best practices',
});

console.log(result.text); // Final article content

// Access execution metadata
const metadata = result.raw.metadata;
console.log(metadata.agentsInvolved); // ['researcher', 'writer']
console.log(metadata.totalToolCalls); // Number of tool invocations
console.log(metadata.totalMessages); // Messages exchanged between agents
```

### Testing a Hierarchical Agent System

```typescript
import { createDeepAgentsAdapter } from '@artemiskit/adapter-deepagents';
import { createHierarchy, Coordinator, Worker } from 'deepagents';

// Create hierarchical system
const coordinator = new Coordinator({
  name: 'manager',
  strategy: 'delegate-and-synthesize',
});

const workers = [
  new Worker({ name: 'analyst', specialty: 'data analysis' }),
  new Worker({ name: 'visualizer', specialty: 'chart creation' }),
];

const hierarchy = createHierarchy({ coordinator, workers });

const adapter = createDeepAgentsAdapter(hierarchy, {
  name: 'analysis-team',
  executionTimeout: 120000, // 2 minutes
});

const result = await adapter.generate({
  prompt: 'Analyze sales data and create visualizations',
});
```

### Testing with Execution Tracing

```typescript
const adapter = createDeepAgentsAdapter(mySystem, {
  name: 'traced-system',
  captureTraces: true,
  captureMessages: true,
});

const result = await adapter.generate({ prompt: 'Complex task' });

// Access detailed execution information
const { metadata } = result.raw;

// See which agents were involved
console.log('Agents:', metadata.agentsInvolved);

// See tools used
console.log('Tools:', metadata.toolsUsed);

// See full trace of execution
for (const trace of metadata.traces) {
  console.log(`${trace.agent}: ${trace.action}`, trace.output);
}

// See inter-agent communication
for (const msg of metadata.messages) {
  console.log(`${msg.from} -> ${msg.to}: ${msg.content}`);
}
```

## Configuration Options

| Option              | Type      | Default    | Description                              |
| ------------------- | --------- | ---------- | ---------------------------------------- |
| `name`              | `string`  | -          | Identifier for the agent system          |
| `captureTraces`     | `boolean` | `true`     | Capture agent execution traces           |
| `captureMessages`   | `boolean` | `true`     | Capture inter-agent messages             |
| `executionTimeout`  | `number`  | `300000`   | Max execution time (ms)                  |
| `inputTransformer`  | `string`  | -          | Custom input transformer function        |
| `outputTransformer` | `string`  | -          | Custom output transformer function       |

## Supported System Types

The adapter supports DeepAgents systems that implement one of these methods:

- `invoke(input, config)` - Primary execution method
- `run(input, config)` - Alternative execution method
- `execute(input, config)` - Legacy execution method

All methods should return a `DeepAgentsOutput` object.

## Streaming Support

If your system supports streaming via `stream()`, the adapter will use it:

```typescript
for await (const chunk of adapter.stream({ prompt: 'Long task' }, console.log)) {
  // Process streaming events
}
```

## Execution Metadata

The adapter captures rich metadata about multi-agent execution:

```typescript
interface DeepAgentsExecutionMetadata {
  name?: string;                  // System name
  agentsInvolved: string[];       // All participating agents
  totalAgentCalls: number;        // Total agent invocations
  totalMessages: number;          // Messages exchanged
  totalToolCalls: number;         // Tool invocations across agents
  toolsUsed: string[];            // Unique tools used
  traces?: DeepAgentsTrace[];     // Full execution traces
  messages?: DeepAgentsMessage[]; // Full message log
  executionTimeMs?: number;       // Total execution time
}
```

## ArtemisKit Integration

Use with ArtemisKit scenarios:

```yaml
# scenario.yaml
name: multi-agent-test
provider: deepagents
scenarios:
  - name: Research Task
    input: 'Research and summarize recent AI developments'
    expected:
      contains: ['AI', 'development']
    metadata:
      minAgents: 2
```

```typescript
// Register adapter in your test setup
import { adapterRegistry } from '@artemiskit/core';
import { DeepAgentsAdapter } from '@artemiskit/adapter-deepagents';

adapterRegistry.register('deepagents', async (config) => {
  // Your system setup
  return new DeepAgentsAdapter(config, myTeam);
});
```

## License

Apache-2.0
