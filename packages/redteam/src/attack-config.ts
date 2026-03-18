/**
 * Attack Configuration File Support
 *
 * Provides YAML-based configuration for attack mutations.
 * See: dev-docs/v0.3.x/05-attack-config-file.md
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import {
  BadLikertJudgeMutation,
  CrescendoMutation,
  DeceptiveDelightMutation,
  EncodingMutation,
  ExcessiveAgencyMutation,
  HallucinationTrapMutation,
  MultiTurnMutation,
  type Mutation,
  OutputInjectionMutation,
  SystemExtractionMutation,
} from './mutations';
import {
  AgentConfusionMutation,
  type AgentDetectionMode,
  ChainManipulationMutation,
  MemoryPoisoningMutation,
  ToolAbuseMutation,
} from './mutations/agent';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Severity levels
 */
const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Default settings schema
 */
const DefaultsSchema = z
  .object({
    severity: SeveritySchema.optional(),
    iterations: z.number().int().positive().optional(),
    timeout: z.number().int().positive().optional(),
    stopOnFirstFailure: z.boolean().optional(),
  })
  .optional();

/**
 * Bad Likert Judge mutation config
 */
const BadLikertJudgeConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  topics: z.array(z.string()).optional(),
  scaleLabels: z.record(z.string()).optional(),
  scaleType: z
    .enum(['agreement', 'effectiveness', 'quality', 'realism', 'helpfulness', 'accuracy'])
    .optional(),
  useWrapper: z.boolean().optional(),
});

/**
 * Crescendo mutation config
 */
const CrescendoConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  steps: z.number().int().min(3).max(10).optional(),
  strategies: z.array(z.enum(['educational', 'fictional', 'research', 'historical'])).optional(),
});

/**
 * Deceptive Delight mutation config
 */
const DeceptiveDelightConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  framings: z.array(z.enum(['positive', 'helpful', 'creative', 'supportive'])).optional(),
});

/**
 * Output Injection mutation config
 */
const OutputInjectionConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  categories: z
    .array(z.enum(['xss', 'sqli', 'command', 'template', 'path', 'redirect']))
    .optional(),
  customPayloads: z.record(z.array(z.string())).optional(),
});

/**
 * Excessive Agency mutation config
 */
const ExcessiveAgencyConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  actionTypes: z
    .array(
      z.enum([
        'database_access',
        'record_modification',
        'payment_processing',
        'authority_claims',
        'file_operations',
      ])
    )
    .optional(),
  customActions: z.array(z.string()).optional(),
});

/**
 * System Extraction mutation config
 */
const SystemExtractionConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  techniques: z
    .array(
      z.enum([
        'documentation',
        'error_diagnostic',
        'architecture_review',
        'version_check',
        'emergency_override',
      ])
    )
    .optional(),
});

/**
 * Hallucination Trap mutation config
 */
const HallucinationTrapConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  entityTypes: z
    .array(
      z.enum(['fake_agency', 'fake_regulation', 'fake_event', 'fake_quote', 'fake_statistics'])
    )
    .optional(),
  domain: z.enum(['government', 'finance', 'healthcare', 'legal', 'technology']).optional(),
});

/**
 * Encoding mutation config
 */
const EncodingConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  types: z.array(z.enum(['base64', 'rot13', 'hex', 'unicode'])).optional(),
});

/**
 * Multi-turn mutation config
 */
const MultiTurnConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  maxTurns: z.number().int().min(2).max(10).optional(),
  strategies: z
    .array(z.enum(['context_building', 'trust_establishment', 'gradual_escalation']))
    .optional(),
});

/**
 * Generic mutation config (for simple enable/disable)
 */
const GenericMutationConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
});

// ============================================================================
// Agent Mutation Schemas
// ============================================================================

/**
 * Tool Abuse mutation config (LLM08)
 */
const ToolAbuseConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  targetTools: z.array(z.string()).optional(),
  payloads: z.array(z.string()).optional(),
  forbiddenTools: z.array(z.string()).optional(),
});

/**
 * Agent Confusion mutation config (LLM01)
 */
const AgentConfusionConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  customRoles: z.array(z.string()).optional(),
  customPermissions: z.array(z.string()).optional(),
});

