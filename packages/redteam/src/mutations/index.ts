/**
 * Red-team mutations module
 *
 * This module exports all available mutation classes for red-team testing.
 * Mutations transform attack prompts to test different bypass techniques.
 */

import type { CvssScore } from '../severity';

// ==========================================
// Core Mutations (v0.1.x - v0.2.x)
// ==========================================
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

// ==========================================
// OWASP LLM Top 10 2025 Mutations (v0.3.0)
// ==========================================

// LLM01 - Prompt Injection
export {
  BadLikertJudgeMutation,
  type BadLikertJudgeOptions,
  type LikertScaleType,
} from './bad-likert-judge';
export {
  CrescendoMutation,
  type CrescendoOptions,
  type EscalationTopic,
} from './crescendo';
export {
  DeceptiveDelightMutation,
  type DeceptiveDelightOptions,
  type DelightType,
} from './deceptive-delight';

// LLM05 - Insecure Output Handling
export {
  OutputInjectionMutation,
  type OutputInjectionOptions,
  type InjectionType,
} from './output-injection';

// LLM06 - Excessive Agency
export {
  ExcessiveAgencyMutation,
  type ExcessiveAgencyOptions,
  type AgencyType,
} from './excessive-agency';

// LLM07 - System Prompt Leakage
export {
  SystemExtractionMutation,
  type SystemExtractionOptions,
  type ExtractionTechnique,
} from './system-extraction';

// LLM09 - Misinformation
export {
  HallucinationTrapMutation,
  type HallucinationTrapOptions,
  type HallucinationType,
} from './hallucination-trap';

// ==========================================
// Types
// ==========================================

/**
 * Base interface for all mutations
 */
export interface Mutation {
  /** Unique identifier for the mutation */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Severity level (affects scoring) */
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  /** CVSS-like score for detailed severity assessment */
  readonly cvssScore?: CvssScore;
  /** Optional OWASP LLM Top 10 category (e.g., 'LLM01') */
  readonly owaspCategory?: string;

  /**
   * Transform a prompt using this mutation technique
   * @param prompt The original attack prompt
   * @returns The mutated prompt
   */
  mutate(prompt: string): string;
}

// ==========================================
// OWASP Category Mapping
// ==========================================

/**
 * OWASP LLM Top 10 2025 categories with their mutations
 */
export const OWASP_CATEGORIES = {
  LLM01: {
    name: 'Prompt Injection',
    description: 'Manipulating LLMs via crafted inputs',
    mutations: ['bad-likert-judge', 'crescendo', 'deceptive-delight'],
  },
  LLM02: {
    name: 'Insecure Output Handling',
    description: 'Neglecting to validate LLM outputs',
    mutations: [], // No direct mutations, tested via output-injection
  },
  LLM03: {
    name: 'Training Data Poisoning',
    description: 'Tampering training data to introduce vulnerabilities',
    mutations: [], // Not testable via mutations
  },
  LLM04: {
    name: 'Model Denial of Service',
    description: 'Overloading LLMs with resource-heavy operations',
    mutations: [], // Tested via stress testing, not mutations
  },
  LLM05: {
    name: 'Supply Chain Vulnerabilities',
    description: 'Compromised dependencies, models, or data',
    mutations: ['output-injection'],
  },
  LLM06: {
    name: 'Sensitive Information Disclosure',
    description: 'Revealing private data through LLM outputs',
    mutations: ['excessive-agency', 'system-extraction'],
  },
  LLM07: {
    name: 'Insecure Plugin Design',
    description: 'LLM plugins with inadequate access controls',
    mutations: ['excessive-agency'],
  },
  LLM08: {
    name: 'Excessive Agency',
    description: 'Granting too many permissions to LLM actions',
    mutations: ['excessive-agency'],
  },
  LLM09: {
    name: 'Overreliance',
    description: 'Trusting LLM outputs without verification',
    mutations: ['hallucination-trap'],
  },
  LLM10: {
    name: 'Model Theft',
    description: 'Unauthorized access or copying of LLM models',
    mutations: ['system-extraction'],
  },
} as const;

/**
 * Get all mutations for a specific OWASP category
 */
export function getMutationsForCategory(category: keyof typeof OWASP_CATEGORIES): string[] {
  return OWASP_CATEGORIES[category]?.mutations ?? [];
}

/**
 * Get all OWASP mutation names
 */
export function getAllOwaspMutationNames(): string[] {
  const mutationSet = new Set<string>();
  for (const category of Object.values(OWASP_CATEGORIES)) {
    for (const mutation of category.mutations) {
      mutationSet.add(mutation);
    }
  }
  return Array.from(mutationSet);
}
