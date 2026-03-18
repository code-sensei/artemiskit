/**
 * @artemiskit/sdk
 * Fluent builders for constructing scenarios and test cases
 *
 * Provides a type-safe, fluent API for building ArtemisKit scenarios
 * programmatically without manually constructing complex objects.
 */

import type {
  ChatMessageType,
  Expected,
  Provider,
  Scenario,
  TestCase,
  Variables,
} from '@artemiskit/core';
import type { RedactionConfig } from '@artemiskit/core';

// ============================================================================
// Test Case Builder
// ============================================================================

/**
 * Fluent builder for constructing test cases
 */
export class TestCaseBuilder {
  private _id: string;
  private _name?: string;
  private _description?: string;
  private _prompt: string | ChatMessageType[] = '';
  private _expected?: Expected;
  private _tags: string[] = [];
  private _metadata: Record<string, unknown> = {};
  private _timeout?: number;
  private _retries = 0;
  private _provider?: Provider;
  private _model?: string;
  private _variables?: Variables;
  private _redaction?: RedactionConfig;

  constructor(id: string) {
    this._id = id;
  }

  /**
   * Set the test case name (display name)
   */
  name(name: string): this {
    this._name = name;
    return this;
  }

  /**
   * Set the test case description
   */
  description(description: string): this {
    this._description = description;
    return this;
  }

  /**
   * Set the prompt as a simple string
   */
  prompt(prompt: string): this {
    this._prompt = prompt;
    return this;
  }

  /**
   * Set the prompt as chat messages
   */
  messages(messages: ChatMessageType[]): this {
    this._prompt = messages;
    return this;
  }

  /**
   * Add a system message followed by a user message
   */
  systemAndUser(systemPrompt: string, userPrompt: string): this {
    this._prompt = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    return this;
  }

  /**
   * Expect an exact match
   */
  expectExact(value: string, caseSensitive = true): this {
    this._expected = { type: 'exact', value, caseSensitive };
    return this;
  }

  /**
   * Expect the response to contain specific values
   */
  expectContains(values: string[], mode: 'all' | 'any' = 'all'): this {
    this._expected = { type: 'contains', values, mode };
    return this;
  }

  /**
   * Expect the response to NOT contain specific values
   */
  expectNotContains(values: string[], mode: 'all' | 'any' = 'all'): this {
    this._expected = { type: 'not_contains', values, mode };
    return this;
  }

  /**
   * Expect a regex match
   */
  expectRegex(pattern: string, flags?: string): this {
    this._expected = { type: 'regex', pattern, flags };
    return this;
  }

  /**
   * Expect a fuzzy match with similarity threshold
   */
  expectFuzzy(value: string, threshold = 0.8): this {
    this._expected = { type: 'fuzzy', value, threshold };
    return this;
  }

  /**
   * Expect a JSON response matching a schema
   */
  expectJsonSchema(schema: Record<string, unknown>): this {
    this._expected = { type: 'json_schema', schema };
    return this;
  }

  /**
   * Expect response to pass LLM grading with a rubric
   */
  expectLLMGrade(
    rubric: string,
    options?: { threshold?: number; model?: string; provider?: Provider }
  ): this {
    this._expected = {
      type: 'llm_grader',
      rubric,
      threshold: options?.threshold ?? 0.7,
      model: options?.model,
      provider: options?.provider,
    };
    return this;
  }

  /**
   * Expect semantic similarity
   */
  expectSimilarity(
    value: string,
    options?: {
      threshold?: number;
      mode?: 'embedding' | 'llm';
      model?: string;
      embeddingModel?: string;
    }
  ): this {
    this._expected = {
      type: 'similarity',
      value,
      threshold: options?.threshold ?? 0.75,
      mode: options?.mode,
      model: options?.model,
      embeddingModel: options?.embeddingModel,
    };
    return this;
  }

  /**
   * Expect an inline expression to evaluate to true
   */
  expectInline(expression: string, value?: string): this {
    this._expected = { type: 'inline', expression, value };
    return this;
  }

  /**
   * Combine multiple expectations with AND logic
   * Note: Pass base expectations (not combined) for proper type inference
   */
  expectAll(...expectations: Expected[]): this {
    // Type assertion needed because TypeScript can't infer combined type correctly
    this._expected = { type: 'combined', operator: 'and', expectations } as unknown as Expected;
    return this;
  }

  /**
   * Combine multiple expectations with OR logic
   * Note: Pass base expectations (not combined) for proper type inference
   */
  expectAny(...expectations: Expected[]): this {
    // Type assertion needed because TypeScript can't infer combined type correctly
    this._expected = { type: 'combined', operator: 'or', expectations } as unknown as Expected;
    return this;
  }

  /**
   * Set a custom expectation
   */
  expect(expected: Expected): this {
    this._expected = expected;
    return this;
  }

  /**
   * Add tags to the test case
   */
  tags(...tags: string[]): this {
    this._tags.push(...tags);
    return this;
  }

  /**
   * Add metadata to the test case
   */
  metadata(data: Record<string, unknown>): this {
    this._metadata = { ...this._metadata, ...data };
    return this;
  }

