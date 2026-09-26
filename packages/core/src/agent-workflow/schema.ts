import Ajv from 'ajv';
import { z } from 'zod';
import { WORKFLOW_TOOL_IDS, getWorkflowTool } from './catalog';

export type WorkflowJson =
  | null
  | boolean
  | number
  | string
  | WorkflowJson[]
  | { [key: string]: WorkflowJson };
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Limit both recursive work and retained fixture size before schema parsing/cloning. */
export function isWorkflowJson(value: unknown): value is WorkflowJson {
  let nodes = 0;
  let textBytes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 10_000 || depth > 16) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') {
      textBytes += Buffer.byteLength(item);
      return textBytes <= 1_048_576;
    }
    if (typeof item !== 'object' || ancestors.has(item)) return false;
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      return false;
    if (Object.getOwnPropertySymbols(item).length) return false;
    if (
      Array.isArray(item) &&
      (item.length > 10_000 ||
        Object.keys(item).length !== item.length ||
        Object.keys(item).some((key, index) => key !== String(index)))
    )
      return false;
    ancestors.add(item);
    for (const key of Object.getOwnPropertyNames(item)) {
      if (Array.isArray(item) && key === 'length') continue;
      textBytes += Buffer.byteLength(key);
      const entry = Object.getOwnPropertyDescriptor(item, key);
      if (
        textBytes > 1_048_576 ||
        forbiddenKeys.has(key) ||
        !entry ||
        !('value' in entry) ||
        !entry.enumerable ||
        !visit(entry.value, depth + 1)
      )
        return false;
    }
    ancestors.delete(item);
    return true;
  }
  return visit(value, 0);
}

export function isWorkflowRelativePath(value: string): boolean {
  return (
    value.length <= 512 &&
    /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(value) &&
    value
      .split('/')
      .every((part) => part.length > 0 && part !== '.' && part !== '..' && !forbiddenKeys.has(part))
  );
}

