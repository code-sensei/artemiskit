import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

// Run from the isolated consumer, against its installed CLI and an owned loopback provider.
const cli = resolve('node_modules/.bin/akit');
const base = JSON.parse(readFileSync('cli-workflow-base.json', 'utf8'));
const requests = [];
let cancelChild;
const secretFixture = 'sensitive-consumer-fixture-content';
const server = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  requests.push(body);
  assert.ok(body.model.startsWith('consumer-'), 'Workflow model must override config default');
  if (body.model === 'consumer-cancel') {
    cancelChild.kill('SIGINT');
    return;
  }
  const continued = body.messages.some((message) => message.role === 'tool');
  const probe = body.tools?.find((tool) => tool.function.name === 'artemis_probe');
  let content = 'Run finished.';
  let calls;
  if (probe) {
    const nonce = probe.function.parameters.properties.nonce.const;
    if (continued) content = nonce;
    else
      calls = [
        {
          id: 'consumer-probe',
          type: 'function',
          function: {
            name: 'artemis_probe',
            arguments: JSON.stringify({ nonce }),
          },
        },
      ];
  } else if (!continued) {
    const sandbox = body.model === 'consumer-sandbox';
    calls = [
      {
        id: 'consumer-call',
        type: 'function',
        function: {
          name:
            body.model === 'consumer-denied'
              ? 'undeclared_tool'
              : sandbox
                ? 'write_file'
                : 'request_approval',
          arguments: JSON.stringify(
            sandbox
              ? { path: 'output.txt', content: secretFixture }
              : { reason: body.model === 'consumer-malformed' ? 42 : secretFixture }
          ),
        },
      },
    ];
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      id: 'consumer-completion',
      object: 'chat.completion',
      created: 1,
      model: body.model,
      choices: [
        {
          index: 0,
          finish_reason: calls ? 'tool_calls' : 'stop',
          message: {
            role: 'assistant',
            content: calls ? null : content,
            ...(calls ? { tool_calls: calls } : {}),
          },
        },
      ],
      ...(body.model === 'consumer-unmeasured'
        ? {}
        : {
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
    })
  );
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
writeFileSync(
  'consumer-config.json',
  JSON.stringify({
    provider: 'anthropic',
    model: 'must-not-override-workflow',
    providers: {
      openai: {
        apiKey: 'offline-fixture-only',
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        defaultModel: 'must-not-override-workflow',
        timeout: 5000,
        maxRetries: 8,
      },
    },
  })
);

function run(args, cancel = false) {
  return new Promise((resolveRun, reject) => {
    const child = spawn('bun', [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (cancel) cancelChild = child;
    let stdout = '';
    let stderr = '';
    let forceTimer;
    const watchdog = setTimeout(() => {
      child.kill('SIGINT');
      forceTimer = setTimeout(() => child.kill('SIGKILL'), 12_000);
    }, 30_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(watchdog);
      clearTimeout(forceTimer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(watchdog);
      clearTimeout(forceTimer);
      if (signal) {
        reject(new Error(`Unexpected termination: ${signal}; ${stderr}`));
        return;
      }
      resolveRun({ code, stdout, stderr });
    });
  });
}
async function check(name, expected, mutate = () => {}, mode = 'run') {
  const workflow = structuredClone(base);
  workflow.target.model = `consumer-${name}`;
  workflow.target.generation = { max_tokens: 256, temperature: 0 };
  workflow.environment.policy.budgets = {
    max_actions: 10,
    max_model_requests: 5,
    max_tool_calls: 5,
    timeout_ms: 15_000,
    max_tokens: 4096,
  };
  mutate(workflow);
  writeFileSync(`${name}.json`, JSON.stringify(workflow));
  const command = [
    'workflow',
    mode,
    `${name}.json`,
    '--config',
    'consumer-config.json',
    '--output',
    `${name}-record.json`,
    '--json',
  ];
  if (['success', 'sandbox'].includes(name)) command.push('--state-output', `${name}-state.json`);
  if (name === 'sandbox') command.push('--cleanup-timeout', '10000');
  const before = requests.length;
  const result = await run(command, name === 'cancel');
  assert.equal(result.code, expected, `${name}: ${result.stdout}\n${result.stderr}`);
  const record = JSON.parse(readFileSync(`${name}-record.json`, 'utf8'));
  assert.deepEqual(JSON.parse(result.stdout), record, `${name}: stdout and saved evidence differ`);
  assert.equal(
    requests.length - before,
    ['success', 'preflight', 'sandbox'].includes(name) ? 2 : 1,
    `${name}: unexpected hidden retry or extra model turn`
  );
  assert.equal(record.taskVerification, 'unavailable');
  assert.ok(!JSON.stringify(record).includes(secretFixture));
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secretFixture));
  assert.equal(record.cleanup.status, 'completed', name);
  return record;
}
try {
  const success = await check('success', 0);
  assert.equal(success.execution, 'completed');
  assert.equal(success.usage.reported.total, 30);
  assert.equal(
    JSON.parse(readFileSync('success-state.json', 'utf8')).workflow_state.approvals.status,
    'pending'
  );
  assert.equal(statSync('success-state.json').mode & 0o777, 0o600);
  const before = requests.length;
  const collision = await run([
    'workflow',
    'run',
    'success.json',
    '--config',
    'consumer-config.json',
    '--output',
    'collision.json',
    '--state-output',
    './collision.json',
  ]);
  assert.equal(collision.code, 1);
  assert.equal(requests.length, before);
  const existing = await run([
    'workflow',
    'run',
    'success.json',
    '--config',
    'consumer-config.json',
    '--output',
    'success-record.json',
  ]);
  assert.equal(existing.code, 1);
  assert.equal(requests.length, before);
  assert.equal((await check('denied', 4)).policy, 'denied');
  assert.equal((await check('malformed', 2)).execution, 'invalid');
  assert.equal((await check('unmeasured', 7)).reason, 'usage_unavailable');
  assert.equal(
    (
      await check('budget', 5, (workflow) => {
        workflow.environment.policy.budgets.max_model_requests = 1;
      })
    ).reason,
    'max_model_requests'
  );
  const preflight = await check(
    'preflight',
    0,
    (workflow) => {
      workflow.workflow.initial_state = 'fixtures/not-loaded.json';
      workflow.environment.type = 'sandbox';
    },
    'preflight'
  );
  assert.equal(preflight.capability.preflight, 'passed');
  assert.equal(preflight.budgets.modelRequests, 2);
  assert.ok(!existsSync('preflight-state.json'));
  assert.equal((await check('cancel', 130)).execution, 'cancelled');
  if (process.argv.includes('--docker')) {
    const sandbox = await check('sandbox', 0, (workflow) => {
      workflow.environment.type = 'sandbox';
      workflow.environment.policy.permissions = { files: 'write' };
      workflow.environment.policy.paths = { read: ['output.txt'], write: ['output.txt'] };
      workflow.tools = ['write_file'];
      workflow.workflow.initial_state = { files: {} };
      workflow.outcomes.deterministic = [{ type: 'file', path: 'output.txt', exists: true }];
    });
    assert.equal(sandbox.environment, 'sandbox');
    assert.equal(sandbox.cleanup.artifacts, 'discarded');
    assert.equal(
      JSON.parse(readFileSync('sandbox-state.json', 'utf8')).files['output.txt'],
      secretFixture
    );
  }
} finally {
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
    server.closeAllConnections();
  });
}
console.log(
  `PASS: installed workflow CLI execution, privacy, exits, preflight, cancellation${process.argv.includes('--docker') ? ', real Docker file artifact and cleanup' : ''}`
);
