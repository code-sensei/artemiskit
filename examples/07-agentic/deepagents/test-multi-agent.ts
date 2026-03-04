/**
 * DeepAgents Multi-Agent System Testing Example
 *
 * This example demonstrates how to test a DeepAgents multi-agent system
 * using ArtemisKit's DeepAgents adapter.
 *
 * Note: This uses a mock DeepAgents-like implementation for demonstration.
 * Replace with actual DeepAgents imports when using the real framework.
 *
 * Run with:
 *   bun examples/agentic-testing/deepagents/test-multi-agent.ts
 */

import { DeepAgentsAdapter, createDeepAgentsAdapter } from '@artemiskit/adapter-deepagents';
import type {
  DeepAgentsConfig,
  DeepAgentsInput,
  DeepAgentsOutput,
  DeepAgentsSystem,
} from '@artemiskit/adapter-deepagents';

// ============================================
// Mock DeepAgents Implementation
// ============================================

/**
 * Mock Agent class representing a specialized AI agent
 */
class MockAgent {
  constructor(
    public name: string,
    public role: string,
    public expertise: string[]
  ) {}

  async process(input: string, context?: Record<string, unknown>): Promise<string> {
    // Simulate agent processing
    await new Promise((r) => setTimeout(r, 100));

    switch (this.name) {
      case 'researcher':
        return `[Research findings on "${input.slice(0, 50)}..."]: 
          - Key fact 1: Found relevant information about the topic
          - Key fact 2: Statistics indicate growing trends
          - Key fact 3: Expert sources confirm the analysis
          Sources: Academic journals, industry reports, expert interviews.`;

      case 'writer':
        return `[Written content based on research]:
          
          # ${input.slice(0, 30)}
          
          In today's rapidly evolving landscape, understanding ${input.slice(0, 20)} has become increasingly important.
          
          ## Key Insights
          
          Based on comprehensive research, we've identified several crucial factors...
          
          ## Conclusion
          
          The evidence clearly demonstrates the significance of this topic.`;

      case 'editor':
        return `[Edited and polished content]:
          
          ${input.replace(/\[.*?\]/g, '').trim()}
          
          *Content has been reviewed for clarity, accuracy, and engagement.*`;

      case 'analyst':
        return `[Analysis of "${input.slice(0, 30)}..."]:
          
          **Summary**: The topic presents significant opportunities and challenges.
          
          **Strengths**:
          - Growing market interest
          - Strong fundamentals
          
          **Weaknesses**:
          - Regulatory uncertainty
          - Implementation challenges
          
          **Recommendation**: Proceed with careful monitoring.`;

      default:
        return `[${this.name}]: Processed "${input.slice(0, 50)}..."`;
    }
  }
}

/**
 * Mock multi-agent team that orchestrates collaboration
 */
class MockTeam implements DeepAgentsSystem {
  private agents: MockAgent[];
  private workflow: 'sequential' | 'parallel';
  private traces: Array<{
    agent: string;
    action: string;
    input?: unknown;
    output?: unknown;
    timestamp: number;
    toolsUsed?: string[];
  }> = [];
  private messages: Array<{
    from: string;
    to: string;
    content: string;
    timestamp: number;
  }> = [];

  constructor(config: { agents: MockAgent[]; workflow: 'sequential' | 'parallel' }) {
    this.agents = config.agents;
    this.workflow = config.workflow;
  }

