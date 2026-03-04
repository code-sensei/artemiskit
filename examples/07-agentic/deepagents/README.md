# Testing DeepAgents Multi-Agent Systems with ArtemisKit

This guide covers testing DeepAgents multi-agent systems, teams, and collaborative workflows using the `@artemiskit/adapter-deepagents` adapter.

## Installation

```bash
# ArtemisKit packages
bun add @artemiskit/core @artemiskit/cli @artemiskit/adapter-deepagents

# DeepAgents framework
bun add deepagents
```

## Adapter Overview

The DeepAgents adapter wraps multi-agent systems that coordinate multiple specialized agents working together on complex tasks. It supports:

- **Teams**: Groups of agents working sequentially or in parallel
- **Orchestrators**: Coordinator agents that delegate to specialists
- **Workflows**: Defined pipelines of agent collaboration
- **Swarms**: Dynamic agent coordination patterns

## Basic Usage

### Wrapping a Multi-Agent System

```typescript
import { createTeam, Agent } from 'deepagents';
import { createDeepAgentsAdapter, DeepAgentsAdapter } from '@artemiskit/adapter-deepagents';

// 1. Define your agents
const researcher = new Agent({
  name: 'researcher',
  role: 'Research and gather information',
  model: 'gpt-4',
  tools: [searchTool, wikitool],
});

const writer = new Agent({
  name: 'writer',
  role: 'Write clear, engaging content',
  model: 'gpt-4',
});

const editor = new Agent({
  name: 'editor',
  role: 'Review and improve content quality',
  model: 'gpt-4',
});

// 2. Create a team
const contentTeam = createTeam({
  name: 'content-team',
  agents: [researcher, writer, editor],
  workflow: 'sequential', // researcher → writer → editor
});

// 3. Wrap with ArtemisKit adapter
const adapter = createDeepAgentsAdapter(contentTeam, {
  name: 'content-team',
  captureTraces: true,
  captureMessages: true,
});

// 4. Use the adapter
const result = await adapter.generate({
  prompt: 'Write a blog post about machine learning trends in 2024',
});

console.log(result.text);
console.log(result.raw.metadata.agentsInvolved); // ['researcher', 'writer', 'editor']
```

## Configuration Options

```typescript
interface DeepAgentsAdapterConfig {
  // Required
  provider: 'deepagents';
  
  // Optional
  name?: string;                  // Identifier for reports
  captureTraces?: boolean;        // Capture agent execution traces (default: true)
  captureMessages?: boolean;      // Capture inter-agent messages (default: true)
  executionTimeout?: number;      // Max execution time in ms (default: 300000 = 5min)
  inputTransformer?: string;      // Custom input transform function
  outputTransformer?: string;     // Custom output transform function
}
```

## Agent System Types

The adapter supports various multi-agent patterns:

### Sequential Teams

Agents work in order, passing output to the next:

```typescript
const team = createTeam({
  workflow: 'sequential',
  agents: [researchAgent, analysisAgent, summaryAgent],
});
```

### Parallel Teams

Agents work simultaneously, results are aggregated:

```typescript
const team = createTeam({
  workflow: 'parallel',
  agents: [searchAgent, databaseAgent, apiAgent],
  aggregator: 'merge', // or 'first', 'vote', 'custom'
});
```

### Orchestrator Pattern

A lead agent delegates to specialists:

```typescript
const orchestrator = createOrchestrator({
  coordinator: managerAgent,
  specialists: [codeAgent, testAgent, docAgent],
});
```

## Writing Test Scenarios

### Basic Multi-Agent Scenario

```yaml
# scenarios/multi-agent-eval.yaml
name: Multi-Agent Content Team
description: Test content creation workflow

provider: deepagents
model: content-team

cases:
  - id: blog-post
    name: Blog post generation
    prompt: "Write a blog post about AI safety"
    expected:
      type: llm_grader
      rubric: |
        Evaluate the content for:
        1. Research quality (facts, sources)
        2. Writing quality (clarity, engagement)
        3. Editing quality (grammar, flow)
      threshold: 0.8
```

### Agent Collaboration Scenarios

```yaml
# Test that specific agents are involved
cases:
  - id: research-task
    name: Research-heavy task
    prompt: "Compile statistics on global renewable energy adoption"
    expected:
      type: llm_grader
      rubric: |
        Response should include:
        - Specific statistics and numbers
        - Source citations or references
        - Data from multiple sources
      threshold: 0.8
    tags:
      - research
      - collaboration
```

## Running Tests

### From Command Line

```bash
# Run multi-agent scenarios
bun packages/cli/bin/artemis.ts run examples/agentic-testing/deepagents/scenarios/multi-agent-eval.yaml --provider deepagents

# With verbose logging to see agent traces
bun packages/cli/bin/artemis.ts run scenarios/multi-agent-eval.yaml --provider deepagents --verbose

# Generate detailed report
bun packages/cli/bin/artemis.ts run scenarios/multi-agent-eval.yaml --report html --output report.html
```

### Programmatic Testing