  /**
   * Set timeout for this test case
   */
  timeout(ms: number): this {
    this._timeout = ms;
    return this;
  }

  /**
   * Set number of retries for this test case
   */
  retries(count: number): this {
    this._retries = count;
    return this;
  }

  /**
   * Override provider for this test case
   */
  provider(provider: Provider): this {
    this._provider = provider;
    return this;
  }

  /**
   * Override model for this test case
   */
  model(model: string): this {
    this._model = model;
    return this;
  }

  /**
   * Set variables for this test case
   */
  variables(vars: Variables): this {
    this._variables = vars;
    return this;
  }

  /**
   * Enable redaction for this test case
   */
  redact(config: RedactionConfig): this {
    this._redaction = config;
    return this;
  }

  /**
   * Build the test case object
   */
  build(): TestCase {
    if (!this._expected) {
      throw new Error(
        `TestCase "${this._id}" must have an expectation. Call one of the expect* methods.`
      );
    }

    // Check for empty prompt: empty string or empty array
    const hasEmptyPrompt =
      !this._prompt ||
      (typeof this._prompt === 'string' && this._prompt.length === 0) ||
      (Array.isArray(this._prompt) && this._prompt.length === 0);

    if (hasEmptyPrompt) {
      throw new Error(`TestCase "${this._id}" must have a prompt.`);
    }

    return {
      id: this._id,
      name: this._name,
      description: this._description,
      prompt: this._prompt,
      expected: this._expected,
      tags: this._tags,
      metadata: this._metadata,
      timeout: this._timeout,
      retries: this._retries,
      provider: this._provider,
      model: this._model,
      variables: this._variables,
      redaction: this._redaction,
    };
  }
}

// ============================================================================
// Scenario Builder
// ============================================================================

/**
 * Fluent builder for constructing scenarios
 */
export class ScenarioBuilder {
  private _name: string;
  private _description?: string;
  private _version = '1.0';
  private _provider?: Provider;
  private _model?: string;
  private _providerConfig?: Record<string, unknown>;
  private _seed?: number;
  private _temperature?: number;
  private _maxTokens?: number;
  private _tags: string[] = [];
  private _variables?: Variables;
  private _redaction?: RedactionConfig;
  private _systemPrompt?: string;
  private _cases: TestCase[] = [];

  constructor(name: string) {
    this._name = name;
  }

  /**
   * Set the scenario description
   */
  description(description: string): this {
    this._description = description;
    return this;
  }

  /**
   * Set the scenario version
   */
  version(version: string): this {
    this._version = version;
    return this;
  }

  /**
   * Set the default provider
   */
  provider(provider: Provider): this {
    this._provider = provider;
    return this;
  }

  /**
   * Set the default model
   */
  model(model: string): this {
    this._model = model;
    return this;
  }

  /**
   * Set provider configuration
   */
  providerConfig(config: Record<string, unknown>): this {
    this._providerConfig = config;
    return this;
  }

  /**
   * Set the random seed for reproducibility
   */
  seed(seed: number): this {
    this._seed = seed;
    return this;
  }

  /**
   * Set the temperature
   */
  temperature(temp: number): this {
    this._temperature = temp;
    return this;
  }

  /**
   * Set max tokens
   */
  maxTokens(tokens: number): this {
    this._maxTokens = tokens;
    return this;
  }

  /**
   * Add tags to the scenario
   */
  tags(...tags: string[]): this {
    this._tags.push(...tags);
    return this;
  }

  /**
   * Set variables for template substitution
   */
  variables(vars: Variables): this {
    this._variables = vars;
    return this;
  }

  /**
   * Set redaction configuration
   */
  redact(config: RedactionConfig): this {
    this._redaction = config;
    return this;
  }

  /**
   * Set a system prompt for all test cases
   */
  systemPrompt(prompt: string): this {
    this._systemPrompt = prompt;
    return this;
  }

  /**
   * Add a test case using a builder
   */
  case(caseBuilder: TestCaseBuilder): this {
    this._cases.push(caseBuilder.build());
    return this;
  }

  /**
   * Add a test case directly
   */
  addCase(testCase: TestCase): this {
    this._cases.push(testCase);
    return this;
  }

  /**
   * Add multiple test cases
   */
  cases(...caseBuilders: TestCaseBuilder[]): this {
    for (const builder of caseBuilders) {
      this._cases.push(builder.build());
    }
    return this;
  }

