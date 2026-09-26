import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import * as core from '@artemiskit/core';
import * as sdk from '@artemiskit/sdk';

// These are public package imports, resolved inside a fresh tarball installation.
for (const name of [
  '@artemiskit/redteam',
  '@artemiskit/reports',
  ...['openai', 'ling', 'anthropic', 'langchain', 'deepagents', 'vercel-ai', 'trueforge'].map(
    (adapter) => `@artemiskit/adapter-${adapter}`
  ),
  ...['matchers', 'vitest', 'jest', 'builders', 'contracts', 'utils'].map(
    (subpath) => `@artemiskit/sdk/${subpath}`
  ),
]) {
  assert.ok(Object.keys(await import(name)).length > 0, name);
}
assert.equal(core.listWorkflowTools().length, 12);
assert.equal(sdk.listWorkflowTools().length, 12);
assert.equal(core.createModelClientTarget, sdk.createModelClientTarget);
assert.ok(new sdk.ArtemisKit());

const workflow = await sdk.loadAgentWorkflow('./workflow.yaml');
writeFileSync('cli-workflow-base.json', JSON.stringify(workflow));
const state = { workflow_state: {} };
const result = sdk.executeSimulatedTool({
  tool: 'request_approval',
  input: { reason: 'Packed consumer review' },
  state,
  declaredTools: workflow.tools,
  policy: workflow.environment.policy,
});
assert.equal(result.status, 'succeeded');
assert.equal(result.state.workflow_state.approvals.status, 'pending');
assert.deepEqual(state, { workflow_state: {} });
const denied = sdk.executeSimulatedTool({
  tool: 'request_approval',
  input: { reason: 'Must not mutate' },
  state,
  declaredTools: workflow.tools,
  policy: { ...workflow.environment.policy, permissions: {} },
});
assert.equal(denied.code, 'permission_denied');
assert.throws(() => sdk.validateAgentWorkflow({ ...workflow, version: 'unsupported' }));

// Exercise the actual installed OpenAI and Ling adapters against an owned loopback fixture.
// No provider credentials, external inference, or model-generated substitutes.
const requests = [];
const server = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  requests.push(body);
  const continued = body.messages.some((message) => message.role === 'tool');
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      id: 'fixture-completion',
      object: 'chat.completion',
      created: 1,
      model: body.model,
      choices: [
        {
          index: 0,
          finish_reason: continued ? 'stop' : 'tool_calls',
          message: continued
            ? { role: 'assistant', content: 'Approval requested.' }
            : {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'fixture-call',
                    type: 'function',
                    function: {
                      name: 'request_approval',
                      arguments: JSON.stringify({ reason: 'Packed consumer review' }),
                    },
                  },
                ],
              },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })
  );
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  for (const provider of ['openai', 'ling']) {
    const adapter = await core.createAdapter({
      provider,
      apiKey: 'offline-fixture-only',
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
      defaultModel: provider === 'ling' ? 'Ling-3.0-flash' : 'gpt-4o-mini',
      timeout: 2000,
      maxRetries: 0,
    });
    const target = sdk.createModelClientTarget(adapter);
    const descriptor = sdk.getWorkflowTool('request_approval');
    const request = {
      messages: [{ role: 'user', content: 'Request approval.' }],
      tools: [
        {
          type: 'function',
          function: { name: descriptor.id, parameters: descriptor.inputSchema },
        },
      ],
      generation: { maxTokens: 50 },
      budgets: { timeoutMs: 3000, maxToolCalls: 1 },
    };
    const first = await target.turn(request);
    assert.equal(first.status, 'completed', provider);
    assert.equal(first.message.tool_calls[0].id, 'fixture-call');
    const second = await target.turn({
      ...request,
      messages: [
        ...request.messages,
        first.message,
        { role: 'tool', toolCallId: 'fixture-call', content: JSON.stringify(result.output) },
      ],
    });
    assert.equal(second.status, 'completed', provider);
    assert.equal(second.message.content, 'Approval requested.');
    const sent = requests.at(-1);
    assert.equal(sent.messages[1].tool_calls[0].id, 'fixture-call');
    assert.equal(sent.messages[2].tool_call_id, 'fixture-call');

    const executed = await sdk.runAgentWorkflow({
      workflow: {
        ...workflow,
        target: {
          provider,
          model: provider === 'ling' ? 'Ling-3.0-flash' : 'gpt-4o-mini',
        },
      },
      target,
    });
    assert.equal(executed.record.execution, 'completed', provider);
    assert.equal(executed.record.policy, 'passed');
    assert.equal(executed.record.taskVerification, 'unavailable');
    assert.equal(executed.record.budgets.modelRequests, 2);
    assert.equal(executed.record.budgets.toolCalls, 1);
    assert.equal(executed.record.usage.reported.total, 30);
    assert.equal(executed.record.cleanup.status, 'completed');
    assert.equal(executed.state.workflow_state.approvals.status, 'pending');
    assert.ok(!JSON.stringify(executed.record).includes('Packed consumer review'));

    const wrapped = await new sdk.ArtemisKit().runWorkflow({
      workflow: {
        ...workflow,
        target: { provider, model: provider === 'ling' ? 'Ling-3.0-flash' : 'gpt-4o-mini' },
      },
      providerConfig: {
        apiKey: 'offline-fixture-only',
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        timeout: 2000,
      },
    });
    assert.equal(wrapped.record.execution, 'completed', provider);
    assert.equal(wrapped.record.budgets.modelRequests, 2);
    assert.equal(wrapped.record.cleanup.status, 'completed');
    assert.equal(wrapped.state.workflow_state.approvals.status, 'pending');
  }
  assert.equal(requests.length, 12);
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
console.log(
  'PASS: public imports, workflow schema, approval/denial, OpenAI/Ling continuation and native sessions'
);

