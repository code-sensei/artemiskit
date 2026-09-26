import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AgentWorkflowRecord, readWorkflowRecord } from '@artemiskit/core';
import { stringify } from 'yaml';
import { buildAgentWorkflow } from '../../commands/agent-workflow';
import { workflowExitCode } from '../../commands/workflow';

const cli = fileURLToPath(new URL('../../../bin/artemis.ts', import.meta.url));
const judgeUtility = fileURLToPath(new URL('../../utils/workflow-judge.ts', import.meta.url));
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});
type Body = {
  model: string;
  max_tokens?: number;
  tools?: unknown[];
  messages: { role: string; content: string }[];
  response_format?: { type: string };
};
const limits = { maxRequests: 2, maxTokens: 100, maxOutputTokens: 10, timeoutMs: 2000 };
function completion(text: string, usage = true) {
  return Response.json({
    id: 'fixture',
    model: 'observed',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    ...(usage ? { usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } } : {}),
  });
}
async function collect(child: ReturnType<typeof Bun.spawn>) {
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
}
async function fixture(
  judgeResponse: (body: Body) => Response | Promise<Response> = () =>
    completion('{"verdict":"pass"}')
) {
  const directory = await mkdtemp(join(tmpdir(), 'artemis-outcomes-cli-'));
  const targetRequests: Body[] = [];
  const judgeRequests: Body[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as Body;
      if (new URL(request.url).pathname.startsWith('/judge/')) {
        judgeRequests.push(body);
        return judgeResponse(body);
      }
      targetRequests.push(body);
      return completion('PRIVATE-TARGET-ANSWER');
    },
  });
  servers.push(server);
  const workflow = buildAgentWorkflow({
    provider: 'openai',
    model: 'target-model',
    tools: 'write_file',
    prompt: 'PRIVATE-TASK',
  });
  workflow.outcomes.deterministic = [{ type: 'file', path: 'absent.txt', exists: false }];
  workflow.outcomes.semantic = [
    { type: 'llm_judge', mode: 'strict_assurance', rubric: 'PRIVATE-RUBRIC' },
  ];
  const targetConfig = {
    providers: {
      openai: {
        apiKey: 'dummy-target',
        baseUrl: `http://127.0.0.1:${server.port}/target`,
        maxRetries: 5,
      },
    },
  };
  const judgeConfig = {
    provider: 'ling',
    model: 'judge-model',
    workflowJudge: limits,
    providers: {
      ling: {
        apiKey: 'dummy-judge',
        baseUrl: `http://127.0.0.1:${server.port}/judge`,
        defaultModel: 'wrong',
        maxRetries: 5,
      },
    },
  };
  await writeFile(join(directory, 'workflow.yaml'), stringify(workflow));
  await writeFile(join(directory, 'target.yaml'), stringify(targetConfig));
  await writeFile(join(directory, 'judge.yaml'), stringify(judgeConfig));
  const spawn = (...args: string[]) =>
    Bun.spawn([process.execPath, cli, 'workflow', ...args], {
      cwd: directory,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { PATH: process.env.PATH, HOME: directory },
    });
  const run = (...extra: string[]) =>
    collect(spawn('run', 'workflow.yaml', '--config', 'target.yaml', '--json', ...extra));
  const saveWorkflow = () => writeFile(join(directory, 'workflow.yaml'), stringify(workflow));
  const saveJudge = (value: unknown) => writeFile(join(directory, 'judge.yaml'), stringify(value));
  return {
    directory,
    workflow,
    judgeConfig,
    targetConfig,
    targetRequests,
    judgeRequests,
    spawn,
    run,
    saveWorkflow,
    saveJudge,
  };
}