  async invoke(input: DeepAgentsInput, config?: DeepAgentsConfig): Promise<DeepAgentsOutput> {
    const startTime = Date.now();
    this.traces = [];
    this.messages = [];

    const task = input.task || input.query || input.input || '';
    let currentOutput = String(task);

    // Notify callbacks if provided
    const callbacks = config?.callbacks;

    if (this.workflow === 'sequential') {
      // Sequential: each agent processes the output of the previous
      for (const agent of this.agents) {
        // Agent start
        callbacks?.onAgentStart?.(agent.name, currentOutput);
        this.traces.push({
          agent: agent.name,
          action: 'start',
          input: currentOutput,
          timestamp: Date.now(),
        });

        // Simulate tool use for researcher
        if (agent.name === 'researcher') {
          callbacks?.onToolUse?.(agent.name, 'web_search', { query: task });
          this.traces.push({
            agent: agent.name,
            action: 'tool_use',
            input: { tool: 'web_search', query: task },
            timestamp: Date.now(),
            toolsUsed: ['web_search'],
          });
        }

        // Process
        const output = await agent.process(currentOutput);

        // Agent end
        callbacks?.onAgentEnd?.(agent.name, output);
        this.traces.push({
          agent: agent.name,
          action: 'end',
          output,
          timestamp: Date.now(),
        });

        // Inter-agent message
        const nextAgent = this.agents[this.agents.indexOf(agent) + 1];
        if (nextAgent) {
          const msg = {
            from: agent.name,
            to: nextAgent.name,
            content: `Here's my output for your review: ${output.slice(0, 100)}...`,
            timestamp: Date.now(),
          };
          callbacks?.onMessage?.(msg.from, msg.to, msg.content);
          this.messages.push(msg);
        }

        currentOutput = output;
      }
    } else {
      // Parallel: all agents process the same input, results merged
      const results = await Promise.all(
        this.agents.map(async (agent) => {
          callbacks?.onAgentStart?.(agent.name, task);
          this.traces.push({
            agent: agent.name,
            action: 'start',
            input: task,
            timestamp: Date.now(),
          });

          const output = await agent.process(String(task));

          callbacks?.onAgentEnd?.(agent.name, output);
          this.traces.push({
            agent: agent.name,
            action: 'end',
            output,
            timestamp: Date.now(),
          });

          return { agent: agent.name, output };
        })
      );

      currentOutput = results.map((r) => `## ${r.agent}\n${r.output}`).join('\n\n');
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      result: currentOutput,
      output: currentOutput,
      agents: this.agents.map((a) => a.name),
      traces: this.traces,
      messages: this.messages,
      executionTimeMs,
      tokenUsage: {
        prompt: 500,
        completion: 800,
        total: 1300,
      },
    };
  }
}

// ============================================
// Create the Multi-Agent System
// ============================================

// Define specialized agents
const researcher = new MockAgent('researcher', 'Research and gather information', [
  'search',
  'analysis',
  'fact-checking',
]);

const writer = new MockAgent('writer', 'Write clear, engaging content', [
  'writing',
  'storytelling',
  'communication',
]);

const editor = new MockAgent('editor', 'Review and improve content quality', [
  'grammar',
  'style',
  'coherence',
]);

const analyst = new MockAgent('analyst', 'Analyze data and provide insights', [
  'data-analysis',
  'strategy',
  'recommendations',
]);

// Create sequential content team
const contentTeam = new MockTeam({
  agents: [researcher, writer, editor],
  workflow: 'sequential',
});

// Create parallel analysis team
const analysisTeam = new MockTeam({
  agents: [researcher, analyst],
  workflow: 'parallel',
});

// ============================================
// Wrap with ArtemisKit Adapters
// ============================================

const contentAdapter = createDeepAgentsAdapter(contentTeam, {
  name: 'content-team',
  captureTraces: true,
  captureMessages: true,
  executionTimeout: 60000,
});

const analysisAdapter = createDeepAgentsAdapter(analysisTeam, {
  name: 'analysis-team',
  captureTraces: true,
  captureMessages: true,
});

// ============================================
// Test Functions
// ============================================

