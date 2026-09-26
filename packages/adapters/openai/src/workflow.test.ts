import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { validateAgentWorkflow } from '../../../core/src/agent-workflow/parser';
import {
  createAgentWorkflowSession,
  runAgentWorkflow,
} from '../../../core/src/agent-workflow/session';
import { createModelClientTarget } from '../../../core/src/agent-workflow/target';
import { LingAdapter } from '../../ling/src/client';
import { OpenAIAdapter } from './client';

function workflow(provider: string) {
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'transport',
    target: { provider, model: 'fixture-model' },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions: { files: 'read' },
        paths: { read: ['allowed.txt'], write: [] },
        budgets: { max_actions: 10, timeout_ms: 2000, max_tokens: 100 },
      },
    },
    tools: ['read_file'],
    workflow: {
      system_instructions: 'Read allowed.txt.',
      initial_state: { files: { 'allowed.txt': 'fixture' } },
      turns: [{ role: 'user', content: 'Read.' }],
    },
    outcomes: {
      deterministic: [{ type: 'policy', rule: 'permissions_respected', expected: 'passed' }],
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}
function response(tool?: { name: string; args: string }) {
  return {
    id: 'fixture-response',
    model: 'fixture-model',
    choices: [
      {
        index: 0,
        finish_reason: tool ? 'tool_calls' : 'stop',
        message: {
          role: 'assistant',
          content: tool ? null : 'done',
          ...(tool
            ? {
                tool_calls: [
                  {
                    id: 'private-call-id',
                    type: 'function',
                    function: { name: tool.name, arguments: tool.args },
                  },
                ],
              }
            : {}),
        },
      },
    ],
    usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
  };
}
async function server(
  handler: (
    body: Record<string, unknown>,
    response: ServerResponse,
    request: IncomingMessage
  ) => void
) {
  const http = createServer(async (request, response) => {
    const parts = [];
    for await (const part of request) parts.push(part);
    handler(JSON.parse(Buffer.concat(parts).toString('utf8')), response, request);
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('local server unavailable');
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    async close() {
      const closing = new Promise<void>((resolve) => http.close(() => resolve()));
      http.closeAllConnections();
      await closing;
    },
  };
}
// Bun's node:http ServerResponse does not reliably emit close on client abort.
// A separate Node observer measures the actual socket while the Bun client stays alive.
async function abortObserver() {
  let ready: (url: string) => void = () => {};
  let started: () => void = () => {};
  let disconnected: () => void = () => {};
  const url = new Promise<string>((resolve) => {
    ready = resolve;
  });
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const closed = new Promise<void>((resolve) => {
    disconnected = resolve;
  });
  let requests = 0;
  const child = spawn(
    'node',
    [
      '--input-type=module',
      '-e',
      `
    import {createServer} from 'node:http';
    const server=createServer(async(req,res)=>{
      for await(const chunk of req) {}
      req.socket.once('close',()=>console.log('closed'));
      console.log('started');
    });
    server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/v1'));
    setTimeout(()=>process.exit(1),10000).unref();
  `,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  );
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let end = buffer.indexOf('\n');
    while (end !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line.startsWith('http://127.0.0.1:')) ready(line);
      if (line === 'started') {
        requests++;
        started();
      }
      if (line === 'closed') disconnected();
      end = buffer.indexOf('\n');
    }
  });
  async function bounded<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Node socket observer timed out')), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function close() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exit = once(child, 'exit');
    child.kill('SIGTERM');
    await bounded(exit);
  }
  try {
    return {
      url: await bounded(url),
      began: () => bounded(began),
      closed: () => bounded(closed),
      requests: () => requests,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
function json(res: ServerResponse, value: unknown) {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(value));
}

for (const provider of ['openai', 'ling'] as const)
  describe(`${provider} real workflow transport`, () => {
    function client(url: string) {
      const config = {
        provider,
        apiKey: 'fixture-only',
        baseUrl: url,
        maxRetries: 2,
        timeout: 2000,
      };
      return provider === 'openai' ? new OpenAIAdapter(config) : new LingAdapter(config);
    }
    test('sends tools and correlated results across real HTTP continuation', async () => {
      const bodies: Record<string, unknown>[] = [];
      const host = await server((body, res) => {
        bodies.push(body);
        json(
          res,
          bodies.length === 1
            ? response({ name: 'read_file', args: '{"path":"allowed.txt"}' })
            : response()
        );
      });
      try {
        const result = await runAgentWorkflow({
          workflow: workflow(provider),
          target: createModelClientTarget(client(host.url)),
        });
        expect(result.record.execution).toBe('completed');
        expect(result.record.capability.transportCancellation).toBe(true);
        expect(result.record.usage.reported.total).toBe(6);
        expect((bodies[1].messages as Record<string, unknown>[]).at(-1)).toMatchObject({
          role: 'tool',
          tool_call_id: 'private-call-id',
        });
      } finally {
        await host.close();
      }
    });
    test.each(['undeclared', 'path'] as const)(
      'denies %s calls through the actual adapter',
      async (kind) => {
        let count = 0;
        const host = await server((_, res) => {
          count++;
          json(
            res,
            response(
              kind === 'undeclared'
                ? { name: 'send_email', args: '{}' }
                : { name: 'read_file', args: '{"path":"private.txt"}' }
            )
          );
        });
        try {
          const result = await runAgentWorkflow({
            workflow: workflow(provider),
            target: createModelClientTarget(client(host.url)),
          });
          expect(result.record.policy).toBe('denied');
          expect(result.record.reason).toBe('policy_denied');
          expect(count).toBe(1);
          expect(
            result.record.events.some(
              (event) =>
                event.type === 'tool_completed' &&
                event.status === 'denied' &&
                event.requestedCallIdHash?.length === 64
            )
          ).toBe(true);
          expect(JSON.stringify(result.record)).not.toContain('private-call-id');
          expect(result.record.usage.reported.total).toBe(3);
        } finally {
          await host.close();
        }
      }
    );
    test('aborts an in-flight HTTP request and does not retry', async () => {
      const host = await abortObserver();
      try {
        const session = createAgentWorkflowSession({
          workflow: workflow(provider),
          target: createModelClientTarget(client(host.url)),
          cleanupTimeoutMs: 300,
        });
        const running = session.run();
        await host.began();
        session.cancel();
        const result = await running;
        await host.closed();
        expect(result.record.execution).toBe('cancelled');
        expect(host.requests()).toBe(1);
        expect(result.record.usage.missingRequests).toBe(1);
        expect(result.record.cleanup.pendingOperations).toBe(0);
      } finally {
        await host.close();
      }
    });
    test('request host disables configured provider retries', async () => {
      let requests = 0;
      const host = await server((_, res) => {
        requests++;
        res.statusCode = 500;
        json(res, { error: { message: 'fixture failure' } });
      });
      try {
        const result = await runAgentWorkflow({
          workflow: workflow(provider),
          target: createModelClientTarget(client(host.url)),
        });
        expect(result.record.execution).toBe('failed');
        expect(requests).toBe(1);
        expect(result.record.usage.status).toBe('unavailable');
      } finally {
        await host.close();
      }
    });
  });