describe('workflow outcome CLI composition', () => {
  test('separate explicit provider/model and budgets produce identical saved/printed core evidence', async () => {
    const f = await fixture();
    const result = await f.run('--judge-config', 'judge.yaml', '--output', 'record.json');
    expect(result.exit).toBe(0);
    const record = JSON.parse(result.stdout) as AgentWorkflowRecord;
    expect(record.taskVerification).toBe('passed');
    expect(record.outcomes.semantic.judge?.requested.provider.display).toBe('ling');
    expect(record.usage.reported.total).toBe(4);
    expect(record.outcomes.semantic.usage.reported.total).toBe(4);
    expect(record.outcomes.semantic.budgets.limits).toEqual(limits);
    expect(f.targetRequests[0].model).toBe('target-model');
    expect(f.judgeRequests[0]).toMatchObject({
      model: 'judge-model',
      max_tokens: 10,
      response_format: { type: 'json_object' },
    });
    expect(f.judgeRequests[0].tools).toBeUndefined();
    expect(f.targetRequests).toHaveLength(1);
    expect(f.judgeRequests).toHaveLength(1);
    expect(JSON.parse(await readFile(join(f.directory, 'record.json'), 'utf8'))).toEqual(record);
    expect(readWorkflowRecord(record)).toEqual(record);
    expect(result.stdout + result.stderr).not.toContain('PRIVATE-');
    expect(result.stdout + result.stderr).not.toContain('dummy-');
  });
  test('valid semantic failure exits8, malformed and missing measurements exit9 with target complete', async () => {
    for (const mode of ['fail', 'malformed', 'missing', 'error']) {
      const f = await fixture(() =>
        mode === 'error'
          ? Response.json({ error: { message: 'PRIVATE-UPSTREAM' } }, { status: 500 })
          : completion(
              mode === 'malformed'
                ? 'PRIVATE-NOT-JSON'
                : JSON.stringify({ verdict: mode === 'fail' ? 'fail' : 'pass' }),
              mode !== 'missing'
            )
      );
      const result = await f.run('--judge-config', 'judge.yaml');
      expect(result.exit).toBe(mode === 'fail' ? 8 : 9);
      const record = JSON.parse(result.stdout);
      expect(record.execution).toBe('completed');
      expect(record.taskVerification).toBe(
        mode === 'fail' ? 'failed' : mode === 'malformed' ? 'invalid' : 'unavailable'
      );
      expect(f.targetRequests).toHaveLength(1);
      expect(f.judgeRequests).toHaveLength(1);
      expect(result.stdout + result.stderr).not.toContain('PRIVATE-');
    }
  }, 15000);
  test('no flag never authorizes a judge, even if default target config includes judge settings', async () => {
    const f = await fixture();
    await writeFile(
      join(f.directory, 'target.yaml'),
      stringify({
        ...f.judgeConfig,
        providers: { ...f.judgeConfig.providers, ...f.targetConfig.providers },
      })
    );
    const result = await f.run();
    expect(result.exit).toBe(9);
    const record = JSON.parse(result.stdout);
    expect(record.outcomes.semantic.assertions[0].reason).toBe('judge_not_configured');
    expect(f.targetRequests).toHaveLength(1);
    expect(f.judgeRequests).toHaveLength(0);
  });
  test('deterministic failure exits8 and undeclared semantics pass without initializing judge', async () => {
    for (const failed of [true, false]) {
      const f = await fixture();
      if (failed)
        f.workflow.outcomes.deterministic = [{ type: 'file', path: 'absent.txt', exists: true }];
      else f.workflow.outcomes.semantic = [];
      await f.saveWorkflow();
      // This known factory fails if initialized because no runnable can be supplied by YAML.
      await f.saveJudge({ provider: 'langchain', model: 'judge', workflowJudge: limits });
      const result = await f.run('--judge-config', 'judge.yaml');
      expect(result.exit).toBe(failed ? 8 : 0);
      expect(JSON.parse(result.stdout).taskVerification).toBe(failed ? 'failed' : 'passed');
      expect(f.judgeRequests).toHaveLength(0);
    }
  });
  test('lazy factory failure retains complete target evidence as evaluation unavailable', async () => {
    const f = await fixture();
    await f.saveJudge({ provider: 'langchain', model: 'judge', workflowJudge: limits });
    const result = await f.run('--judge-config', 'judge.yaml');
    expect(result.exit).toBe(9);
    expect(JSON.parse(result.stdout).execution).toBe('completed');
    expect(JSON.parse(result.stdout).outcomes.semantic.assertions[0].reason).toBe(
      'unsupported_capability'
    );
    expect(f.targetRequests).toHaveLength(1);
    expect(result.stdout + result.stderr).not.toContain('runnable');
  });
  test('missing, malformed and unsupported judge configuration fail before target spending', async () => {
    const f = await fixture();
    const configurations = [
      { ...f.judgeConfig, provider: undefined },
      { ...f.judgeConfig, model: '' },
      { ...f.judgeConfig, workflowJudge: undefined },
      ...Object.entries({
        maxRequests: 21,
        maxTokens: 1000001,
        maxOutputTokens: 100001,
        timeoutMs: 60001,
      }).map(([key, value]) => ({ ...f.judgeConfig, workflowJudge: { ...limits, [key]: value } })),
      { ...f.judgeConfig, workflowJudge: { ...limits, extra: true } },
      { ...f.judgeConfig, workflowJudge: { ...limits, maxRequests: 0 } },
      { ...f.judgeConfig, workflowJudge: { ...limits, maxRequests: 1.5 } },
    ];
    for (const config of configurations) {
      await f.saveJudge(config);
      expect((await f.run('--judge-config', 'judge.yaml')).exit).toBe(2);
    }
    await f.saveJudge({ ...f.judgeConfig, provider: 'PRIVATE-UNKNOWN-PROVIDER' });
    const unknown = await f.run('--judge-config', 'judge.yaml');
    expect(unknown.exit).toBe(3);
    expect(unknown.stdout + unknown.stderr).not.toContain('PRIVATE-');
    expect((await f.run('--judge-config', 'missing.yaml')).exit).toBe(1);
    expect((await f.run('--judge-config', '')).exit).toBe(2);
    expect((await f.run('--judge-config', '   ')).exit).toBe(2);
    expect(f.targetRequests).toHaveLength(0);
    expect(f.judgeRequests).toHaveLength(0);
  }, 30000);
  test('preflight rejects the judge flag without initializing either model', async () => {
    const f = await fixture();
    const result = await collect(
      f.spawn(
        'preflight',
        'workflow.yaml',
        '--judge-config',
        'judge.yaml',
        '--config',
        'target.yaml'
      )
    );
    expect(result.exit).not.toBe(0);
    expect(f.targetRequests).toHaveLength(0);
    expect(f.judgeRequests).toHaveLength(0);
  });
  test('console reports actual task reason, assertion coverage and separate judge measurement', async () => {
    const f = await fixture();
    const result = await collect(
      f.spawn('run', 'workflow.yaml', '--config', 'target.yaml', '--judge-config', 'judge.yaml')
    );
    expect(result.exit).toBe(0);
    expect(result.stdout).toContain('Task verification: passed (verified)');
    expect(result.stdout).toContain('Deterministic coverage: 1/1 valid; 1 passed');
    expect(result.stdout).toContain('Semantic coverage: 1/1 valid; 1 passed');
    expect(result.stdout).toContain('Judge usage: reported; 4 reported tokens; 1 requests');
    expect(result.stdout + result.stderr).not.toContain('PRIVATE-');
  });
  test('SIGINT during semantic evaluation exits130 and preserves completed target evidence', async () => {
    let started!: () => void;
    const seen = new Promise<void>((resolve) => {
      started = resolve;
    });
    const f = await fixture(async () => {
      started();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return completion('{"verdict":"pass"}');
    });
    const child = f.spawn(
      'run',
      'workflow.yaml',
      '--config',
      'target.yaml',
      '--judge-config',
      'judge.yaml',
      '--json',
      '--output',
      'cancelled.json'
    );
    await seen;
    child.kill('SIGINT');
    const result = await collect(child);
    expect(result.exit).toBe(130);
    const record = JSON.parse(result.stdout);
    expect(record.execution).toBe('completed');
    expect(record.outcomes.cancelled).toBe(true);
    expect(record.taskVerification).toBe('unavailable');
    expect(JSON.parse(await readFile(join(f.directory, 'cancelled.json'), 'utf8'))).toEqual(record);
    expect(f.targetRequests).toHaveLength(1);
    expect(f.judgeRequests).toHaveLength(1);
  });
  test('runtime and policy exit precedence remains stronger than task scoring', async () => {
    const f = await fixture();
    const { stdout } = await f.run('--judge-config', 'judge.yaml');
    const record: AgentWorkflowRecord = JSON.parse(stdout);
    for (const [execution, code] of [
      ['invalid', 2],
      ['unsupported', 3],
      ['budget_exceeded', 5],
      ['timeout', 6],
      ['failed', 7],
      ['cancelled', 130],
    ] as const)
      expect(
        workflowExitCode({
          ...record,
          execution,
          outcomes: { ...record.outcomes, cancelled: true },
        })
      ).toBe(code);
    expect(
      workflowExitCode({
        ...record,
        policy: 'denied',
        outcomes: { ...record.outcomes, cancelled: true },
      })
    ).toBe(4);
    expect(workflowExitCode({ ...record, reason: 'usage_unavailable' })).toBe(7);
  });
  test('lazy wrapper preserves capability data and rejects changing underlying provider identity', async () => {
    const f = await fixture();
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `
      import assert from 'node:assert/strict';
      import { registerAdapter, loadAgentWorkflow, runAgentWorkflow } from '@artemiskit/core';
      import { prepareWorkflowJudge } from ${JSON.stringify(judgeUtility)};
      const workflow = await loadAgentWorkflow(${JSON.stringify(join(f.directory, 'workflow.yaml'))});
      const results = [];
      for (const mode of ['partial', 'changed', 'error', 'valid']) {
        let initialized = 0, generated = 0;
        registerAdapter('ling', async (config) => {
          initialized++;
          assert.equal(config.maxRetries, 0); assert.equal(config.defaultModel, 'judge-model');
          const client = { provider: 'ling', capabilities: async () => {
            if (mode === 'error') throw new Error('PRIVATE-CAPABILITY');
            if (mode === 'changed') client.provider = 'other';
            return mode === 'partial' ? { jsonMode: true } : { streaming: false, functionCalling: false, toolUse: false, maxContext: 1000, jsonMode: false };
          }, generate: async (request) => { generated++; assert.equal(request.responseFormat, undefined); return { id: 'judge', model: 'judge-model', text: '{"verdict":"pass"}', tokens: { prompt: 1, completion: 1, total: 2 }, latencyMs: 1 }; } };
          return client;
        });
        const semanticJudge = await prepareWorkflowJudge(${JSON.stringify(join(f.directory, 'judge.yaml'))});
        assert.equal(initialized, 0);
        const result = await runAgentWorkflow({ workflow, semanticJudge, target: { provider: 'openai', capabilities: async () => ({ status: 'available', toolUse: true, transportCancellation: true }), turn: async () => ({ status: 'completed', id: 'target', model: 'target', message: { role: 'assistant', content: 'done' }, tokens: { prompt: 1, completion: 1, total: 2 }, latencyMs: 1 }) } });
        assert.equal(initialized, 1); assert.equal(generated, mode === 'valid' ? 1 : 0);
        assert.equal(result.record.taskVerification, mode === 'valid' ? 'passed' : 'unavailable');
        results.push(result.record);
      }
      console.log(JSON.stringify(results));
    `,
      ],
      {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { PATH: process.env.PATH },
      }
    );
    const result = await collect(child);
    expect({ exit: result.exit, stderr: result.stderr }).toEqual({ exit: 0, stderr: '' });
    expect(result.stdout).not.toContain('PRIVATE-');
    expect(JSON.parse(result.stdout)).toHaveLength(4);
    expect(f.targetRequests).toHaveLength(0);
    expect(f.judgeRequests).toHaveLength(0);
  });
});
