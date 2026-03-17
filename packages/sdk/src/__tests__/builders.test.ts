/**
 * Tests for SDK builders - scenario and test case construction
 */

import { describe, expect, it } from 'bun:test';
import {
  ScenarioBuilder,
  TestCaseBuilder,
  allOf,
  anyOf,
  contains,
  containsCase,
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
  scenario,
  similarity,
  testCase,
} from '../builders';

describe('Builders - TestCaseBuilder', () => {
  describe('Basic construction', () => {
    it('should create a test case with contains expectation', () => {
      const tc = testCase('test-1').prompt('What is 2 + 2?').expectContains(['4']).build();

      expect(tc.id).toBe('test-1');
      expect(tc.prompt).toBe('What is 2 + 2?');
      expect(tc.expected.type).toBe('contains');
    });

    it('should create a test case with exact expectation', () => {
      const tc = testCase('exact-1').prompt('Say hello').expectExact('Hello!').build();

      expect(tc.expected.type).toBe('exact');
      expect((tc.expected as any).value).toBe('Hello!');
    });

    it('should create a test case with regex expectation', () => {
      const tc = testCase('regex-1').prompt('Give me a number').expectRegex('\\d+').build();

      expect(tc.expected.type).toBe('regex');
      expect((tc.expected as any).pattern).toBe('\\d+');
    });

    it('should set optional properties', () => {
      const tc = testCase('full-1')
        .name('Full Test Case')
        .description('A comprehensive test case')
        .prompt('Test prompt')
        .expectContains(['test'])
        .tags('smoke', 'critical')
        .metadata({ priority: 1 })
        .timeout(5000)
        .retries(3)
        .provider('anthropic')
        .model('claude-3-opus')
        .build();

      expect(tc.name).toBe('Full Test Case');
      expect(tc.description).toBe('A comprehensive test case');
      expect(tc.tags).toContain('smoke');
      expect(tc.tags).toContain('critical');
      expect(tc.metadata).toEqual({ priority: 1 });
      expect(tc.timeout).toBe(5000);
      expect(tc.retries).toBe(3);
      expect(tc.provider).toBe('anthropic');
      expect(tc.model).toBe('claude-3-opus');
    });
  });

  describe('Prompt types', () => {
    it('should accept string prompts', () => {
      const tc = testCase('string-prompt').prompt('Simple prompt').expectContains(['test']).build();

      expect(typeof tc.prompt).toBe('string');
    });

    it('should accept chat message prompts', () => {
      const tc = testCase('chat-prompt')
        .messages([
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ])
        .expectContains(['test'])
        .build();

      expect(Array.isArray(tc.prompt)).toBe(true);
      expect(tc.prompt as any[]).toHaveLength(2);
    });

    it('should accept system and user shorthand', () => {
      const tc = testCase('system-user')
        .systemAndUser('Be helpful', 'What is AI?')
        .expectContains(['test'])
        .build();

      expect(Array.isArray(tc.prompt)).toBe(true);
      const messages = tc.prompt as any[];
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });
  });

  describe('Expectation types', () => {
    it('should create fuzzy expectation', () => {
      const tc = testCase('fuzzy-1').prompt('Test').expectFuzzy('expected value', 0.9).build();

      expect(tc.expected.type).toBe('fuzzy');
      expect((tc.expected as any).threshold).toBe(0.9);
    });

    it('should create JSON schema expectation', () => {
      const schema = {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      };
      const tc = testCase('json-1').prompt('Test').expectJsonSchema(schema).build();

      expect(tc.expected.type).toBe('json_schema');
      expect((tc.expected as any).schema).toEqual(schema);
    });

    it('should create LLM grader expectation', () => {
      const tc = testCase('graded-1')
        .prompt('Test')
        .expectLLMGrade('Response should be helpful and accurate', {
          threshold: 0.8,
          model: 'gpt-4',
        })
        .build();

      expect(tc.expected.type).toBe('llm_grader');
      expect((tc.expected as any).rubric).toBe('Response should be helpful and accurate');
      expect((tc.expected as any).threshold).toBe(0.8);
    });

    it('should create similarity expectation', () => {
      const tc = testCase('sim-1')
        .prompt('Test')
        .expectSimilarity('expected text', { threshold: 0.85, mode: 'embedding' })
        .build();

      expect(tc.expected.type).toBe('similarity');
      expect((tc.expected as any).mode).toBe('embedding');
    });

    it('should create inline expectation', () => {
      const tc = testCase('inline-1').prompt('Test').expectInline('response.length > 10').build();

      expect(tc.expected.type).toBe('inline');
      expect((tc.expected as any).expression).toBe('response.length > 10');
    });

    it('should create combined AND expectation', () => {
      const tc = testCase('combined-and')
        .prompt('Test')
        .expectAll(contains(['hello']), notContains(['error']))
        .build();

      expect(tc.expected.type).toBe('combined');
      expect((tc.expected as any).operator).toBe('and');
      expect((tc.expected as any).expectations).toHaveLength(2);
    });

    it('should create combined OR expectation', () => {
      const tc = testCase('combined-or')
        .prompt('Test')
        .expectAny(exact('yes'), exact('no'))
        .build();

      expect(tc.expected.type).toBe('combined');
      expect((tc.expected as any).operator).toBe('or');
    });

    it('should allow setting raw expected', () => {
      const customExpected = { type: 'custom' as const, evaluator: 'my-evaluator' };
      const tc = testCase('custom-1')
        .prompt('Test')
        .expect(customExpected as any)
        .build();

      expect(tc.expected).toEqual(customExpected);
    });
  });

  describe('Validation', () => {
    it('should throw if no expectation is set', () => {
      expect(() => testCase('no-expect').prompt('Test').build()).toThrow(
        'must have an expectation'
      );
    });

    it('should throw if no prompt is set', () => {
      expect(() => testCase('no-prompt').expectContains(['test']).build()).toThrow(
        'must have a prompt'
      );
    });
  });
});

