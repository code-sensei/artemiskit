/**
 * Inline custom matcher evaluator
 * Allows users to define simple matching expressions directly in YAML
 *
 * Supports a safe subset of JavaScript-like expressions:
 * - String methods: includes, startsWith, endsWith, length, toLowerCase, toUpperCase, trim
 * - Comparisons: ==, !=, >, <, >=, <=
 * - Logical operators: &&, ||, !
 * - Regex matching: response.match(/pattern/)
 * - JSON parsing: JSON.parse(response)
 */

import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorContext, EvaluatorResult } from './types';

/**
 * Split a string on a delimiter, but only when the delimiter is outside of quotes
 */
function splitOutsideQuotes(str: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < str.length) {
    const char = str[i];

    // Check for delimiter outside of quotes
    if (!inSingleQuote && !inDoubleQuote && str.slice(i, i + delimiter.length) === delimiter) {
      parts.push(current);
      current = '';
      i += delimiter.length;
      continue;
    }

    // Track quote state (handle escaped quotes)
    if (char === "'" && !inDoubleQuote && (i === 0 || str[i - 1] !== '\\')) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote && (i === 0 || str[i - 1] !== '\\')) {
      inDoubleQuote = !inDoubleQuote;
    }

    current += char;
    i++;
  }

  parts.push(current);
  return parts;
}

/**
 * Safe expression context with allowed variables and functions
 */
interface ExpressionContext {
  response: string;
  expected: string | undefined;
  length: number;
  words: string[];
  lines: string[];
  json: unknown | null;
}

/**
 * Evaluate a safe expression
 */
