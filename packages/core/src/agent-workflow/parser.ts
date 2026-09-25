import { readFile } from 'node:fs/promises';
import { parseDocument } from 'yaml';
import { ArtemisError } from '../utils/errors';
import { type AgentWorkflow, AgentWorkflowSchema } from './schema';

export function validateAgentWorkflow(value: unknown): AgentWorkflow {
  const result = AgentWorkflowSchema.safeParse(value);
  if (!result.success) {
    // Never include input values or untrusted YAML content in diagnostic messages.
    throw new ArtemisError(
      'Invalid agent workflow: check version, fields, tools, policy, and outcomes',
      'SCENARIO_VALIDATION_ERROR',
      { issues: result.error.issues.map((issue) => ({ path: issue.path, code: issue.code })) }
    );
  }
  return result.data;
}

/** Parse without environment substitution or fixture dereferencing. */
export function parseAgentWorkflow(yamlText: string): AgentWorkflow {
  if (Buffer.byteLength(yamlText) > 1_048_576)
    throw new ArtemisError('Agent workflow exceeds 1 MiB', 'SCENARIO_PARSE_ERROR');
  let value: unknown;
  try {
    const document = parseDocument(yamlText, { uniqueKeys: true, customTags: [] });
    if (document.errors.length || document.warnings.length) throw new Error('Invalid YAML');
    value = document.toJS({ maxAliasCount: 0 });
  } catch {
    throw new ArtemisError('Failed to parse agent workflow YAML', 'SCENARIO_PARSE_ERROR');
  }
  return validateAgentWorkflow(value);
}

/** Reads only the explicitly supplied scenario; fixture resolution belongs to a future runner. */
export async function loadAgentWorkflow(filePath: string): Promise<AgentWorkflow> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    throw new ArtemisError('Failed to read agent workflow file', 'SCENARIO_READ_ERROR');
  }
  return parseAgentWorkflow(content);
}
