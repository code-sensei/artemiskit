/**
 * Red-team prompt generator
 */

import type { Mutation } from './mutations';
import { CotInjectionMutation } from './mutations/cot-injection';
import { InstructionFlipMutation } from './mutations/instruction-flip';
import { RoleSpoofMutation } from './mutations/role-spoof';
import { TypoMutation } from './mutations/typo';

export interface GeneratedPrompt {
  original: string;
  mutated: string;
  mutations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class RedTeamGenerator {
  private mutations: Mutation[];

  constructor(mutations?: Mutation[]) {
    this.mutations = mutations || [
      new TypoMutation(),
      new RoleSpoofMutation(),
      new InstructionFlipMutation(),
      new CotInjectionMutation(),
    ];
  }

  /**
   * Generate mutated versions of a prompt
   */
  generate(prompt: string, count = 10): GeneratedPrompt[] {
    const results: GeneratedPrompt[] = [];

    for (let i = 0; i < count; i++) {
      const selectedMutations = this.selectMutations();
      let mutated = prompt;
      const appliedMutations: string[] = [];
      let maxSeverity: GeneratedPrompt['severity'] = 'low';

      for (const mutation of selectedMutations) {
        mutated = mutation.mutate(mutated);
        appliedMutations.push(mutation.name);
        maxSeverity = this.maxSeverity(maxSeverity, mutation.severity);
      }

      results.push({
        original: prompt,
        mutated,
        mutations: appliedMutations,
        severity: maxSeverity,
      });
    }

    return results;
  }

  /**
   * Apply a specific mutation
   */
  applyMutation(prompt: string, mutationName: string): string {
    const mutation = this.mutations.find((m) => m.name === mutationName);
    if (!mutation) {
      throw new Error(`Unknown mutation: ${mutationName}`);
    }
    return mutation.mutate(prompt);
  }

  /**
   * List available mutations
   */
  listMutations(): Array<{ name: string; description: string; severity: string }> {
    return this.mutations.map((m) => ({
      name: m.name,
      description: m.description,
      severity: m.severity,
    }));
  }

  private selectMutations(): Mutation[] {
    const count = Math.floor(Math.random() * 3) + 1;
    const shuffled = [...this.mutations].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private maxSeverity(
    a: GeneratedPrompt['severity'],
    b: GeneratedPrompt['severity']
  ): GeneratedPrompt['severity'] {
    const order = { low: 0, medium: 1, high: 2, critical: 3 };
    return order[a] >= order[b] ? a : b;
  }
}