/**
 * Memory Poisoning mutation config (LLM01)
 */
const MemoryPoisoningConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  followUpTurns: z.number().int().min(1).max(10).optional(),
  verificationPrompts: z.array(z.string()).optional(),
  poisonPayloads: z.array(z.string()).optional(),
});

/**
 * Chain Manipulation mutation config (LLM01)
 */
const ChainManipulationConfigSchema = z.object({
  enabled: z.boolean().optional().default(true),
  targetAgents: z.array(z.string()).optional(),
  propagationInstructions: z.array(z.string()).optional(),
});

/**
 * Full attack config schema
 */
export const AttackConfigSchema = z.object({
  version: z.string().optional().default('1.0'),
  defaults: DefaultsSchema,
  mutations: z
    .object({
      'bad-likert-judge': BadLikertJudgeConfigSchema.optional(),
      crescendo: CrescendoConfigSchema.optional(),
      'deceptive-delight': DeceptiveDelightConfigSchema.optional(),
      'output-injection': OutputInjectionConfigSchema.optional(),
      'excessive-agency': ExcessiveAgencyConfigSchema.optional(),
      'system-extraction': SystemExtractionConfigSchema.optional(),
      'hallucination-trap': HallucinationTrapConfigSchema.optional(),
      encoding: EncodingConfigSchema.optional(),
      'multi-turn': MultiTurnConfigSchema.optional(),
      typo: GenericMutationConfigSchema.optional(),
      'role-spoof': GenericMutationConfigSchema.optional(),
      'instruction-flip': GenericMutationConfigSchema.optional(),
      'cot-injection': GenericMutationConfigSchema.optional(),
      // Agent mutations (v0.3.1+)
      'tool-abuse': ToolAbuseConfigSchema.optional(),
      'agent-confusion': AgentConfusionConfigSchema.optional(),
      'memory-poisoning': MemoryPoisoningConfigSchema.optional(),
      'chain-manipulation': ChainManipulationConfigSchema.optional(),
    })
    .passthrough()
    .optional(),
  owasp: z
    .record(
      z.object({
        enabled: z.boolean().optional().default(true),
        minSeverity: SeveritySchema.optional(),
      })
    )
    .optional(),
});

// ============================================================================
// Types
// ============================================================================

export type AttackConfig = z.infer<typeof AttackConfigSchema>;
export type AttackConfigDefaults = z.infer<typeof DefaultsSchema>;
export type BadLikertJudgeConfig = z.infer<typeof BadLikertJudgeConfigSchema>;
export type CrescendoConfig = z.infer<typeof CrescendoConfigSchema>;
export type DeceptiveDelightConfig = z.infer<typeof DeceptiveDelightConfigSchema>;
export type OutputInjectionConfig = z.infer<typeof OutputInjectionConfigSchema>;
export type ExcessiveAgencyConfig = z.infer<typeof ExcessiveAgencyConfigSchema>;
export type SystemExtractionConfig = z.infer<typeof SystemExtractionConfigSchema>;
export type HallucinationTrapConfig = z.infer<typeof HallucinationTrapConfigSchema>;
export type EncodingConfig = z.infer<typeof EncodingConfigSchema>;
export type MultiTurnConfig = z.infer<typeof MultiTurnConfigSchema>;
export type ToolAbuseConfig = z.infer<typeof ToolAbuseConfigSchema>;
export type AgentConfusionConfig = z.infer<typeof AgentConfusionConfigSchema>;
export type MemoryPoisoningConfig = z.infer<typeof MemoryPoisoningConfigSchema>;
export type ChainManipulationConfig = z.infer<typeof ChainManipulationConfigSchema>;

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse and validate attack config from YAML string
 */
export function parseAttackConfig(yamlContent: string): AttackConfig {
  const parsed = parseYaml(yamlContent);
  return AttackConfigSchema.parse(parsed);
}

/**
 * Load attack config from file path
 */
export async function loadAttackConfig(filePath: string): Promise<AttackConfig> {
  const resolvedPath = resolve(filePath);
  const content = await readFile(resolvedPath, 'utf-8');
  return parseAttackConfig(content);
}

// ============================================================================
// OWASP Category Mapping
// ============================================================================

