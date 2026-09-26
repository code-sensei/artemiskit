import { createHash } from 'node:crypto';
import { z } from 'zod';
import { WORKFLOW_TOOL_IDS, listWorkflowTools } from './catalog';
import { type AgentWorkflow, isWorkflowJson } from './schema';

const count = z.number().int().nonnegative().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const operation = z.string().regex(/^tool-[1-9][0-9]{0,3}$/);
export const WORKFLOW_CHECKPOINT_HARNESS = 'artemiskit-native-0.6.3';
export const workflowDigest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Working-data storage is opt-in. The host identity must describe the selected transport. */
export interface WorkflowCheckpointOptions {
  directory: string;
  mode: 'create' | 'resume';
  configurationId: string;
}
export const WorkflowCheckpointOptionsSchema = z
  .object({
    directory: z.string().min(1).max(4096),
    mode: z.enum(['create', 'resume']),
    configurationId: z
      .string()
      .min(1)
      .max(4096)
      .refine((value) => value.trim().length > 0),
  })
  .strict();

export const WorkflowRecoverySchema = z
  .object({
    schemaVersion: z.literal('1'),
    runId: z.string().uuid(),
    attemptId: z.string().uuid(),
    attempts: z.number().int().min(1).max(1000),
    checkpoint: z.enum(['disabled', 'active', 'paused', 'terminal', 'refused']),
    reason: z.enum([
      'fresh',
      'resumed',
      'paused',
      'finished',
      'checkpoint_unavailable',
      'checkpoint_incompatible',
      'checkpoint_pending',
      'checkpoint_terminal',
      'checkpoint_expired',
      'checkpoint_clock_rollback',
      'checkpoint_invalid',
      'checkpoint_cleanup_unresolved',
      'retry_exhausted',
    ]),
    configurationSha256: digest.optional(),
    initialStateSha256: digest.optional(),
    pendingOperations: count,
    faults: z
      .object({
        declared: z.number().int().min(0).max(32),
        injected: z.number().int().min(0).max(32),
        entries: z
          .array(
            z
              .object({
                index: z.number().int().min(0).max(31),
                kind: z.enum([
                  'unavailable_tool',
                  'stale_data',
                  'incomplete_data',
                  'malformed_result',
                  'timeout',
                  'conflicting_instructions',
                ]),
                tool: z.enum(WORKFLOW_TOOL_IDS),
                operationId: operation,
                id_sha256: digest,
                fixture_sha256: digest.optional(),
                fixture_bytes: z.number().int().min(0).max(16384).optional(),
                instruction_sha256: digest.optional(),
                instruction_bytes: z.number().int().min(0).max(4096).optional(),
              })
              .strict()
          )
          .max(32),
      })
      .strict(),
    retries: z
      .object({
        maxAttempts: z.number().int().min(1).max(5),
        attempted: count,
        recovered: count,
        exhausted: count,
        entries: z
          .array(
            z
              .object({
                operationId: operation,
                previousOperationId: operation,
                attempt: z.number().int().min(2).max(5),
              })
              .strict()
          )
          .max(128),
        omitted: count,
      })
      .strict(),
    stateChanges: z
      .object({
        total: count,
        entries: z
          .array(
            z
              .object({
                operationId: operation,
                beforeSha256: digest,
                afterSha256: digest,
              })
              .strict()
          )
          .max(64),
        omitted: count,
      })
      .strict(),
  })
  .strict();
export type WorkflowRecoveryEvidence = z.infer<typeof WorkflowRecoverySchema>;

/** Bound public summaries; raw working content, paths and caller configuration IDs stay private. */
export function validWorkflowRecovery(value: unknown): value is WorkflowRecoveryEvidence {
  if (!isWorkflowJson(value)) return false;
  const parsed = WorkflowRecoverySchema.safeParse(value);
  if (!parsed.success) return false;
  const r = parsed.data;
  return (
    r.faults.injected === r.faults.entries.length &&
    r.faults.injected <= r.faults.declared &&
    new Set(r.faults.entries.map((entry) => entry.index)).size === r.faults.injected &&
    r.faults.entries.every((entry) => entry.index < r.faults.declared) &&
    r.retries.attempted === r.retries.entries.length + r.retries.omitted &&
    r.retries.recovered <= r.retries.attempted &&
    r.retries.entries.every((entry) => entry.attempt <= r.retries.maxAttempts) &&
    r.stateChanges.total === r.stateChanges.entries.length + r.stateChanges.omitted
  );
}

export function workflowCheckpointIdentity(
  workflow: AgentWorkflow,
  configurationId: string,
  preflight: boolean
) {
  return {
    harness: WORKFLOW_CHECKPOINT_HARNESS,
    workflowSha256: workflowDigest(workflow),
    toolsSha256: workflowDigest(listWorkflowTools()),
    configurationSha256: workflowDigest(configurationId),
    preflight,
  };
}
