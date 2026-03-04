/**
 * LangChain Agent Testing Example
 *
 * This example demonstrates how to test a LangChain agent with tools
 * using ArtemisKit's LangChain adapter.
 *
 * Run with:
 *   bun examples/agentic-testing/langchain/test-agent.ts
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { LangChainAdapter, createLangChainAdapter } from '@artemiskit/adapter-langchain';

// ============================================
// 1. Define custom tools
// ============================================

/**
 * Calculator tool for mathematical operations
 */
const calculatorTool = new DynamicStructuredTool({
  name: 'calculator',
  description: 'Perform mathematical calculations. Use this for any math operations.',
  schema: z.object({
    expression: z.string().describe('The mathematical expression to evaluate (e.g., "2 + 3 * 4")'),
  }),
  func: async ({ expression }) => {
    try {
      // Simple eval for demo - in production, use a proper math parser
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
      const result = Function(`'use strict'; return (${sanitized})`)();
      return `${result}`;
    } catch (error) {
      return `Error evaluating expression: ${error}`;
    }
  },
});

/**
 * Weather tool (simulated)
 */
const weatherTool = new DynamicStructuredTool({
  name: 'get_weather',
  description: 'Get the current weather for a location.',
  schema: z.object({
    location: z.string().describe('The city and country (e.g., "London, UK")'),
  }),
  func: async ({ location }) => {
    // Simulated weather data
    const weatherData: Record<string, string> = {
      london: 'Cloudy, 12°C, 70% humidity',
      'new york': 'Sunny, 22°C, 45% humidity',
      tokyo: 'Rainy, 18°C, 85% humidity',
      paris: 'Partly cloudy, 15°C, 60% humidity',
      sydney: 'Clear, 28°C, 40% humidity',
    };

    const key = location.toLowerCase().split(',')[0].trim();
    return weatherData[key] || `Weather data unavailable for ${location}`;
  },
});

/**
 * Search tool (simulated)
 */
const searchTool = new DynamicStructuredTool({
  name: 'web_search',
  description: 'Search the web for information. Use for current events or facts.',
  schema: z.object({
    query: z.string().describe('The search query'),
  }),
  func: async ({ query }) => {
    // Simulated search results
    return `Search results for "${query}": Found relevant information about ${query}. This is simulated search data for testing purposes.`;
  },
});

const tools = [calculatorTool, weatherTool, searchTool];

// ============================================
// 2. Create the agent
// ============================================

// Initialize the model
const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
});

// Create the agent prompt
const agentPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a helpful assistant with access to tools.
Use the calculator for any math operations.
Use get_weather for weather questions.
Use web_search for general knowledge questions.

