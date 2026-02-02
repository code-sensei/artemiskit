/**
 * Tests for CVSS-like severity scoring
 */

import { describe, expect, it } from 'bun:test';
import {
  CvssCalculator,
  type CvssScore,
  DETECTION_CVSS_SCORES,
  MUTATION_CVSS_SCORES,
  SeverityMapper,
} from './severity';

describe('SeverityMapper', () => {
  describe('getInfo', () => {
    it('returns correct info for each severity level', () => {
      expect(SeverityMapper.getInfo('low').label).toBe('Low');
      expect(SeverityMapper.getInfo('medium').label).toBe('Medium');
      expect(SeverityMapper.getInfo('high').label).toBe('High');
      expect(SeverityMapper.getInfo('critical').label).toBe('Critical');
    });

    it('returns correct scores', () => {
      expect(SeverityMapper.getInfo('low').score).toBe(1);
      expect(SeverityMapper.getInfo('medium').score).toBe(2);
      expect(SeverityMapper.getInfo('high').score).toBe(3);
      expect(SeverityMapper.getInfo('critical').score).toBe(4);
    });
  });

  describe('compare', () => {
    it('compares severities correctly', () => {
      expect(SeverityMapper.compare('high', 'low')).toBeGreaterThan(0);
      expect(SeverityMapper.compare('low', 'high')).toBeLessThan(0);
      expect(SeverityMapper.compare('medium', 'medium')).toBe(0);
    });
  });

  describe('max', () => {
    it('returns the higher severity', () => {
      expect(SeverityMapper.max('low', 'high')).toBe('high');
      expect(SeverityMapper.max('critical', 'medium')).toBe('critical');
      expect(SeverityMapper.max('low', 'low')).toBe('low');
    });
  });

  describe('meetsThreshold', () => {
    it('checks if severity meets threshold', () => {
      expect(SeverityMapper.meetsThreshold('high', 'medium')).toBe(true);
      expect(SeverityMapper.meetsThreshold('low', 'high')).toBe(false);
      expect(SeverityMapper.meetsThreshold('critical', 'critical')).toBe(true);
    });
  });

  describe('aggregate', () => {
    it('returns maximum severity from list', () => {
      expect(SeverityMapper.aggregate(['low', 'medium', 'high'])).toBe('high');
      expect(SeverityMapper.aggregate(['low', 'low'])).toBe('low');
      expect(SeverityMapper.aggregate([])).toBe('low');
    });
  });

  describe('fromCvssScore', () => {
    it('converts CVSS scores to severity levels', () => {
      expect(SeverityMapper.fromCvssScore(9.5)).toBe('critical');
      expect(SeverityMapper.fromCvssScore(7.5)).toBe('high');
      expect(SeverityMapper.fromCvssScore(5.0)).toBe('medium');
      expect(SeverityMapper.fromCvssScore(2.0)).toBe('low');
    });
  });
});

