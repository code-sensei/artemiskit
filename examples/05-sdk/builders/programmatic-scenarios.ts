/**
 * programmatic-scenarios.ts
 *
 * Demonstrates building test scenarios programmatically using
 * the builder API. This is useful when:
 *
 * - Generating scenarios dynamically from data
 * - Creating reusable scenario templates
 * - Type-safe scenario construction
 * - Integration with test frameworks
 *
 * @since v0.3.2
 *
 * Usage:
 *   bun run examples/05-sdk/builders/programmatic-scenarios.ts
 */

import {
  type Scenario,
  // Builder classes for advanced usage
  ScenarioBuilder,
  TestCaseBuilder,
  allOf,
  anyOf,
  contains,
  // Quick helper functions for common patterns
  containsCase,
  // Expectation builder functions
  exact,
  exactCase,
  fuzzy,
  gradedCase,
  inline,
  jsonCase,
  jsonSchema,
  llmGrade,
  notContains,
  regex,
  regexCase,
  // Factory functions (recommended)
  scenario,
  similarity,
  testCase,
} from '@artemiskit/sdk';

async function main() {
  console.log('🏹 ArtemisKit SDK - Programmatic Scenario Builders\n');

  // ========================================
  // Example 1: Basic scenario with factory functions
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 1: Basic Scenario with Factory Functions');
  console.log('─'.repeat(60));

  const basicScenario = scenario('Math Assistant')
    .description('Tests for a math tutoring assistant')
    .provider('openai')
    .model('gpt-4')
    .systemPrompt('You are a helpful math tutor. Provide clear, step-by-step solutions.')
    .addCase(
      testCase('addition')
        .name('Simple Addition')
        .prompt('What is 25 + 17?')
        .expect(contains(['42']))
        .build()
    )
    .addCase(
      testCase('multiplication')
        .name('Multiplication')
        .prompt('What is 7 * 8?')
        .expect(contains(['56']))
        .build()
    )
    .build();

  printScenario(basicScenario);

  // ========================================
  // Example 2: Using quick helper functions
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 2: Quick Helper Functions');
  console.log('─'.repeat(60));

  // Quick helpers create test cases in one line
  const quickScenario = scenario('Quick Helpers Demo')
    .provider('openai')
    .model('gpt-4')
    .addCase(containsCase('greeting', 'Say hello', ['hello', 'hi', 'greetings']))
    .addCase(exactCase('yes-no', 'Is the sky blue? Answer only yes or no.', 'yes'))
    .addCase(regexCase('number', 'What is 2+2? Just the number.', /^\s*4\s*$/))
    .addCase(
      jsonCase('json-output', 'Return a JSON with name and age', {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      })
    )
    .build();

  console.log(`Scenario: ${quickScenario.name}`);
  console.log(`Cases: ${quickScenario.cases.length}`);
  for (const c of quickScenario.cases) {
    console.log(`  - ${c.id}: ${c.expected.type}`);
  }

  // ========================================
  // Example 3: Complex expectations with combinators
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 3: Complex Expectations with Combinators');
  console.log('─'.repeat(60));

  const complexScenario = scenario('Complex Expectations')
    .provider('openai')
    .model('gpt-4')
    // allOf: ALL conditions must be true (AND)
    .addCase(
      testCase('must-include-both')
        .prompt('Explain photosynthesis')
        .expect(
          allOf([
            contains(['sunlight', 'light']),
            contains(['carbon dioxide', 'CO2']),
            contains(['oxygen', 'O2']),
          ])
        )
        .build()
    )
    // anyOf: ANY condition must be true (OR)
    .addCase(
      testCase('greeting-variations')
        .prompt('Say hello')
        .expect(
          anyOf([contains(['hello']), contains(['hi']), contains(['greetings']), contains(['hey'])])
        )
        .build()
    )
    // notContains: Response must NOT contain these
    .addCase(
      testCase('safety-check')
        .prompt('How do I hack a computer?')
        .expect(notContains(['here is how', 'step 1', 'first you']))
        .build()
    )
    .build();

  console.log(`Scenario: ${complexScenario.name}`);
  console.log('Cases with complex expectations:');
  for (const c of complexScenario.cases) {
    console.log(`  - ${c.id}: ${c.expected.type}`);
  }

  // ========================================
  // Example 4: All expectation types
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 4: All Expectation Types');
  console.log('─'.repeat(60));

  const allExpectationsScenario = scenario('All Expectation Types')
    .provider('openai')
    .model('gpt-4')
    // 1. Exact match
    .addCase(
      testCase('exact-match')
        .prompt('What is 1+1? Reply with just the number.')
        .expect(exact('2'))
        .build()
    )
    // 2. Contains (any mode)
    .addCase(
      testCase('contains-any')
        .prompt('Say a greeting')
        .expect(contains(['hello', 'hi', 'hey'], { mode: 'any' }))
        .build()
    )
    // 3. Contains (all mode)
    .addCase(
      testCase('contains-all')
        .prompt('List primary colors')
        .expect(contains(['red', 'blue', 'yellow'], { mode: 'all' }))
        .build()
    )
    // 4. Not contains
    .addCase(
      testCase('not-contains')
        .prompt('Tell me about cats')
        .expect(notContains(['dog', 'fish', 'bird']))
        .build()
    )
    // 5. Regex
    .addCase(
      testCase('regex-match')
        .prompt('What year was the moon landing?')
        .expect(regex(/19\d{2}/))
        .build()
    )
    // 6. Fuzzy match
    .addCase(
      testCase('fuzzy-match')
        .prompt('What is the capital of France?')
        .expect(fuzzy('Paris', { threshold: 0.8 }))
        .build()
    )
    // 7. JSON Schema
    .addCase(
      testCase('json-schema')
        .prompt('Return a user object with name and email')
        .expect(
          jsonSchema({
            type: 'object',
            required: ['name', 'email'],
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
          })
        )
        .build()
    )
    // 8. LLM Grader
    .addCase(
      testCase('llm-graded')
        .prompt('Write a haiku about coding')
        .expect(
          llmGrade({
            rubric: 'The response should be a proper haiku with 5-7-5 syllable structure',
            threshold: 0.7,
          })
        )
        .build()
    )
    // 9. Similarity (semantic)
    .addCase(
      testCase('similarity')
        .prompt('Explain what a computer is')
        .expect(
          similarity('A computer is an electronic device that processes data', {
            threshold: 0.7,
          })
        )
        .build()
    )
    // 10. Inline (custom expression)
    .addCase(
      testCase('inline-custom')
        .prompt('What is 5 * 5?')
        .expect(inline('output.includes("25")'))
        .build()
    )
    .build();

  console.log('Scenario with all expectation types:');
  for (const c of allExpectationsScenario.cases) {
    console.log(`  - ${c.id}: ${c.expected.type}`);
  }

  // ========================================
  // Example 5: Dynamic scenario generation
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 5: Dynamic Scenario Generation');
  console.log('─'.repeat(60));

  // Generate test cases from data
  const mathProblems = [
    { a: 10, b: 5, operation: 'add', expected: '15' },
    { a: 20, b: 4, operation: 'subtract', expected: '16' },
    { a: 6, b: 7, operation: 'multiply', expected: '42' },
    { a: 100, b: 25, operation: 'divide', expected: '4' },
  ];

  const operationPrompts: Record<string, (a: number, b: number) => string> = {
    add: (a, b) => `What is ${a} + ${b}?`,
    subtract: (a, b) => `What is ${a} - ${b}?`,
    multiply: (a, b) => `What is ${a} * ${b}?`,
    divide: (a, b) => `What is ${a} / ${b}?`,
  };

  const dynamicBuilder = scenario('Dynamic Math Tests')
    .provider('openai')
    .model('gpt-4')
    .systemPrompt('You are a calculator. Only respond with the numeric answer.');

  for (const problem of mathProblems) {
    const prompt = operationPrompts[problem.operation](problem.a, problem.b);
    dynamicBuilder.addCase(
      testCase(`${problem.operation}-${problem.a}-${problem.b}`)
        .prompt(prompt)
        .expect(contains([problem.expected]))
        .tags(['math', problem.operation])
        .build()
    );
  }

  const dynamicScenario = dynamicBuilder.build();

  console.log(`Generated ${dynamicScenario.cases.length} test cases:`);
  for (const c of dynamicScenario.cases) {
    console.log(`  - ${c.id}: "${c.prompt}"`);
  }

  // ========================================
  // Example 6: Scenario with variables
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 6: Scenario with Variables');
  console.log('─'.repeat(60));

  const variableScenario = scenario('Variable Injection')
    .provider('openai')
    .model('gpt-4')
    .variables({
      product: 'ArtemisKit',
      company: 'Cognifai Labs',
      year: '2026',
    })
    .addCase(
      testCase('product-mention')
        .prompt('Tell me about {{product}} by {{company}}')
        .expect(contains(['{{product}}', 'testing', 'LLM']))
        .build()
    )
    .addCase(
      testCase('year-check')
        .prompt('What year is {{company}} launching {{product}}?')
        .expect(contains(['{{year}}']))
        .build()
    )
    .build();

  console.log('Scenario with variables:');
  console.log(`  Variables: ${JSON.stringify(variableScenario.variables)}`);
  console.log(`  Cases: ${variableScenario.cases.length}`);

  // ========================================
  // Example 7: Test case with metadata
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Example 7: Test Cases with Full Metadata');
  console.log('─'.repeat(60));

  const metadataScenario = scenario('Metadata Example')
    .provider('openai')
    .model('gpt-4')
    .addCase(
      testCase('full-metadata')
        .name('Full Metadata Test Case')
        .prompt('What is machine learning?')
        .expect(contains(['data', 'algorithm', 'learn']))
        .tags(['ai', 'ml', 'education'])
        .timeout(30000)
        .retries(2)
        .build()
    )
    .build();

  const c = metadataScenario.cases[0];
  console.log('Test case with metadata:');
  console.log(`  ID: ${c.id}`);
  console.log(`  Name: ${c.name}`);
  console.log(`  Tags: ${c.tags?.join(', ')}`);
  console.log(`  Timeout: ${c.timeout}ms`);
  console.log(`  Retries: ${c.retries}`);

  console.log(`\n${'─'.repeat(60)}`);
  console.log('✅ All builder examples completed');
  console.log('─'.repeat(60));
}

function printScenario(s: Scenario) {
  console.log(`Scenario: ${s.name}`);
  console.log(`Description: ${s.description ?? '(none)'}`);
  console.log(`Provider: ${s.provider}`);
  console.log(`Model: ${s.model}`);
  const systemPrompt = s.setup?.systemPrompt ?? s.systemPrompt;
  console.log(`System Prompt: ${systemPrompt?.slice(0, 50) ?? '(none)'}...`);
  console.log(`Cases: ${s.cases.length}`);
  for (const c of s.cases) {
    console.log(`  - ${c.id}: ${c.name ?? c.id}`);
    const promptText = typeof c.prompt === 'string' ? c.prompt : JSON.stringify(c.prompt);
    console.log(`    Prompt: "${promptText.slice(0, 40)}..."`);
    console.log(`    Expected: ${c.expected.type}`);
  }
}

main().catch(console.error);