Always explain your reasoning before using a tool.`,
  ],
  ['human', '{input}'],
  new MessagesPlaceholder('agent_scratchpad'),
]);

// Create the agent
const agent = createToolCallingAgent({
  llm: model,
  tools,
  prompt: agentPrompt,
});

// Create the agent executor
const agentExecutor = new AgentExecutor({
  agent,
  tools,
  returnIntermediateSteps: true, // Important for capturing tool usage
  verbose: false,
});

// ============================================
// 3. Wrap with ArtemisKit adapter
// ============================================

const adapter = createLangChainAdapter(agentExecutor, {
  name: 'tool-agent',
  runnableType: 'agent',
  captureIntermediateSteps: true,
});

// ============================================
// 4. Test the agent
// ============================================

async function testCalculator() {
  console.log('=== Calculator Tool Test ===\n');

  const result = await adapter.generate({
    prompt: 'What is 234 multiplied by 567?',
  });

  console.log('Query: What is 234 multiplied by 567?');
  console.log('Response:', result.text);
  console.log('Latency:', result.latencyMs, 'ms');

  // Check metadata for tool usage
  const metadata = result.raw?.metadata as {
    toolsUsed?: string[];
    totalToolCalls?: number;
    intermediateSteps?: Array<{
      action: { tool: string; toolInput: unknown };
      observation: string;
    }>;
  };

  if (metadata?.toolsUsed) {
    console.log('Tools used:', metadata.toolsUsed);
    console.log('Total tool calls:', metadata.totalToolCalls);
  }

  // Verify correctness
  const expected = 234 * 567; // 132678
  const passed = result.text.includes('132678');
  console.log('Expected:', expected);
  console.log('Pass:', passed ? '✅' : '❌');
  console.log();

  return passed;
}

async function testWeather() {
  console.log('=== Weather Tool Test ===\n');

  const result = await adapter.generate({
    prompt: "What's the weather like in Tokyo?",
  });

  console.log("Query: What's the weather like in Tokyo?");
  console.log('Response:', result.text);

  const metadata = result.raw?.metadata as { toolsUsed?: string[] };
  if (metadata?.toolsUsed) {
    console.log('Tools used:', metadata.toolsUsed);
  }

  // Check if weather tool was used
  const usedWeatherTool = metadata?.toolsUsed?.includes('get_weather');
  const hasWeatherInfo =
    result.text.toLowerCase().includes('rain') ||
    result.text.toLowerCase().includes('18') ||
    result.text.toLowerCase().includes('humidity');

  console.log('Used weather tool:', usedWeatherTool ? '✅' : '❌');
  console.log('Contains weather info:', hasWeatherInfo ? '✅' : '❌');
  console.log();

  return usedWeatherTool && hasWeatherInfo;
}

async function testToolSelection() {
  console.log('=== Tool Selection Test ===\n');

  // Question that should NOT require tools
  const result = await adapter.generate({
    prompt: 'What is the capital of France?',
  });

  console.log('Query: What is the capital of France?');
  console.log('Response:', result.text);

  const metadata = result.raw?.metadata as { toolsUsed?: string[] };
  console.log('Tools used:', metadata?.toolsUsed?.length || 0);

  // This might or might not use tools depending on the model
  const correctAnswer = result.text.toLowerCase().includes('paris');
  console.log('Contains correct answer:', correctAnswer ? '✅' : '❌');
  console.log();

  return correctAnswer;
}

async function testMultiStepReasoning() {
  console.log('=== Multi-Step Reasoning Test ===\n');

  const result = await adapter.generate({
    prompt:
      'If a product costs $45.99 and I have a 20% discount, how much will I pay? Then tell me the weather in London.',
  });

  console.log('Query: Multi-step task (calculation + weather)');
  console.log('Response:', result.text);

  const metadata = result.raw?.metadata as {
    toolsUsed?: string[];
    totalToolCalls?: number;
  };

  if (metadata) {
    console.log('Tools used:', metadata.toolsUsed);
    console.log('Total tool calls:', metadata.totalToolCalls);
  }

  // Check for both results
  const expectedPrice = 45.99 * 0.8; // 36.792
  const hasPrice = result.text.includes('36.79') || result.text.includes('36.80');
  const hasWeather =
    result.text.toLowerCase().includes('london') &&
    (result.text.toLowerCase().includes('cloudy') || result.text.includes('12'));

  console.log('Has correct price (~$36.79):', hasPrice ? '✅' : '❌');
  console.log('Has London weather:', hasWeather ? '✅' : '❌');
  console.log();

  return hasPrice && hasWeather;
}

async function testIntermediateSteps() {
  console.log('=== Intermediate Steps Inspection ===\n');

  const result = await adapter.generate({
    prompt: 'Calculate 100 divided by 4, then multiply by 3',
  });

  console.log('Query: 100 / 4 * 3');
  console.log('Response:', result.text);

  const metadata = result.raw?.metadata as {
    intermediateSteps?: Array<{
      action: { tool: string; toolInput: unknown; log?: string };
      observation: string;
    }>;
  };

  if (metadata?.intermediateSteps?.length) {
    console.log('\nIntermediate Steps:');
    metadata.intermediateSteps.forEach((step, i) => {
      console.log(`  Step ${i + 1}:`);
      console.log(`    Tool: ${step.action.tool}`);
      console.log(`    Input: ${JSON.stringify(step.action.toolInput)}`);
      console.log(`    Observation: ${step.observation}`);
    });
  }

  // 100 / 4 = 25, 25 * 3 = 75
  const passed = result.text.includes('75');
  console.log('\nExpected result: 75');
  console.log('Pass:', passed ? '✅' : '❌');
  console.log();

  return passed;
}

async function testAgentCapabilities() {
  console.log('=== Agent Capabilities ===\n');

  const caps = await adapter.capabilities();

  console.log('  Streaming:', caps.streaming ? '✅' : '❌');
  console.log('  Function Calling:', caps.functionCalling ? '✅' : '❌');
  console.log('  Tool Use:', caps.toolUse ? '✅' : '❌');
  console.log('  Max Context:', caps.maxContext);
  console.log();
}

// ============================================
// Main runner
// ============================================

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  LangChain Agent Testing with ArtemisKit     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const results: Record<string, boolean> = {};

  try {
    results['Calculator'] = await testCalculator();
    results['Weather'] = await testWeather();
    results['Tool Selection'] = await testToolSelection();
    results['Multi-Step'] = await testMultiStepReasoning();
    results['Intermediate Steps'] = await testIntermediateSteps();
    await testAgentCapabilities();

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

export { agentExecutor, adapter, tools };
