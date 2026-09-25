import { describe, expect, test } from 'bun:test';
import type { ModelClient } from '../adapters/types';
import { ScenarioSchema } from '../scenario/schema';
import { LLMGraderEvaluator } from './llm-grader';

function graderCase(strict: boolean) {
  return ScenarioSchema.parse({
    name: 'grader parsing',
    cases: [
      {
        id: 'grade',
        prompt: 'grade this',
        expected: { type: 'llm_grader', rubric: 'Be correct', threshold: 0.7, strict },
      },
    ],
  }).cases[0].expected;
}

function clientWith(text: string): ModelClient {
  return {
    provider: 'test',
    generate: async () => ({
      id: 'judge-response',
      model: 'judge-model',
      text,
      tokens: { prompt: 1, completion: 1, total: 2 },
      latencyMs: 1,
      finishReason: 'stop',
    }),
    capabilities: async () => ({
      streaming: false,
      functionCalling: false,
      toolUse: false,
      maxContext: 1,
    }),
  };
}

describe('LLMGraderEvaluator strict parsing', () => {
  test('accepts finite numeric boundary scores in exact JSON', async () => {
    const evaluator = new LLMGraderEvaluator();
    const passing = await evaluator.evaluate('response', graderCase(true), {
      client: clientWith('{"score":1,"reason":"complete"}'),
    });
    const failing = await evaluator.evaluate('response', graderCase(true), {
      client: clientWith('{"score":0,"reason":"missing requirement"}'),
    });

    expect(passing).toMatchObject({ passed: true, score: 1, status: 'passed' });
    expect(failing).toMatchObject({ passed: false, score: 0, status: 'failed' });
  });

  test('marks malformed, coerced, and out-of-range strict judge scores invalid', async () => {
    const evaluator = new LLMGraderEvaluator();
    for (const text of [
      'Score: 1',
      '{"score":"1","reason":"coerced"}',
      '{"score":1.01,"reason":"out of range"}',
      '```json\n{"score":1,"reason":"wrapped"}\n```',
    ]) {
      const result = await evaluator.evaluate('response', graderCase(true), {
        client: clientWith(text),
      });
      expect(result).toMatchObject({
        passed: false,
        score: 0,
        status: 'invalid',
        evidence: { validation: { status: 'invalid', code: 'grader_failure' } },
      });
    }
  });

  test('keeps permissive parsing for non-strict legacy graders', async () => {
    const result = await new LLMGraderEvaluator().evaluate('response', graderCase(false), {
      client: clientWith('Score: 0.8'),
    });

    expect(result).toMatchObject({ passed: true, score: 0.8, status: 'passed' });
  });
});
