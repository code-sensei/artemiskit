import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentWorkflowSession } from '@artemiskit/core';
import { generateWorkflowReport } from '@artemiskit/reports';
import { buildAgentWorkflow } from '../../commands/agent-workflow';

const cli = fileURLToPath(new URL('../../../bin/artemis.ts', import.meta.url));
const privateText = 'DO-NOT-EXPORT-WORKING-DATA';
async function evidence() {
  const workflow = buildAgentWorkflow({
    tools: 'request_approval',
    provider: 'openai',
    model: 'fixture',
  });
  workflow.workflow.initial_state = { workflow_state: { ready: false, private: privateText } };
  workflow.outcomes.deterministic = [{ type: 'workflow_state', path: 'ready', equals: true }];
  return (
    await createAgentWorkflowSession({
      workflow,
      target: {
        provider: 'openai',
        capabilities: async () => ({
          status: 'available',
          toolUse: true,
          transportCancellation: true,
        }),
        turn: async () => ({
          status: 'completed',
          id: 'fixture',
          model: 'fixture',
          message: { role: 'assistant', content: privateText },
          tokens: { prompt: 1, completion: 1, total: 2 },
          latencyMs: 1,
        }),
      },
    }).run()
  ).record;
}
async function invoke(directory: string, args: string[]) {
  const preload = join(directory, 'offline.ts');
  await writeFile(preload, "globalThis.fetch = () => { throw new Error('NETWORK-FORBIDDEN'); };\n");
  const child = Bun.spawn(
    [process.execPath, '--preload', preload, cli, 'workflow', 'report', ...args],
    {
      cwd: directory,
      env: { PATH: process.env.PATH },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const timer = setTimeout(() => child.kill(), 10000);
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(`${stdout}${stderr}`).not.toContain(privateText);
    expect(`${stdout}${stderr}`).not.toContain('NETWORK-FORBIDDEN');
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}
describe('offline workflow assessment CLI', () => {
  test('all views/formats match SDK generation with failed task evidence and no configuration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'artemis-report-'));
    const record = await evidence();
    expect(record.taskVerification).toBe('failed');
    const input = join(directory, 'evidence.json');
    await writeFile(input, JSON.stringify(record));
    // An invalid config in the current directory must never be resolved by this command.
    await writeFile(join(directory, 'artemis.config.yaml'), 'invalid: [configuration');
    for (const format of ['html', 'markdown'] as const) {
      for (const view of ['technical', 'executive', 'comprehensive'] as const) {
        const result = await invoke(directory, [input, '--format', format, '--view', view]);
        expect(result.code).toBe(0);
        expect(result.stdout).toBe(generateWorkflowReport([record], { format, view }));
        expect(result.stderr).toBe('');
      }
    }
  }, 30000);
  test('new output only, deterministic duplicates, bounded files and generic errors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'artemis-report-errors-'));
    const input = join(directory, 'evidence.json');
    const record = await evidence();
    await writeFile(input, JSON.stringify(record));
    const output = join(directory, 'assessment.md');
    const result = await invoke(directory, [
      input,
      input,
      '--format',
      'markdown',
      '--output',
      output,
    ]);
    expect(result.code).toBe(0);
    expect(await readFile(output, 'utf8')).toBe(
      generateWorkflowReport([record, record], { format: 'markdown' })
    );
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    const original = await readFile(output, 'utf8');
    expect((await invoke(directory, [input, '--output', output])).code).toBe(1);
    expect(await readFile(output, 'utf8')).toBe(original);
    expect((await invoke(directory, [input, '--output', input])).code).toBe(1);
    expect(JSON.parse(await readFile(input, 'utf8'))).toEqual(record);
    const alias = join(directory, 'alias.json');
    await symlink(input, alias);
    expect((await invoke(directory, [alias])).code).toBe(1);
    expect((await invoke(directory, [directory])).code).toBe(1);
    await writeFile(input, JSON.stringify({ schemaVersion: '99', private: privateText }));
    const invalid = await invoke(directory, [input]);
    expect(invalid.code).toBe(2);
    expect(invalid.stdout).toBe('');
    await writeFile(input, ' '.repeat(1_048_577));
    expect((await invoke(directory, [input])).code).toBe(1);
  }, 30000);
});