describe('Builders - ScenarioBuilder', () => {
  describe('Basic construction', () => {
    it('should create a minimal scenario', () => {
      const s = scenario('Basic Test')
        .case(testCase('case-1').prompt('Test').expectContains(['pass']))
        .build();

      expect(s.name).toBe('Basic Test');
      expect(s.cases).toHaveLength(1);
    });

    it('should set all optional properties', () => {
      const s = scenario('Full Scenario')
        .description('A comprehensive test scenario')
        .version('2.0')
        .provider('openai')
        .model('gpt-4')
        .seed(42)
        .temperature(0.7)
        .maxTokens(1000)
        .tags('integration', 'api')
        .variables({ topic: 'AI' })
        .systemPrompt('You are a helpful assistant')
        .case(testCase('case-1').prompt('Test').expectContains(['pass']))
        .build();

      expect(s.description).toBe('A comprehensive test scenario');
      expect(s.version).toBe('2.0');
      expect(s.provider).toBe('openai');
      expect(s.model).toBe('gpt-4');
      expect(s.seed).toBe(42);
      expect(s.temperature).toBe(0.7);
      expect(s.maxTokens).toBe(1000);
      expect(s.tags).toContain('integration');
      expect(s.variables).toEqual({ topic: 'AI' });
      expect(s.setup?.systemPrompt).toBe('You are a helpful assistant');
    });
  });

  describe('Adding cases', () => {
    it('should add multiple cases with case()', () => {
      const s = scenario('Multi-case')
        .case(testCase('case-1').prompt('Test 1').expectContains(['1']))
        .case(testCase('case-2').prompt('Test 2').expectContains(['2']))
        .case(testCase('case-3').prompt('Test 3').expectContains(['3']))
        .build();

      expect(s.cases).toHaveLength(3);
    });

    it('should add multiple cases with cases()', () => {
      const s = scenario('Batch cases')
        .cases(
          testCase('case-1').prompt('Test 1').expectContains(['1']),
          testCase('case-2').prompt('Test 2').expectContains(['2'])
        )
        .build();

      expect(s.cases).toHaveLength(2);
    });

    it('should add raw test case objects', () => {
      const rawCase = {
        id: 'raw-case',
        prompt: 'Raw prompt',
        expected: { type: 'contains' as const, values: ['test'], mode: 'all' as const },
        tags: [],
        metadata: {},
        retries: 0,
      };

      const s = scenario('Raw case').addCase(rawCase).build();

      expect(s.cases).toHaveLength(1);
      expect(s.cases[0].id).toBe('raw-case');
    });
  });

  describe('Provider configuration', () => {
    it('should set provider config', () => {
      const s = scenario('Configured')
        .provider('azure-openai')
        .providerConfig({
          resourceName: 'my-resource',
          deploymentName: 'gpt-4',
        })
        .case(testCase('case-1').prompt('Test').expectContains(['pass']))
        .build();

      expect(s.providerConfig).toEqual({
        resourceName: 'my-resource',
        deploymentName: 'gpt-4',
      });
    });
  });

  describe('Validation', () => {
    it('should throw if no cases are added', () => {
      expect(() => scenario('Empty').build()).toThrow('must have at least one test case');
    });
  });
});

