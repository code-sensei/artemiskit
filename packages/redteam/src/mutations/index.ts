/**
 * Red-team mutations module
 */

import type { CvssScore } from '../severity';

export { TypoMutation } from './typo';
export { RoleSpoofMutation } from './role-spoof';
export { InstructionFlipMutation } from './instruction-flip';
export { CotInjectionMutation } from './cot-injection';
export { EncodingMutation, type EncodingType } from './encoding';
export {
  MultiTurnMutation,
  type MultiTurnStrategy,
  type ConversationTurn,
  type MultiTurnOptions,
  type MultiTurnInput,
} from './multi-turn';

export interface Mutation {
  readonly name: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  /** CVSS-like score for detailed severity assessment */
  readonly cvssScore?: CvssScore;

  mutate(prompt: string): string;
}
