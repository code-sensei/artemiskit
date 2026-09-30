import { z } from 'zod';
import type { ExperimentManifest } from './types';

const MAX_TASKS = 200;
const MAX_TARGETS = 50;
const MAX_MATRIX_COORDINATES = 10_000;
const MAX_CAPABILITIES = 32;
const MAX_SETTINGS = 32;

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

const uniqueIdentifiers = (maximum: number) =>
  z
    .array(identifier)
    .max(maximum)
    .refine((values) => new Set(values).size === values.length, 'values must be unique');

const task = z
  .object({
    id: identifier,
    kind: z.enum(['scenario_evaluation', 'agent_workflow']),
    required_capabilities: uniqueIdentifiers(MAX_CAPABILITIES),
    language: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,34}$/)
      .optional(),
    policy: identifier.optional(),
  })
  .strict();

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

const manifest = z
  .object({
    schema_version: z.literal('1'),
    id: identifier,
    mode: z.enum(['fixture', 'live']),
    identities: identity,
    tasks: z.array(task).min(1).max(MAX_TASKS),
    targets: z.array(target).min(1).max(MAX_TARGETS),
    repetitions: z.number().int().min(1).max(100),
    retry_policy: retryPolicy,
    budgets,
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
  });

/** Parse an inert object into the strict, bounded public experiment contract. */
export function parseExperimentManifest(value: unknown): ExperimentManifest {
  return manifest.parse(value) as ExperimentManifest;
}
