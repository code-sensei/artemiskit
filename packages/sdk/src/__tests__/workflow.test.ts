import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AgentTarget,
  type AgentWorkflow,
  type AgentWorkflowEvent,
  createSimulatedWorkflowEnvironment,
  validateAgentWorkflow,
} from '@artemiskit/core';
import { OpenAIAdapter } from '../../../adapters/openai/src/client';
import { ArtemisKit } from '../artemiskit';
import type { WorkflowRunOptions } from '../types-only';

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});
function workflow(): AgentWorkflow {
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'sdk-workflow',
    target: {
      provider: 'openai',
      model: 'workflow-authoritative',
      generation: { max_tokens: 256 },
    },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions: { files: 'write' },
        budgets: { max_actions: 10, max_tokens: 4096, timeout_ms: 1000 },
      },
    },
    tools: ['write_file'],
    workflow: {
      system_instructions: 'PRIVATE-INSTRUCTIONS',
      initial_state: { files: {} },
      turns: [{ role: 'user', content: 'PRIVATE-PROMPT' }],
    },
    outcomes: { deterministic: [{ type: 'file', path: 'result.txt', exists: true }] },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}
function target(): AgentTarget {
  return {
    provider: 'custom',
    capabilities: async () => ({ status: 'available', toolUse: true, transportCancellation: true }),
    turn: async () => ({
      status: 'completed',
      id: 'fixture',
      model: 'fixture',
      message: { role: 'assistant', content: 'PRIVATE-ANSWER' },
      tokens: { prompt: 2, completion: 1, total: 3 },
      latencyMs: 1,
    }),
  };
}

describe('SDK native workflow session', () => {
  test('configured adapter uses workflow identity and zero retries with real loopback multi-turn execution', async () => {
    const bodies: Record<string, unknown>[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        bodies.push(await request.json());
        const first = bodies.length === 1;
        return Response.json({
          id: 'fixture',
          model: 'observed-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: first ? null : 'PRIVATE-ANSWER',
                ...(first
                  ? {
                      tool_calls: [
                        {
                          id: 'private-id',
                          type: 'function',
                          function: {
                            name: 'write_file',
                            arguments: '{"path":"result.txt","content":"PRIVATE-STATE"}',
                          },
                        },
                      ],
                    }
                  : {}),
              },
              finish_reason: first ? 'tool_calls' : 'stop',
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        });
      },
    });
    servers.push(server);
    // Legacy SDK tests mock the core factory globally; qualify the real public boundary in a fresh process.
    const directory = await mkdtemp(join(tmpdir(), 'artemis-sdk-client-'));
    const workflowPath = join(directory, 'workflow.json');
    await writeFile(workflowPath, JSON.stringify(workflow()));
    const child = Bun.spawn(
      [
        process.execPath,
        '-e',
        `
      import { ArtemisKit } from ${JSON.stringify(fileURLToPath(new URL('../artemiskit.ts', import.meta.url)))};
      import { registerAdapter } from '@artemiskit/core';
      import { OpenAIAdapter } from '@artemiskit/adapter-openai';
      import assert from 'node:assert/strict';
      registerAdapter('openai', async (config) => {
        assert.equal(config.provider, 'openai');
        assert.equal(config.defaultModel, 'workflow-authoritative');
        assert.equal(config.maxRetries, 0);
        return new OpenAIAdapter(config);
      });
      const kit = new ArtemisKit({ provider: 'anthropic', model: 'wrong', providerConfig: {
        provider: 'openai', defaultModel: 'wrong-config', apiKey: 'dummy-only',
        baseUrl: ${JSON.stringify(`http://127.0.0.1:${server.port}/v1`)}, maxRetries: 9,
      }});
      const events = [];
      const result = await kit.runWorkflow({ workflow: ${JSON.stringify(workflowPath)}, onEvent: (event) => events.push(event) });
      console.log(JSON.stringify({ result, events }));
    `,
      ],
      {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { PATH: process.env.PATH },
      }
    );
    const timer = setTimeout(() => child.kill(), 10000);
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    clearTimeout(timer);
    expect({ exit, stderr }).toEqual({ exit: 0, stderr: '' });
    const { result, events } = JSON.parse(stdout);
    expect(bodies[0].model).toBe('workflow-authoritative');
    expect(result.record.execution).toBe('completed');
    expect(result.record.taskVerification).toBe('unavailable');
    expect(result.record.budgets).toMatchObject({ modelRequests: 2, toolCalls: 1 });
    expect(result.state?.files).toEqual({ 'result.txt': 'PRIVATE-STATE' });
    expect(JSON.stringify(result.record)).not.toContain('PRIVATE-');
    expect(events.some((event) => event.type === 'tool_completed')).toBe(true);
  });
  test('file fixture roots, session events and environment overrides use the same engine without persistence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'artemis-sdk-workflow-'));
    const scenario = workflow();
    scenario.workflow.initial_state = 'fixture.json';
    await writeFile(join(directory, 'fixture.json'), '{"files":{"initial.txt":"PRIVATE"}}');
    await writeFile(join(directory, 'workflow.json'), JSON.stringify(scenario));
    let factories = 0;
    const options: WorkflowRunOptions = {
      workflow: join(directory, 'workflow.json'),
      target: target(),
      environmentFactory: async (args) => {
        factories++;
        return createSimulatedWorkflowEnvironment(args);
      },
    };
    const session = await new ArtemisKit().createWorkflowSession(options);
    expect(session.state).toBe('idle');
    expect(factories).toBe(0);
    const stream = (async () => {
      const events: AgentWorkflowEvent[] = [];
      for await (const event of session.events()) events.push(event);
      return events;
    })();
    const result = await session.run();
    expect(session.state).toBe('completed');
    expect(result.state?.files).toEqual({ 'initial.txt': 'PRIVATE' });
    expect(factories).toBe(1);
    expect((await stream).at(-1)?.type).toBe('finished');
    expect((await readdir(directory)).sort()).toEqual(['fixture.json', 'workflow.json']);
  });
  test('supports explicit client, rejects client+target and custom unsupported capabilities', async () => {
    const unsupported = target();
    unsupported.capabilities = async () => ({
      status: 'available',
      toolUse: false,
      transportCancellation: false,
    });
    const kit = new ArtemisKit();
    const client = new OpenAIAdapter({
      provider: 'openai',
      apiKey: 'dummy-only',
      baseUrl: 'http://127.0.0.1:1',
      maxRetries: 0,
    });
    await expect(
      kit.createWorkflowSession({ workflow: workflow(), client, target: unsupported })
    ).rejects.toThrow('client or target');
    expect(
      (await kit.runWorkflow({ workflow: workflow(), target: unsupported })).record.execution
    ).toBe('unsupported');
    const aborted = new AbortController();
    aborted.abort();
    expect(
      (await kit.runWorkflow({ workflow: workflow(), client, signal: aborted.signal })).record
        .execution
    ).toBe('cancelled');
  });
  test('cancellation and all SDK engine options stay host controlled', async () => {
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const custom = target();
    custom.turn = async (_request, signal) => {
      resolveStarted();
      await new Promise<void>((resolve) =>
        signal?.addEventListener('abort', () => resolve(), { once: true })
      );
      return { status: 'error', code: 'aborted' };
    };
    const session = await new ArtemisKit().createWorkflowSession({
      workflow: workflow(),
      target: custom,
      cleanupTimeoutMs: 20,
    });
    const result = session.run();
    await started;
    session.cancel();
    expect((await result).record.execution).toBe('cancelled');
    expect(session.state).toBe('completed');
  });
});
