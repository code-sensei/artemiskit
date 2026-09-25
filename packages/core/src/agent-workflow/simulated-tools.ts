import Ajv from 'ajv';
import { getWorkflowTool, listWorkflowTools } from './catalog';
import {
  type WorkflowJson,
  type WorkflowPolicy,
  WorkflowPolicySchema,
  isWorkflowJson,
  isWorkflowRelativePath,
} from './schema';

type JsonObject = { [key: string]: WorkflowJson };
type ToolFailureCode =
  | 'undeclared_tool'
  | 'permission_denied'
  | 'invalid_input'
  | 'invalid_state'
  | 'not_found'
  | 'output_limit'
  | 'invalid_policy'
  | 'tool_error';
export interface SimulatedToolEvidence {
  tool: string;
  version: '1';
  status: 'succeeded' | 'denied' | 'invalid' | 'failed';
  code?: ToolFailureCode;
}
export type SimulatedToolResult =
  | {
      status: 'succeeded';
      output: WorkflowJson;
      state: JsonObject;
      evidence: SimulatedToolEvidence;
    }
  | {
      status: 'denied' | 'invalid' | 'failed';
      code: ToolFailureCode;
      evidence: SimulatedToolEvidence;
    };

const ajv = new Ajv({ allErrors: false, strict: true });
const validators = new Map(
  listWorkflowTools().map((tool) => [
    tool.id,
    { input: ajv.compile(tool.inputSchema), output: ajv.compile(tool.outputSchema) },
  ])
);

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class SimulatedFailure extends Error {
  constructor(readonly code: ToolFailureCode) {
    super(code);
  }
}

function objectAt(state: JsonObject, key: string, create = false): JsonObject {
  const value = state[key];
  if (value === undefined) {
    const empty = {};
    if (create) state[key] = empty;
    return empty;
  }
  if (!isObject(value)) throw new SimulatedFailure('invalid_state');
  return value;
}

function nextId(collection: JsonObject, prefix: string): string {
  let index = Object.keys(collection).length + 1;
  while (Object.hasOwn(collection, `${prefix}-${index}`)) index++;
  return `${prefix}-${index}`;
}

/**
 * One deterministic simulated call, with isolated input/output state and metadata-only evidence.
 * Budgets are declarative here: a future environment runner owns action counts and deadlines.
 * `side_effects` governs external effects; declared local state writes never authorize real effects.
 */