  /**
   * Build the scenario object
   */
  build(): Scenario {
    if (this._cases.length === 0) {
      throw new Error(`Scenario "${this._name}" must have at least one test case.`);
    }

    return {
      name: this._name,
      description: this._description,
      version: this._version,
      provider: this._provider,
      model: this._model,
      providerConfig: this._providerConfig,
      seed: this._seed,
      temperature: this._temperature,
      maxTokens: this._maxTokens,
      tags: this._tags,
      variables: this._variables,
      redaction: this._redaction,
      setup: this._systemPrompt ? { systemPrompt: this._systemPrompt } : undefined,
      cases: this._cases,
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new scenario builder
 *
 * @example
 * ```typescript
 * import { scenario, testCase } from '@artemiskit/sdk/builders'
 *
 * const myScenario = scenario('Math Tests')
 *   .provider('openai')
 *   .model('gpt-4')
 *   .description('Basic math verification tests')
 *   .case(
 *     testCase('addition')
 *       .prompt('What is 2 + 2?')
 *       .expectContains(['4'])
 *   )
 *   .case(
 *     testCase('multiplication')
 *       .prompt('What is 6 * 7?')
 *       .expectContains(['42'])
 *   )
 *   .build()
 * ```
 */
export function scenario(name: string): ScenarioBuilder {
  return new ScenarioBuilder(name);
}

/**
 * Create a new test case builder
 *
 * @example
 * ```typescript
 * import { testCase } from '@artemiskit/sdk/builders'
 *
 * const case1 = testCase('json-output')
 *   .prompt('Return a JSON object with name and age')
 *   .expectJsonSchema({
 *     type: 'object',
 *     required: ['name', 'age'],
 *     properties: {
 *       name: { type: 'string' },
 *       age: { type: 'number' }
 *     }
 *   })
 *   .tags('json', 'structured')
 *   .build()
 * ```
 */
export function testCase(id: string): TestCaseBuilder {
  return new TestCaseBuilder(id);
}

// ============================================================================
// Quick Helpers
// ============================================================================

/**
 * Create a simple test case with contains expectation
 */
export function containsCase(
  id: string,
  prompt: string,
  values: string[],
  mode: 'all' | 'any' = 'all'
): TestCase {
  return testCase(id).prompt(prompt).expectContains(values, mode).build();
}

/**
 * Create a simple test case with exact match expectation
 */
export function exactCase(id: string, prompt: string, value: string): TestCase {
  return testCase(id).prompt(prompt).expectExact(value).build();
}

/**
 * Create a simple test case with regex expectation
 */
export function regexCase(id: string, prompt: string, pattern: string, flags?: string): TestCase {
  return testCase(id).prompt(prompt).expectRegex(pattern, flags).build();
}

/**
 * Create a simple test case with JSON schema expectation
 */
export function jsonCase(id: string, prompt: string, schema: Record<string, unknown>): TestCase {
  return testCase(id).prompt(prompt).expectJsonSchema(schema).build();
}

/**
 * Create a simple test case with LLM grading
 */
export function gradedCase(id: string, prompt: string, rubric: string, threshold = 0.7): TestCase {
  return testCase(id).prompt(prompt).expectLLMGrade(rubric, { threshold }).build();
}

// ============================================================================
// Expectation Helpers
// ============================================================================

/**
 * Create an exact match expectation
 */
export function exact(value: string, caseSensitive = true): Expected {
  return { type: 'exact', value, caseSensitive };
}

/**
 * Create a contains expectation
 */
export function contains(values: string[], mode: 'all' | 'any' = 'all'): Expected {
  return { type: 'contains', values, mode };
}

/**
 * Create a not_contains expectation
 */
export function notContains(values: string[], mode: 'all' | 'any' = 'all'): Expected {
  return { type: 'not_contains', values, mode };
}

/**
 * Create a regex expectation
 */
export function regex(pattern: string, flags?: string): Expected {
  return { type: 'regex', pattern, flags };
}

/**
 * Create a fuzzy match expectation
 */
export function fuzzy(value: string, threshold = 0.8): Expected {
  return { type: 'fuzzy', value, threshold };
}

/**
 * Create a JSON schema expectation
 */
export function jsonSchema(schema: Record<string, unknown>): Expected {
  return { type: 'json_schema', schema };
}

/**
 * Create an LLM grader expectation
 */
export function llmGrade(
  rubric: string,
  options?: { threshold?: number; model?: string; provider?: Provider }
): Expected {
  return {
    type: 'llm_grader',
    rubric,
    threshold: options?.threshold ?? 0.7,
    model: options?.model,
    provider: options?.provider,
  };
}

/**
 * Create a similarity expectation
 */
export function similarity(
  value: string,
  options?: {
    threshold?: number;
    mode?: 'embedding' | 'llm';
    model?: string;
    embeddingModel?: string;
  }
): Expected {
  return {
    type: 'similarity',
    value,
    threshold: options?.threshold ?? 0.75,
    mode: options?.mode,
    model: options?.model,
    embeddingModel: options?.embeddingModel,
  };
}

/**
 * Create an inline expression expectation
 */
export function inline(expression: string, value?: string): Expected {
  return { type: 'inline', expression, value };
}

/**
 * Combine expectations with AND logic
 * Note: Pass base expectations (not combined) for proper type inference
 */
export function allOf(...expectations: Expected[]): Expected {
  // Type assertion needed because TypeScript can't infer combined type correctly
  return { type: 'combined', operator: 'and', expectations } as unknown as Expected;
}

/**
 * Combine expectations with OR logic
 * Note: Pass base expectations (not combined) for proper type inference
 */
export function anyOf(...expectations: Expected[]): Expected {
  // Type assertion needed because TypeScript can't infer combined type correctly
  return { type: 'combined', operator: 'or', expectations } as unknown as Expected;
}