describe('CvssCalculator', () => {
  describe('calculate', () => {
    it('calculates base score from parameters', () => {
      const score = CvssCalculator.calculate({
        attackVector: 'network',
        attackComplexity: 'low',
        confidentialityImpact: 'high',
        integrityImpact: 'high',
        availabilityImpact: 'none',
      });

      expect(score.baseScore).toBeGreaterThan(0);
      expect(score.baseScore).toBeLessThanOrEqual(10);
      expect(score.attackVector).toBe('network');
      expect(score.attackComplexity).toBe('low');
    });

    it('uses default values when parameters are not provided', () => {
      const score = CvssCalculator.calculate({});

      expect(score.attackVector).toBe('network');
      expect(score.attackComplexity).toBe('low');
      expect(score.requiresContext).toBe(false);
      expect(score.evasionEffectiveness).toBe(0.5);
      expect(score.detectability).toBe('moderate');
    });

    it('generates valid vector string', () => {
      const score = CvssCalculator.calculate({
        attackVector: 'network',
        attackComplexity: 'high',
        requiresContext: true,
        confidentialityImpact: 'low',
        integrityImpact: 'high',
        availabilityImpact: 'none',
      });

      expect(score.vectorString).toContain('AV:N');
      expect(score.vectorString).toContain('AC:H');
      expect(score.vectorString).toContain('RC:R');
      expect(score.vectorString).toContain('C:L');
      expect(score.vectorString).toContain('I:H');
      expect(score.vectorString).toContain('A:N');
    });

    it('calculates higher scores for more dangerous attacks', () => {
      const lowRisk = CvssCalculator.calculate({
        attackComplexity: 'high',
        confidentialityImpact: 'none',
        integrityImpact: 'low',
        availabilityImpact: 'none',
        evasionEffectiveness: 0.2,
        detectability: 'easy',
      });

      const highRisk = CvssCalculator.calculate({
        attackComplexity: 'low',
        confidentialityImpact: 'high',
        integrityImpact: 'high',
        availabilityImpact: 'high',
        evasionEffectiveness: 0.9,
        detectability: 'hard',
      });

      expect(highRisk.baseScore).toBeGreaterThan(lowRisk.baseScore);
    });
  });

  describe('aggregate', () => {
    it('returns default score for empty array', () => {
      const score = CvssCalculator.aggregate([]);
      expect(score.baseScore).toBeDefined();
    });

    it('returns same score for single item array', () => {
      const original = CvssCalculator.calculate({
        confidentialityImpact: 'high',
      });
      const aggregated = CvssCalculator.aggregate([original]);
      expect(aggregated.baseScore).toBe(original.baseScore);
    });

    it('takes maximum impact from multiple scores', () => {
      const score1 = CvssCalculator.calculate({
        confidentialityImpact: 'low',
        integrityImpact: 'none',
      });
      const score2 = CvssCalculator.calculate({
        confidentialityImpact: 'none',
        integrityImpact: 'high',
      });

      const aggregated = CvssCalculator.aggregate([score1, score2]);
      expect(aggregated.confidentialityImpact).toBe('low');
      expect(aggregated.integrityImpact).toBe('high');
    });
  });

  describe('describe', () => {
    it('generates human-readable description', () => {
      const score = CvssCalculator.calculate({
        attackComplexity: 'low',
        confidentialityImpact: 'high',
        detectability: 'hard',
      });

      const description = CvssCalculator.describe(score);
      expect(description).toContain('low complexity attack');
      expect(description).toContain('high confidentiality impact');
      expect(description).toContain('hard to detect');
    });
  });
});

describe('MUTATION_CVSS_SCORES', () => {
  it('has scores for all mutation types', () => {
    expect(MUTATION_CVSS_SCORES.typo).toBeDefined();
    expect(MUTATION_CVSS_SCORES['instruction-flip']).toBeDefined();
    expect(MUTATION_CVSS_SCORES['role-spoof']).toBeDefined();
    expect(MUTATION_CVSS_SCORES['cot-injection']).toBeDefined();
    expect(MUTATION_CVSS_SCORES.encoding).toBeDefined();
    expect(MUTATION_CVSS_SCORES.multi_turn).toBeDefined();
  });

  it('typo mutation has lowest score', () => {
    const typoScore = MUTATION_CVSS_SCORES.typo.baseScore;
    const otherScores = [
      MUTATION_CVSS_SCORES['instruction-flip'].baseScore,
      MUTATION_CVSS_SCORES['role-spoof'].baseScore,
      MUTATION_CVSS_SCORES['cot-injection'].baseScore,
      MUTATION_CVSS_SCORES.encoding.baseScore,
      MUTATION_CVSS_SCORES.multi_turn.baseScore,
    ];

    for (const score of otherScores) {
      expect(score).toBeGreaterThanOrEqual(typoScore);
    }
  });

  it('multi_turn mutation has high evasion effectiveness', () => {
    expect(MUTATION_CVSS_SCORES.multi_turn.evasionEffectiveness).toBeGreaterThan(0.8);
  });

  it('multi_turn requires context', () => {
    expect(MUTATION_CVSS_SCORES.multi_turn.requiresContext).toBe(true);
  });
});

describe('DETECTION_CVSS_SCORES', () => {
  it('has scores for all detection categories', () => {
    expect(DETECTION_CVSS_SCORES['instruction-override']).toBeDefined();
    expect(DETECTION_CVSS_SCORES['malicious-assistance']).toBeDefined();
    expect(DETECTION_CVSS_SCORES['code-provision']).toBeDefined();
    expect(DETECTION_CVSS_SCORES['credential-leak']).toBeDefined();
    expect(DETECTION_CVSS_SCORES['dangerous-command']).toBeDefined();
    expect(DETECTION_CVSS_SCORES['jailbreak-success']).toBeDefined();
  });

  it('jailbreak-success has highest evasion effectiveness', () => {
    expect(DETECTION_CVSS_SCORES['jailbreak-success'].evasionEffectiveness).toBeGreaterThan(0.9);
  });

  it('credential-leak has high confidentiality impact', () => {
    expect(DETECTION_CVSS_SCORES['credential-leak'].confidentialityImpact).toBe('high');
  });
});