describe('Builders - Quick Helpers', () => {
  it('containsCase should create a case with contains expectation', () => {
    const tc = containsCase('quick-1', 'Prompt', ['value1', 'value2']);

    expect(tc.id).toBe('quick-1');
    expect(tc.expected.type).toBe('contains');
  });

  it('exactCase should create a case with exact expectation', () => {
    const tc = exactCase('quick-2', 'Prompt', 'exact value');

    expect(tc.expected.type).toBe('exact');
    expect((tc.expected as any).value).toBe('exact value');
  });

  it('regexCase should create a case with regex expectation', () => {
    const tc = regexCase('quick-3', 'Prompt', '\\d+', 'g');

    expect(tc.expected.type).toBe('regex');
    expect((tc.expected as any).flags).toBe('g');
  });

  it('jsonCase should create a case with json_schema expectation', () => {
    const schema = { type: 'object' };
    const tc = jsonCase('quick-4', 'Prompt', schema);

    expect(tc.expected.type).toBe('json_schema');
  });

  it('gradedCase should create a case with llm_grader expectation', () => {
    const tc = gradedCase('quick-5', 'Prompt', 'Be helpful', 0.9);

    expect(tc.expected.type).toBe('llm_grader');
    expect((tc.expected as any).threshold).toBe(0.9);
  });
});

describe('Builders - Expectation Helpers', () => {
  it('exact() should create exact expectation', () => {
    const exp = exact('value', false);
    expect(exp).toEqual({ type: 'exact', value: 'value', caseSensitive: false });
  });

  it('contains() should create contains expectation', () => {
    const exp = contains(['a', 'b'], 'any');
    expect(exp).toEqual({ type: 'contains', values: ['a', 'b'], mode: 'any' });
  });

  it('notContains() should create not_contains expectation', () => {
    const exp = notContains(['error']);
    expect(exp).toEqual({ type: 'not_contains', values: ['error'], mode: 'all' });
  });

  it('regex() should create regex expectation', () => {
    const exp = regex('\\w+', 'gi');
    expect(exp).toEqual({ type: 'regex', pattern: '\\w+', flags: 'gi' });
  });

  it('fuzzy() should create fuzzy expectation', () => {
    const exp = fuzzy('value', 0.9);
    expect(exp).toEqual({ type: 'fuzzy', value: 'value', threshold: 0.9 });
  });

  it('jsonSchema() should create json_schema expectation', () => {
    const schema = { type: 'object' };
    const exp = jsonSchema(schema);
    expect(exp).toEqual({ type: 'json_schema', schema });
  });

  it('llmGrade() should create llm_grader expectation', () => {
    const exp = llmGrade('Be accurate', { threshold: 0.8 });
    expect(exp.type).toBe('llm_grader');
    expect((exp as any).rubric).toBe('Be accurate');
  });

  it('similarity() should create similarity expectation', () => {
    const exp = similarity('expected', { mode: 'llm' });
    expect(exp.type).toBe('similarity');
    expect((exp as any).mode).toBe('llm');
  });

  it('inline() should create inline expectation', () => {
    const exp = inline('response.includes("test")');
    expect(exp).toEqual({
      type: 'inline',
      expression: 'response.includes("test")',
      value: undefined,
    });
  });

  it('allOf() should create combined AND expectation', () => {
    const exp = allOf(contains(['a']), contains(['b']));
    expect(exp.type).toBe('combined');
    expect((exp as any).operator).toBe('and');
  });

  it('anyOf() should create combined OR expectation', () => {
    const exp = anyOf(exact('yes'), exact('no'));
    expect(exp.type).toBe('combined');
    expect((exp as any).operator).toBe('or');
  });
});

describe('Builders - Integration', () => {
  it('should build a complete scenario programmatically', () => {
    const mathScenario = scenario('Math Tests')
      .description('Test basic math operations')
      .provider('openai')
      .model('gpt-4')
      .temperature(0)
      .tags('math', 'smoke')
      .case(testCase('addition').prompt('What is 2 + 2?').expectContains(['4']).tags('basic'))
      .case(
        testCase('multiplication')
          .prompt('What is 6 * 7?')
          .expectAll(contains(['42']), notContains(['error']))
          .tags('basic')
      )
      .case(
        testCase('complex')
          .prompt('Solve: (3 + 5) * 2 - 4')
          .expectLLMGrade('The answer should be 12 and the solution should show work')
          .tags('advanced')
      )
      .build();

    expect(mathScenario.name).toBe('Math Tests');
    expect(mathScenario.cases).toHaveLength(3);
    expect(mathScenario.tags).toContain('math');
    expect(mathScenario.cases[0].tags).toContain('basic');
    expect(mathScenario.cases[2].expected.type).toBe('llm_grader');
  });
});
