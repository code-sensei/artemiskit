# Agentic AI Testing with ArtemisKit

This guide explains how to test **agentic AI systems** — chains, agents, and multi-agent workflows — using ArtemisKit's specialized adapters.

## What is Agentic Testing?

Agentic AI systems are more complex than simple prompt → response models. They involve:

- **Chains**: Sequential pipelines that process data through multiple steps
- **Agents**: Autonomous systems that use tools and make decisions
- **Multi-agent systems**: Collaborative workflows with multiple specialized agents

Testing these systems requires evaluating not just the final output, but also:

- Tool usage and selection
- Decision-making quality
- Agent collaboration patterns
- Intermediate reasoning steps

## Supported Frameworks

ArtemisKit provides first-class adapters for popular agentic frameworks:

| Adapter | Framework | Use Case |
|---------|-----------|----------|
| `@artemiskit/adapter-langchain` | LangChain.js | Chains, LCEL pipelines, agents |
| `@artemiskit/adapter-deepagents` | DeepAgents | Multi-agent systems, teams |

## Directory Structure

```
agentic-testing/
├── README.md                  # This guide
├── langchain/
│   ├── README.md              # LangChain-specific guide
│   ├── test-chain.ts          # Test a simple chain
│   ├── test-agent.ts          # Test an agent with tools
│   └── scenarios/
│       └── chain-eval.yaml    # Chain evaluation scenarios
└── deepagents/
    ├── README.md              # DeepAgents-specific guide
    ├── test-multi-agent.ts    # Test a multi-agent system
    └── scenarios/
        └── multi-agent-eval.yaml  # Multi-agent scenarios
```

## Quick Start

### 1. Install Dependencies

```bash
# Core ArtemisKit
bun add @artemiskit/core @artemiskit/cli

# Choose your adapter(s)
bun add @artemiskit/adapter-langchain   # For LangChain
bun add @artemiskit/adapter-deepagents  # For DeepAgents

# Framework-specific dependencies
bun add @langchain/openai @langchain/core  # For LangChain
bun add deepagents                         # For DeepAgents (hypothetical)
```

### 2. Wrap Your Agent

```typescript
import { createLangChainAdapter } from '@artemiskit/adapter-langchain';

// Your LangChain chain or agent
const chain = prompt.pipe(model).pipe(outputParser);

// Wrap for ArtemisKit testing
const adapter = createLangChainAdapter(chain, {
  name: 'my-chain',
  runnableType: 'chain',
});
```

### 3. Define Scenarios

```yaml
# scenarios/my-chain.yaml
name: My Chain Tests
description: Evaluate chain accuracy and quality

provider: langchain
model: gpt-4

cases:
  - id: basic-query
    prompt: "What is the capital of France?"
    expected:
      type: contains
      values: ["Paris"]
```

### 4. Run Tests

```bash
# Run from examples directory
bun packages/cli/bin/artemis.ts run examples/agentic-testing/langchain/scenarios/chain-eval.yaml --provider langchain

# Or with npm
npx artemis run scenarios/chain-eval.yaml --provider langchain
```

## Key Concepts

### Adapter Configuration

Both adapters share common configuration options:

```typescript
interface AgenticAdapterConfig {
  // Provider identifier
  provider: 'langchain' | 'deepagents';
  
  // Human-readable name for reports
  name?: string;
  
  // Capture execution details for debugging
  captureTraces?: boolean;        // Agent execution traces
  captureIntermediateSteps?: boolean;  // Tool calls (LangChain)
  captureMessages?: boolean;      // Inter-agent messages (DeepAgents)
}
```

### Evaluating Tool Usage

For agents that use tools, you can validate tool selection and usage:

```yaml
cases:
  - id: calculator-agent
    prompt: "What is 234 * 567?"
    expected:
      type: llm_grader
      rubric: |
        Agent should use a calculator tool rather than mental math.
        Result should be exactly 132678.
      threshold: 0.9
```

### Testing Multi-Agent Collaboration

For DeepAgents multi-agent systems:

```yaml
cases:
  - id: research-write-task
    prompt: "Research and write a blog post about quantum computing"
    expected:
      type: llm_grader
      rubric: |
        - Research agent should gather facts
        - Writer agent should produce coherent content
        - Output should include sources/citations
      threshold: 0.8
```

## Best Practices

### 1. Test Incrementally

- Start with simple chains
- Add complexity gradually (tools, multi-agent)
- Isolate failures by testing components individually

### 2. Set Appropriate Timeouts

Agentic systems can be slow:

```typescript
const adapter = createDeepAgentsAdapter(system, {
  executionTimeout: 300000, // 5 minutes for complex workflows
});
```

### 3. Capture Traces for Debugging

Enable trace capture during development:

```typescript
const adapter = createLangChainAdapter(agent, {
  captureIntermediateSteps: true,  // See every tool call
});
```

### 4. Use LLM Graders for Complex Evaluation

When exact matching isn't possible:

```yaml
expected:
  type: llm_grader
  rubric: |
    Evaluate whether the agent:
    1. Identified the correct tool to use
    2. Provided accurate information
    3. Explained its reasoning clearly
  threshold: 0.85
```

### 5. Test Edge Cases

- What happens when tools fail?
- How does the agent handle ambiguous queries?
- Does the multi-agent system recover from errors?

## Examples

- [LangChain Chain Testing](./langchain/test-chain.ts)
- [LangChain Agent Testing](./langchain/test-agent.ts)
- [DeepAgents Multi-Agent Testing](./deepagents/test-multi-agent.ts)

## CLI Commands

```bash
# Run LangChain scenarios
bun packages/cli/bin/artemis.ts run scenarios/chain-eval.yaml --provider langchain

# Run DeepAgents scenarios
bun packages/cli/bin/artemis.ts run scenarios/multi-agent-eval.yaml --provider deepagents

# Run with verbose output
bun packages/cli/bin/artemis.ts run scenarios/chain-eval.yaml --provider langchain --verbose

# Generate HTML report
bun packages/cli/bin/artemis.ts run scenarios/chain-eval.yaml --report html
```

## Troubleshooting

### "No execution method available"

Your system must implement `invoke()`, `run()`, or `execute()`:

```typescript
// ✅ Correct
const chain = prompt.pipe(model).pipe(parser); // Has invoke()

// ❌ Incorrect - plain function
const fn = (input) => model.call(input);
```

### "Timeout exceeded"

Increase the execution timeout:

```typescript
const adapter = createDeepAgentsAdapter(system, {
  executionTimeout: 600000, // 10 minutes
});
```

### Missing intermediate steps

Ensure your agent is configured to return steps:

```typescript
const agent = new AgentExecutor({
  agent: myAgent,
  tools: myTools,
  returnIntermediateSteps: true, // Required!
});
```

## See Also

- [LangChain Adapter API](../../../packages/adapters/langchain/README.md)
- [DeepAgents Adapter API](../../../packages/adapters/deepagents/README.md)
- [Scenario File Reference](../../scenarios/README.md)
- [Evaluator Types](../../scenarios/evaluators/README.md)