if (process.argv.includes('--docker')) {
  for (let iteration = 0; iteration < 2; iteration++) {
    let turn = 0;
    const sandbox = await new sdk.ArtemisKit().runWorkflow({
      workflow: {
        ...workflow,
        environment: {
          type: 'sandbox',
          policy: {
            ...workflow.environment.policy,
            permissions: { files: 'write' },
            paths: { read: ['output.txt'], write: ['output.txt'] },
            budgets: { max_actions: 10, timeout_ms: 15_000, max_tokens: 4096 },
          },
        },
        tools: ['read_file', 'write_file'],
        workflow: { ...workflow.workflow, initial_state: { files: {} } },
        outcomes: { deterministic: [{ type: 'file', path: 'output.txt', exists: true }] },
      },
      cleanupTimeoutMs: 10_000,
      ...(iteration === 1
        ? {
            environmentFactory: async (options) => {
              const environment = await sdk.createDockerWorkflowEnvironment(options);
              try {
                const initial = await environment.snapshot(new AbortController().signal);
                assert.deepEqual(
                  initial.files,
                  {},
                  'A new container must not retain the earlier output'
                );
                return environment;
              } catch (error) {
                await environment.close(new AbortController().signal);
                throw error;
              }
            },
          }
        : {}),
      target: {
        provider: 'openai',
        async capabilities() {
          return { status: 'available', toolUse: true, transportCancellation: true };
        },
        async turn(request) {
          turn++;
          if (turn === 3) {
            const output = JSON.parse(request.messages.at(-1).content);
            assert.equal(output.content, `container-${iteration}`);
          }
          return {
            status: 'completed',
            id: `docker-${turn}`,
            model: 'container-fixture',
            message: {
              role: 'assistant',
              content: '',
              ...(turn < 3
                ? {
                    tool_calls: [
                      {
                        id: `file-${turn}`,
                        type: 'function',
                        function: {
                          name: turn === 1 ? 'write_file' : 'read_file',
                          arguments: JSON.stringify(
                            turn === 1
                              ? { path: 'output.txt', content: `container-${iteration}` }
                              : { path: 'output.txt' }
                          ),
                        },
                      },
                    ],
                  }
                : {}),
            },
            tokens: { prompt: 1, completion: 1, total: 2 },
            usageAvailable: true,
            latencyMs: 1,
          };
        },
      },
    });
    assert.equal(sandbox.record.execution, 'completed', JSON.stringify(sandbox.record));
    assert.equal(sandbox.record.environment, 'sandbox');
    assert.equal(sandbox.state.files['output.txt'], `container-${iteration}`);
    assert.equal(sandbox.record.cleanup.status, 'completed');
    assert.equal(sandbox.record.cleanup.artifacts, 'discarded');
  }
  console.log('PASS: installed SDK default Docker sessions, real read/write artifacts and cleanup');
}
