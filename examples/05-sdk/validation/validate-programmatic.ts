/**
 * validate-programmatic.ts
 *
 * Demonstrates validating programmatically-built scenarios using
 * the builder API combined with kit.validate().
 *
 * This is useful when you want to validate dynamically generated
 * scenarios before execution.
 *
 * @since v0.3.2
 *
 * Usage:
 *   bun run examples/05-sdk/validation/validate-programmatic.ts
 */

import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ArtemisKit,
  type Scenario,
  // Expectation helpers
  contains,
  exact,
  jsonSchema,
  llmGrade,
  // Builder functions
  scenario,
  testCase,
} from '@artemiskit/sdk';

async function main() {
  console.log('🏹 ArtemisKit SDK - Validate Programmatic Scenarios\n');

  const kit = new ArtemisKit({
    project: 'programmatic-validation',
  });

  // ========================================
  // Build a valid scenario programmatically
  // ========================================
  console.log('─'.repeat(60));
  console.log('Building and validating a programmatic scenario');
  console.log('─'.repeat(60));

  const validScenario = scenario('Customer Support Bot')
    .description('Test cases for customer support responses')
    .provider('openai')
    .model('gpt-4')
    .systemPrompt('You are a helpful customer support agent.')
    .addCase(
      testCase('greeting-test')
        .name('Greeting Response')
        .prompt('Hello, I need help with my order')
        .expect(contains(['hello', 'hi', 'help', 'assist']))
        .tags(['smoke', 'greeting'])
        .build()
    )
    .addCase(
      testCase('order-status')
        .name('Order Status Query')
        .prompt('What is the status of order #12345?')
        .expect(contains(['order', 'status', 'checking'], { mode: 'any' }))
        .tags(['order', 'status'])
        .build()
    )
    .addCase(
      testCase('json-response')
        .name('Structured Response')
        .prompt('List my recent orders in JSON format')
        .expect(
          jsonSchema({
            type: 'object',
            properties: {
              orders: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'date'],
                },
              },
            },
          })
        )
        .tags(['json', 'structured'])
        .build()
    )
    .build();

  console.log(`Built scenario: ${validScenario.name}`);
  console.log(`Cases: ${validScenario.cases.length}`);

  // Save to temp file and validate
  const tempPath = join('/tmp', 'valid-scenario.yaml');
  await saveScenarioToYaml(validScenario, tempPath);

  const validResult = await kit.validate({ scenario: tempPath });

  console.log(`\nValidation result: ${validResult.valid ? '✅ Valid' : '❌ Invalid'}`);
  if (validResult.valid) {
    console.log(`  Scenarios: ${validResult.scenarios.length}`);
    console.log(`  Total cases: ${validResult.scenarios[0].caseCount}`);
  }

  // ========================================
  // Build a scenario with intentional errors
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Validating a scenario with errors');
  console.log('─'.repeat(60));

  // Create a scenario with duplicate IDs (validation error)
  const duplicateIdScenario = `
name: Invalid Scenario
provider: openai
model: gpt-4
cases:
  - id: same-id
    prompt: "First case"
    expected:
      type: contains
      values: ["test"]
  - id: same-id
    prompt: "Second case with duplicate ID"
    expected:
      type: contains
      values: ["test"]
`;

  const duplicatePath = join('/tmp', 'duplicate-ids.yaml');
  await writeFile(duplicatePath, duplicateIdScenario);

  const duplicateResult = await kit.validate({ scenario: duplicatePath });

  console.log(`Validation result: ${duplicateResult.valid ? '✅ Valid' : '❌ Invalid'}`);
  if (!duplicateResult.valid) {
    console.log('Errors found (expected):');
    for (const error of duplicateResult.errors) {
      console.log(`  ❌ ${error.message}`);
    }
  }

  // ========================================
  // Validate scenario with invalid expectation type
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Validating scenario with invalid expectation type');
  console.log('─'.repeat(60));

  const invalidTypePath = join('/tmp', 'invalid-type.yaml');
  await writeFile(
    invalidTypePath,
    `
name: Invalid Expectation Type
provider: openai
model: gpt-4
cases:
  - id: test-1
    prompt: "Hello"
    expected:
      type: invalid_type_xyz
      values: ["test"]
`
  );

  const invalidTypeResult = await kit.validate({ scenario: invalidTypePath });

  console.log(`Validation result: ${invalidTypeResult.valid ? '✅ Valid' : '❌ Invalid'}`);
  if (!invalidTypeResult.valid) {
    console.log('Errors found (expected):');
    for (const error of invalidTypeResult.errors) {
      console.log(`  ❌ ${error.message}`);
    }
  }

  // ========================================
  // Validate scenario missing required fields
  // ========================================
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Validating scenario missing required fields');
  console.log('─'.repeat(60));

  const missingFieldsPath = join('/tmp', 'missing-fields.yaml');
  await writeFile(
    missingFieldsPath,
    `
name: Missing Fields
cases:
  - prompt: "No ID specified"
`
  );

  const missingResult = await kit.validate({ scenario: missingFieldsPath });

  console.log(`Validation result: ${missingResult.valid ? '✅ Valid' : '❌ Invalid'}`);
  if (!missingResult.valid) {
    console.log('Errors found (expected):');
    for (const error of missingResult.errors) {
      console.log(`  ❌ ${error.message}`);
    }
  }

  // Clean up temp files
  await rm(tempPath, { force: true });
  await rm(duplicatePath, { force: true });
  await rm(invalidTypePath, { force: true });
  await rm(missingFieldsPath, { force: true });

  console.log(`\n${'─'.repeat(60)}`);
  console.log('✅ All validation examples completed');
  console.log('─'.repeat(60));
}

/**
 * Helper to save a scenario object to YAML format
 */
async function saveScenarioToYaml(s: Scenario, path: string) {
  // Convert scenario to YAML-compatible format
  const yaml = `
name: ${s.name}
description: ${s.description ?? ''}
provider: ${s.provider}
model: ${s.model}
${s.systemPrompt ? `systemPrompt: "${s.systemPrompt}"` : ''}

cases:
${s.cases
  .map(
    (c) => `  - id: ${c.id}
    name: "${c.name ?? c.id}"
    prompt: "${c.prompt}"
    expected:
      type: ${c.expected.type}
      ${c.expected.values ? `values: ${JSON.stringify(c.expected.values)}` : ''}
      ${c.expected.mode ? `mode: ${c.expected.mode}` : ''}
    ${c.tags?.length ? `tags: ${JSON.stringify(c.tags)}` : ''}`
  )
  .join('\n')}
`;

  await writeFile(path, yaml);
}

main().catch(console.error);
