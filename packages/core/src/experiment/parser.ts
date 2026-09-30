import { z } from 'zod';
import type { ExperimentManifest } from './types';

const MAX_TASKS = 200;
const MAX_TARGETS = 50;
const MAX_MATRIX_COORDINATES = 10_000;
const MAX_CAPABILITIES = 32;
const MAX_SETTINGS = 32;
const MAX_EXCLUSIONS = 100;
const MAX_SEED = 4_294_967_295;

const identifier = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,63}$/);
const boundedText = z.string().trim().min(1).max(128);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

const contentIdentity = z
  .object({
    schema_version: z.literal('1'),
    algorithm: z.literal('sha256'),
    digest,
  })
  .strict();

const identity = z
  .object({
    schema_version: z.literal('1'),
    workload: contentIdentity,
    rubric: contentIdentity,
    policy: contentIdentity.optional(),
    profile: contentIdentity.optional(),
  })
  .strict();

const safeTaskSourcePath = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) =>
      !value.includes('\\') &&
      !value.includes('\0') &&
      !value.startsWith('/') &&
      !/^[A-Za-z]:/.test(value) &&
      value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'task source must be a safe relative path'
  )
  .refine((value) => /\.(?:json|ya?ml)$/.test(value), 'task source must be JSON or YAML');

const taskSource = z
  .object({
    kind: z.enum(['scenario_evaluation', 'agent_workflow']),
    path: safeTaskSourcePath,
    artifact: contentIdentity,
  })
  .strict();

const uniqueIdentifiers = (maximum: number) =>
  z
    .array(identifier)
    .max(maximum)
    .refine((values) => new Set(values).size === values.length, 'values must be unique');

const task = z
  .object({
    id: identifier,
    kind: z.enum(['scenario_evaluation', 'agent_workflow']),
    source: taskSource,
    required_capabilities: uniqueIdentifiers(MAX_CAPABILITIES),
    language: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,34}$/)
      .optional(),
    policy: identifier.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source.kind !== value.kind) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source', 'kind'],
        message: 'task source kind must match task kind',
      });
    }
  });

const setting = z.union([z.string().max(256), z.number().finite(), z.boolean()]);
const settings = z
  .record(setting)
  .refine((value) => Object.keys(value).length <= MAX_SETTINGS, 'too many target settings')
  .refine(
    (value) => Object.keys(value).every((key) => identifier.safeParse(key).success),
    'target setting names must be bounded identifiers'
  )
  .refine(
    (value) =>
      Object.keys(value).every(
        (key) => !/(?:api[-_]?key|authorization|credential|password|secret|token)$/i.test(key)
      ),
    'target settings must not contain credentials or secrets'
  );

const target = z
  .object({
    id: identifier,
    provider: boundedText,
    model: boundedText,
    capabilities: uniqueIdentifiers(MAX_CAPABILITIES),
    settings: settings.optional(),
  })
  .strict();

const retryStatus = z.enum(['incomplete', 'invalid', 'infrastructure_failed']);
const retryPolicy = z
  .object({
    max_attempts: z.number().int().min(1).max(10),
    retry_on: z
      .array(retryStatus)
      .max(3)
      .refine((values) => new Set(values).size === values.length, 'retry statuses must be unique'),
  })
  .strict();