const json = z.custom<WorkflowJson>(
  isWorkflowJson,
  'Expected bounded plain JSON without unsafe keys'
);
const jsonObject = json.refine(
  (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
  'Expected JSON object'
);
const relativePath = z.string().refine(isWorkflowRelativePath, 'Expected safe relative path');
const statePath = z
  .string()
  .max(512)
  .refine(
    (value) =>
      value.split('.').every((part) => /^[A-Za-z0-9_-]+$/.test(part) && !forbiddenKeys.has(part)),
    'Expected safe dotted state path'
  );
const permission = z.enum(['read', 'write']);

export const WorkflowPolicySchema = z
  .object({
    network: z.literal('denied'),
    side_effects: z.enum(['denied', 'approval_required']),
    permissions: z
      .object({
        documents: permission.optional(),
        records: permission.optional(),
        files: permission.optional(),
        workflow_state: permission.optional(),
        communication: permission.optional(),
        coordination: permission.optional(),
      })
      .strict(),
    paths: z
      .object({ read: z.array(relativePath).max(1000), write: z.array(relativePath).max(1000) })
      .strict()
      .optional(),
    budgets: z
      .object({
        max_actions: z.number().int().min(1).max(1000),
        max_model_requests: z.number().int().min(1).max(1000).optional(),
        max_tool_calls: z.number().int().min(1).max(1000).optional(),
        timeout_ms: z.number().int().min(1).max(3_600_000),
        max_tokens: z.number().int().min(1).max(1_000_000).optional(),
      })
      .strict(),
  })
  .strict();
export type WorkflowPolicy = z.infer<typeof WorkflowPolicySchema>;

/** Intentionally bounded JSON Schema subset: typed trees, never refs, regexes or applicators. */
export function isSupportedWorkflowJsonSchema(
  value: unknown
): value is Record<string, WorkflowJson> {
  if (
    !isWorkflowJson(value) ||
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Buffer.byteLength(JSON.stringify(value)) > 16_384
  )
    return false;
  let nodes = 0;
  function visit(node: WorkflowJson, depth: number): boolean {
    if (
      ++nodes > 256 ||
      depth > 8 ||
      node === null ||
      typeof node !== 'object' ||
      Array.isArray(node)
    )
      return false;
    const type = node.type;
    if (
      typeof type !== 'string' ||
      !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(type)
    )
      return false;
    const common = ['type', 'enum', 'const'];
    const specific =
      type === 'object'
        ? ['properties', 'required', 'additionalProperties', 'minProperties', 'maxProperties']
        : type === 'array'
          ? ['items', 'minItems', 'maxItems']
          : type === 'string'
            ? ['minLength', 'maxLength']
            : ['number', 'integer'].includes(type)
              ? ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']
              : [];
    if (Object.keys(node).some((key) => !common.includes(key) && !specific.includes(key)))
      return false;
    if (
      node.enum !== undefined &&
      (!Array.isArray(node.enum) || !node.enum.length || node.enum.length > 100)
    )
      return false;
    if (node.properties !== undefined) {
      if (
        !node.properties ||
        typeof node.properties !== 'object' ||
        Array.isArray(node.properties) ||
        Object.keys(node.properties).length > 100
      )
        return false;
      if (!Object.values(node.properties).every((property) => visit(property, depth + 1)))
        return false;
    }
    if (
      node.required !== undefined &&
      (!Array.isArray(node.required) ||
        node.required.length > 100 ||
        new Set(node.required).size !== node.required.length ||
        node.required.some(
          (key) =>
            typeof key !== 'string' ||
            !node.properties ||
            typeof node.properties !== 'object' ||
            !Object.hasOwn(node.properties, key)
        ))
    )
      return false;
    if (node.additionalProperties !== undefined && typeof node.additionalProperties !== 'boolean')
      return false;
    if (node.items !== undefined && !visit(node.items, depth + 1)) return false;
    for (const [minimum, maximum, limit] of [
      ['minLength', 'maxLength', 16384],
      ['minItems', 'maxItems', 1000],
      ['minProperties', 'maxProperties', 1000],
    ] as const) {
      for (const key of [minimum, maximum])
        if (
          node[key] !== undefined &&
          (typeof node[key] !== 'number' ||
            !Number.isInteger(node[key]) ||
            node[key] < 0 ||
            node[key] > limit)
        )
          return false;
      if (
        typeof node[minimum] === 'number' &&
        typeof node[maximum] === 'number' &&
        node[minimum] > node[maximum]
      )
        return false;
    }
    for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'])
      if (node[key] !== undefined && typeof node[key] !== 'number') return false;
    if (
      typeof node.minimum === 'number' &&
      typeof node.maximum === 'number' &&
      node.minimum > node.maximum
    )
      return false;
    return true;
  }
  if (!visit(value, 0)) return false;
  try {
    new Ajv({
      strict: true,
      allErrors: false,
      validateFormats: false,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    }).compile(value);
    return true;
  } catch {
    return false;
  }
}

const deterministic = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('json_schema'),
      source: z.enum(['workflow_state', 'file']),
      path: z.string().min(1).max(512),
      schema: z.custom<Record<string, WorkflowJson>>(
        isSupportedWorkflowJsonSchema,
        'Unsupported or unbounded workflow JSON Schema'
      ),
    })
    .strict(),
  z.object({ type: z.literal('workflow_state'), path: statePath, equals: json }).strict(),
  z
    .object({
      type: z.literal('tool_trace'),
      tool: z.enum(WORKFLOW_TOOL_IDS),
      minimum_calls: z.number().int().min(0).max(1000),
      maximum_calls: z.number().int().min(0).max(1000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('policy'),
      rule: z.enum([
        'no_undeclared_tool',
        'permissions_respected',
        'network_denied',
        'budgets_respected',
        'no_external_side_effects',
      ]),
      expected: z.literal('passed'),
    })
    .strict(),
  z
    .object({
      type: z.literal('file'),
      path: relativePath,
      exists: z.boolean(),
      equals: z.string().max(16_384).optional(),
    })
    .strict(),
]);

