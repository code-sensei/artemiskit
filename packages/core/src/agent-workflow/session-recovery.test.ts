import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWorkflowCheckpoint } from './checkpoint';
import { openWorkflowCheckpointStore } from './checkpoint-store';
import { readWorkflowRecord } from './records';
import {
  recoveryAnswer,
  recoveryCalls,
  recoveryTarget,
  recoveryWorkflow,
} from './recovery-fixtures/scenario';
import type { WorkflowJudgeOptions } from './semantic';
import { createAgentWorkflowSession, runAgentWorkflow } from './session';
import type { AgentTarget } from './target';

const roots: string[] = [];
let worker: string;
let bundleRoot: string;
beforeAll(async () => {
  bundleRoot = await mkdtemp(join(tmpdir(), 'artemis-resume-bundle-'));
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, 'recovery-fixtures/worker.ts')],
    target: 'node',
    outdir: bundleRoot,
    naming: 'worker.mjs',
  });
  expect(built.success).toBe(true);
  worker = join(bundleRoot, 'worker.mjs');
});
afterAll(async () => {
  await rm(bundleRoot, { recursive: true, force: true });
});
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'artemis-resume-'));
  roots.push(root);
  return join(root, 'checkpoint');
}
const checkpoint = (directory: string, mode: 'create' | 'resume' = 'create') => ({
  directory,
  mode,
  configurationId: 'fixture-transport',
});
async function paused(path: string, pauseAfterActions = 2, workflow = recoveryWorkflow()) {
  return runAgentWorkflow({
    workflow,
    target: recoveryTarget(),
    checkpoint: checkpoint(path),
    pauseAfterActions,
  });
}
async function mutate(
  path: string,
  change: (value: ReturnType<typeof parseWorkflowCheckpoint>) => void
) {
  const store = await openWorkflowCheckpointStore({ directory: path, mode: 'resume' });
  try {
    const value = parseWorkflowCheckpoint((await store.read())?.payload);
    expect(value.lifecycle).toBe('ready');
    change(value);
    await store.write(value);
  } finally {
    await store.close();
  }
}
function external(args: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [worker, JSON.stringify(args)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let diagnostics = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('recovery child timed out'));
    }, 10000);
    child.stdout.on('data', (value) => {
      output += value;
    });
    child.stderr.on('data', (value) => {
      diagnostics += value;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(new Error(`recovery child failed (${code}): ${diagnostics.slice(0, 1000)}`));
    });
  });
}
function countedTarget() {
  const base = recoveryTarget();
  const calls = { capabilities: 0, turn: 0, drain: 0 };
  const target: AgentTarget = {
    provider: base.provider,
    capabilities: async (...args) => {
      calls.capabilities++;
      return base.capabilities(...args);
    },
    turn: async (...args) => {
      calls.turn++;
      return base.turn(...args);
    },
    drain: async () => {
      calls.drain++;
      return { pendingOperations: 0 };
    },
  };
  return { target, calls };
}

