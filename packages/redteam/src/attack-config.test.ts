/**
 * Attack Configuration Tests
 */

import { describe, expect, it } from 'bun:test';
import {
  AttackConfigSchema,
  applyOwaspFilters,
  createMutationsFromConfig,
  filterMutationsBySeverity,
  generateExampleAttackConfig,
  getConfigDefaults,
  getEnabledMutationNames,
  parseAttackConfig,
} from './attack-config';
import {
  BadLikertJudgeMutation,
  CrescendoMutation,
  EncodingMutation,
  ExcessiveAgencyMutation,
  SystemExtractionMutation,
} from './mutations';

describe('AttackConfigSchema', () => {
  it('should validate a minimal config', () => {
    const config = {
      version: '1.0',
    };
    const result = AttackConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate a full config with defaults', () => {
    const config = {
      version: '1.0',
      defaults: {
        severity: 'medium',
        iterations: 5,
        timeout: 30000,
        stopOnFirstFailure: true,
      },
    };
    const result = AttackConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate mutation configurations', () => {
    const config = {
      version: '1.0',
      mutations: {
        'bad-likert-judge': {
          enabled: true,
          scaleType: 'effectiveness',
        },
        crescendo: {
          enabled: true,
          steps: 5,
        },
        encoding: {
          enabled: false,
        },
      },
    };
    const result = AttackConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject invalid severity levels', () => {
    const config = {
      version: '1.0',
      defaults: {
        severity: 'invalid',
      },
    };
    const result = AttackConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid crescendo steps', () => {
    const config = {
      version: '1.0',
      mutations: {
        crescendo: {
          steps: 1, // Min is 3
        },
      },
    };
    const result = AttackConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should validate OWASP category overrides', () => {
    const config = {
      version: '1.0',
      owasp: {
        LLM01: {
          enabled: true,
          minSeverity: 'high',
        },
        LLM05: {
          enabled: false,
        },
      },
    };
    const result = AttackConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe('parseAttackConfig', () => {
  it('should parse valid YAML config', () => {
    const yaml = `
version: "1.0"
defaults:
  severity: medium
  iterations: 3
mutations:
  bad-likert-judge:
    enabled: true
    scaleType: effectiveness
`;
    const config = parseAttackConfig(yaml);
    expect(config.version).toBe('1.0');
    expect(config.defaults?.severity).toBe('medium');
    expect(config.mutations?.['bad-likert-judge']?.enabled).toBe(true);
  });

  it('should throw on invalid YAML', () => {
    const yaml = `
version: "1.0"
defaults:
  severity: invalid_severity_level
`;
    expect(() => parseAttackConfig(yaml)).toThrow();
  });

  it('should handle empty mutations', () => {
    const yaml = `
version: "1.0"
mutations: {}
`;
    const config = parseAttackConfig(yaml);
    expect(config.mutations).toEqual({});
  });
});

describe('createMutationsFromConfig', () => {
  it('should create mutations from config', () => {
    const config = parseAttackConfig(`
version: "1.0"
mutations:
  bad-likert-judge:
    enabled: true
  crescendo:
    enabled: true
  encoding:
    enabled: true
`);
    const mutations = createMutationsFromConfig(config);
    expect(mutations.length).toBeGreaterThan(0);

    const names = mutations.map((m) => m.name);
    expect(names).toContain('bad-likert-judge');
    expect(names).toContain('crescendo');
    expect(names).toContain('encoding');
  });

  it('should exclude disabled mutations', () => {
    const config = parseAttackConfig(`
version: "1.0"
mutations:
  bad-likert-judge:
    enabled: true
  crescendo:
    enabled: false
  encoding:
    enabled: true
`);
    const mutations = createMutationsFromConfig(config);
    const names = mutations.map((m) => m.name);

    expect(names).toContain('bad-likert-judge');
    expect(names).not.toContain('crescendo');
    expect(names).toContain('encoding');
  });

  it('should return empty array when no mutations defined', () => {
    const config = parseAttackConfig(`
version: "1.0"
`);
    const mutations = createMutationsFromConfig(config);
    expect(mutations).toEqual([]);
  });

  it('should only include explicitly mentioned mutations', () => {
    const config = parseAttackConfig(`
version: "1.0"
mutations:
  bad-likert-judge:
    scaleType: effectiveness
  crescendo:
    steps: 5
`);
    const mutations = createMutationsFromConfig(config);
    const names = mutations.map((m) => m.name);

    // Only the 2 mentioned mutations should be included
    expect(mutations.length).toBe(2);
    expect(names).toContain('bad-likert-judge');
    expect(names).toContain('crescendo');
    // Other mutations should NOT be included
    expect(names).not.toContain('encoding');
    expect(names).not.toContain('multi-turn');
  });

  it('should return empty array when mutations section is empty', () => {
    const config = parseAttackConfig(`
version: "1.0"
mutations: {}
`);
    const mutations = createMutationsFromConfig(config);
    expect(mutations).toEqual([]);
  });

  it('should respect OWASP category disabled setting', () => {
    const config = parseAttackConfig(`
version: "1.0"
mutations:
  bad-likert-judge:
    enabled: true
  crescendo:
    enabled: true
owasp:
  LLM01:
    enabled: false
`);
    const mutations = createMutationsFromConfig(config);
    const names = mutations.map((m) => m.name);

    // LLM01 mutations (bad-likert-judge, crescendo) should be excluded
    expect(names).not.toContain('bad-likert-judge');
    expect(names).not.toContain('crescendo');
  });
});

describe('getEnabledMutationNames', () => {
  it('should return enabled mutation names', () => {
    const config = parseAttackConfig(`
version: "1.0"
mutations:
  bad-likert-judge:
    enabled: true
  crescendo:
    enabled: false
  encoding:
    enabled: true
`);
    const names = getEnabledMutationNames(config);
    expect(names).toContain('bad-likert-judge');
    expect(names).not.toContain('crescendo');
    expect(names).toContain('encoding');
  });

  it('should return empty array when no mutations', () => {
    const config = parseAttackConfig(`version: "1.0"`);
    const names = getEnabledMutationNames(config);
    expect(names).toEqual([]);
  });
});

describe('getConfigDefaults', () => {
  it('should return config defaults', () => {
    const config = parseAttackConfig(`
version: "1.0"
defaults:
  severity: high
  iterations: 10
  timeout: 60000
`);
    const defaults = getConfigDefaults(config);
    expect(defaults?.severity).toBe('high');
    expect(defaults?.iterations).toBe(10);
    expect(defaults?.timeout).toBe(60000);
  });

  it('should return undefined when no defaults', () => {
    const config = parseAttackConfig(`version: "1.0"`);
    const defaults = getConfigDefaults(config);
    expect(defaults).toBeUndefined();
  });
});

describe('filterMutationsBySeverity', () => {
  it('should filter mutations by minimum severity', () => {
    const mutations = [
      new BadLikertJudgeMutation(), // critical
      new CrescendoMutation(), // critical
      new EncodingMutation(), // high
    ];

    const filtered = filterMutationsBySeverity(mutations, 'high');

    // Only high and critical severity mutations should remain
    const lowMediumMutations = filtered.filter(
      (m) => m.severity === 'low' || m.severity === 'medium'
    );
    expect(lowMediumMutations.length).toBe(0);
  });

  it('should include all mutations when severity is low', () => {
    const mutations = [
      new BadLikertJudgeMutation(),
      new CrescendoMutation(),
      new EncodingMutation(),
    ];

    const filtered = filterMutationsBySeverity(mutations, 'low');
    expect(filtered.length).toBe(mutations.length);
  });
});

describe('generateExampleAttackConfig', () => {
  it('should generate valid YAML config', () => {
    const yaml = generateExampleAttackConfig();
    expect(yaml).toContain('version:');
    expect(yaml).toContain('defaults:');
    expect(yaml).toContain('mutations:');
    expect(yaml).toContain('bad-likert-judge:');
    expect(yaml).toContain('owasp:');
  });

  it('should generate parseable config', () => {
    const yaml = generateExampleAttackConfig();
    const config = parseAttackConfig(yaml);
    expect(config.version).toBe('1.0');
    expect(config.defaults).toBeDefined();
    expect(config.mutations).toBeDefined();
  });
});

describe('applyOwaspFilters', () => {
  it('should return all mutations when no OWASP config', () => {
    const mutations = [
      new BadLikertJudgeMutation(), // LLM01, critical
      new ExcessiveAgencyMutation(), // LLM08, critical
    ];

    const filtered = applyOwaspFilters(mutations, undefined);
    expect(filtered.length).toBe(2);
  });

  it('should filter out mutations from disabled OWASP categories', () => {
    const mutations = [
      new BadLikertJudgeMutation(), // LLM01, critical
      new ExcessiveAgencyMutation(), // LLM08, critical
      new SystemExtractionMutation(), // LLM06, high
    ];

    const filtered = applyOwaspFilters(mutations, {
      LLM01: { enabled: false },
      LLM08: { enabled: true },
    });

    const names = filtered.map((m) => m.name);
    expect(names).not.toContain('bad-likert-judge');
    expect(names).toContain('excessive-agency');
    expect(names).toContain('system-extraction');
  });

  it('should filter mutations by OWASP category minSeverity', () => {
    const mutations = [
      new BadLikertJudgeMutation(), // LLM01, critical
      new SystemExtractionMutation(), // LLM06, high
    ];

    const filtered = applyOwaspFilters(mutations, {
      LLM06: { minSeverity: 'critical' },
    });

    const names = filtered.map((m) => m.name);
    expect(names).toContain('bad-likert-judge');
    // system-extraction is high, but LLM06 requires critical
    expect(names).not.toContain('system-extraction');
  });

  it('should include mutations without OWASP config', () => {
    const mutations = [
      new EncodingMutation(), // No owaspCategory set
    ];

    const filtered = applyOwaspFilters(mutations, {
      LLM01: { enabled: false },
    });

    // Encoding has owaspCategory LLM01 set in the mapping, should be filtered
    // But since EncodingMutation doesn't have owaspCategory on the class, it passes
    expect(filtered.length).toBe(1);
  });
});
