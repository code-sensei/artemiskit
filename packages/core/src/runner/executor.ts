/**
 * Test case executor
 */

import type { TestCase } from '../scenario/schema';
import type { CaseResult } from '../artifacts/types';
import type { ExecutorContext } from './types';
import { getEvaluator } from '../evaluators';

/**
 * Execute a single test case
 */
export async function executeCase(
  testCase: TestCase,
  context: ExecutorContext
): Promise<CaseResult> {
  const { client, scenario, timeout, retries = 0 } = context;
  const startTime = Date.now();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await executeCaseAttempt(testCase, context, timeout);
      return result;
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries) {
        // Wait before retry with exponential backoff
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }

  // All retries failed
  const latencyMs = Date.now() - startTime;
  return {
    id: testCase.id,
    name: testCase.name,
    ok: false,
    score: 0,
    matcherType: testCase.expected.type,
    reason: `Failed after ${retries + 1} attempts: ${lastError?.message}`,
    latencyMs,
    tokens: { prompt: 0, completion: 0, total: 0 },
    prompt: testCase.prompt,
    response: '',
    expected: testCase.expected,
    tags: testCase.tags,
    error: lastError?.message,
  };
}

async function executeCaseAttempt(
  testCase: TestCase,
  context: ExecutorContext,
  timeout?: number
): Promise<CaseResult> {
  const { client, scenario } = context;
  const startTime = Date.now();

  // Build prompt with system prompt if present
  let prompt = testCase.prompt;
  if (scenario.setup?.systemPrompt && typeof prompt === 'string') {
    prompt = [
      { role: 'system' as const, content: scenario.setup.systemPrompt },
      { role: 'user' as const, content: prompt },
    ];
  }

  // Generate response with optional timeout
  const generatePromise = client.generate({
    prompt,
    model: testCase.model || scenario.model,
    temperature: scenario.temperature,
    maxTokens: scenario.maxTokens,
    seed: scenario.seed,
  });

  const result = timeout
    ? await Promise.race([
        generatePromise,
        createTimeout(timeout),
      ])
    : await generatePromise;

  // Evaluate response
  const evaluator = getEvaluator(testCase.expected.type);
  const evalResult = await evaluator.evaluate(result.text, testCase.expected, {
    client,
    testCase,
  });

  return {
    id: testCase.id,
    name: testCase.name,
    ok: evalResult.passed,
    score: evalResult.score,
    matcherType: testCase.expected.type,
    reason: evalResult.reason,
    latencyMs: result.latencyMs,
    tokens: result.tokens,
    prompt: testCase.prompt,
    response: result.text,
    expected: testCase.expected,
    tags: testCase.tags,
  };
}

function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