describe('durable native workflow attempts', () => {
  test('preserves a partial multi-call cursor, identities, budgets and one logical ledger', async () => {
    const path = await directory();
    const first = await paused(path);
    expect(first.record.reason).toBe('checkpoint_paused');
    expect(first.record.schemaVersion).toBe('3');
    expect(first.record.budgets.actions).toBe(2);
    expect(first.state?.files).toEqual({ 'one.txt': 'PRIVATE-ONE' });
    expect(readWorkflowRecord(first.record)).toEqual(first.record);
    const second = await runAgentWorkflow({
      workflow: recoveryWorkflow(),
      target: recoveryTarget(),
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(second.record.execution).toBe('completed');
    expect(second.record.taskVerification).toBe('passed');
    expect(second.record.budgets).toMatchObject({ actions: 4, modelRequests: 2, toolCalls: 2 });
    expect(second.record.usage.reported.total).toBe(6);
    expect(second.record.recovery?.runId).toBe(first.record.recovery?.runId);
    expect(second.record.recovery?.attemptId).not.toBe(first.record.recovery?.attemptId);
    expect(second.record.recovery?.attempts).toBe(2);
    expect(second.record.events.filter((event) => event.type === 'started')).toHaveLength(1);
    expect(
      second.record.events.filter((event) => event.type === 'execution_finished')
    ).toHaveLength(1);
    expect(second.record.events.filter((event) => event.type === 'finished')).toHaveLength(1);
    expect(second.record.recovery?.stateChanges.total).toBe(2);
    expect(readWorkflowRecord(second.record)).toEqual(second.record);
    const text = JSON.stringify(second.record);
    for (const secret of [path, 'fixture-transport', 'PRIVATE-ONE', 'PRIVATE-TWO', 'one.txt'])
      expect(text).not.toContain(secret);
    const { target, calls } = countedTarget();
    const duplicate = await runAgentWorkflow({
      workflow: recoveryWorkflow(),
      target,
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(duplicate.record.reason).toBe('checkpoint_terminal');
    expect(calls).toEqual({ capabilities: 0, turn: 0, drain: 0 });
  });

  test('separate Node processes pause and resume without reexecuting the first write', async () => {
    const path = await directory();
    const first = JSON.parse(
      await external({ directory: path, mode: 'create', pauseAfterActions: 2 })
    );
    expect(first.reason).toBe('checkpoint_paused');
    const second = JSON.parse(await external({ directory: path, mode: 'resume' }));
    expect(second.taskVerification).toBe('passed');
    expect(second.budgets.actions).toBe(4);
    expect(second.recovery.runId).toBe(first.recovery.runId);
    expect(second.recovery.attempts).toBe(2);
  });

  test('pause during a target request waits for its measured response and resumes its pending calls', async () => {
    const path = await directory();
    const base = recoveryTarget();
    let started!: () => void;
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    let release!: () => void;
    const response = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = createAgentWorkflowSession({
      workflow: recoveryWorkflow(),
      checkpoint: checkpoint(path),
      target: {
        ...base,
        turn: async (request) => {
          started();
          await response;
          return base.turn(request);
        },
      },
    });
    const running = session.run();
    await requested;
    session.pause();
    release();
    const first = await running;
    expect(first.record.reason).toBe('checkpoint_paused');
    expect(first.record.budgets.actions).toBe(1);
    const second = await runAgentWorkflow({
      workflow: recoveryWorkflow(),
      target: recoveryTarget(),
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(second.record.taskVerification).toBe('passed');
    expect(second.record.budgets.actions).toBe(4);
  });

  test('preflight is measured once and its call IDs survive resume', async () => {
    const path = await directory();
    const workflow = recoveryWorkflow();
    const first = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      preflight: true,
      checkpoint: checkpoint(path),
      pauseAfterActions: 4,
    });
    expect(first.record.reason).toBe('checkpoint_paused');
    expect(first.record.usage.preflight.total).toBe(6);
    const second = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      preflight: true,
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(second.record.taskVerification).toBe('passed');
    expect(second.record.budgets.actions).toBe(7);
    expect(second.record.usage.preflight.total).toBe(6);
    expect(
      second.record.events.filter((event) => event.type === 'preflight_completed')
    ).toHaveLength(1);
  });

  test('resumes the saved fixture state after its source file changes or disappears', async () => {
    const path = await directory();
    const root = join(path, '..');
    await writeFile(
      join(root, 'initial.json'),
      JSON.stringify({ files: { 'original.txt': 'original' } })
    );
    const workflow = recoveryWorkflow();
    workflow.workflow.initial_state = 'initial.json';
    const first = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      fixtureRoot: root,
      checkpoint: checkpoint(path),
      pauseAfterActions: 2,
    });
    expect(first.record.reason).toBe('checkpoint_paused');
    await writeFile(join(root, 'initial.json'), 'not valid anymore');
    const second = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(second.record.taskVerification).toBe('passed');
    expect(second.state?.files).toMatchObject({ 'original.txt': 'original' });
    expect(second.record.recovery?.initialStateSha256).toBe(
      first.record.recovery?.initialStateSha256
    );
  });

  test.each(['model', 'tool'])(
    'refuses ambiguous %s pending after actual process interruption',
    async (crash) => {
      const path = await directory();
      expect(await external({ directory: path, mode: 'create', crash })).toBe('crashed');
      const { target, calls } = countedTarget();
      const result = await runAgentWorkflow({
        workflow: recoveryWorkflow(),
        target,
        checkpoint: checkpoint(path, 'resume'),
      });
      expect(result.record.reason).toBe('checkpoint_pending');
      expect(calls).toEqual({ capabilities: 0, turn: 0, drain: 0 });
    }
  );

  test('refuses a live duplicate claim and never falls back to a fresh repetition', async () => {
    const path = await directory();
    await paused(path);
    const lease = await openWorkflowCheckpointStore({ directory: path, mode: 'resume' });
    try {
      const { target, calls } = countedTarget();
      const result = await runAgentWorkflow({
        workflow: recoveryWorkflow(),
        target,
        checkpoint: checkpoint(path, 'resume'),
      });
      expect(result.record.reason).toBe('checkpoint_unavailable');
      expect(calls.turn).toBe(0);
    } finally {
      await lease.close();
    }
  });

  test('rejects changed host, scenario, preflight, fixture hash and cursor before callbacks', async () => {
    for (const kind of [
      'host',
      'scenario',
      'preflight',
      'fixture',
      'cursor',
      'usage',
      'ids',
      'events',
      'state',
      'unknown',
    ]) {
      const path = await directory();
      const workflow = recoveryWorkflow();
      await paused(path);
      if (kind === 'scenario') workflow.environment.policy.budgets.max_actions++;
      if (kind === 'fixture')
        await mutate(path, (p) => {
          p.initialStateSha256 = '0'.repeat(64);
        });
      if (kind === 'cursor')
        await mutate(path, (p) => {
          p.cursor.callIndex = 0;
        });
      if (kind === 'usage')
        await mutate(path, (p) => {
          p.ledger.budgets.actions = 0;
        });
      if (kind === 'ids')
        await mutate(path, (p) => {
          p.seenIds = [];
        });
      if (kind === 'events')
        await mutate(path, (p) => {
          p.ledger.events[0].type = 'finished';
        });
      if (kind === 'state')
        await mutate(path, (p) => {
          p.stateSha256 = '0'.repeat(64);
        });
      if (kind === 'unknown')
        await mutate(path, (p) => {
          p.ledger.usage.missingRequests = 1;
        });
      const { target, calls } = countedTarget();
      const result = await runAgentWorkflow({
        workflow,
        target,
        checkpoint: {
          ...checkpoint(path, 'resume'),
          configurationId: kind === 'host' ? 'different' : 'fixture-transport',
        },
        ...(kind === 'preflight' ? { preflight: true } : {}),
      });
      expect(result.record.execution).not.toBe('completed');
      expect(calls).toEqual({ capabilities: 0, turn: 0, drain: 0 });
    }
  });

  test('checks expired deadlines and backward wall clocks before capabilities', async () => {
    for (const kind of ['expired', 'rollback']) {
      const path = await directory();
      await paused(path);
      await mutate(path, (p) => {
        if (kind === 'expired') {
          p.startedAt = Date.now() - 40000;
          p.deadlineAt = p.startedAt + 30000;
          p.lastObservedAt = p.startedAt + p.ledger.budgets.elapsedMs;
        } else {
          p.lastObservedAt = Date.now() + 30000;
          p.ledger.budgets.elapsedMs = p.lastObservedAt - p.startedAt;
        }
      });
      const { target, calls } = countedTarget();
      const result = await runAgentWorkflow({
        workflow: recoveryWorkflow(),
        target,
        checkpoint: checkpoint(path, 'resume'),
      });
      expect(result.record.reason).toBe(
        kind === 'expired' ? 'checkpoint_expired' : 'checkpoint_clock_rollback'
      );
      expect(calls.capabilities).toBe(0);
    }
  });

  test('preserves action, model, tool and token limits at restore', async () => {
    for (const kind of ['actions', 'model_requests', 'tool_calls', 'tokens']) {
      const path = await directory();
      const workflow = recoveryWorkflow();
      workflow.environment.policy.budgets[`max_${kind}` as 'max_actions'] =
        kind === 'tokens' ? 3 : 1;
      const first = await paused(
        path,
        kind === 'tool_calls' ? 2 : kind === 'model_requests' ? 3 : 1,
        workflow
      );
      expect(first.record.reason).toBe('checkpoint_paused');
      const { target, calls } = countedTarget();
      const result = await runAgentWorkflow({
        workflow,
        target,
        checkpoint: checkpoint(path, 'resume'),
      });
      expect(result.record.reason).toBe(`max_${kind}`);
      expect(calls.capabilities).toBe(0);
    }
  });

  test('checkpoint usage is never free, while the fresh V2 path keeps its established behavior', async () => {
    const path = await directory();
    const base = recoveryTarget();
    const target = {
      ...base,
      turn: async () => ({
        ...recoveryAnswer(),
        tokens: { prompt: 0, completion: 0, total: 0 },
        usageAvailable: false,
      }),
    };
    const result = await runAgentWorkflow({
      workflow: recoveryWorkflow(),
      target,
      checkpoint: checkpoint(path),
    });
    expect(result.record.reason).toBe('usage_unavailable');
    expect(result.record.usage.missingRequests).toBe(1);
    const again = await runAgentWorkflow({
      workflow: recoveryWorkflow(),
      target,
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(again.record.reason).toBe('checkpoint_terminal');
    const fresh = await runAgentWorkflow({ workflow: recoveryWorkflow(), target });
    expect(fresh.record.schemaVersion).toBe('2');
    expect(fresh.record.execution).toBe('completed');
  });

  test('rejects custom factories, preflight-only, missing checkpoint pause and wrong target identity before effects', async () => {
    for (const kind of ['custom', 'preflightOnly', 'pause', 'provider']) {
      const path = await directory();
      const { target, calls } = countedTarget();
      const result = await runAgentWorkflow({
        workflow: recoveryWorkflow(),
        target: kind === 'provider' ? { ...target, provider: 'different' } : target,
        ...(kind === 'pause' ? { pauseAfterActions: 1 } : { checkpoint: checkpoint(path) }),
        ...(kind === 'preflightOnly' ? { preflightOnly: true } : {}),
        ...(kind === 'custom'
          ? {
              environmentFactory: async () => {
                throw new Error('must not run');
              },
            }
          : {}),
      });
      expect(result.record.reason).toBe('invalid_options');
      expect(calls.turn).toBe(0);
    }
  });

  test('large post-response data cannot roll back to a replayable old generation', async () => {
    const path = await directory();
    const workflow = recoveryWorkflow();
    workflow.workflow.initial_state = { files: { 'large.txt': 's'.repeat(600000) } };
    const base = recoveryTarget();
    const result = await runAgentWorkflow({
      workflow,
      checkpoint: checkpoint(path),
      target: {
        ...base,
        turn: async () => recoveryAnswer(recoveryCalls(), 'PRIVATE'.repeat(130000)),
      },
    });
    expect(result.record.reason).toBe('checkpoint_unavailable');
    const raw = JSON.parse(await readFile(join(path, 'checkpoint.json'), 'utf8'));
    expect(['pending', 'terminal']).toContain(raw.payload.lifecycle);
    const { target, calls } = countedTarget();
    const restored = await runAgentWorkflow({
      workflow,
      target,
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(restored.record.execution).not.toBe('completed');
    expect(calls.turn).toBe(0);
    expect(JSON.stringify(result.record)).not.toContain('PRIVATEPRIVATE');
  });
  test('a dead simulated ready boundary resumes, without replaying completed effects', async () => {
    const path = await directory();
    expect(await external({ directory: path, mode: 'create', crash: 'ready' })).toBe('crashed');
    const stored = JSON.parse(await readFile(join(path, 'checkpoint.json'), 'utf8')).payload;
    expect(stored.lifecycle).toBe('ready');
    expect(stored.environmentReleased).toBe(false);
    const result = await runAgentWorkflow({
      workflow: recoveryWorkflow(),
      target: recoveryTarget(),
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(result.record.taskVerification).toBe('passed');
    expect(result.record.budgets.actions).toBe(4);
  });

  test('pause threshold is per attempt and repeated resumes preserve cumulative authority', async () => {
    const path = await directory();
    const workflow = recoveryWorkflow();
    const first = await paused(path, 1);
    const second = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      checkpoint: checkpoint(path, 'resume'),
      pauseAfterActions: 1,
    });
    expect(second.record.reason).toBe('checkpoint_paused');
    expect(second.record.budgets.actions).toBe(2);
    const third = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(third.record.taskVerification).toBe('passed');
    expect(third.record.budgets.actions).toBe(4);
    expect(third.record.recovery?.attempts).toBe(3);
    expect(third.record.recovery?.runId).toBe(first.record.recovery?.runId);
  });

  test('retains bounded trace/state changes across restore and does not invent omitted trace coverage', async () => {
    const path = await directory();
    const workflow = recoveryWorkflow();
    workflow.environment.policy.budgets.max_actions = 200;
    workflow.outcomes.deterministic = [
      { type: 'file', path: 'one.txt', exists: true, equals: 'PRIVATE-70' },
      { type: 'tool_trace', tool: 'write_file', minimum_calls: 70 },
    ];
    const base = recoveryTarget();
    const target = {
      ...base,
      turn: async (request: Parameters<AgentTarget['turn']>[0]) => {
        const completed = request.messages.filter((message) => message.role === 'tool').length;
        return completed === 70
          ? recoveryAnswer()
          : recoveryAnswer([
              {
                id: `call-${completed + 1}`,
                type: 'function' as const,
                function: {
                  name: 'write_file',
                  arguments: JSON.stringify({
                    path: 'one.txt',
                    content: `PRIVATE-${completed + 1}`,
                  }),
                },
              },
            ]);
      },
    };
    const first = await runAgentWorkflow({
      workflow,
      target,
      checkpoint: checkpoint(path),
      pauseAfterActions: 130,
    });
    expect(first.record.reason).toBe('checkpoint_paused');
    expect(first.record.droppedEvents).toBeGreaterThan(0);
    const result = await runAgentWorkflow({
      workflow,
      target,
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(result.record.execution).toBe('completed');
    expect(result.record.budgets.actions).toBe(141);
    expect(
      result.record.outcomes.deterministic.assertions.map((assertion) => assertion.status)
    ).toEqual(['passed', 'unavailable']);
    expect(result.record.events).toHaveLength(256);
    expect(result.record.recovery?.stateChanges).toMatchObject({ total: 70, omitted: 6 });
    expect(result.record.recovery?.stateChanges.entries).toHaveLength(64);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
    expect(JSON.stringify(result.record)).not.toContain('PRIVATE-70');
  });

  test('terminal execution is durable before judging and binds the explicit judge identity', async () => {
    const path = await directory();
    const workflow = recoveryWorkflow();
    workflow.outcomes.semantic = [
      { type: 'llm_judge', mode: 'strict_assurance', rubric: 'Confirm both files.' },
    ];
    let observedTerminal = false;
    const judge: WorkflowJudgeOptions = {
      provider: 'judge',
      model: 'judge-model',
      limits: { maxRequests: 1, maxTokens: 100, maxOutputTokens: 10, timeoutMs: 1000 },
      client: {
        provider: 'judge',
        capabilities: async () => ({
          streaming: false,
          functionCalling: false,
          toolUse: false,
          maxContext: 10000,
          jsonMode: true,
          transportCancellation: true,
        }),
        generate: async () => {
          const data = JSON.parse(await readFile(join(path, 'checkpoint.json'), 'utf8'));
          observedTerminal = data.payload.lifecycle === 'terminal';
          return {
            id: 'judge-answer',
            model: 'judge-model',
            text: '{"verdict":"pass"}',
            tokens: { prompt: 2, completion: 1, total: 3 },
            usageAvailable: true,
            latencyMs: 1,
            finishReason: 'stop',
          };
        },
      },
    };
    const first = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      semanticJudge: judge,
      checkpoint: checkpoint(path),
      pauseAfterActions: 2,
    });
    expect(first.record.reason).toBe('checkpoint_paused');
    const changed = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      semanticJudge: { ...judge, model: 'different' },
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(changed.record.reason).toBe('checkpoint_incompatible');
    const result = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      semanticJudge: judge,
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(result.record.taskVerification).toBe('passed');
    expect(observedTerminal).toBe(true);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
    const replay = await runAgentWorkflow({
      workflow,
      target: recoveryTarget(),
      semanticJudge: judge,
      checkpoint: checkpoint(path, 'resume'),
    });
    expect(replay.record.reason).toBe('checkpoint_terminal');
  });
});