```typescript
import { ArtemisRunner } from '@artemiskit/core';
import { createDeepAgentsAdapter } from '@artemiskit/adapter-deepagents';

const adapter = createDeepAgentsAdapter(myTeam);
const runner = new ArtemisRunner({ adapter });

const results = await runner.runScenario('./scenarios/team-eval.yaml');

// Analyze agent performance
results.cases.forEach(c => {
  const meta = c.raw?.metadata;
  console.log(`Case: ${c.id}`);
  console.log(`  Agents: ${meta?.agentsInvolved?.join(', ')}`);
  console.log(`  Messages: ${meta?.totalMessages}`);
  console.log(`  Tool calls: ${meta?.totalToolCalls}`);
});
```

## Accessing Execution Metadata

The adapter captures rich metadata about multi-agent execution:

```typescript
const result = await adapter.generate({ prompt: '...' });
const metadata = result.raw.metadata;

console.log(metadata.name);             // 'content-team'
console.log(metadata.agentsInvolved);   // ['researcher', 'writer', 'editor']
console.log(metadata.totalAgentCalls);  // 6 (start + end for each)
console.log(metadata.totalMessages);    // 4 (inter-agent messages)
console.log(metadata.totalToolCalls);   // 2 (tools used)
console.log(metadata.toolsUsed);        // ['web_search', 'calculator']
console.log(metadata.executionTimeMs);  // 15234
```

### Trace Structure

```typescript
interface DeepAgentsTrace {
  agent: string;       // Agent name
  action: string;      // 'start' | 'end' | 'tool_use'
  input?: unknown;     // Input to agent/action
  output?: unknown;    // Output/result
  timestamp: number;   // Unix timestamp
  durationMs?: number; // Duration of this step
  toolsUsed?: string[];
}
```

### Message Structure

```typescript
interface DeepAgentsMessage {
  from: string;        // Sender agent
  to: string;          // Recipient agent
  content: string;     // Message content
  type?: 'request' | 'response' | 'broadcast' | 'delegation';
  timestamp: number;
}
```

## Streaming Support

For systems that support streaming:

```typescript
const adapter = createDeepAgentsAdapter(streamableSystem);

for await (const chunk of adapter.stream(
  { prompt: 'Write a comprehensive report' },
  (text) => process.stdout.write(text)
)) {
  // Streaming output with real-time progress
}
```

## Common Patterns

### Testing Role Specialization

Verify each agent contributes according to their role:

```typescript
const result = await adapter.generate({
  prompt: 'Research quantum computing and write a technical summary',
});

const traces = result.raw.metadata.traces;

// Verify researcher ran first
const researcherTrace = traces.find(t => t.agent === 'researcher' && t.action === 'end');
expect(researcherTrace).toBeDefined();

// Verify researcher used search tools
expect(researcherTrace.toolsUsed).toContain('web_search');
```

### Testing Error Recovery

```yaml
cases:
  - id: error-recovery
    name: Handle partial failure gracefully
    prompt: "Fetch data from [invalid-url] and summarize it"
    expected:
      type: llm_grader
      rubric: |
        System should:
        - Acknowledge the fetch failure
        - Not crash or hang
        - Provide a helpful response about the issue
      threshold: 0.7
```

### Testing Collaboration Quality

```yaml
cases:
  - id: collaboration-quality
    name: Verify meaningful collaboration
    prompt: "Create a marketing plan for a new product"
    expected:
      type: llm_grader
      rubric: |
        The output should show evidence of multi-agent collaboration:
        - Market research (from researcher)
        - Creative content (from writer)
        - Strategic recommendations (from strategist)
        Each component should build on the others.
      threshold: 0.85
```

## Troubleshooting

### "No execution method available"

Your system must implement `invoke()`, `run()`, or `execute()`:

```typescript
// ✅ Correct - Team with invoke
const team = createTeam({ agents, workflow: 'sequential' });

// ❌ Incorrect - Plain object
const notASystem = { agents: [a, b], process: (x) => x };
```

### Timeout Errors

Multi-agent systems can be slow. Increase timeout:

```typescript
const adapter = createDeepAgentsAdapter(team, {
  executionTimeout: 600000, // 10 minutes for complex workflows
});
```

### Missing Traces

Ensure callbacks are supported by your system:

```typescript
const team = createTeam({
  agents,
  // Enable tracing
  tracing: true,
  verbose: true,
});
```

### Message Capture Not Working

Some systems don't emit inter-agent messages. Check system configuration:

```typescript
const team = createTeam({
  agents,
  // Enable message logging
  messageLogging: true,
});
```

## Example Files

- [`test-multi-agent.ts`](./test-multi-agent.ts) - Multi-agent system testing example
- [`scenarios/multi-agent-eval.yaml`](./scenarios/multi-agent-eval.yaml) - Multi-agent evaluation scenarios

## See Also

- [DeepAgents Documentation](https://deepagents.dev/) (hypothetical)
- [ArtemisKit Core](../../../packages/core/README.md)
- [Agentic Testing Overview](../README.md)