const definition = z
  .object({
    version: z.literal('1'),
    kind: z.literal('agent_workflow'),
    name: z
      .string()
      .min(1)
      .max(128)
      .refine((value) => value.trim().length > 0, 'Expected nonblank workflow name'),
    description: z.string().max(4096).optional(),
    target: z
      .object({
        provider: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9_-]+$/),
        model: z.string().min(1).max(256),
        generation: z
          .object({
            max_tokens: z.number().int().min(1).max(1_000_000).optional(),
            temperature: z.number().min(0).max(2).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    environment: z
      .object({ type: z.enum(['simulated', 'sandbox']), policy: WorkflowPolicySchema })
      .strict(),
    tools: z.array(z.enum(WORKFLOW_TOOL_IDS)).min(1).max(WORKFLOW_TOOL_IDS.length),
    workflow: z
      .object({
        system_instructions: z.string().min(1).max(32_768),
        initial_state: z.union([relativePath, jsonObject]),
        turns: z
          .array(
            z.object({ role: z.literal('user'), content: z.string().min(1).max(32_768) }).strict()
          )
          .min(1)
          .max(100),
      })
      .strict(),
    outcomes: z
      .object({
        deterministic: z.array(deterministic).min(1).max(100),
        semantic: z
          .array(
            z
              .object({
                type: z.literal('llm_judge'),
                rubric: z.string().min(1).max(16_384),
                mode: z.literal('strict_assurance'),
              })
              .strict()
          )
          .max(20)
          .optional(),
      })
      .strict(),
    evidence: z
      .object({
        trace: z.literal('summary'),
        artifacts: z.literal('checksums'),
        redact: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((workflow, ctx) => {
    if (new Set(workflow.tools).size !== workflow.tools.length)
      ctx.addIssue({ code: 'custom', path: ['tools'], message: 'Duplicate tool declaration' });
    for (const [index, id] of workflow.tools.entries()) {
      const tool = getWorkflowTool(id);
      if (!tool || tool.authority.access === 'none') continue;
      const resource = tool.authority.resource as keyof WorkflowPolicy['permissions'];
      const grant = workflow.environment.policy.permissions[resource];
      if (!grant || (tool.authority.access === 'write' && grant !== 'write'))
        ctx.addIssue({
          code: 'custom',
          path: ['tools', index],
          message: `Missing ${tool.authority.access} permission for ${resource}`,
        });
    }
    workflow.outcomes.deterministic.forEach((outcome, index) => {
      if (
        outcome.type === 'json_schema' &&
        !(outcome.source === 'file' ? relativePath : statePath).safeParse(outcome.path).success
      )
        ctx.addIssue({
          code: 'custom',
          path: ['outcomes', 'deterministic', index, 'path'],
          message: 'Invalid assertion source path',
        });
      if (
        outcome.type === 'tool_trace' &&
        (!workflow.tools.includes(outcome.tool) ||
          (outcome.maximum_calls !== undefined && outcome.maximum_calls < outcome.minimum_calls))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['outcomes', 'deterministic', index],
          message: 'Tool trace references an undeclared tool or inconsistent call bounds',
        });
      if (outcome.type === 'file' && !outcome.exists && outcome.equals !== undefined)
        ctx.addIssue({
          code: 'custom',
          path: ['outcomes', 'deterministic', index],
          message: 'An absent file cannot have expected content',
        });
    });
  });

/** V1 rejects unavailable authority/environment features rather than silently accepting them. */
export const AgentWorkflowSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (!isWorkflowJson(value))
      ctx.addIssue({
        code: 'custom',
        message: 'Workflow must be bounded plain JSON without unsafe keys',
      });
  })
  .pipe(definition);
export type AgentWorkflow = z.infer<typeof AgentWorkflowSchema>;
