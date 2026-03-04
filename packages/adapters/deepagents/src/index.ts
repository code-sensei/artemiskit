/**
 * @artemiskit/adapter-deepagents
 *
 * DeepAgents.js adapter for ArtemisKit LLM evaluation toolkit.
 * Enables testing of DeepAgents multi-agent systems.
 *
 * @example
 * ```typescript
 * import { createDeepAgentsAdapter } from '@artemiskit/adapter-deepagents';
 * import { createTeam } from 'deepagents';
 *
 * const team = createTeam({ agents: [researcher, writer] });
 * const adapter = createDeepAgentsAdapter(team, { name: 'content-team' });
 *
 * // Use with ArtemisKit
 * const result = await adapter.generate({ prompt: 'Create content' });
 * ```
 */

export { DeepAgentsAdapter, createDeepAgentsAdapter } from './client';
export type {
  DeepAgentsAdapterConfig,
  DeepAgentsSystem,
  DeepAgentsInput,
  DeepAgentsOutput,
  DeepAgentsConfig,
  DeepAgentsTrace,
  DeepAgentsMessage,
  DeepAgentsStreamEvent,
  DeepAgentsCallbacks,
  DeepAgentsExecutionMetadata,
} from './types';
