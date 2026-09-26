import { createHash } from 'node:crypto';
import { types } from 'node:util';
import Ajv from 'ajv';
import { z } from 'zod';
import { WORKFLOW_TOOL_IDS, type WorkflowToolId, getWorkflowTool } from './catalog';
import { type WorkflowJson, isWorkflowJson } from './schema';

/** Inspect descriptors before Zod can probe thenables or evaluate Proxy traps. */
function safeFaultJson(value: unknown): value is WorkflowJson {
  let nodes = 0;
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 10_000 || depth > 16) return false;
    if (item === null || typeof item !== 'object') return typeof item !== 'function';
    if (types.isProxy(item) || ancestors.has(item)) return false;
    const prototype = Object.getPrototypeOf(item);
    if (
      Array.isArray(item)
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      return false;
    ancestors.add(item);
    for (const key of Object.getOwnPropertyNames(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !('value' in descriptor) || !visit(descriptor.value, depth + 1))
        return false;
    }
    ancestors.delete(item);
    return true;
  }
  try {
    return visit(value, 0) && isWorkflowJson(value);
  } catch {
    return false;
  }
}

/** Zod probes root inputs before refinements; guard its entry and composed parse paths. */
function guardFaultSchema<T extends z.ZodTypeAny>(schema: T, optionalInput = false): T {
  const valid = (data: unknown) => (optionalInput && data === undefined) || safeFaultJson(data);
  const issue = () => ({
    code: 'custom' as const,
    message: 'Expected bounded plain JSON',
    path: [],
  });
  const failure = () => ({ success: false as const, error: new z.ZodError([issue()]) });
  const parse = schema._parse.bind(schema);
  schema._parse = (input) => {
    if (valid(input.data)) return parse(input);
    input.parent.common.issues.push({ ...issue(), path: input.path });
    return z.INVALID;
  };
  const safeParse = schema.safeParse.bind(schema);
  schema.safeParse = (data, params) => {
    if (!valid(data)) return failure();
    try {
      return safeParse(data, params);
    } catch {
      return failure();
    }
  };
  const safeParseAsync = schema.safeParseAsync.bind(schema);
  schema.safeParseAsync = async (data, params) => {
    if (!valid(data)) return failure();
    try {
      return await safeParseAsync(data, params);
    } catch {
      return failure();
    }
  };
  schema.spa = schema.safeParseAsync;
  const optional = schema.optional.bind(schema);
  schema.optional = () => guardFaultSchema(optional(), true);
  const pipe = schema.pipe.bind(schema);
  schema.pipe = (next) => guardFaultSchema(pipe(next), optionalInput);
  return schema;
}

const MAX_FIXTURE_BYTES = 16_384;
const MAX_INSTRUCTION_BYTES = 4096;
const plainJson = z.unknown().superRefine((value, ctx) => {
  if (!safeFaultJson(value))
    ctx.addIssue({ code: 'custom', message: 'Expected bounded plain JSON' });
});
const boundedOutput = z.custom<WorkflowJson>(
  (value) => safeFaultJson(value) && Buffer.byteLength(JSON.stringify(value)) <= MAX_FIXTURE_BYTES,
  'Expected bounded fault fixture'
);
const instruction = z
  .string()
  .refine(
    (value) => value.trim().length > 0 && Buffer.byteLength(value) <= MAX_INSTRUCTION_BYTES,
    'Expected bounded fault instruction'
  );
const common = {
  id: z.string().regex(/^(?!(?:__proto__|prototype|constructor)$)[A-Za-z0-9_-]{1,128}$/),
  tool: z.enum(WORKFLOW_TOOL_IDS),
  occurrence: z.number().int().min(1).max(1000),
};
const faultDefinition = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('unavailable_tool') }).strict(),
  z
    .object({
      ...common,
      kind: z.literal('timeout'),
      timeout_ms: z.number().int().min(1).max(60_000).optional(),
    })
    .strict(),
  z.object({ ...common, kind: z.literal('stale_data'), output: boundedOutput }).strict(),
  z.object({ ...common, kind: z.literal('incomplete_data'), output: boundedOutput }).strict(),
  z.object({ ...common, kind: z.literal('malformed_result'), output: boundedOutput }).strict(),
  z.object({ ...common, kind: z.literal('conflicting_instructions'), instruction }).strict(),
]);

