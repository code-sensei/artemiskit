/**
 * LangChain Chain Testing Example
 *
 * This example demonstrates how to test a LangChain LCEL chain
 * using ArtemisKit's LangChain adapter.
 *
 * Run with:
 *   bun examples/agentic-testing/langchain/test-chain.ts
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { createLangChainAdapter, LangChainAdapter } from '@artemiskit/adapter-langchain';

// ============================================
// 1. Create your LangChain chain
// ============================================

// Initialize the model
const model = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
});

// Create a prompt template
const prompt = ChatPromptTemplate.fromTemplate(`
You are a helpful assistant that answers questions concisely.

Question: {input}

Provide a brief, accurate answer.
`);

// Create the output parser
const outputParser = new StringOutputParser();

// Build the chain using LCEL (LangChain Expression Language)
const chain = prompt.pipe(model).pipe(outputParser);

// Alternative: Use RunnableSequence explicitly
const chainExplicit = RunnableSequence.from([prompt, model, outputParser]);

// ============================================
// 2. Wrap with ArtemisKit adapter
// ============================================

const adapter = createLangChainAdapter(chain, {
  name: 'qa-chain',
  runnableType: 'chain',
});

// ============================================
// 3. Test the chain directly
// ============================================

async function testChainDirectly() {
  console.log('=== Direct Chain Testing ===\n');

  // Test case 1: Simple factual question
  const result1 = await adapter.generate({
    prompt: 'What is the capital of Japan?',
  });

  console.log('Test 1: Capital of Japan');
  console.log('  Response:', result1.text);
  console.log('  Latency:', result1.latencyMs, 'ms');
  console.log('  Pass:', result1.text.toLowerCase().includes('tokyo') ? '✅' : '❌');
  console.log();

  // Test case 2: Mathematical question
  const result2 = await adapter.generate({
    prompt: 'What is 15 + 27?',
  });

  console.log('Test 2: Simple Math');
  console.log('  Response:', result2.text);
  console.log('  Pass:', result2.text.includes('42') ? '✅' : '❌');
  console.log();

  // Test case 3: Date question
  const result3 = await adapter.generate({
    prompt: 'What year did World War II end?',
  });

  console.log('Test 3: Historical Date');
  console.log('  Response:', result3.text);
  console.log('  Pass:', result3.text.includes('1945') ? '✅' : '❌');
  console.log();
}

// ============================================
// 4. Test with chat messages format
// ============================================

async function testWithChatMessages() {
  console.log('=== Chat Messages Format Testing ===\n');

  const result = await adapter.generate({
    prompt: [
      { role: 'system', content: 'You are a geography expert.' },
      { role: 'user', content: 'Name three countries in South America.' },
    ],
  });

  console.log('Test: South American Countries');
  console.log('  Response:', result.text);
  const countries = ['brazil', 'argentina', 'chile', 'peru', 'colombia', 'ecuador'];
  const foundCountries = countries.filter((c) => result.text.toLowerCase().includes(c));
  console.log('  Countries found:', foundCountries.length);
  console.log('  Pass:', foundCountries.length >= 3 ? '✅' : '❌');
  console.log();
}

// ============================================
// 5. Test streaming capability
// ============================================

async function testStreaming() {
  console.log('=== Streaming Test ===\n');

  const chunks: string[] = [];

  console.log('Streaming response:');
  process.stdout.write('  ');

  for await (const chunk of adapter.stream({ prompt: 'Count from 1 to 5.' }, (c) => {
    chunks.push(c);
    process.stdout.write(c);
  })) {
    // Chunks are also yielded here
  }

  console.log('\n');
  console.log('  Total chunks:', chunks.length);
  console.log();
}

// ============================================
// 6. Test adapter capabilities
// ============================================

async function testCapabilities() {
  console.log('=== Adapter Capabilities ===\n');

  const caps = await adapter.capabilities();

  console.log('  Streaming:', caps.streaming ? '✅' : '❌');
  console.log('  Function Calling:', caps.functionCalling ? '✅' : '❌');
  console.log('  Tool Use:', caps.toolUse ? '✅' : '❌');
  console.log('  Max Context:', caps.maxContext);
  console.log();
}

// ============================================
// 7. Example: Custom chain with context
// ============================================

async function testCustomChain() {
  console.log('=== Custom Chain with Context ===\n');

  // Create a chain that uses additional context
  const contextPrompt = ChatPromptTemplate.fromTemplate(`
Context Information:
{context}

Based on the context above, answer this question:
{input}
`);

  const contextChain = contextPrompt.pipe(model).pipe(outputParser);

  // Note: We need to create a wrapper that handles the input format
  const contextAdapter = new LangChainAdapter(
    {
      provider: 'langchain',
      name: 'context-chain',
      runnableType: 'chain',
    },
    // Pass the chain directly
    contextChain
  );

  // For context-aware chains, invoke directly on the chain
  const result = await contextChain.invoke({
    context: 'The company was founded in 2020 by Alice and Bob. They started with 5 employees.',
    input: 'Who founded the company?',
  });

  console.log('Test: Context-aware QA');
  console.log('  Response:', result);
  console.log(
    '  Pass:',
    result.toLowerCase().includes('alice') && result.toLowerCase().includes('bob') ? '✅' : '❌'
  );
  console.log();
}

// ============================================
// Main runner
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  LangChain Chain Testing with ArtemisKit  ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    await testChainDirectly();
    await testWithChatMessages();
    await testStreaming();
    await testCapabilities();
    await testCustomChain();

    console.log('=== All Tests Complete ===');
  } catch (error) {
    console.error('Error running tests:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.main) {
  main();
}

export { chain, adapter };