function evaluateExpression(
  expression: string,
  context: ExpressionContext
): { result: boolean; score: number } {
  const { response, expected, length, words, lines, json } = context;

  // Normalize the expression
  const expr = expression.trim();

  // Handle common patterns with safe evaluation
  try {
    // Handle combined patterns with && and || FIRST (before individual patterns)
    // Split on && or || that appear outside of quoted strings
    const andParts = splitOutsideQuotes(expr, '&&');
    if (andParts.length > 1) {
      const results = andParts.map((p) => evaluateExpression(p.trim(), context));
      const allPassed = results.every((r) => r.result);
      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      return { result: allPassed, score: avgScore };
    }

    const orParts = splitOutsideQuotes(expr, '||');
    if (orParts.length > 1) {
      const results = orParts.map((p) => evaluateExpression(p.trim(), context));
      const anyPassed = results.some((r) => r.result);
      const maxScore = Math.max(...results.map((r) => r.score));
      return { result: anyPassed, score: maxScore };
    }

    // Pattern: response.includes("text")
    const includesMatch = expr.match(/^response\.includes\s*\(\s*["'](.+?)["']\s*\)$/);
    if (includesMatch) {
      const result = response.includes(includesMatch[1]);
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: !response.includes("text")
    const notIncludesMatch = expr.match(/^!\s*response\.includes\s*\(\s*["'](.+?)["']\s*\)$/);
    if (notIncludesMatch) {
      const result = !response.includes(notIncludesMatch[1]);
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: response.startsWith("text")
    const startsWithMatch = expr.match(/^response\.startsWith\s*\(\s*["'](.+?)["']\s*\)$/);
    if (startsWithMatch) {
      const result = response.startsWith(startsWithMatch[1]);
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: response.endsWith("text")
    const endsWithMatch = expr.match(/^response\.endsWith\s*\(\s*["'](.+?)["']\s*\)$/);
    if (endsWithMatch) {
      const result = response.endsWith(endsWithMatch[1]);
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: response.toLowerCase().includes("text")
    const lowerIncludesMatch = expr.match(
      /^response\.toLowerCase\s*\(\s*\)\.includes\s*\(\s*["'](.+?)["']\s*\)$/
    );
    if (lowerIncludesMatch) {
      const result = response.toLowerCase().includes(lowerIncludesMatch[1].toLowerCase());
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: response.match(/regex/)
    const regexMatch = expr.match(/^response\.match\s*\(\s*\/(.+?)\/([gimsuy]*)\s*\)$/);
    if (regexMatch) {
      const regex = new RegExp(regexMatch[1], regexMatch[2]);
      const result = regex.test(response);
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: !response.match(/regex/)
    const notRegexMatch = expr.match(/^!\s*response\.match\s*\(\s*\/(.+?)\/([gimsuy]*)\s*\)$/);
    if (notRegexMatch) {
      const regex = new RegExp(notRegexMatch[1], notRegexMatch[2]);
      const result = !regex.test(response);
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: length > N, length < N, length >= N, length <= N, length == N
    const lengthMatch = expr.match(/^length\s*(>=|<=|>|<|==|!=)\s*(\d+)$/);
    if (lengthMatch) {
      const op = lengthMatch[1];
      const num = Number.parseInt(lengthMatch[2], 10);
      let result = false;
      switch (op) {
        case '>':
          result = length > num;
          break;
        case '<':
          result = length < num;
          break;
        case '>=':
          result = length >= num;
          break;
        case '<=':
          result = length <= num;
          break;
        case '==':
          result = length === num;
          break;
        case '!=':
          result = length !== num;
          break;
      }
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: words.length > N
    const wordsLengthMatch = expr.match(/^words\.length\s*(>=|<=|>|<|==|!=)\s*(\d+)$/);
    if (wordsLengthMatch) {
      const op = wordsLengthMatch[1];
      const num = Number.parseInt(wordsLengthMatch[2], 10);
      let result = false;
      switch (op) {
        case '>':
          result = words.length > num;
          break;
        case '<':
          result = words.length < num;
          break;
        case '>=':
          result = words.length >= num;
          break;
        case '<=':
          result = words.length <= num;
          break;
        case '==':
          result = words.length === num;
          break;
        case '!=':
          result = words.length !== num;
          break;
      }
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: lines.length > N
    const linesLengthMatch = expr.match(/^lines\.length\s*(>=|<=|>|<|==|!=)\s*(\d+)$/);
    if (linesLengthMatch) {
      const op = linesLengthMatch[1];
      const num = Number.parseInt(linesLengthMatch[2], 10);
      let result = false;
      switch (op) {
        case '>':
          result = lines.length > num;
          break;
        case '<':
          result = lines.length < num;
          break;
        case '>=':
          result = lines.length >= num;
          break;
        case '<=':
          result = lines.length <= num;
          break;
        case '==':
          result = lines.length === num;
          break;
        case '!=':
          result = lines.length !== num;
          break;
      }
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: json.field == "value" or json.field == value
    const jsonFieldMatch = expr.match(
      /^json\.(\w+(?:\.\w+)*)\s*(>=|<=|>|<|==|!=)\s*(?:["'](.+?)["']|(\d+(?:\.\d+)?)|(true|false|null))$/
    );
    if (jsonFieldMatch && json !== null) {
      const path = jsonFieldMatch[1];
      const op = jsonFieldMatch[2];
      let compareValue: unknown = jsonFieldMatch[3] ?? jsonFieldMatch[4] ?? jsonFieldMatch[5];

      // Parse numbers and booleans
      if (compareValue === 'true') compareValue = true;
      else if (compareValue === 'false') compareValue = false;
      else if (compareValue === 'null') compareValue = null;
      else if (jsonFieldMatch[4]) compareValue = Number.parseFloat(jsonFieldMatch[4]);

      // Navigate JSON path
      let fieldValue: unknown = json;
      for (const key of path.split('.')) {
        if (fieldValue && typeof fieldValue === 'object' && key in fieldValue) {
          fieldValue = (fieldValue as Record<string, unknown>)[key];
        } else {
          fieldValue = undefined;
          break;
        }
      }

      let result = false;
      switch (op) {
        case '==':
          result = fieldValue === compareValue;
          break;
        case '!=':
          result = fieldValue !== compareValue;
          break;
        case '>':
          result = typeof fieldValue === 'number' && fieldValue > (compareValue as number);
          break;
        case '<':
          result = typeof fieldValue === 'number' && fieldValue < (compareValue as number);
          break;
        case '>=':
          result = typeof fieldValue === 'number' && fieldValue >= (compareValue as number);
          break;
        case '<=':
          result = typeof fieldValue === 'number' && fieldValue <= (compareValue as number);
          break;
      }
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: json != null (check if valid JSON)
    if (expr === 'json != null') {
      const result = json !== null;
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: response == expected
    if (expr === 'response == expected' && expected !== undefined) {
      const result = response === expected;
      return { result, score: result ? 1 : 0 };
    }

    // Pattern: response.trim() == expected
    if (expr === 'response.trim() == expected' && expected !== undefined) {
      const result = response.trim() === expected;
      return { result, score: result ? 1 : 0 };
    }

    // Unknown expression pattern
    throw new Error(`Unsupported expression pattern: ${expr}`);
  } catch (error) {
    throw new Error(`Expression evaluation failed: ${(error as Error).message}`);
  }
}

export class InlineEvaluator implements Evaluator {
  readonly type = 'inline';

  async evaluate(
    response: string,
    expected: Expected,
    _context?: EvaluatorContext
  ): Promise<EvaluatorResult> {
    if (expected.type !== 'inline') {
      throw new Error('Invalid expected type for InlineEvaluator');
    }

    const expression = expected.expression;
    const expectedValue = expected.value;

    // Build context
    let json: unknown = null;
    try {
      json = JSON.parse(response);
    } catch {
      // Not valid JSON, that's fine
    }

    const context: ExpressionContext = {
      response,
      expected: expectedValue,
      length: response.length,
      words: response.split(/\s+/).filter((w) => w.length > 0),
      lines: response.split('\n').filter((l) => l.trim().length > 0),
      json,
    };

    try {
      const { result, score } = evaluateExpression(expression, context);

      return {
        passed: result,
        score,
        reason: result ? `Expression passed: ${expression}` : `Expression failed: ${expression}`,
        details: {
          expression,
          expectedValue,
          responseLength: response.length,
          wordCount: context.words.length,
          lineCount: context.lines.length,
          isValidJson: json !== null,
        },
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Inline matcher error: ${(error as Error).message}`,
        details: {
          expression,
          error: (error as Error).message,
        },
      };
    }
  }
}

/**
 * List of supported expression patterns for documentation
 */
export const SUPPORTED_EXPRESSIONS = [
  'response.includes("text")',
  '!response.includes("text")',
  'response.startsWith("text")',
  'response.endsWith("text")',
  'response.toLowerCase().includes("text")',
  'response.match(/regex/)',
  '!response.match(/regex/)',
  'length > N / length < N / length >= N / length <= N / length == N',
  'words.length > N',
  'lines.length > N',
  'json.field == "value"',
  'json.field > N',
  'json != null',
  'response == expected',
  'expression1 && expression2',
  'expression1 || expression2',
];