const ajv = new Ajv({
  strict: true,
  allErrors: false,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
const outputValidators = new Map(
  WORKFLOW_TOOL_IDS.map((id) => {
    const descriptor = getWorkflowTool(id);
    if (!descriptor) throw new Error('workflow_tool_catalog_unavailable');
    return [id, ajv.compile(descriptor.outputSchema)] as const;
  })
);

/** Fixtures alter observations only; they cannot invent successful write effects. */
export const WorkflowFaultsSchema = guardFaultSchema(
  plainJson.pipe(
    z
      .array(faultDefinition)
      .max(32)
      .superRefine((faults, ctx) => {
        const ids = new Set<string>();
        const schedules = new Map<string, number>();
        for (const [index, fault] of faults.entries()) {
          const fail = (message: string) =>
            ctx.addIssue({ code: 'custom', path: [index], message });
          if (ids.has(fault.id)) fail('Duplicate fault identifier');
          ids.add(fault.id);
          const schedule = `${fault.tool}:${fault.occurrence}`;
          const count = (schedules.get(schedule) ?? 0) + 1;
          schedules.set(schedule, count);
          if (count > 5) fail('Fault schedule exceeds maximum retry attempts');
          if (fault.kind === 'unavailable_tool' || fault.kind === 'timeout') continue;
          if (getWorkflowTool(fault.tool)?.authority.access === 'write') {
            fail('Fault output cannot replace a write effect');
            continue;
          }
          if (fault.kind === 'conflicting_instructions') {
            if (fault.tool !== 'read_document' && fault.tool !== 'read_file')
              fail('Conflicting instructions require a document or file read');
          } else {
            const valid = outputValidators.get(fault.tool)?.(fault.output) === true;
            if (fault.kind === 'malformed_result' ? valid : !valid)
              fail('Fault fixture does not match its declared validity');
          }
        }
      })
  )
);
export type WorkflowFaults = z.infer<typeof WorkflowFaultsSchema>;
export type WorkflowFault = WorkflowFaults[number];
export type WorkflowFaultKind = WorkflowFault['kind'];

/** Attempts include the initial invocation. Every retry remains subject to host budgets. */
export const WorkflowRetrySchema = guardFaultSchema(
  plainJson.pipe(z.object({ max_attempts: z.number().int().min(1).max(5) }).strict())
);
export type WorkflowRetry = z.infer<typeof WorkflowRetrySchema>;

export interface WorkflowFaultSummary {
  readonly index: number;
  readonly kind: WorkflowFaultKind;
  readonly tool: WorkflowToolId;
  readonly id_sha256: string;
  readonly fixture_sha256?: string;
  readonly fixture_bytes?: number;
  readonly instruction_sha256?: string;
  readonly instruction_bytes?: number;
}

function canonical(value: WorkflowJson): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function summary(fault: WorkflowFault, index: number): WorkflowFaultSummary {
  return Object.freeze({
    index,
    kind: fault.kind,
    tool: fault.tool,
    id_sha256: digest(fault.id),
    ...('output' in fault
      ? {
          fixture_sha256: digest(canonical(fault.output)),
          fixture_bytes: Buffer.byteLength(canonical(fault.output)),
        }
      : {}),
    ...('instruction' in fault
      ? {
          instruction_sha256: digest(fault.instruction),
          instruction_bytes: Buffer.byteLength(fault.instruction),
        }
      : {}),
  });
}

/** Public metadata contains digests and counts, never identifiers or injected content. */
export function summarizeWorkflowFault(fault: unknown, index: number): WorkflowFaultSummary {
  const parsed = WorkflowFaultsSchema.safeParse([fault]);
  if (!parsed.success || !Number.isInteger(index) || index < 0 || index >= 32)
    throw new Error('invalid_workflow_fault_configuration');
  return summary(parsed.data[0], index);
}

export interface WorkflowFaultContext {
  readonly tool: WorkflowToolId;
  readonly occurrence: number;
  readonly attempt: number;
  readonly consumedFaultIndices: readonly number[];
}
export type WorkflowFaultAction =
  | {
      readonly kind: 'execute';
      readonly instruction?: string;
      readonly fault?: WorkflowFaultSummary;
    }
  | {
      readonly kind: 'substitute';
      readonly output: WorkflowJson;
      readonly validity: 'valid' | 'malformed';
      readonly fault: WorkflowFaultSummary;
    }
  | {
      readonly kind: 'fail';
      readonly code: 'unavailable_tool' | 'timeout';
      readonly timeoutMs?: number;
      readonly fault: WorkflowFaultSummary;
    };

const contextSchema = guardFaultSchema(
  plainJson.pipe(
    z
      .object({
        tool: z.enum(WORKFLOW_TOOL_IDS),
        occurrence: z.number().int().min(1).max(1000),
        attempt: z.number().int().min(1).max(5),
        consumedFaultIndices: z.array(z.number().int().min(0).max(31)).max(32),
      })
      .strict()
      .refine(
        (value) => new Set(value.consumedFaultIndices).size === value.consumedFaultIndices.length,
        'Duplicate consumed fault index'
      )
  )
);

/**
 * Authorize and validate the original call before using this planner. Occurrence is the
 * original logical call, not the retry count. Matching declarations map in order to attempts.
 * The host persists consumed indices with attempt state; this helper performs no effects,
 * waits or retries. A malformed substitution must never be recorded as a validated success.
 */
export function planWorkflowFault(
  faults: unknown,
  context: WorkflowFaultContext
): WorkflowFaultAction {
  const parsed = WorkflowFaultsSchema.safeParse(faults);
  const invocation = contextSchema.safeParse(context);
  if (
    !parsed.success ||
    !invocation.success ||
    invocation.data.consumedFaultIndices.some((index) => index >= parsed.data.length)
  )
    throw new Error('invalid_workflow_fault_configuration');
  const call = invocation.data;
  const candidates = parsed.data
    .map((fault, index) => ({ fault, index }))
    .filter(({ fault }) => fault.tool === call.tool && fault.occurrence === call.occurrence);
  const selected = candidates[call.attempt - 1];
  if (!selected || call.consumedFaultIndices.includes(selected.index))
    return Object.freeze({ kind: 'execute' });
  const { fault, index } = selected;
  const metadata = summary(fault, index);
  if (fault.kind === 'unavailable_tool' || fault.kind === 'timeout')
    return Object.freeze({
      kind: 'fail',
      code: fault.kind,
      ...(fault.kind === 'timeout' && fault.timeout_ms !== undefined
        ? { timeoutMs: fault.timeout_ms }
        : {}),
      fault: metadata,
    });
  if (fault.kind === 'conflicting_instructions')
    return Object.freeze({ kind: 'execute', instruction: fault.instruction, fault: metadata });
  return Object.freeze({
    kind: 'substitute',
    output: structuredClone(fault.output),
    validity: fault.kind === 'malformed_result' ? 'malformed' : 'valid',
    fault: metadata,
  });
}

/** Append only to a successful read's valid content; never truncate evidence to fit. */
export function applyWorkflowFaultInstruction(
  tool: WorkflowToolId,
  output: unknown,
  appendedInstruction: string
): WorkflowJson | undefined {
  if (
    (tool !== 'read_document' && tool !== 'read_file') ||
    !safeFaultJson(output) ||
    !output ||
    typeof output !== 'object' ||
    Array.isArray(output) ||
    typeof appendedInstruction !== 'string' ||
    !instruction.safeParse(appendedInstruction).success ||
    !outputValidators.get(tool)?.(output) ||
    typeof output.content !== 'string'
  )
    return undefined;
  const result = {
    ...structuredClone(output),
    content: `${output.content}\n${appendedInstruction}`,
  };
  return Buffer.byteLength(JSON.stringify(result)) <= MAX_FIXTURE_BYTES &&
    outputValidators.get(tool)?.(result)
    ? result
    : undefined;
}
