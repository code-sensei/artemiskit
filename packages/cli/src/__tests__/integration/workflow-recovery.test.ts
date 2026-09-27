import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkflowRecord } from '@artemiskit/core';
import { buildAgentWorkflow } from '../../commands/agent-workflow';

const cli = fileURLToPath(new URL('../../../bin/artemis.ts', import.meta.url));
describe('CLI private workflow recovery', () => {
  test('separate CLI processes preserve cursor, state, budgets and transport identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'artemis-cli-recovery-'));
    const checkpoint = join(directory, 'private');
    const secret = 'PRIVATE-RECOVERY-CONTENT';
    let requests = 0;
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const body = await request.json();
        requests++;
        const replies = body.messages.filter(
          (message: { role: string }) => message.role === 'tool'
        );
        if (requests > 1) expect(replies).toHaveLength(2);
        const tool_calls = ['one', 'two'].map((name) => ({
          id: name,
          type: 'function',
          function: {
            name: 'write_file',
            arguments: JSON.stringify({ path: `${name}.txt`, content: secret }),
          },
        }));
        return Response.json({
          id: 'fixture',
          model: body.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: replies.length ? 'Done.' : null,
                ...(replies.length ? {} : { tool_calls }),
              },
              finish_reason: replies.length ? 'stop' : 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        });
      },
    });
    const scenario = buildAgentWorkflow({
      tools: 'write_file',
      provider: 'openai',
      model: 'fixture-recovery',
    });
    scenario.workflow.initial_state = { files: {} };
    scenario.environment.policy.budgets = {
      max_actions: 8,
      max_tool_calls: 4,
      max_model_requests: 3,
      max_tokens: 100,
      timeout_ms: 60000,
    };
    scenario.outcomes.deterministic = ['one', 'two'].map((name) => ({
      type: 'file',
      path: `${name}.txt`,
      exists: true,
      equals: secret,
    }));
    const workflow = join(directory, 'workflow.json');
    const config = join(directory, 'config.json');
    await writeFile(workflow, JSON.stringify(scenario));
    const settings = {
      providers: {
        openai: {
          apiKey: 'dummy-only',
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          maxRetries: 8,
        },
      },
    };
    await writeFile(config, JSON.stringify(settings));
    const run = async (mode: string, name: string, extra: string[] = []) => {
      const output = join(directory, `${name}.json`);
      const child = Bun.spawn(
        [
          process.execPath,
          cli,
          'workflow',
          mode,
          workflow,
          '--config',
          config,
          '--checkpoint-dir',
          checkpoint,
          '--output',
          output,
          '--json',
          ...extra,
        ],
        {
          cwd: directory,
          env: { PATH: process.env.PATH },
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
        }
      );
      const timer = setTimeout(() => child.kill(), 15000);
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      clearTimeout(timer);
      expect(`${stdout}${stderr}`).not.toContain(secret);
      const record = readWorkflowRecord(await readFile(output, 'utf8'));
      expect(JSON.parse(stdout)).toEqual(record);
      return { code, record };
    };
    try {
      const paused = await run('run', 'paused', ['--pause-after-actions', '2']);
      expect(paused.code).toBe(10);
      expect(paused.record.reason).toBe('checkpoint_paused');
      expect(paused.record.budgets).toMatchObject({ actions: 2, modelRequests: 1, toolCalls: 1 });
      expect(requests).toBe(1);
      expect((await stat(checkpoint)).mode & 0o777).toBe(0o700);
      expect((await stat(join(checkpoint, 'checkpoint.json'))).mode & 0o777).toBe(0o600);
      settings.providers.openai.apiKey = 'different-dummy-only';
      await writeFile(config, JSON.stringify(settings));
      expect((await run('resume', 'incompatible')).code).not.toBe(0);
      expect(requests).toBe(1);
      settings.providers.openai.apiKey = 'dummy-only';
      await writeFile(config, JSON.stringify(settings));
      const resumed = await run('resume', 'resumed');
      expect(resumed.code).toBe(0);
      expect(resumed.record.taskVerification).toBe('passed');
      expect(resumed.record.budgets).toMatchObject({ actions: 4, modelRequests: 2, toolCalls: 2 });
      expect(resumed.record.usage.reported.total).toBe(6);
      expect(requests).toBe(2);
      expect(resumed.record.events.filter((event) => event.type === 'started')).toHaveLength(1);
      expect(resumed.record.events.filter((event) => event.type === 'finished')).toHaveLength(1);
      expect((await run('resume', 'terminal')).code).not.toBe(0);
      expect(requests).toBe(2);
    } finally {
      server.stop(true);
    }
  }, 30000);
});
