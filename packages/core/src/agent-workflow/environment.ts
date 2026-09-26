import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { getWorkflowTool } from './catalog';
import {
  type AgentWorkflow,
  type WorkflowJson,
  isWorkflowJson,
  isWorkflowRelativePath,
} from './schema';
import { type SimulatedToolResult, executeSimulatedTool } from './simulated-tools';

export type WorkflowState = { [key: string]: WorkflowJson };
export interface WorkflowEnvironmentCleanup {
  status: 'completed' | 'unresolved';
  artifacts: 'discarded' | 'retained' | 'unknown';
}
/** Factories report unresolved partially-created resources without disclosing engine errors. */
export class WorkflowEnvironmentInitializationError extends Error {
  constructor(readonly cleanup: WorkflowEnvironmentCleanup & { pendingOperations: number }) {
    super('environment_initialization_failed');
  }
}
/** Trusted host extension, never constructed from model output. Implementations must honor abort. */
export interface WorkflowEnvironment {
  readonly type: 'simulated' | 'sandbox';
  readonly capabilities: {
    network: 'denied';
    commands: 'denied';
    externalSideEffects: 'denied';
    isolation: 'memory' | 'container';
  };
  execute(
    request: { tool: string; input: WorkflowJson },
    signal: AbortSignal
  ): Promise<SimulatedToolResult>;
  snapshot(signal: AbortSignal): Promise<WorkflowState>;
  close(signal: AbortSignal): Promise<WorkflowEnvironmentCleanup>;
}
export type WorkflowEnvironmentFactory = (options: {
  workflow: AgentWorkflow;
  initialState: WorkflowState;
  signal: AbortSignal;
}) => Promise<WorkflowEnvironment>;

export function isWorkflowState(value: unknown): value is WorkflowState {
  return (
    isWorkflowJson(value) && value !== null && typeof value === 'object' && !Array.isArray(value)
  );
}

/** Exact relative path grants, no globs or path normalization that could hide traversal. */
export function workflowPathAllowed(
  workflow: AgentWorkflow,
  tool: string,
  input: WorkflowJson
): boolean {
  if (tool !== 'read_file' && tool !== 'write_file') return true;
  if (
    !isWorkflowState(input) ||
    typeof input.path !== 'string' ||
    !isWorkflowRelativePath(input.path)
  )
    return false;
  const paths = workflow.environment.policy.paths;
  return !paths || (tool === 'read_file' ? paths.read : paths.write).includes(input.path);
}

export function workflowToolPermitted(workflow: AgentWorkflow, tool: string): boolean {
  const descriptor = getWorkflowTool(tool);
  if (!descriptor || !workflow.tools.includes(descriptor.id)) return false;
  if (descriptor.authority.access === 'none') return true;
  const grant =
    workflow.environment.policy.permissions[
      descriptor.authority.resource as keyof AgentWorkflow['environment']['policy']['permissions']
    ];
  return grant === 'write' || (grant === 'read' && descriptor.authority.access === 'read');
}

/** Fixture files are explicit, bounded JSON/YAML data. Hidden/credential paths never load. */
export async function resolveWorkflowInitialState(
  workflow: AgentWorkflow,
  fixtureRoot?: string
): Promise<WorkflowState> {
  const initial = workflow.workflow.initial_state;
  if (typeof initial !== 'string') {
    if (!isWorkflowState(initial)) throw new Error('invalid_fixture');
    return structuredClone(initial);
  }
  if (
    !fixtureRoot ||
    !isWorkflowRelativePath(initial) ||
    !/\.(json|ya?ml)$/i.test(initial) ||
    initial
      .split('/')
      .some(
        (part) =>
          part.startsWith('.') ||
          /(?:^|[._-])(?:secrets?|credentials?|tokens?|private|id_rsa|id_ed25519)(?:[._-]|$)/i.test(
            part
          )
      )
  )
    throw new Error('invalid_fixture');
  const root = resolve(fixtureRoot);
  // The explicitly selected root may be reached via an OS alias (/tmp on macOS). Descendants may not.
  const canonicalRoot = await realpath(root);
  let current = canonicalRoot;
  const ancestry: { path: string; ino: number; dev: number }[] = [];
  const parts = initial.split('/');
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()))
      throw new Error('invalid_fixture');
    ancestry.push({ path: current, ino: stat.ino, dev: stat.dev });
  }
  const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    const expected = ancestry[ancestry.length - 1];
    if (
      !stat.isFile() ||
      stat.size > 1_048_576 ||
      stat.ino !== expected.ino ||
      stat.dev !== expected.dev
    )
      throw new Error('invalid_fixture');
    // A bounded descriptor read prevents a concurrently growing fixture from consuming unbounded memory.
    const buffer = Buffer.alloc(1_048_577);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 1_048_576) throw new Error('invalid_fixture');
    for (const entry of ancestry) {
      const after = await lstat(entry.path);
      if (after.isSymbolicLink() || after.ino !== entry.ino || after.dev !== entry.dev)
        throw new Error('invalid_fixture');
    }
    const document = parseDocument(buffer.subarray(0, length).toString('utf8'), {
      uniqueKeys: true,
      customTags: [],
    });
    if (document.errors.length || document.warnings.length) throw new Error('invalid_fixture');
    const value: unknown = document.toJS({ maxAliasCount: 0 });
    if (!isWorkflowState(value)) throw new Error('invalid_fixture');
    return value;
  } finally {
    await file.close();
  }
}

export const createSimulatedWorkflowEnvironment: WorkflowEnvironmentFactory = async ({
  workflow,
  initialState,
  signal,
}) => {
  if (workflow.environment.type !== 'simulated' || signal.aborted || !isWorkflowState(initialState))
    throw new Error('environment_unavailable');
  const configuration = structuredClone(workflow);
  let state = structuredClone(initialState);
  let closed = false;
  return {
    type: 'simulated',
    capabilities: {
      network: 'denied',
      commands: 'denied',
      externalSideEffects: 'denied',
      isolation: 'memory',
    },
    async execute(request, executionSignal) {
      if (closed || executionSignal.aborted) throw new Error('environment_unavailable');
      if (!workflowPathAllowed(configuration, request.tool, request.input))
        return {
          status: 'denied',
          code: 'permission_denied',
          evidence: {
            tool: getWorkflowTool(request.tool)?.id ?? 'unknown',
            version: '1',
            status: 'denied',
            code: 'permission_denied',
          },
        };
      const result = executeSimulatedTool({
        ...request,
        state,
        policy: configuration.environment.policy,
        declaredTools: configuration.tools,
      });
      if (result.status === 'succeeded') state = structuredClone(result.state);
      return result;
    },
    async snapshot(snapshotSignal) {
      if (closed || snapshotSignal.aborted) throw new Error('environment_unavailable');
      return structuredClone(state);
    },
    async close() {
      closed = true;
      state = {};
      return { status: 'completed', artifacts: 'discarded' };
    },
  };
};
