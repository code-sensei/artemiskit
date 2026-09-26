import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAgentWorkflow } from '@artemiskit/core';
import inquirer from 'inquirer';
import { buildAgentWorkflow, promptForAgentWorkflow } from '../../commands/agent-workflow';
import { cleanupTestDir, createTestDir } from '../helpers/test-utils';

const cli = fileURLToPath(new URL('../../../bin/artemis.ts', import.meta.url));
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(cleanupTestDir));
});

async function directory() {
  const path = await createTestDir('agent-workflow');
  directories.push(path);
  return path;
}

async function command(cwd: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, cli, ...args], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timeout = setTimeout(() => child.kill(), 15000);
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timeout);
  return { exit, stdout, stderr };
}

describe('agent workflow authoring', () => {
  it('generates validated YAML through the real CLI without creating config, credentials, or artifacts', async () => {
    const cwd = await directory();
    const result = await command(
      cwd,
      'init',
      'agent-workflow',
      '--yes',
      '--provider',
      'ling',
      '--model',
      'fixture-model',
      '--output',
      'workflow.yaml'
    );
    expect(result.exit).toBe(0);
    expect(await readdir(cwd)).toEqual(['workflow.yaml']);
    const scenario = parseAgentWorkflow(await readFile(join(cwd, 'workflow.yaml'), 'utf8'));
    expect(scenario.target).toEqual({
      provider: 'ling',
      model: 'fixture-model',
      generation: { max_tokens: 256 },
    });
    expect(scenario.environment.policy.permissions).toEqual({ workflow_state: 'write' });
    expect(scenario.environment.policy.network).toBe('denied');
    expect(scenario.outcomes.deterministic).toEqual([
      { type: 'tool_trace', tool: 'request_approval', minimum_calls: 1 },
    ]);
    for (const args of [['scenario', 'validate'], ['validate']]) {
      const validation = await command(cwd, ...args, 'workflow.yaml', '--json');
      expect(validation.exit).toBe(0);
      expect(JSON.parse(validation.stdout).valid).toBe(true);
    }
  }, 60_000);

  it('preserves existing output unless force is explicit', async () => {
    const cwd = await directory();
    const output = join(cwd, 'workflow.yaml');
    await writeFile(output, 'user-owned content');
    expect((await command(cwd, 'init', 'agent-workflow', '--yes', '-o', output)).exit).toBe(1);
    expect(await readFile(output, 'utf8')).toBe('user-owned content');
    expect(
      (await command(cwd, 'init', 'agent-workflow', '--yes', '--force', '-o', output)).exit
    ).toBe(0);
    expect(parseAgentWorkflow(await readFile(output, 'utf8')).kind).toBe('agent_workflow');
  }, 60_000);

  it('rejects unsupported tools and bad budgets before creating output', async () => {
    const cwd = await directory();
    for (const flags of [
      ['--tools', 'send_message'],
      ['--max-actions', '0'],
      ['--max-tokens', 'NaN'],
      ['--expect-state', 'decision'],
    ]) {
      expect((await command(cwd, 'init', 'agent-workflow', '--yes', ...flags)).exit).toBe(1);
    }
    expect(await readdir(cwd)).toEqual([]);
  }, 60_000);

  it('lists descriptors and rejects unknown tool IDs', async () => {
    const cwd = await directory();
    const listed = await command(cwd, 'tools', 'list', '--json');
    expect(listed.exit).toBe(0);
    const tools = JSON.parse(listed.stdout);
    expect(tools.length).toBeGreaterThanOrEqual(7);
    const described = await command(cwd, 'tools', 'describe', 'draft_message', '--json');
    expect(described.exit).toBe(0);
    expect(JSON.parse(described.stdout)).toMatchObject({
      id: 'draft_message',
      authority: { network: 'denied', sideEffects: 'simulated' },
    });
    expect((await command(cwd, 'tools', 'describe', 'send_message')).exit).toBe(1);
  }, 60_000);

  it('supports explicit state outcomes and keeps YAML-like user text as data', () => {
    const scenario = buildAgentWorkflow({
      name: 'review: [draft]',
      tools: 'read_document,request_approval',
      prompt: 'Hello\nnetwork: allowed',
      expectState: 'approvals.requested',
      equals: 'true',
      semanticRubric: 'Explains uncertainty',
    });
    expect(scenario.name).toBe('review: [draft]');
    expect(scenario.environment.policy.permissions).toEqual({
      documents: 'read',
      workflow_state: 'write',
    });
    expect(scenario.outcomes.deterministic).toEqual([
      { type: 'workflow_state', path: 'approvals.requested', equals: true },
    ]);
    expect(scenario.outcomes.semantic?.[0]).toMatchObject({ mode: 'strict_assurance' });
  });

  it('guided authoring uses the same validator and builder as non-interactive flags', async () => {
    const prompt = spyOn(inquirer, 'prompt').mockResolvedValue({
      name: 'guided',
      provider: 'openai',
      model: 'fixture',
      selectedTools: ['calculator'],
      instructions: 'Calculate only',
      prompt: 'Add 2 and 3',
      maxActions: '2',
      maxToolCalls: '1',
      timeout: '5000',
      maxTokens: '64',
      expectState: '',
      readPaths: '',
      writePaths: '  ',
      semanticRubric: '',
    });
    try {
      const options = await promptForAgentWorkflow({});
      const scenario = buildAgentWorkflow(options);
      expect(scenario.tools).toEqual(['calculator']);
      expect(scenario.environment.policy.permissions).toEqual({});
      expect(scenario.environment.policy.budgets.max_actions).toBe(2);
      expect(scenario.environment.policy.paths).toBeUndefined();
    } finally {
      prompt.mockRestore();
    }
  });

  it('rejects invalid workflow authority and still validates legacy scenarios in a mixed directory', async () => {
    const cwd = await directory();
    await command(cwd, 'init', 'agent-workflow', '--yes', '-o', 'workflow.yaml');
    await writeFile(
      join(cwd, 'legacy.yaml'),
      'name: legacy\ncases:\n  - id: one\n    prompt: hello\n    expected:\n      type: exact\n      value: hello\n'
    );
    const valid = await command(cwd, 'scenario', 'validate', '.', '--json');
    expect(valid.exit).toBe(0);
    expect(JSON.parse(valid.stdout).summary.total).toBe(2);
    const workflow = await readFile(join(cwd, 'workflow.yaml'), 'utf8');
    await writeFile(
      join(cwd, 'workflow.yaml'),
      workflow.replace('network: denied', 'network: allowed')
    );
    const invalid = await command(cwd, 'scenario', 'validate', '.', '--json');
    expect(invalid.exit).toBe(1);
    expect(JSON.parse(invalid.stdout).summary.failed).toBe(1);
  }, 60_000);
});