const costLimit = z
  .object({
    amount: z.number().finite().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();

const budgets = z
  .object({
    max_requests: z.number().int().min(1).max(1_000_000),
    max_tokens: z.number().int().min(1).max(10_000_000_000).optional(),
    max_cost: costLimit.optional(),
  })
  .strict();

const seed = z
  .object({
    value: z.number().int().min(0).max(MAX_SEED),
    strategy: z.enum(['fixed', 'increment_by_repetition']),
    require_support: z.boolean(),
  })
  .strict();

const exclusion = z
  .object({
    id: identifier,
    reason: z.string().trim().min(1).max(256),
    task_id: identifier.optional(),
    target_id: identifier.optional(),
  })
  .strict()
  .refine((value) => value.task_id !== undefined || value.target_id !== undefined, {
    message: 'an exclusion must select a task or target',
  });

const stopReason = z.enum([
  'request_budget_exhausted',
  'token_budget_exhausted',
  'cost_budget_exhausted',
  'usage_unreported',
  'usage_invalid',
  'budget_exceeded',
]);
const requiredStopReasons = stopReason.options;
const liveControls = z
  .object({
    concurrency_ceiling: z.literal(1),
    stop_conditions: z
      .array(stopReason)
      .length(requiredStopReasons.length)
      .refine(
        (values) => requiredStopReasons.every((reason) => values.includes(reason)),
        'live stop conditions must declare every enforced stop reason'
      ),
  })
  .strict();

const manifest = z
  .object({
    schema_version: z.literal('1'),
    id: identifier,
    mode: z.enum(['fixture', 'live']).default('fixture'),
    identities: identity,
    tasks: z.array(task).min(1).max(MAX_TASKS),
    targets: z.array(target).min(2).max(MAX_TARGETS),
    repetitions: z.number().int().min(1).max(100),
    concurrency: z.literal(1),
    seed: seed.optional(),
    exclusions: z.array(exclusion).max(MAX_EXCLUSIONS),
    retry_policy: retryPolicy,
    budgets,
    live: liveControls.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.tasks.map((item) => item.id)).size !== value.tasks.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tasks'],
        message: 'task IDs must be unique',
      });
    }
    if (new Set(value.tasks.map((item) => item.source.path)).size !== value.tasks.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tasks'],
        message: 'task source paths must be unique',
      });
    }
    if (new Set(value.targets.map((item) => item.id)).size !== value.targets.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targets'],
        message: 'target IDs must be unique',
      });
    }
    if (value.tasks.length * value.targets.length * value.repetitions > MAX_MATRIX_COORDINATES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `experiment matrix exceeds ${MAX_MATRIX_COORDINATES} coordinates`,
      });
    }
    if (
      value.seed?.strategy === 'increment_by_repetition' &&
      value.seed.value + value.repetitions - 1 > MAX_SEED
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['seed'],
        message: 'incremented seed exceeds the v1 seed range',
      });
    }
    if (new Set(value.exclusions.map((item) => item.id)).size !== value.exclusions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exclusions'],
        message: 'exclusion IDs must be unique',
      });
    }
    const taskIds = new Set(value.tasks.map((item) => item.id));
    const targetIds = new Set(value.targets.map((item) => item.id));
    for (const [index, item] of value.exclusions.entries()) {
      if (item.task_id !== undefined && !taskIds.has(item.task_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['exclusions', index, 'task_id'],
          message: 'exclusion references an unknown task',
        });
      }
      if (item.target_id !== undefined && !targetIds.has(item.target_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['exclusions', index, 'target_id'],
          message: 'exclusion references an unknown target',
        });
      }
    }
    for (const declaredTask of value.tasks) {
      for (const declaredTarget of value.targets) {
        const matches = value.exclusions.filter(
          (item) =>
            (item.task_id === undefined || item.task_id === declaredTask.id) &&
            (item.target_id === undefined || item.target_id === declaredTarget.id)
        );
        if (matches.length > 1) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['exclusions'],
            message: 'exclusions must not overlap on a task-target pair',
          });
          break;
        }
      }
    }
    if (value.mode === 'live' && value.budgets.max_tokens === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['budgets', 'max_tokens'],
        message: 'live experiments require an explicit token limit',
      });
    }
    if (value.mode === 'live' && value.budgets.max_cost === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['budgets', 'max_cost'],
        message: 'live experiments require an explicit cost limit',
      });
    }
    if (value.mode === 'live' && value.live === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['live'],
        message: 'live experiments require explicit live execution controls',
      });
    }
    if (value.mode === 'fixture' && value.live !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['live'],
        message: 'fixture experiments must not declare live execution controls',
      });
    }
  });

/** Parse an inert object into the strict, bounded public experiment contract. */
export function parseExperimentManifest(value: unknown): ExperimentManifest {
  return manifest.parse(value) as ExperimentManifest;
}
