/**
 * Agent-Specific Mutations
 *
 * Mutations designed specifically for testing agentic AI systems:
 * - LangChain agents
 * - DeepAgents.js
 * - Other agent frameworks
 *
 * These mutations target vulnerabilities unique to agents:
 * - Tool abuse (LLM08)
 * - Agent confusion / identity hijacking (LLM01)
 * - Memory poisoning (LLM01)
 * - Chain manipulation (LLM01) - partial support
 */

// ============================================================================
// Types
// ============================================================================

export type {
  AgentConfusionOptions,
  AgentDetectionMode,
  AgentDetectionResult,
  AgentMutationContext,
  AgentMutationOptions,
  AgentMutationType,
  AgentStep,
  AgentTrace,
  AllAgentMutationOptions,
  ChainManipulationOptions,
  MemoryPoisoningOptions,
  ResponseFindings,
  ToolAbuseOptions,
  TraceFindings,
} from './types';

export {
  AGENT_MUTATION_NAMES,
  AgentDetectionModeSchema,
  AgentMutationOptionsSchema,
  AgentMutationTypeSchema,
  AllAgentMutationOptionsSchema,
} from './types';

// ============================================================================
// Mutations
// ============================================================================

export {
  AgentConfusionMutation,
  CONFUSION_RESISTANCE_PATTERNS,
  CONFUSION_SUCCESS_PATTERNS,
  detectConfusionSuccess,
} from './agent-confusion';

export {
  ToolAbuseMutation,
  TOOL_ABUSE_RESISTANCE_PATTERNS,
  TOOL_ABUSE_SUCCESS_PATTERNS,
  detectToolAbuseFromResponse,
  detectToolAbuseFromTrace,
} from './tool-abuse';

export {
  MemoryPoisoningMutation,
  POISONING_RESISTANCE_PATTERNS,
  POISONING_SUCCESS_PATTERNS,
  buildPoisoningConversation,
  detectMemoryPoisoning,
  type MemoryPoisonSequence,
} from './memory-poisoning';

export {
  ChainManipulationMutation,
  PROPAGATION_RESISTANCE_PATTERNS,
  PROPAGATION_WILLINGNESS_PATTERNS,
  detectChainManipulation,
  type AgentChainDefinition,
  type ChainTraceInspection,
} from './chain-manipulation';

// ============================================================================
// Detector
// ============================================================================

export {
  AgentMutationDetector,
  getHighestSeverity,
  hasAgentVulnerability,
  quickDetect,
  type AgentDetectorConfig,
} from './detector';

// ============================================================================
// Category Mapping
// ============================================================================

/**
 * OWASP category mapping for agent mutations
 */
export const AGENT_OWASP_CATEGORIES = {
  'tool-abuse': {
    category: 'LLM08',
    name: 'Excessive Agency',
    description: 'Testing if agents can be manipulated to misuse their tools',
  },
  'agent-confusion': {
    category: 'LLM01',
    name: 'Prompt Injection',
    description: 'Testing if agents can be confused about their identity/permissions',
  },
  'memory-poisoning': {
    category: 'LLM01',
    name: 'Prompt Injection',
    description: 'Testing if agent memory can be corrupted for privilege escalation',
  },
  'chain-manipulation': {
    category: 'LLM01',
    name: 'Prompt Injection',
    description: 'Testing if malicious instructions can propagate through agent chains',
  },
} as const;

/**
 * Get all agent mutation names
 */
export function getAgentMutationNames(): string[] {
  return ['tool-abuse', 'agent-confusion', 'memory-poisoning', 'chain-manipulation'];
}

/**
 * Check if a mutation name is an agent mutation
 */
export function isAgentMutation(name: string): boolean {
  return getAgentMutationNames().includes(name);
}

/**
 * Get agent mutations by OWASP category
 */
export function getAgentMutationsForCategory(category: string): string[] {
  return Object.entries(AGENT_OWASP_CATEGORIES)
    .filter(([, info]) => info.category === category)
    .map(([name]) => name);
}
