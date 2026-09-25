import assert from 'node:assert/strict';
import { once } from 'node:events';
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
  }
  assert.equal(requests.length, 4);
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
console.log(
  'PASS: public imports, workflow schema, approval/denial, OpenAI/Ling tool continuation'
);
