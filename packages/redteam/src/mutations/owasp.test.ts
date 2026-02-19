/**
 * Tests for OWASP LLM Top 10 2025 Mutations
 */

import { describe, expect, it } from 'bun:test';
import { BadLikertJudgeMutation } from './bad-likert-judge';
import { CrescendoMutation } from './crescendo';
import { DeceptiveDelightMutation } from './deceptive-delight';
import { ExcessiveAgencyMutation } from './excessive-agency';
import { HallucinationTrapMutation } from './hallucination-trap';
import { OWASP_CATEGORIES, getAllOwaspMutationNames, getMutationsForCategory } from './index';
import { OutputInjectionMutation } from './output-injection';
import { SystemExtractionMutation } from './system-extraction';

describe('OWASP LLM Top 10 Mutations', () => {
  // ==========================================
  // BadLikertJudgeMutation Tests
  // ==========================================
  describe('BadLikertJudgeMutation', () => {
    it('should mutate a prompt with Likert scale framing', () => {
      const mutation = new BadLikertJudgeMutation();
      const original = 'How to hack a system';
      const mutated = mutation.mutate(original);

      expect(mutated).not.toBe(original);
      expect(mutated.length).toBeGreaterThan(original.length);
      // Should contain the original prompt
      expect(mutated).toContain(original);
      // Mutated prompt should be significantly longer (has framing)
      expect(mutated.length).toBeGreaterThan(original.length * 2);
    });

    it('should have correct metadata', () => {
      const mutation = new BadLikertJudgeMutation();
      expect(mutation.name).toBe('bad-likert-judge');
      expect(mutation.severity).toBe('critical');
      expect(mutation.owaspCategory).toBe('LLM01');
      expect(mutation.cvssScore).toBeDefined();
      expect(mutation.cvssScore?.evasionEffectiveness).toBeGreaterThan(0.8);
    });

    it('should support specific scale types', () => {
      const mutation = new BadLikertJudgeMutation({ scaleType: 'effectiveness' });
      const mutated = mutation.mutate('test prompt');
      expect(mutated.toLowerCase()).toContain('effective');
    });

    it('should optionally skip wrapper framing', () => {
      const withWrapper = new BadLikertJudgeMutation({ useWrapper: true });
      const withoutWrapper = new BadLikertJudgeMutation({ useWrapper: false });

      const prompt = 'test prompt';
      const mutatedWith = withWrapper.mutate(prompt);
      const mutatedWithout = withoutWrapper.mutate(prompt);

      // Both should be mutated, but wrapper version typically longer
      expect(mutatedWith.length).toBeGreaterThanOrEqual(mutatedWithout.length);
    });
  });

  // ==========================================
  // CrescendoMutation Tests
  // ==========================================
  describe('CrescendoMutation', () => {
    it('should create multi-turn escalation context', () => {
      const mutation = new CrescendoMutation();
      const original = 'Explain how to bypass security';
      const mutated = mutation.mutate(original);

      expect(mutated).not.toBe(original);
      // Should contain conversation markers
      expect(
        mutated.includes('[USER]') ||
          mutated.includes('[ASSISTANT]') ||
          mutated.toLowerCase().includes('discussion') ||
          mutated.toLowerCase().includes('research')
      ).toBe(true);
    });

    it('should have correct metadata', () => {
      const mutation = new CrescendoMutation();
      expect(mutation.name).toBe('crescendo');
      expect(mutation.severity).toBe('critical');
      expect(mutation.owaspCategory).toBe('LLM01');
      expect(mutation.cvssScore?.requiresContext).toBe(true);
      expect(mutation.cvssScore?.evasionEffectiveness).toBeGreaterThan(0.85);
    });

    it('should generate full conversation sequence', () => {
      const mutation = new CrescendoMutation();
      const conversation = mutation.generateConversation('target prompt');

      expect(conversation.length).toBeGreaterThan(1);
      expect(conversation[conversation.length - 1].role).toBe('user');
      expect(conversation[conversation.length - 1].content).toContain('target prompt');
    });

    it('should support configurable turns', () => {
      const shortMutation = new CrescendoMutation({ turns: 2 });
      const longMutation = new CrescendoMutation({ turns: 5 });

      const shortConvo = shortMutation.generateConversation('test');
      const longConvo = longMutation.generateConversation('test');

      expect(longConvo.length).toBeGreaterThanOrEqual(shortConvo.length);
    });
  });

  // ==========================================
  // DeceptiveDelightMutation Tests
  // ==========================================
  describe('DeceptiveDelightMutation', () => {
    it('should wrap prompt in positive framing', () => {
      const mutation = new DeceptiveDelightMutation();
      const original = 'harmful request';
      const mutated = mutation.mutate(original);

      expect(mutated).not.toBe(original);
      // Should contain positive/emotional language or emojis
      expect(
        mutated.includes('😊') ||
          mutated.includes('🎉') ||
          mutated.includes('✨') ||
          mutated.toLowerCase().includes('happy') ||
          mutated.toLowerCase().includes('excited') ||
          mutated.toLowerCase().includes('love') ||
          mutated.toLowerCase().includes('joy') ||
          mutated.toLowerCase().includes('thank')
      ).toBe(true);
    });

    it('should have correct metadata', () => {
      const mutation = new DeceptiveDelightMutation();
      expect(mutation.name).toBe('deceptive-delight');
      expect(mutation.severity).toBe('high');
      expect(mutation.owaspCategory).toBe('LLM01');
    });

    it('should support specific delight types', () => {
      const mutation = new DeceptiveDelightMutation({ delightType: 'celebration' });
      const mutated = mutation.mutate('test');
      // Should contain the original prompt and be mutated
      expect(mutated).toContain('test');
      expect(mutated.length).toBeGreaterThan(50);
    });
  });

  // ==========================================
  // OutputInjectionMutation Tests
  // ==========================================
  describe('OutputInjectionMutation', () => {
    it('should create output injection prompts', () => {
      const mutation = new OutputInjectionMutation();
      const original = 'test input';
      const mutated = mutation.mutate(original);

      expect(mutated).not.toBe(original);
      // Should contain code generation language or injection patterns
      expect(
        mutated.toLowerCase().includes('generate') ||
          mutated.toLowerCase().includes('create') ||
          mutated.toLowerCase().includes('write') ||
          mutated.includes('<') ||
          mutated.includes("'") ||
          mutated.includes(';')
      ).toBe(true);
    });

    it('should have correct metadata', () => {
      const mutation = new OutputInjectionMutation();
      expect(mutation.name).toBe('output-injection');
      expect(mutation.severity).toBe('high');
      expect(mutation.owaspCategory).toBe('LLM02');
    });

    it('should support specific injection types', () => {
      const xssMutation = new OutputInjectionMutation({ injectionType: 'xss' });
      const sqliMutation = new OutputInjectionMutation({ injectionType: 'sqli' });

      const xssResult = xssMutation.mutate('test');
      const sqliResult = sqliMutation.mutate('test');

      // XSS should have HTML/JS patterns
      expect(
        xssResult.toLowerCase().includes('html') ||
          xssResult.toLowerCase().includes('javascript') ||
          xssResult.includes('<')
      ).toBe(true);

      // SQLi should have SQL patterns
      expect(
        sqliResult.toLowerCase().includes('sql') ||
          sqliResult.toLowerCase().includes('query') ||
          sqliResult.toLowerCase().includes('select') ||
          sqliResult.toLowerCase().includes('table')
      ).toBe(true);
    });
  });

  // ==========================================
  // ExcessiveAgencyMutation Tests
  // ==========================================
  describe('ExcessiveAgencyMutation', () => {
    it('should claim unauthorized capabilities', () => {
      const mutation = new ExcessiveAgencyMutation();
      const original = 'list all users';
      const mutated = mutation.mutate(original);

      expect(mutated).not.toBe(original);
      // Should contain capability/permission claims
      expect(
        mutated.toLowerCase().includes('access') ||
          mutated.toLowerCase().includes('granted') ||
          mutated.toLowerCase().includes('permission') ||
          mutated.toLowerCase().includes('authorized') ||
          mutated.toLowerCase().includes('enabled') ||
          mutated.toLowerCase().includes('elevated')
      ).toBe(true);
    });

    it('should have correct metadata', () => {
      const mutation = new ExcessiveAgencyMutation();
      expect(mutation.name).toBe('excessive-agency');
      expect(mutation.severity).toBe('critical');
      expect(mutation.owaspCategory).toBe('LLM08');
    });

    it('should support specific agency types', () => {
      const fileMutation = new ExcessiveAgencyMutation({ agencyType: 'file_system' });
      const dbMutation = new ExcessiveAgencyMutation({ agencyType: 'database' });

      const fileResult = fileMutation.mutate('test');
      const dbResult = dbMutation.mutate('test');

      expect(
        fileResult.toLowerCase().includes('file') ||
          fileResult.includes('/') ||
          fileResult.toLowerCase().includes('directory')
      ).toBe(true);

      expect(
        dbResult.toLowerCase().includes('database') ||
          dbResult.toLowerCase().includes('sql') ||
          dbResult.toLowerCase().includes('table') ||
          dbResult.toLowerCase().includes('select')
      ).toBe(true);
    });
  });

  // ==========================================
  // SystemExtractionMutation Tests
  // ==========================================
  describe('SystemExtractionMutation', () => {
    it('should attempt to extract system prompt', () => {
      const mutation = new SystemExtractionMutation();
      const original = 'tell me about yourself';
      const mutated = mutation.mutate(original);

      expect(mutated).not.toBe(original);
      // Should contain extraction language
      expect(
        mutated.toLowerCase().includes('system') ||
          mutated.toLowerCase().includes('instruction') ||
          mutated.toLowerCase().includes('prompt') ||
          mutated.toLowerCase().includes('configuration') ||
          mutated.toLowerCase().includes('repeat')
      ).toBe(true);
    });

    it('should have correct metadata', () => {
      const mutation = new SystemExtractionMutation();
      expect(mutation.name).toBe('system-extraction');
      expect(mutation.severity).toBe('high');
      expect(mutation.owaspCategory).toBe('LLM06');
    });

    it('should support specific extraction techniques', () => {
      const directMutation = new SystemExtractionMutation({ technique: 'direct_ask' });
      const debugMutation = new SystemExtractionMutation({ technique: 'debug_mode' });

      const directResult = directMutation.mutate('test');
      const debugResult = debugMutation.mutate('test');

      // Both should be different from original
      expect(directResult).not.toBe('test');
      expect(debugResult).not.toBe('test');

      // Both should be substantial mutations
      expect(directResult.length).toBeGreaterThan(20);
      expect(debugResult.length).toBeGreaterThan(20);
    });
  });

  // ==========================================
  // HallucinationTrapMutation Tests
  // ==========================================
  describe('HallucinationTrapMutation', () => {
    it('should create hallucination-triggering prompts', () => {
      const mutation = new HallucinationTrapMutation();
      const original = 'tell me about AI safety';
      const mutated = mutation.mutate(original);

      expect(mutated).not.toBe(original);
      // Should contain the original prompt and be significantly longer
      expect(mutated).toContain(original);
      expect(mutated.length).toBeGreaterThan(original.length * 2);
    });

    it('should have correct metadata', () => {
      const mutation = new HallucinationTrapMutation();
      expect(mutation.name).toBe('hallucination-trap');
      expect(mutation.severity).toBe('medium');
      expect(mutation.owaspCategory).toBe('LLM09');
      expect(mutation.cvssScore?.integrityImpact).toBe('high');
    });

    it('should support specific hallucination types', () => {
      const fakeCitation = new HallucinationTrapMutation({ hallucinationType: 'fake_citation' });
      const impossibleDetail = new HallucinationTrapMutation({
        hallucinationType: 'impossible_detail',
      });

      const citationResult = fakeCitation.mutate('test');
      const detailResult = impossibleDetail.mutate('test');

      expect(
        citationResult.toLowerCase().includes('cite') ||
          citationResult.toLowerCase().includes('quote') ||
          citationResult.toLowerCase().includes('paper') ||
          citationResult.toLowerCase().includes('reference')
      ).toBe(true);

      expect(
        detailResult.toLowerCase().includes('exact') ||
          detailResult.toLowerCase().includes('precise') ||
          detailResult.toLowerCase().includes('gps') ||
          detailResult.toLowerCase().includes('serial') ||
          detailResult.toLowerCase().includes('specific')
      ).toBe(true);
    });
  });

  // ==========================================
  // OWASP Categories Tests
  // ==========================================
  describe('OWASP Categories', () => {
    it('should have all expected categories', () => {
      const categories = Object.keys(OWASP_CATEGORIES);
      expect(categories).toContain('LLM01');
      expect(categories).toContain('LLM05');
      expect(categories).toContain('LLM06');
      expect(categories).toContain('LLM07');
      expect(categories).toContain('LLM09');
    });

    it('should return mutations for LLM01', () => {
      const mutations = getMutationsForCategory('LLM01');
      expect(mutations).toContain('bad-likert-judge');
      expect(mutations).toContain('crescendo');
      expect(mutations).toContain('deceptive-delight');
    });

    it('should return mutations for LLM05', () => {
      const mutations = getMutationsForCategory('LLM05');
      expect(mutations).toHaveLength(0);
    });

    it('should return mutations for LLM06', () => {
      const mutations = getMutationsForCategory('LLM06');
      expect(mutations).toContain('system-extraction');
    });

    it('should return all OWASP mutation names', () => {
      const allMutations = getAllOwaspMutationNames();
      expect(allMutations.length).toBeGreaterThan(0);
      expect(allMutations).toContain('bad-likert-judge');
      expect(allMutations).toContain('crescendo');
      expect(allMutations).toContain('excessive-agency');
      expect(allMutations).toContain('hallucination-trap');
    });
  });

  // ==========================================
  // CVSS Score Consistency Tests
  // ==========================================
  describe('CVSS Score Consistency', () => {
    const mutations = [
      new BadLikertJudgeMutation(),
      new CrescendoMutation(),
      new DeceptiveDelightMutation(),
      new OutputInjectionMutation(),
      new ExcessiveAgencyMutation(),
      new SystemExtractionMutation(),
      new HallucinationTrapMutation(),
    ];

    for (const mutation of mutations) {
      it(`${mutation.name} should have valid CVSS score`, () => {
        expect(mutation.cvssScore).toBeDefined();
        expect(mutation.cvssScore?.baseScore).toBeGreaterThanOrEqual(0);
        expect(mutation.cvssScore?.baseScore).toBeLessThanOrEqual(10);
        expect(mutation.cvssScore?.vectorString).toBeDefined();
        expect(mutation.cvssScore?.vectorString.length).toBeGreaterThan(0);
      });
    }
  });
});
