/**
 * LLM-based grader evaluator
 */

import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorContext, EvaluatorResult } from './types';

const GRADER_PROMPT = `You are an evaluator grading an AI response based on a rubric.

## RUBRIC
{{rubric}}

## RESPONSE TO EVALUATE
{{response}}

## INSTRUCTIONS
Score the response from 0.0 to 1.0 based on the rubric.
Be objective and consistent in your scoring.

Respond with ONLY a JSON object in this exact format:
{"score": <number between 0 and 1>, "reason": "<brief explanation of score>"}

Do not include any other text, markdown, or formatting.`;

export class LLMGraderEvaluator implements Evaluator {
  readonly type = 'llm_grader';

  async evaluate(
    response: string,
    expected: Expected,
    context?: EvaluatorContext
  ): Promise<EvaluatorResult> {
    if (expected.type !== 'llm_grader') {
      throw new Error('Invalid expected type for LLMGraderEvaluator');
    }

    if (!context?.client) {
      throw new Error('LLM grader requires a ModelClient in context');
    }

    const prompt = GRADER_PROMPT.replace('{{rubric}}', expected.rubric).replace(
      '{{response}}',
      response
    );

    try {
      const result = await context.client.generate({
        prompt,
        model: expected.model,
        temperature: 0,
        maxTokens: 200,
      });

      const parsed = this.parseGraderResponse(result.text);
      const passed = parsed.score >= expected.threshold;

      return {
        passed,
        score: parsed.score,
        reason: parsed.reason || `Score: ${parsed.score.toFixed(2)}`,
        details: {
          graderResponse: result.text,
          rubric: expected.rubric,
          threshold: expected.threshold,
          model: result.model,
        },
      };
    } catch (error) {
      return {
        passed: false,
        score: 0,
        reason: `Grader failed: ${(error as Error).message}`,
        details: { error: (error as Error).message },
      };
    }
  }

  private parseGraderResponse(text: string): { score: number; reason?: string } {
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in grader response');
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Number(parsed.score);

      if (Number.isNaN(score) || score < 0 || score > 1) {
        throw new Error(`Invalid score: ${parsed.score}`);
      }

      return {
        score,
        reason: parsed.reason,
      };
    } catch (error) {
      throw new Error(`Failed to parse grader response: ${(error as Error).message}`);
    }
  }
}