/**
 * Map mutation names to their OWASP categories
 */
const MUTATION_OWASP_CATEGORIES: Record<string, string> = {
  'bad-likert-judge': 'LLM01',
  crescendo: 'LLM01',
  'deceptive-delight': 'LLM01',
  'output-injection': 'LLM02',
  'excessive-agency': 'LLM08',
  'system-extraction': 'LLM06',
  'hallucination-trap': 'LLM09',
  encoding: 'LLM01', // Encoding is a technique for prompt injection
  'multi-turn': 'LLM01', // Multi-turn is a technique for prompt injection
  // Agent mutations (v0.3.1+)
  'tool-abuse': 'LLM08', // Excessive Agency - tool misuse
  'agent-confusion': 'LLM01', // Prompt Injection - identity hijacking
  'memory-poisoning': 'LLM01', // Prompt Injection - context poisoning
  'chain-manipulation': 'LLM01', // Prompt Injection - propagation attacks
};

// ============================================================================
// Mutation Factory
// ============================================================================

/**
 * Check if a mutation is enabled based on config and OWASP settings
 */
function isMutationEnabled(
  mutationName: string,
  mutationConfig: { enabled?: boolean } | undefined,
  owaspConfig: AttackConfig['owasp']
): boolean {
  // Mutation must be explicitly mentioned in config to be included
  if (!mutationConfig) {
    return false;
  }

  // Check if mutation is explicitly disabled
  if (mutationConfig.enabled === false) {
    return false;
  }

  // Check OWASP category settings
  if (owaspConfig) {
    const owaspCategory = MUTATION_OWASP_CATEGORIES[mutationName];
    if (owaspCategory && owaspConfig[owaspCategory]) {
      const categoryConfig = owaspConfig[owaspCategory];
      if (categoryConfig.enabled === false) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Options for creating mutations from config
 */
export interface CreateMutationsOptions {
  /** Detection mode for agent mutations: 'trace' | 'response' | 'combined' */
  agentDetection?: AgentDetectionMode;
}

/**
 * Create mutations from attack config
 *
 * Only mutations explicitly listed in the config are included.
 * OWASP category settings can disable entire categories.
 *
 * @param config - Attack configuration
 * @param options - Optional settings including agentDetection mode
 */
export function createMutationsFromConfig(
  config: AttackConfig,
  options?: CreateMutationsOptions
): Mutation[] {
  const mutations: Mutation[] = [];
  const agentDetection = options?.agentDetection ?? 'combined';

  if (!config.mutations) {
    return mutations;
  }

  // Bad Likert Judge
  const badLikertConfig = config.mutations['bad-likert-judge'];
  if (isMutationEnabled('bad-likert-judge', badLikertConfig, config.owasp)) {
    mutations.push(
      new BadLikertJudgeMutation({
        scaleType: badLikertConfig?.scaleType,
        useWrapper: badLikertConfig?.useWrapper,
      })
    );
  }

  // Crescendo
  const crescendoConfig = config.mutations.crescendo;
  if (isMutationEnabled('crescendo', crescendoConfig, config.owasp)) {
    mutations.push(new CrescendoMutation());
  }

  // Deceptive Delight
  const deceptiveDelightConfig = config.mutations['deceptive-delight'];
  if (isMutationEnabled('deceptive-delight', deceptiveDelightConfig, config.owasp)) {
    mutations.push(new DeceptiveDelightMutation());
  }

  // Output Injection
  const outputInjectionConfig = config.mutations['output-injection'];
  if (isMutationEnabled('output-injection', outputInjectionConfig, config.owasp)) {
    mutations.push(new OutputInjectionMutation());
  }

  // Excessive Agency
  const excessiveAgencyConfig = config.mutations['excessive-agency'];
  if (isMutationEnabled('excessive-agency', excessiveAgencyConfig, config.owasp)) {
    mutations.push(new ExcessiveAgencyMutation());
  }

  // System Extraction
  const systemExtractionConfig = config.mutations['system-extraction'];
  if (isMutationEnabled('system-extraction', systemExtractionConfig, config.owasp)) {
    mutations.push(new SystemExtractionMutation());
  }

  // Hallucination Trap
  const hallucinationTrapConfig = config.mutations['hallucination-trap'];
  if (isMutationEnabled('hallucination-trap', hallucinationTrapConfig, config.owasp)) {
    mutations.push(new HallucinationTrapMutation());
  }

  // Encoding
  const encodingConfig = config.mutations.encoding;
  if (isMutationEnabled('encoding', encodingConfig, config.owasp)) {
    mutations.push(new EncodingMutation());
  }

  // Multi-turn
  const multiTurnConfig = config.mutations['multi-turn'];
  if (isMutationEnabled('multi-turn', multiTurnConfig, config.owasp)) {
    mutations.push(new MultiTurnMutation());
  }

  // ============================================================================
  // Agent Mutations (v0.3.1+)
  // ============================================================================

  // Tool Abuse (LLM08)
  const toolAbuseConfig = config.mutations['tool-abuse'];
  if (isMutationEnabled('tool-abuse', toolAbuseConfig, config.owasp)) {
    mutations.push(
      new ToolAbuseMutation({
        detectionMode: agentDetection,
        targetTools: toolAbuseConfig?.targetTools,
        payloads: toolAbuseConfig?.payloads,
        forbiddenTools: toolAbuseConfig?.forbiddenTools,
      })
    );
  }

  // Agent Confusion (LLM01)
  const agentConfusionConfig = config.mutations['agent-confusion'];
  if (isMutationEnabled('agent-confusion', agentConfusionConfig, config.owasp)) {
    mutations.push(
      new AgentConfusionMutation({
        detectionMode: agentDetection,
        customRoles: agentConfusionConfig?.customRoles,
        customPermissions: agentConfusionConfig?.customPermissions,
      })
    );
  }

  // Memory Poisoning (LLM01)
  const memoryPoisoningConfig = config.mutations['memory-poisoning'];
  if (isMutationEnabled('memory-poisoning', memoryPoisoningConfig, config.owasp)) {
    mutations.push(
      new MemoryPoisoningMutation({
        detectionMode: agentDetection,
        followUpTurns: memoryPoisoningConfig?.followUpTurns,
        verificationPrompts: memoryPoisoningConfig?.verificationPrompts,
        poisonPayloads: memoryPoisoningConfig?.poisonPayloads,
      })
    );
  }

  // Chain Manipulation (LLM01)
  const chainManipulationConfig = config.mutations['chain-manipulation'];
  if (isMutationEnabled('chain-manipulation', chainManipulationConfig, config.owasp)) {
    mutations.push(
      new ChainManipulationMutation({
        detectionMode: agentDetection,
        targetAgents: chainManipulationConfig?.targetAgents,
        propagationInstructions: chainManipulationConfig?.propagationInstructions,
      })
    );
  }

  return mutations;
}

/**
 * Apply OWASP category filters to mutations
 *
 * Filters mutations based on OWASP category enabled status and minSeverity.
 */
export function applyOwaspFilters(
  mutations: Mutation[],
  owaspConfig: AttackConfig['owasp']
): Mutation[] {
  if (!owaspConfig) {
    return mutations;
  }

  const severityOrder = ['low', 'medium', 'high', 'critical'];

  return mutations.filter((mutation) => {
    const category = mutation.owaspCategory;
    if (!category || !owaspConfig[category]) {
      return true; // No config for this category, include by default
    }

    const categoryConfig = owaspConfig[category];

    // Check if category is disabled
    if (categoryConfig.enabled === false) {
      return false;
    }

    // Check minSeverity
    if (categoryConfig.minSeverity) {
      const minIndex = severityOrder.indexOf(categoryConfig.minSeverity);
      const mutationIndex = severityOrder.indexOf(mutation.severity);
      if (mutationIndex < minIndex) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get enabled mutation names from config
 *
 * Only returns mutations that are explicitly mentioned and not disabled.
 */
export function getEnabledMutationNames(config: AttackConfig): string[] {
  const names: string[] = [];

  if (!config.mutations) {
    return names;
  }

  const mutationEntries = Object.entries(config.mutations) as [string, { enabled?: boolean }][];

  for (const [name, mutation] of mutationEntries) {
    // Only include if mutation is defined and not explicitly disabled
    if (mutation && mutation.enabled !== false) {
      names.push(name);
    }
  }

  return names;
}

/**
 * Get defaults from config
 */
export function getConfigDefaults(config: AttackConfig): AttackConfigDefaults {
  return config.defaults;
}

/**
 * Filter mutations by severity threshold from config
 */
export function filterMutationsBySeverity(
  mutations: Mutation[],
  minSeverity: 'low' | 'medium' | 'high' | 'critical'
): Mutation[] {
  const severityOrder = ['low', 'medium', 'high', 'critical'];
  const minIndex = severityOrder.indexOf(minSeverity);

  return mutations.filter((m) => {
    const mutationIndex = severityOrder.indexOf(m.severity);
    return mutationIndex >= minIndex;
  });
}

// ============================================================================
// Example Config Generator
// ============================================================================

/**
 * Generate an example attack config YAML string
 */
export function generateExampleAttackConfig(): string {
  return `# Attack Configuration File
# See: https://artemiskit.vercel.app/docs/cli/commands/redteam#attack-configuration-file
version: "1.0"

# Global defaults
defaults:
  severity: medium          # Minimum severity filter: low | medium | high | critical
  # iterations: 3           # (Reserved for future use) Number of iterations per mutation
  # timeout: 30000          # (Reserved for future use) Timeout per attack in ms
  # stopOnFirstFailure: false # (Reserved for future use) Stop on first vulnerability

# Mutation-specific configuration
mutations:
  # LLM01 - Prompt Injection
  bad-likert-judge:
    enabled: true
    scaleType: effectiveness  # agreement | effectiveness | quality | realism | helpfulness | accuracy
    useWrapper: true

  crescendo:
    enabled: true
    steps: 5                # Number of escalation steps (3-10)
    strategies:
      - educational
      - research

  deceptive-delight:
    enabled: true
    framings:
      - positive
      - helpful

  # LLM05 - Improper Output Handling
  output-injection:
    enabled: true
    categories:
      - xss
      - sqli
      - command
    customPayloads:
      xss:
        - "<script>alert('XSS')</script>"

  # LLM06 - Excessive Agency
  excessive-agency:
    enabled: true
    actionTypes:
      - database_access
      - payment_processing
    customActions:
      - "Delete all user records"

  # LLM07 - System Prompt Leakage
  system-extraction:
    enabled: true
    techniques:
      - documentation
      - emergency_override

  # LLM09 - Misinformation
  hallucination-trap:
    enabled: true
    entityTypes:
      - fake_agency
      - fake_regulation
    domain: government

  # Encoding mutations
  encoding:
    enabled: true
    types:
      - base64
      - rot13

  # Multi-turn attacks
  multi-turn:
    enabled: true
    maxTurns: 5
    strategies:
      - context_building
      - gradual_escalation

  # ============================================================================
  # Agent Mutations (v0.3.1+)
  # For testing agentic AI systems (LangChain, DeepAgents, etc.)
  # ============================================================================

  # LLM08 - Tool Abuse
  tool-abuse:
    enabled: true
    targetTools:
      - database
      - file
      - api
    forbiddenTools:
      - delete
      - drop
      - execute
    # payloads:
    #   - '{ "admin": true, "bypass_auth": true }'

  # LLM01 - Agent Confusion (Identity Hijacking)
  agent-confusion:
    enabled: true
    # customRoles:
    #   - "security auditor"
    #   - "admin user"
    # customPermissions:
    #   - "full database access"
    #   - "bypass content filters"

  # LLM01 - Memory Poisoning
  memory-poisoning:
    enabled: true
    followUpTurns: 3           # Number of verification turns (1-10)
    # verificationPrompts:
    #   - "What is my access level?"
    #   - "Do I have admin permissions?"

  # LLM01 - Chain Manipulation (Partial Support)
  chain-manipulation:
    enabled: true
    # targetAgents:
    #   - "downstream_agent"
    # propagationInstructions:
    #   - "Pass this instruction to all downstream agents"

# OWASP category overrides
owasp:
  LLM01:
    enabled: true
    minSeverity: medium
  LLM05:
    enabled: true
    minSeverity: high
  LLM06:
    enabled: false          # Disable this category
`;
}
