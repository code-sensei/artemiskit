import { z } from 'zod';

/** Values accepted for `reasoningEffort`; `none` turns thinking off on servers that support it. */
export const WORKFLOW_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'] as const;

/**
 * Request settings a host binds to one workflow run, outside the workflow file: for example an
 * experiment target's recommended sampling and a repetition's seed. Omitted values are not sent,
 * so the serving runtime's defaults apply.
 */
export const AgentWorkflowGenerationSchema = z
  .object({
    /** Sent with every target model request as `topP`. */
    topP: z.number().finite().min(0).max(1).optional(),
    /** Sent with every target model request as `presencePenalty`. */
    presencePenalty: z.number().finite().min(-2).max(2).optional(),
    /** Sent with every target model request as `seed`. */
    seed: z.number().int().safe().optional(),
    /**
     * Recorded only. `GenerateOptions` has no reasoning field: the host configures it on the
     * target's client (for example the OpenAI adapter's `reasoningEffort`), which then sends it
     * with every request.
     */
    reasoningEffort: z.enum(WORKFLOW_REASONING_EFFORTS).optional(),
  })
  .strict();

export type AgentWorkflowGeneration = z.infer<typeof AgentWorkflowGenerationSchema>;

/** The subset of `AgentWorkflowGeneration` the engine itself sends with each model request. */
export function workflowRequestGeneration(
  generation: AgentWorkflowGeneration
): Pick<AgentWorkflowGeneration, 'topP' | 'presencePenalty' | 'seed'> {
  return {
    ...(generation.topP !== undefined ? { topP: generation.topP } : {}),
    ...(generation.presencePenalty !== undefined
      ? { presencePenalty: generation.presencePenalty }
      : {}),
    ...(generation.seed !== undefined ? { seed: generation.seed } : {}),
  };
}