async function testContentTeam() {
  console.log('=== Content Team Test (Sequential Workflow) ===\n');

  const result = await contentAdapter.generate({
    prompt: 'Write a blog post about the future of artificial intelligence',
  });

  console.log('Task: Write a blog post about AI');
  console.log('Output preview:', result.text.slice(0, 300), '...\n');
  console.log('Latency:', result.latencyMs, 'ms');
  console.log('Tokens:', result.tokens);

  // Access metadata
  const metadata = result.raw?.metadata as {
    agentsInvolved?: string[];
    totalAgentCalls?: number;
    totalMessages?: number;
    totalToolCalls?: number;
    toolsUsed?: string[];
    traces?: Array<{ agent: string; action: string }>;
  };

  console.log('\nExecution Metadata:');
  console.log('  Agents involved:', metadata?.agentsInvolved);
  console.log('  Total agent calls:', metadata?.totalAgentCalls);
  console.log('  Total messages:', metadata?.totalMessages);
  console.log('  Total tool calls:', metadata?.totalToolCalls);
  console.log('  Tools used:', metadata?.toolsUsed);

  // Verify sequential execution
  const traces = metadata?.traces || [];
  const agentOrder = traces.filter((t) => t.action === 'start').map((t) => t.agent);

  console.log('  Execution order:', agentOrder);

  const expectedOrder = ['researcher', 'writer', 'editor'];
  const orderCorrect = JSON.stringify(agentOrder) === JSON.stringify(expectedOrder);
  console.log('  Correct order:', orderCorrect ? '✅' : '❌');

  // Verify output contains content from all agents
  const hasResearch = result.text.includes('Research') || result.text.includes('findings');
  const hasWriting = result.text.includes('#') || result.text.includes('Insights');
  const hasEditing = result.text.includes('reviewed') || result.text.includes('polished');

  console.log('\nOutput Verification:');
  console.log('  Contains research:', hasResearch ? '✅' : '❌');
  console.log('  Contains writing:', hasWriting ? '✅' : '❌');
  console.log('  Contains editing:', hasEditing ? '✅' : '❌');
  console.log();

  return orderCorrect && hasResearch && hasWriting;
}

async function testAnalysisTeam() {
  console.log('=== Analysis Team Test (Parallel Workflow) ===\n');

  const result = await analysisAdapter.generate({
    prompt: 'Analyze the cryptocurrency market trends for 2024',
  });

  console.log('Task: Analyze cryptocurrency market');
  console.log('Output preview:', result.text.slice(0, 400), '...\n');

  const metadata = result.raw?.metadata as {
    agentsInvolved?: string[];
    totalAgentCalls?: number;
    traces?: Array<{ agent: string; action: string; timestamp: number }>;
  };

  console.log('Execution Metadata:');
  console.log('  Agents involved:', metadata?.agentsInvolved);
  console.log('  Total agent calls:', metadata?.totalAgentCalls);

  // In parallel workflow, both agents should start at nearly the same time
  const traces = metadata?.traces || [];
  const startTraces = traces.filter((t) => t.action === 'start');

  if (startTraces.length >= 2) {
    const timeDiff = Math.abs(startTraces[1].timestamp - startTraces[0].timestamp);
    console.log('  Start time difference:', timeDiff, 'ms (should be small for parallel)');
    console.log('  Parallel execution:', timeDiff < 50 ? '✅' : '⚠️');
  }

  // Verify output contains both agent contributions
  const hasResearch = result.text.includes('researcher') || result.text.includes('Research');
  const hasAnalysis = result.text.includes('analyst') || result.text.includes('Analysis');

  console.log('\nOutput Verification:');
  console.log('  Contains research section:', hasResearch ? '✅' : '❌');
  console.log('  Contains analysis section:', hasAnalysis ? '✅' : '❌');
  console.log();

  return hasResearch && hasAnalysis;
}

