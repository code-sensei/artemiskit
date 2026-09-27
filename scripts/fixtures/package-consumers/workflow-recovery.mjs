import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArtemisKit, readWorkflowRecord, validateAgentWorkflow } from '@artemiskit/sdk';

const secret = 'sensitive-recovery-fixture';
const worker = process.argv.indexOf('--worker');
if (worker !== -1) {
  const [mode, directory, environment] = process.argv.slice(worker + 1);
  const workflow = validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'installed-recovery',
    target: { provider: 'openai', model: 'fixture-recovery' },
    environment: {
      type: environment,
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions: { files: 'write' },
        budgets: {
          max_actions: 8,
          max_model_requests: 3,
          max_tool_calls: 4,
          max_tokens: 100,
          timeout_ms: 120000,
        },
      },
    },
    tools: ['write_file'],
    faults: [
      {
        id: 'first-write-unavailable',
        tool: 'write_file',
        occurrence: 1,
        kind: 'unavailable_tool',
      },
    ],
    retry: { max_attempts: 2 },
    workflow: {
      system_instructions: 'Use the declared tools.',
      initial_state: { files: {} },
      turns: [{ role: 'user', content: secret }],
    },
    outcomes: {
      deterministic: [
        { type: 'file', path: 'first.txt', exists: true, equals: secret },
        { type: 'file', path: 'second.txt', exists: true, equals: secret },
        { type: 'tool_trace', tool: 'write_file', minimum_calls: 2, maximum_calls: 2 },
      ],
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
  let turns = 0;
  const target = {
    provider: 'openai',
    capabilities: async () => ({ status: 'available', toolUse: true, transportCancellation: true }),
    turn: async (request) => {
      turns++;
      const completed = request.messages.filter((message) => message.role === 'tool').length;
      if (mode === 'resume') assert.equal(completed, 2, 'Resume lost or replayed the tool queue');
      return {
        status: 'completed',
        id: `answer-${completed}`,
        model: 'fixture-recovery',
        message: {
          role: 'assistant',
          content: completed ? 'Done.' : '',
          ...(completed
            ? {}
            : {
                tool_calls: ['first', 'second'].map((name) => ({
                  id: `call-${name}`,
                  type: 'function',
                  function: {
                    name: 'write_file',
                    arguments: JSON.stringify({ path: `${name}.txt`, content: secret }),
                  },
                })),
              }),
        },
        tokens: { prompt: 2, completion: 1, total: 3 },
        latencyMs: 1,
      };
    },
  };
  const result = await new ArtemisKit().runWorkflow({
    workflow,
    target,
    checkpoint: {
      directory,
      mode: mode === 'create' ? 'create' : 'resume',
      configurationId: mode === 'wrong-identity' ? 'different-fixture' : 'fixture-target-v1',
    },
    ...(mode === 'create' ? { pauseAfterActions: 3 } : {}),
    cleanupTimeoutMs: 10000,
  });
  readWorkflowRecord(result.record);
  assert.ok(!JSON.stringify(result.record).includes(secret));
  console.log(
    JSON.stringify({
      record: result.record,
      turns,
      filesRestored:
        result.state?.files?.['first.txt'] === secret &&
        result.state?.files?.['second.txt'] === secret,
    })
  );
} else {
  const results = [];
  for (const environment of [
    'simulated',
    ...(process.argv.includes('--docker') ? ['sandbox'] : []),
  ]) {
    const directory = join(mkdtempSync(join(tmpdir(), 'artemis-installed-recovery-')), 'private');
    const run = (mode) => {
      const child = spawnSync(
        process.execPath,
        [fileURLToPath(import.meta.url), '--worker', mode, directory, environment],
        {
          encoding: 'utf8',
          timeout: 45000,
          maxBuffer: 2 * 1024 * 1024,
        }
      );
      assert.equal(child.status, 0, `Recovery worker ${mode}: ${child.stderr}`);
      assert.ok(!`${child.stdout}${child.stderr}`.includes(secret));
      return JSON.parse(child.stdout);
    };
    const paused = run('create');
    assert.equal(paused.record.reason, 'checkpoint_paused');
    assert.equal(paused.record.taskVerification, 'unavailable');
    assert.equal(paused.record.budgets.actions, 3);
    assert.equal(paused.record.budgets.toolCalls, 2);
    assert.equal(paused.turns, 1);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(join(directory, 'checkpoint.json')).mode & 0o777, 0o600);
    assert.ok(
      readFileSync(join(directory, 'checkpoint.json'), 'utf8').includes(secret),
      'Working data deliberately retained only in private checkpoint'
    );
    const refused = run('wrong-identity');
    assert.equal(refused.turns, 0);
    assert.notEqual(refused.record.execution, 'completed');
    const resumed = run('resume');
    assert.equal(resumed.record.taskVerification, 'passed');
    assert.equal(resumed.turns, 1);
    assert.equal(resumed.filesRestored, true);
    assert.equal(resumed.record.budgets.actions, 5);
    assert.equal(resumed.record.budgets.modelRequests, 2);
    assert.equal(resumed.record.budgets.toolCalls, 3);
    assert.equal(resumed.record.usage.reported.total, 6);
    assert.equal(resumed.record.recovery.faults.injected, 1);
    assert.equal(resumed.record.recovery.retries.attempted, 1);
    assert.equal(resumed.record.recovery.retries.recovered, 1);
    assert.equal(resumed.record.recovery.runId, paused.record.recovery.runId);
    assert.notEqual(resumed.record.recovery.attemptId, paused.record.recovery.attemptId);
    assert.equal(resumed.record.recovery.attempts, 2);
    assert.equal(resumed.record.events.filter((event) => event.type === 'started').length, 1);
    assert.equal(resumed.record.events.filter((event) => event.type === 'finished').length, 1);
    const terminal = run('resume');
    assert.equal(terminal.turns, 0);
    assert.notEqual(terminal.record.execution, 'completed');
    results.push({
      environment,
      paused: paused.record,
      resumed: resumed.record,
      incompatible: refused.record,
      terminal: terminal.record,
    });
  }
  writeFileSync(
    resolve(`workflow-recovery-${process.versions.bun ? 'bun' : 'node'}.json`),
    JSON.stringify(results, null, 2)
  );
  console.log(
    `PASS: installed SDK separate-process ${results.map((r) => r.environment).join('/')} recovery, identity/budgets/tool cursor, terminal refusal and privacy`
  );
}
