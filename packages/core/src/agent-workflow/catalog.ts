/** Versioned built-in capabilities. All implementations in this release are simulated. */
export const WORKFLOW_TOOL_IDS = [
  'search',
  'read_document',
  'query_records',
  'read_file',
  'write_file',
  'calculator',
  'get_workflow_state',
  'request_approval',
  'record_decision',
  'draft_message',
  'delegate_task',
  'get_task_status',
] as const;

export type WorkflowToolId = (typeof WORKFLOW_TOOL_IDS)[number];
export type WorkflowResource =
  | 'documents'
  | 'records'
  | 'files'
  | 'computation'
  | 'workflow_state'
  | 'communication'
  | 'coordination';

export interface WorkflowToolDescriptor {
  id: WorkflowToolId;
  version: '1';
  family: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  authority: {
    resource: WorkflowResource;
    access: 'read' | 'write' | 'none';
    network: 'denied';
    sideEffects: 'none' | 'simulated';
  };
  evidence: { mode: 'metadata_only'; maxBytes: 1024 };
  failureModes: string[];
}

const text = { type: 'string', minLength: 1, maxLength: 16_384 };
const identifier = {
  type: 'string',
  pattern: '^(?!(?:__proto__|prototype|constructor)$)[a-zA-Z0-9_-]{1,128}$',
};
const relativePath = {
  type: 'string',
  maxLength: 512,
  pattern:
    '^(?!.*(?:^|/)(?:\\.\\.?|__proto__|prototype|constructor)(?:/|$))[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$',
};

function object(properties: Record<string, unknown>, required = Object.keys(properties)) {
  return { type: 'object', properties, required, additionalProperties: false };
}

function descriptor(
  id: WorkflowToolId,
  family: string,
  description: string,
  resource: WorkflowResource,
  access: 'read' | 'write' | 'none',
  inputSchema: Record<string, unknown>,
  outputSchema: Record<string, unknown>
): WorkflowToolDescriptor {
  return {
    id,
    version: '1',
    family,
    description,
    inputSchema,
    outputSchema,
    authority: {
      resource,
      access,
      network: 'denied',
      sideEffects: access === 'write' ? 'simulated' : 'none',
    },
    evidence: { mode: 'metadata_only', maxBytes: 1024 },
    failureModes: [
      'undeclared_tool',
      'permission_denied',
      'invalid_policy',
      'invalid_input',
      'invalid_state',
      'not_found',
      'output_limit',
      'tool_error',
    ],
  };
}

const tools: WorkflowToolDescriptor[] = [
  descriptor(
    'search',
    'retrieval',
    'Search declared documents by case-insensitive literal text.',
    'documents',
    'read',
    object({ query: text }),
    object({ matches: { type: 'array', maxItems: 100, items: object({ id: identifier }) } })
  ),
  descriptor(
    'read_document',
    'documents',
    'Read one document from simulated state.',
    'documents',
    'read',
    object({ id: identifier }),
    object({ id: identifier, content: { type: 'string', maxLength: 16_384 } })
  ),
  descriptor(
    'query_records',
    'records',
    'Read a bounded declared collection of structured records.',
    'records',
    'read',
    object({ collection: identifier }),
    object({ records: { type: 'array', maxItems: 100, items: { type: 'object' } } })
  ),
  descriptor(
    'read_file',
    'files',
    'Read one relative file from in-memory fixture state.',
    'files',
    'read',
    object({ path: relativePath }),
    object({ content: { type: 'string', maxLength: 16_384 } })
  ),
  descriptor(
    'write_file',
    'files',
    'Write one relative file in isolated in-memory state.',
    'files',
    'write',
    object({ path: relativePath, content: { type: 'string', maxLength: 16_384 } }),
    object({ path: relativePath, written: { const: true } })
  ),
  descriptor(
    'calculator',
    'computation',
    'Perform one finite arithmetic operation without evaluating code.',
    'computation',
    'none',
    object({
      operation: { enum: ['add', 'subtract', 'multiply', 'divide'] },
      a: { type: 'number' },
      b: { type: 'number' },
    }),
    object({ value: { type: 'number' } })
  ),
  descriptor(
    'get_workflow_state',
    'workflow',
    'Read declared workflow state.',
    'workflow_state',
    'read',
    object({}),
    object({ state: { type: 'object' } })
  ),
  descriptor(
    'request_approval',
    'approvals',
    'Record a pending simulated request; never grant approval.',
    'workflow_state',
    'write',
    object({ reason: text }),
    object({ requested: { const: true }, status: { const: 'pending' } })
  ),
  descriptor(
    'record_decision',
    'workflow',
    'Record a proposed decision without granting authority.',
    'workflow_state',
    'write',
    object({ decision: text }),
    object({ recorded: { const: true } })
  ),
  descriptor(
    'draft_message',
    'communication',
    'Create a local message draft; never send it.',
    'communication',
    'write',
    object({ recipient: text, body: text }),
    object({ id: identifier, status: { const: 'draft' } })
  ),
  descriptor(
    'delegate_task',
    'coordination',
    'Record a pending local task; never invoke a worker or external system.',
    'coordination',
    'write',
    object({ task: text }),
    object({ id: identifier, status: { const: 'pending' } })
  ),
  descriptor(
    'get_task_status',
    'coordination',
    'Read the status of a declared simulated task.',
    'coordination',
    'read',
    object({ id: identifier }),
    object({ id: identifier, status: { enum: ['pending', 'completed', 'failed'] } })
  ),
];

/** Defensive copies prevent callers or adapters from modifying the catalog's authority. */
export function listWorkflowTools(): WorkflowToolDescriptor[] {
  return structuredClone(tools);
}

export function getWorkflowTool(id: string): WorkflowToolDescriptor | undefined {
  const tool = tools.find((candidate) => candidate.id === id);
  return tool ? structuredClone(tool) : undefined;
}
