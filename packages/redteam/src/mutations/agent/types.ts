/**
 * Agent-specific mutation types and schemas
 * For testing agentic AI systems (LangChain, DeepAgents, etc.)
 */

import { z } from 'zod';

// ============================================================================
// Detection Mode
// ============================================================================

/**
 * Detection mode for agent mutations
 * - trace: Analyze execution trace (tool calls, steps)
 * - response: Analyze text response patterns
 * - combined: Use both trace and response analysis
 */
export type AgentDetectionMode = 'trace' | 'response' | 'combined';

export const AgentDetectionModeSchema = z.enum(['trace', 'response', 'combined']);

// ============================================================================
// Agent Mutation Types
// ============================================================================

/**
 * Agent-specific mutation categories
 */
export type AgentMutationType =
  | 'tool-abuse'
  | 'agent-confusion'
  | 'chain-manipulation'
  | 'memory-poisoning';

export const AgentMutationTypeSchema = z.enum([
  'tool-abuse',
  'agent-confusion',
  'chain-manipulation',
  'memory-poisoning',
]);

/**
 * All agent mutation names for CLI/SDK
 */
export const AGENT_MUTATION_NAMES: AgentMutationType[] = [
  'tool-abuse',
  'agent-confusion',
  'chain-manipulation',
  'memory-poisoning',
];

// ============================================================================
// Agent Mutation Options
// ============================================================================

/**
 * Base options for all agent mutations
 */
export interface AgentMutationOptions {
  /** Detection mode: trace-based, response-based, or both */
  detectionMode?: AgentDetectionMode;

  /** Custom detection patterns (regex strings) */
  customPatterns?: string[];

  /** Minimum confidence threshold for detection (0-1) */
  confidenceThreshold?: number;
}

/**
 * Options specific to tool-abuse mutation
 */
export interface ToolAbuseOptions extends AgentMutationOptions {
  /** Specific tools to target (auto-detected if not provided) */
  targetTools?: string[];

  /** Custom malicious payloads to inject */
  payloads?: string[];

  /** Tools that should never be called (for trace detection) */
  forbiddenTools?: string[];
}

/**
 * Options specific to agent-confusion mutation
 */
export interface AgentConfusionOptions extends AgentMutationOptions {
  /** Custom role/identity claims to test */
  customRoles?: string[];

  /** Custom permission claims to test */
  customPermissions?: string[];
}

/**
 * Options specific to memory-poisoning mutation
 */
export interface MemoryPoisoningOptions extends AgentMutationOptions {
  /** Number of follow-up turns to verify poisoning (default: 3) */
  followUpTurns?: number;

  /** Custom verification prompts to use after poisoning */
  verificationPrompts?: string[];

  /** Custom poison payloads */
  poisonPayloads?: string[];
}

/**
 * Options specific to chain-manipulation mutation
 */
export interface ChainManipulationOptions extends AgentMutationOptions {
  /** Target downstream agents (if known) */
  targetAgents?: string[];

  /** Custom propagation instructions */
  propagationInstructions?: string[];
}

/**
 * Combined options for all agent mutations
 */
export interface AllAgentMutationOptions {
  /** Global detection mode */
  detectionMode?: AgentDetectionMode;

  /** Tool abuse specific options */
  toolAbuse?: ToolAbuseOptions;

  /** Agent confusion specific options */
  agentConfusion?: AgentConfusionOptions;

  /** Memory poisoning specific options */
  memoryPoisoning?: MemoryPoisoningOptions;

  /** Chain manipulation specific options */
  chainManipulation?: ChainManipulationOptions;
}

// ============================================================================
// Detection Results
// ============================================================================

/**
 * Trace-based detection findings
 */
export interface TraceFindings {
  /** Tools that were called that shouldn't have been */
  forbiddenToolsCalled?: string[];

  /** Whether agent claimed elevated permissions */
  elevatedPermissionsClaimed?: boolean;

  /** Whether memory appears corrupted */
  memoryCorrupted?: boolean;

  /** Suspicious tool parameters detected */
  suspiciousParameters?: Array<{
    tool: string;
    parameter: string;
    value: unknown;
  }>;

  /** Agent identity changes detected */
  identityChanges?: string[];
}

/**
 * Response-based detection findings
 */
export interface ResponseFindings {
  /** Patterns that matched in the response */
  matchedPatterns: string[];

  /** Confidence score (0-1) */
  confidence: number;

  /** Specific indicators found */
  indicators: string[];
}

/**
 * Complete agent detection result
 */
export interface AgentDetectionResult {
  /** Whether vulnerability was detected */
  vulnerable: boolean;

  /** Severity of the vulnerability */
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';

  /** Trace-based findings (if trace detection was used) */
  traceFindings?: TraceFindings;

  /** Response-based findings (if response detection was used) */
  responseFindings?: ResponseFindings;

  /** Human-readable reasons for the detection */
  reasons: string[];

  /** Detection mode that was used */
  detectionMode: AgentDetectionMode;

  /** Raw detection scores */
  scores?: {
    traceScore?: number;
    responseScore?: number;
    combinedScore?: number;
  };
}

// ============================================================================
// Agent Trace Types (for trace-based detection)
// ============================================================================

/**
 * Agent execution step
 */
export interface AgentStep {
  type: 'thought' | 'action' | 'observation' | 'response';
  content: string;
  tool?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  agent?: string;
  timestamp: Date;
  latencyMs: number;
  tokens?: number;
}

/**
 * Agent execution trace
 */
export interface AgentTrace {
  steps: AgentStep[];
  startTime: Date;
  endTime: Date;
  totalTokens: number;
  toolsUsed?: string[];
  agentsInvolved?: string[];
}

/**
 * Context passed to mutations for dynamic generation
 */
export interface AgentMutationContext {
  /** Available tools on the agent */
  tools?: string[];

  /** Agent's declared role/identity */
  agentRole?: string;

  /** Agent framework being tested */
  framework?: 'langchain' | 'deepagents' | 'other';

  /** Conversation history (for multi-turn attacks) */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;

  /** Custom context data */
  custom?: Record<string, unknown>;
}

// ============================================================================
// Zod Schemas for Validation
// ============================================================================

export const AgentMutationOptionsSchema = z.object({
  detectionMode: AgentDetectionModeSchema.optional(),
  customPatterns: z.array(z.string()).optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
});

export const ToolAbuseOptionsSchema = AgentMutationOptionsSchema.extend({
  targetTools: z.array(z.string()).optional(),
  payloads: z.array(z.string()).optional(),
  forbiddenTools: z.array(z.string()).optional(),
});

export const AgentConfusionOptionsSchema = AgentMutationOptionsSchema.extend({
  customRoles: z.array(z.string()).optional(),
  customPermissions: z.array(z.string()).optional(),
});

export const MemoryPoisoningOptionsSchema = AgentMutationOptionsSchema.extend({
  followUpTurns: z.number().min(1).max(10).optional(),
  verificationPrompts: z.array(z.string()).optional(),
  poisonPayloads: z.array(z.string()).optional(),
});

export const ChainManipulationOptionsSchema = AgentMutationOptionsSchema.extend({
  targetAgents: z.array(z.string()).optional(),
  propagationInstructions: z.array(z.string()).optional(),
});

export const AllAgentMutationOptionsSchema = z.object({
  detectionMode: AgentDetectionModeSchema.optional(),
  toolAbuse: ToolAbuseOptionsSchema.optional(),
  agentConfusion: AgentConfusionOptionsSchema.optional(),
  memoryPoisoning: MemoryPoisoningOptionsSchema.optional(),
  chainManipulation: ChainManipulationOptionsSchema.optional(),
});
