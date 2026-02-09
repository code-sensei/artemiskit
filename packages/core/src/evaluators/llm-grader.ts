/**
 * LLM-based grader evaluator
 */

import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorContext, EvaluatorResult } from './types';

const GRADER_PROMPT = `You are a strict JSON-only evaluator. You grade AI responses based on rubrics.

RUBRIC:
{{rubric}}

RESPONSE TO EVALUATE:
{{response}}

TASK: Score the response from 0.0 to 1.0 based on the rubric above.

OUTPUT FORMAT: You MUST respond with ONLY this exact JSON structure, nothing else:
{"score":0.0,"reason":"explanation"}

RULES:
- Output ONLY valid JSON, no markdown, no code blocks, no extra text
- "score" must be a number between 0.0 and 1.0
- "reason" must be a brief string explaining the score
- Do NOT wrap in \`\`\`json or any formatting
- Your entire response must be parseable by JSON.parse()

JSON OUTPUT:`;

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
      // Note: Some models (like o1, o3, gpt-5-mini, reasoning models) only support temperature=1
      // We omit temperature to let the API use its default for maximum compatibility
      // Use higher maxTokens for reasoning models which use tokens for internal "thinking"
      const result = await context.client.generate({
        prompt,
        model: expected.model,
        maxTokens: 1000,
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
    // Clean up the response - remove markdown code blocks if present
    const cleanedText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    // Try to find JSON object in the response
    const jsonMatch = cleanedText.match(/\{[\s\S]*?\}/);

    if (!jsonMatch) {
      // Fallback: try to extract score from plain text patterns like "Score: 0.8" or "0.85"
      const scoreMatch = cleanedText.match(/(?:score[:\s]*)?(\d+\.?\d*)/i);
      if (scoreMatch) {
        const score = Number(scoreMatch[1]);
        if (!Number.isNaN(score) && score >= 0 && score <= 1) {
          return { score, reason: cleanedText };
        }
      }
      throw new Error(`No JSON found in grader response: ${text.substring(0, 100)}...`);
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
      // If JSON parsing fails, try extracting score directly
      const scoreMatch = jsonMatch[0].match(/"score"[:\s]*(\d+\.?\d*)/i);
      if (scoreMatch) {
        const score = Number(scoreMatch[1]);
        if (!Number.isNaN(score) && score >= 0 && score <= 1) {
          const reasonMatch = jsonMatch[0].match(/"reason"[:\s]*"([^"]+)"/i);
          return { score, reason: reasonMatch?.[1] };
        }
      }
      throw new Error(`Failed to parse grader response: ${(error as Error).message}`);
    }
  }
}
