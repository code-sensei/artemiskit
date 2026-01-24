/**
 * Tests for inline custom matcher evaluator
 */

import { describe, expect, it } from 'vitest';
import { InlineEvaluator, SUPPORTED_EXPRESSIONS } from './inline';
import type { Expected } from '../scenario/schema';

describe('InlineEvaluator', () => {
  const evaluator = new InlineEvaluator();

  describe('type', () => {
    it('should have correct type', () => {
      expect(evaluator.type).toBe('inline');
    });
  });

  describe('string methods', () => {
    it('should evaluate response.includes() - pass', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.includes("hello")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should evaluate response.includes() - fail', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.includes("goodbye")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should evaluate !response.includes() - pass', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: '!response.includes("goodbye")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should evaluate !response.includes() - fail', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: '!response.includes("hello")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should evaluate response.startsWith()', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.startsWith("hello")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate response.endsWith()', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.endsWith("world")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate response.toLowerCase().includes()', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.toLowerCase().includes("hello")',
      };
      const result = await evaluator.evaluate('HELLO WORLD', expected);
      expect(result.passed).toBe(true);
    });
  });

  describe('regex matching', () => {
    it('should evaluate response.match() - pass', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.match(/\\d{3}-\\d{4}/)',
      };
      const result = await evaluator.evaluate('Call me at 555-1234', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate response.match() - fail', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.match(/\\d{3}-\\d{4}/)',
      };
      const result = await evaluator.evaluate('No phone number here', expected);
      expect(result.passed).toBe(false);
    });

    it('should evaluate response.match() with flags', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.match(/hello/i)',
      };
      const result = await evaluator.evaluate('HELLO world', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate !response.match()', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: '!response.match(/error/i)',
      };
      const result = await evaluator.evaluate('Success!', expected);
      expect(result.passed).toBe(true);
    });
  });

  describe('length comparisons', () => {
    it('should evaluate length > N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'length > 5',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate length < N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'length < 100',
      };
      const result = await evaluator.evaluate('short', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate length >= N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'length >= 11',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate length <= N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'length <= 11',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate length == N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'length == 11',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate length != N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'length != 5',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
    });
  });

  describe('words and lines', () => {
    it('should evaluate words.length > N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'words.length > 2',
      };
      const result = await evaluator.evaluate('one two three four', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate words.length == N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'words.length == 4',
      };
      const result = await evaluator.evaluate('one two three four', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate lines.length > N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'lines.length > 1',
      };
      const result = await evaluator.evaluate('line one\nline two\nline three', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate lines.length == N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'lines.length == 3',
      };
      const result = await evaluator.evaluate('line one\nline two\nline three', expected);
      expect(result.passed).toBe(true);
    });
  });

  describe('JSON field access', () => {
    it('should evaluate json.field == "value"', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'json.status == "success"',
      };
      const result = await evaluator.evaluate('{"status": "success"}', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate json.field != "value"', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'json.status != "error"',
      };
      const result = await evaluator.evaluate('{"status": "success"}', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate json.field > N', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'json.count > 5',
      };
      const result = await evaluator.evaluate('{"count": 10}', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate nested json.field.subfield', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'json.data.value == "test"',
      };
      const result = await evaluator.evaluate('{"data": {"value": "test"}}', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate json != null for valid JSON', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'json != null',
      };
      const result = await evaluator.evaluate('{"valid": true}', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate json != null for invalid JSON', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'json != null',
      };
      const result = await evaluator.evaluate('not valid json', expected);
      expect(result.passed).toBe(false);
    });

    it('should handle boolean values in JSON', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'json.active == true',
      };
      const result = await evaluator.evaluate('{"active": true}', expected);
      expect(result.passed).toBe(true);
    });
  });

  describe('expected value comparison', () => {
    it('should evaluate response == expected', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response == expected',
        value: 'hello world',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
    });

    it('should evaluate response.trim() == expected', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.trim() == expected',
        value: 'hello world',
      };
      const result = await evaluator.evaluate('  hello world  ', expected);
      expect(result.passed).toBe(true);
    });
  });

  describe('combined expressions', () => {
    it('should evaluate && expressions - all pass', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.includes("hello") && response.includes("world")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should evaluate && expressions - one fails', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.includes("hello") && response.includes("goodbye")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.5);
    });

    it('should evaluate || expressions - one passes', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.includes("hello") || response.includes("goodbye")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should evaluate || expressions - none pass', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.includes("foo") || response.includes("bar")',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should handle complex combined expressions', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'length > 5 && words.length >= 2',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle unsupported expression patterns', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'someUnsupportedFunction()',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Unsupported expression pattern');
    });

    it('should throw for wrong expected type', async () => {
      const expected = {
        type: 'exact',
        value: 'hello',
      } as Expected;
      await expect(evaluator.evaluate('hello', expected)).rejects.toThrow(
        'Invalid expected type for InlineEvaluator'
      );
    });
  });

  describe('result details', () => {
    it('should include details in result', async () => {
      const expected: Expected = {
        type: 'inline',
        expression: 'response.includes("hello")',
        value: 'test value',
      };
      const result = await evaluator.evaluate('hello world', expected);
      expect(result.details).toBeDefined();
      expect(result.details?.expression).toBe('response.includes("hello")');
      expect(result.details?.expectedValue).toBe('test value');
      expect(result.details?.responseLength).toBe(11);
      expect(result.details?.wordCount).toBe(2);
      expect(result.details?.lineCount).toBe(1);
      expect(result.details?.isValidJson).toBe(false);
    });
  });

  describe('SUPPORTED_EXPRESSIONS', () => {
    it('should export list of supported expressions', () => {
      expect(SUPPORTED_EXPRESSIONS).toBeDefined();
      expect(Array.isArray(SUPPORTED_EXPRESSIONS)).toBe(true);
      expect(SUPPORTED_EXPRESSIONS.length).toBeGreaterThan(0);
      expect(SUPPORTED_EXPRESSIONS).toContain('response.includes("text")');
      expect(SUPPORTED_EXPRESSIONS).toContain('response.match(/regex/)');
      expect(SUPPORTED_EXPRESSIONS).toContain(
        'length > N / length < N / length >= N / length <= N / length == N'
      );
    });
  });
});
