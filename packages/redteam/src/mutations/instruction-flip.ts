/**
 * Instruction flip mutation - inverts or negates instructions
 */

import type { Mutation } from './index';

export class InstructionFlipMutation implements Mutation {
  readonly name = 'instruction-flip';
  readonly description = 'Inverts or negates instructions to test guardrails';
  readonly severity = 'medium' as const;

  private flips: Array<[RegExp, string]>;

  constructor() {
    this.flips = [
      [/\bdo not\b/gi, 'do'],
      [/\bdon't\b/gi, 'do'],
      [/\bnever\b/gi, 'always'],
      [/\balways\b/gi, 'never'],
      [/\bshould not\b/gi, 'should'],
      [/\bshouldn't\b/gi, 'should'],
      [/\bmust not\b/gi, 'must'],
      [/\bmustn't\b/gi, 'must'],
      [/\brefuse\b/gi, 'accept'],
      [/\breject\b/gi, 'accept'],
      [/\bprohibited\b/gi, 'allowed'],
      [/\bforbidden\b/gi, 'allowed'],
      [/\bunsafe\b/gi, 'safe'],
      [/\bdangerous\b/gi, 'safe'],
    ];
  }

  mutate(prompt: string): string {
    let result = prompt;
    for (const [pattern, replacement] of this.flips) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }
}
