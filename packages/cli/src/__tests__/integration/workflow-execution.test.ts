import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentWorkflow } from '@artemiskit/core';
import { stringify } from 'yaml';
import { createCLI } from '../../cli';
import { buildAgentWorkflow } from '../../commands/agent-workflow';

const cli = fileURLToPath(new URL('../../../bin/artemis.ts', import.meta.url));
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});
type Body = {
  model: string;
  messages: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }[];
  tools: {
    function: { name: string; parameters: { properties: { nonce?: { const: string } } } };
  }[];
  max_tokens: number;
};
function completion(
  content = 'PRIVATE-ANSWER',
  tool?: { name: string; arguments: unknown },
  usage = true
) {
  return Response.json({
    id: 'fixture-response',
    model: 'fixture-observed',
    object: 'chat.completion',
    created: 1,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: tool ? null : content,
          ...(tool
            ? {
                tool_calls: [
                  {
                    id: 'private-call-id',
                    type: 'function',
                    function: { name: tool.name, arguments: JSON.stringify(tool.arguments) },
                  },
                ],
              }
            : {}),
        },
        finish_reason: tool ? 'tool_calls' : 'stop',
      },
    ],
    ...(usage ? { usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } } : {}),
  });
}
async function fixture(handler: (body: Body, request: Request) => Response | Promise<Response>) {
  const requests: Body[] = [];
  const directory = await mkdtemp(join(tmpdir(), 'artemis-workflow-cli-'));
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as Body;
      requests.push(body);
      return handler(body, request);
    },
  });
  servers.push(server);
  const workflow = buildAgentWorkflow({
    tools: 'write_file',
    provider: 'openai',
    model: 'workflow-model',
    prompt: '${WORKFLOW_LITERAL} PRIVATE-PROMPT',
    maxTokens: '1000',
  });
  workflow.workflow.initial_state = { files: { 'private.txt': 'PRIVATE-CONTENT' } };
  await writeFile(join(directory, 'workflow.yaml'), stringify(workflow));
  await writeFile(
    join(directory, 'config.yaml'),
    stringify({
      provider: 'anthropic',
      model: 'wrong-default',
      providers: {
        openai: {
          apiKey: 'dummy-local-key',
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          defaultModel: 'wrong-config-model',
          maxRetries: 4,
        },
      },
    })
  );
  const spawn = (...args: string[]) =>
    Bun.spawn(
      [
        process.execPath,
        cli,
        'workflow',
        ...args,
        '--config',
        join(directory, 'config.yaml'),
        '--json',
      ],
      {
        cwd: directory,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          PATH: process.env.PATH,
          HOME: directory,
          WORKFLOW_LITERAL: 'EXPANSION-MUST-NOT-OCCUR',
          OPENAI_API_KEY: 'dummy-local-env-key',
          OPENAI_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
        },
      }
    );
  const collect = async (child: ReturnType<typeof spawn>) => {
    const timer = setTimeout(() => child.kill(), 15000);
    try {
      const [exit, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { exit, stdout, stderr };
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    directory,
    workflow,
    requests,
    spawn,
    collect,
    run: (...args: string[]) => collect(spawn(...args)),
    saveWorkflow: (value: AgentWorkflow) =>
      writeFile(join(directory, 'workflow.yaml'), stringify(value)),
  };
}

describe('native workflow CLI boundary', () => {
  test('multi-turn authoritative identity, literal YAML, safe record and explicit0600 state export', async () => {
    const f = await fixture((body) =>
      body.messages.some((message) => message.role === 'tool')
        ? completion()
        : completion('', {
            name: 'write_file',
            arguments: { path: 'result.txt', content: 'PRIVATE-OUTPUT' },
          })
    );
    const result = await f.run(
      'run',
      'workflow.yaml',
      '--output',
      'record.json',
      '--state-output',
      'state.json'
    );
    expect(result.exit).toBe(0);
    const record = JSON.parse(result.stdout);
    expect(record.execution).toBe('completed');
    expect(record.taskVerification).toBe('unavailable');
    expect(record.budgets.modelRequests).toBe(2);
    expect(record.budgets.toolCalls).toBe(1);
    expect(f.requests[0].model).toBe('workflow-model');
    expect(f.requests[0].max_tokens).toBe(256);
    expect(JSON.stringify(f.requests)).toContain('${WORKFLOW_LITERAL}');
    expect(JSON.stringify(f.requests)).not.toContain('EXPANSION-MUST-NOT-OCCUR');
    expect(
      f.requests[1].messages.some((message) => message.tool_call_id === 'private-call-id')
    ).toBe(true);
    const saved = await readFile(join(f.directory, 'record.json'), 'utf8');
    expect(JSON.parse(saved)).toEqual(record);
    for (const privateText of [
      'PRIVATE-',
      'private.txt',
      'result.txt',
      'private-call-id',
      'dummy-local-key',
    ])
      expect(saved + result.stdout + result.stderr).not.toContain(privateText);
    expect(
      JSON.parse(await readFile(join(f.directory, 'state.json'), 'utf8')).files['result.txt']
    ).toBe('PRIVATE-OUTPUT');
    expect((await stat(join(f.directory, 'state.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(join(f.directory, 'record.json'))).mode & 0o777).toBe(0o600);
  });
  test('policy path denial and malformed original arguments have distinct exit codes', async () => {
    for (const malformed of [false, true]) {
      const f = await fixture(() =>
        completion('', {
          name: 'write_file',
          arguments: { path: malformed ? 42 : 'forbidden.txt', content: 'PRIVATE' },
        })
      );
      f.workflow.environment.policy.paths = { read: [], write: ['allowed.txt'] };
      await f.saveWorkflow(f.workflow);
      const result = await f.run('run', 'workflow.yaml');
      expect(result.exit).toBe(malformed ? 2 : 4);
      expect(JSON.parse(result.stdout).execution).not.toBe('completed');
      expect(f.requests).toHaveLength(1);
    }
  });
  test('action and token budgets stop continuation; missing usage cannot exit0', async () => {
    for (const mode of ['actions', 'tokens', 'missing'] as const) {
      const f = await fixture(() =>
        completion(
          '',
          { name: 'write_file', arguments: { path: 'result.txt', content: 'PRIVATE' } },
          mode !== 'missing'
        )
      );
      if (mode === 'actions') f.workflow.environment.policy.budgets.max_actions = 1;
      if (mode === 'tokens') f.workflow.environment.policy.budgets.max_tokens = 2;
      await f.saveWorkflow(f.workflow);
      const result = await f.run('run', 'workflow.yaml');
      expect(result.exit).toBe(mode === 'missing' ? 7 : 5);
      expect(f.requests).toHaveLength(1);
      expect(JSON.parse(result.stdout).taskVerification).toBe('unavailable');
    }
  });
  test('preflight only uses challenge protocol, no fixture read or user turns, unavailable state export reported', async () => {
    const f = await fixture((body) => {
      const nonce = body.tools[0].function.parameters.properties.nonce?.const ?? '';
      return body.messages.some((message) => message.role === 'tool')
        ? completion(nonce)
        : completion('', { name: 'artemis_probe', arguments: { nonce } });
    });
    f.workflow.workflow.initial_state = 'does-not-exist.json';
    await f.saveWorkflow(f.workflow);
    const result = await f.run(
      'preflight',
      'workflow.yaml',
      '--output',
      'record.json',
      '--state-output',
      'state.json'
    );
    expect(result.exit).toBe(1);
    expect(JSON.parse(result.stdout).capability.preflight).toBe('passed');
    expect(f.requests).toHaveLength(2);
    expect(JSON.stringify(f.requests)).not.toContain('PRIVATE-PROMPT');
    expect(result.stderr).toContain('state is unavailable');
    expect(await readdir(f.directory)).not.toContain('state.json');
    expect(JSON.parse(await readFile(join(f.directory, 'record.json'), 'utf8')).execution).toBe(
      'completed'
    );
  });
  test('preflight success exits0; static offline validation never calls provider', async () => {
    const f = await fixture((body) => {
      const nonce = body.tools[0].function.parameters.properties.nonce?.const ?? '';
      return body.messages.some((message) => message.role === 'tool')
        ? completion(nonce)
        : completion('', { name: 'artemis_probe', arguments: { nonce } });
    });
    expect((await f.run('preflight', 'workflow.yaml')).exit).toBe(0);
    const child = Bun.spawn(
      [process.execPath, cli, 'scenario', 'validate', 'workflow.yaml', '--json'],
      { cwd: f.directory, stdout: 'pipe', stderr: 'pipe' }
    );
    expect((await f.collect(child)).exit).toBe(0);
    expect(f.requests).toHaveLength(2);
  });
  test('refuses existing outputs, aliases and colliding record/state before provider calls', async () => {
    const f = await fixture(() => completion());
    await writeFile(join(f.directory, 'owned.json'), 'KEEP');
    await symlink('owned.json', join(f.directory, 'alias.json'));
    for (const args of [
      ['--output', 'owned.json'],
      ['--state-output', 'alias.json'],
      ['--output', 'new.json', '--state-output', './new.json'],
      ['--output', 'reserved.json', '--state-output', 'owned.json'],
    ]) {
      expect((await f.run('run', 'workflow.yaml', ...args)).exit).toBe(1);
    }
    expect(await readFile(join(f.directory, 'owned.json'), 'utf8')).toBe('KEEP');
    expect(await readdir(f.directory)).not.toContain('reserved.json');
    expect(f.requests).toHaveLength(0);
  });
  test('timeout and SIGINT save interrupted metadata and do not retry provider calls', async () => {
    for (const cancellation of [false, true]) {
      let requested!: () => void;
      const seen = new Promise<void>((done) => {
        requested = done;
      });
      const f = await fixture(async () => {
        requested();
        await new Promise((done) => setTimeout(done, 800));
        return completion();
      });
      if (!cancellation) {
        f.workflow.environment.policy.budgets.timeout_ms = 150;
        await f.saveWorkflow(f.workflow);
      }
      const child = f.spawn('run', 'workflow.yaml', '--output', 'record.json');
      await seen;
      if (cancellation) child.kill('SIGINT');
      const result = await f.collect(child);
      expect(result.exit).toBe(cancellation ? 130 : 6);
      expect(JSON.parse(await readFile(join(f.directory, 'record.json'), 'utf8')).execution).toBe(
        cancellation ? 'cancelled' : 'timeout'
      );
      expect(f.requests).toHaveLength(1);
    }
  });
  test('provider failures are sanitized and configured retries cannot multiply requests', async () => {
    const f = await fixture(() =>
      Response.json({ error: { message: 'PRIVATE-UPSTREAM-ERROR' } }, { status: 500 })
    );
    const result = await f.run('run', 'workflow.yaml', '--output', 'record.json');
    expect(result.exit).toBe(7);
    expect(f.requests).toHaveLength(1);
    expect(result.stdout + result.stderr).not.toContain('PRIVATE-UPSTREAM-ERROR');
  });
  test('an explicitly missing config cannot fall back to environment credentials', async () => {
    const f = await fixture(() => completion());
    await unlink(join(f.directory, 'config.yaml'));
    const result = await f.run('run', 'workflow.yaml');
    expect(result.exit).toBe(1);
    expect(f.requests).toHaveLength(0);
  });
  test('listeners are removed on setup failure and authoring preserves explicit new limits', async () => {
    const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')];
    await createCLI().parseAsync([
      'bun',
      'akit',
      'workflow',
      'run',
      '/nonexistent/fixture-workflow.yaml',
    ]);
    expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(before);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    const workflow = buildAgentWorkflow({
      environment: 'sandbox',
      maxTokens: '123',
      maxOutputTokens: '45',
      maxModelRequests: '3',
      readPaths: 'a.txt,b.txt',
      writePaths: 'c.txt',
    });
    expect(workflow.environment.type).toBe('sandbox');
    expect(workflow.target.generation?.max_tokens).toBe(45);
    expect(workflow.environment.policy.budgets).toMatchObject({
      max_tokens: 123,
      max_model_requests: 3,
    });
    expect(workflow.environment.policy.paths).toEqual({
      read: ['a.txt', 'b.txt'],
      write: ['c.txt'],
    });
    expect(buildAgentWorkflow({}).environment.policy.budgets.max_tokens).toBe(4096);
  });
});