async function testInterAgentCommunication() {
  console.log('=== Inter-Agent Communication Test ===\n');

  const result = await contentAdapter.generate({
    prompt: 'Create a technical whitepaper outline',
  });

  const metadata = result.raw?.metadata as {
    messages?: Array<{ from: string; to: string; content: string }>;
    totalMessages?: number;
  };

  console.log('Inter-agent messages captured:', metadata?.totalMessages);

  if (metadata?.messages?.length) {
    console.log('\nMessage Log:');
    metadata.messages.forEach((msg, i) => {
      console.log(`  ${i + 1}. ${msg.from} → ${msg.to}:`);
      console.log(`     "${msg.content.slice(0, 60)}..."`);
    });
  }

  const hasMessages = (metadata?.totalMessages || 0) > 0;
  console.log('\nMessages captured:', hasMessages ? '✅' : '❌');
  console.log();

  return hasMessages;
}

async function testToolUsageTracking() {
  console.log('=== Tool Usage Tracking Test ===\n');

  const result = await contentAdapter.generate({
    prompt: 'Research the latest developments in quantum computing',
  });

  const metadata = result.raw?.metadata as {
    toolsUsed?: string[];
    totalToolCalls?: number;
    traces?: Array<{
      agent: string;
      action: string;
      toolsUsed?: string[];
    }>;
  };

  console.log('Tools used:', metadata?.toolsUsed);
  console.log('Total tool calls:', metadata?.totalToolCalls);

  // Find tool traces
  const toolTraces = metadata?.traces?.filter((t) => t.action === 'tool_use') || [];
  console.log('\nTool Call Details:');
  toolTraces.forEach((trace) => {
    console.log(`  - ${trace.agent} used: ${trace.toolsUsed?.join(', ')}`);
  });

  const usedTools = (metadata?.toolsUsed?.length || 0) > 0;
  console.log('\nTool usage tracked:', usedTools ? '✅' : '❌');
  console.log();

  return usedTools;
}

async function testAdapterCapabilities() {
  console.log('=== Adapter Capabilities ===\n');

  const caps = await contentAdapter.capabilities();

  console.log('  Streaming:', caps.streaming ? '✅' : '❌');
  console.log('  Function Calling:', caps.functionCalling ? '✅' : '❌');
  console.log('  Tool Use:', caps.toolUse ? '✅' : '❌');
  console.log('  Max Context:', caps.maxContext);
  console.log();
}

async function testErrorHandling() {
  console.log('=== Error Handling Test ===\n');

  // Test with empty input
  try {
    const result = await contentAdapter.generate({
      prompt: '',
    });
    console.log('Empty input handled gracefully:', result.text ? '✅' : '⚠️');
  } catch (error) {
    console.log('Empty input threw error (expected):', error instanceof Error ? '✅' : '❌');
  }

  // Test with very long input
  const longInput = `Analyze this topic: ${'Lorem ipsum '.repeat(100)}`;
  try {
    const result = await contentAdapter.generate({
      prompt: longInput,
    });
    console.log('Long input handled:', result.text.length > 0 ? '✅' : '❌');
  } catch (error) {
    console.log('Long input error:', error);
  }

  console.log();
}

// ============================================
// Main Runner
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  DeepAgents Multi-Agent Testing with ArtemisKit        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const results: Record<string, boolean> = {};

  try {
    results['Content Team'] = await testContentTeam();
    results['Analysis Team'] = await testAnalysisTeam();
    results['Inter-Agent Communication'] = await testInterAgentCommunication();
    results['Tool Usage Tracking'] = await testToolUsageTracking();
    await testAdapterCapabilities();
    await testErrorHandling();

    // Summary
    console.log('=== Test Summary ===\n');
    let passed = 0;
    let total = 0;
    for (const [name, result] of Object.entries(results)) {
      console.log(`  ${name}: ${result ? '✅' : '❌'}`);
      if (result) passed++;
      total++;
    }
    console.log(`\nTotal: ${passed}/${total} tests passed`);
  } catch (error) {
    console.error('Error running tests:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.main) {
  main();
}

export { contentTeam, analysisTeam, contentAdapter, analysisAdapter };