export function executeSimulatedTool(request: {
  tool: string;
  input: unknown;
  state: unknown;
  policy: WorkflowPolicy;
  declaredTools: readonly string[];
}): SimulatedToolResult {
  const tool = getWorkflowTool(request.tool);
  const evidenceTool = tool?.id ?? 'unknown';
  function failure(
    status: 'denied' | 'invalid' | 'failed',
    code: ToolFailureCode
  ): SimulatedToolResult {
    return { status, code, evidence: { tool: evidenceTool, version: '1', status, code } };
  }
  if (!tool || !request.declaredTools.includes(tool.id))
    return failure('denied', 'undeclared_tool');
  if (!isWorkflowJson(request.policy)) return failure('denied', 'invalid_policy');
  const policy = WorkflowPolicySchema.safeParse(request.policy);
  if (!policy.success) return failure('denied', 'invalid_policy');
  if (tool.authority.access !== 'none') {
    const resource = tool.authority.resource as keyof WorkflowPolicy['permissions'];
    const grant = policy.data.permissions[resource];
    if (!grant || (tool.authority.access === 'write' && grant !== 'write'))
      return failure('denied', 'permission_denied');
  }
  const validator = validators.get(tool.id);
  if (
    !validator ||
    !isWorkflowJson(request.input) ||
    !isObject(request.input) ||
    !validator.input(request.input)
  )
    return failure('invalid', 'invalid_input');
  if (!isWorkflowJson(request.state) || !isObject(request.state))
    return failure('invalid', 'invalid_state');
  const state: JsonObject = structuredClone(request.state);
  const input = request.input;
  let output: WorkflowJson;
  try {
    switch (tool.id) {
      case 'search': {
        const documents = objectAt(state, 'documents');
        if (Object.values(documents).some((value) => typeof value !== 'string'))
          throw new SimulatedFailure('invalid_state');
        output = {
          matches: Object.entries(documents)
            .filter(([, content]) =>
              (content as string).toLowerCase().includes((input.query as string).toLowerCase())
            )
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .slice(0, 100)
            .map(([id]) => ({ id })),
        };
        break;
      }
      case 'read_document': {
        const content = objectAt(state, 'documents')[input.id as string];
        if (content === undefined) throw new SimulatedFailure('not_found');
        if (typeof content !== 'string') throw new SimulatedFailure('invalid_state');
        output = { id: input.id, content };
        break;
      }
      case 'query_records': {
        const records = objectAt(state, 'records')[input.collection as string];
        if (records === undefined) throw new SimulatedFailure('not_found');
        if (!Array.isArray(records) || records.some((record) => !isObject(record)))
          throw new SimulatedFailure('invalid_state');
        output = { records: records.slice(0, 100) };
        break;
      }
      case 'read_file':
      case 'write_file': {
        const path = input.path as string;
        if (!isWorkflowRelativePath(path)) return failure('invalid', 'invalid_input');
        const files = objectAt(state, 'files', tool.id === 'write_file');
        if (tool.id === 'write_file') {
          files[path] = input.content;
          output = { path, written: true };
        } else {
          const content = files[path];
          if (content === undefined) throw new SimulatedFailure('not_found');
          if (typeof content !== 'string') throw new SimulatedFailure('invalid_state');
          output = { content };
        }
        break;
      }
      case 'calculator': {
        const a = input.a as number;
        const b = input.b as number;
        const value =
          input.operation === 'add'
            ? a + b
            : input.operation === 'subtract'
              ? a - b
              : input.operation === 'multiply'
                ? a * b
                : a / b;
        if (!Number.isFinite(value)) throw new SimulatedFailure('tool_error');
        output = { value };
        break;
      }
      case 'get_workflow_state':
        output = { state: objectAt(state, 'workflow_state') };
        break;
      case 'request_approval': {
        const workflow = objectAt(state, 'workflow_state', true);
        workflow.approvals = { requested: true, status: 'pending', reason: input.reason };
        output = { requested: true, status: 'pending' };
        break;
      }
      case 'record_decision': {
        objectAt(state, 'workflow_state', true).decision = input.decision;
        output = { recorded: true };
        break;
      }
      case 'draft_message': {
        const drafts = objectAt(state, 'drafts', true);
        const id = nextId(drafts, 'draft');
        drafts[id] = { recipient: input.recipient, body: input.body, status: 'draft' };
        output = { id, status: 'draft' };
        break;
      }
      case 'delegate_task': {
        const tasks = objectAt(state, 'tasks', true);
        const id = nextId(tasks, 'task');
        tasks[id] = { task: input.task, status: 'pending' };
        output = { id, status: 'pending' };
        break;
      }
      case 'get_task_status': {
        const task = objectAt(state, 'tasks')[input.id as string];
        if (task === undefined) throw new SimulatedFailure('not_found');
        if (!isObject(task)) throw new SimulatedFailure('invalid_state');
        output = { id: input.id, status: task.status };
        break;
      }
    }
    if (!isWorkflowJson(output) || !isWorkflowJson(state) || !validator.output(output))
      return failure('failed', 'output_limit');
    // Do not let consumers mutate returned state through a shared output reference.
    return {
      status: 'succeeded',
      output: structuredClone(output),
      state,
      evidence: { tool: tool.id, version: '1', status: 'succeeded' },
    };
  } catch (error) {
    return failure('failed', error instanceof SimulatedFailure ? error.code : 'tool_error');
  }
}
