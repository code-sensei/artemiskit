import { describe, expect, test } from 'bun:test';
import { validateAgentWorkflow } from './parser';
import { readWorkflowRecord } from './records';
import type { AgentWorkflow } from './schema';
import type { WorkflowJudgeOptions } from './semantic';
import { createAgentWorkflowSession, runAgentWorkflow } from './session';
import type { AgentTarget, AgentTurnResult } from './target';

function workflow(): AgentWorkflow {
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'independent-outcomes',
    target: { provider: 'custom', model: 'fixture-model' },
    environment: {
      type: 'simulated',
      policy: {
        network: 'denied',
        side_effects: 'approval_required',
        permissions: { files: 'write', workflow_state: 'write' },
        budgets: { max_actions: 20, max_tokens: 4096, timeout_ms: 1000 },
      },
    },
    tools: ['write_file', 'request_approval'],
    workflow: {
      system_instructions: 'Use declared tools.',
      initial_state: { files: {}, workflow_state: {} },
      turns: [{ role: 'user', content: 'Write the required artifact.' }],
    },
    outcomes: {
      deterministic: [
        { type: 'file', path: 'result.txt', exists: true, equals: 'PRIVATE-ARTIFACT' },
      ],
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}

function response(tool?: { name: string; input: unknown }): AgentTurnResult {
  return {
    status: 'completed',
    id: 'fixture-response',
    model: 'fixture-model',
    message: {
      role: 'assistant',
      content: tool ? '' : 'I have successfully completed every requirement.',
      ...(tool
        ? {
            tool_calls: [
              {
                id: 'fixture-call',
                type: 'function' as const,
                function: { name: tool.name, arguments: JSON.stringify(tool.input) },
              },
            ],
          }
        : {}),
    },
    tokens: { prompt: 2, completion: 1, total: 3 },
    usageAvailable: true,
    latencyMs: 1,
    finishReason: tool ? 'tool_calls' : 'stop',
  };
}

function target(first = response()): AgentTarget {
  let turns = 0;
  return {
    provider: 'custom',
    capabilities: async () => ({
      status: 'available',
      toolUse: true,
      transportCancellation: true,
    }),
    turn: async () => (turns++ ? response() : first),
  };
}

describe('independent outcomes in native sessions', () => {
  test('a successful self-report cannot replace a missing artifact', async () => {
    const result = await runAgentWorkflow({ workflow: workflow(), target: target() });
    expect(result.record.execution).toBe('completed');
    expect(result.record.policy).toBe('passed');
    expect(result.record.taskVerification).toBe('failed');
    expect(JSON.stringify(result.record)).not.toContain('PRIVATE-ARTIFACT');
    expect(JSON.stringify(result.record)).not.toContain('successfully completed');
  });

  test('the actual artifact establishes success with no extra target calls', async () => {
    const result = await runAgentWorkflow({
      workflow: workflow(),
      target: target(
        response({ name: 'write_file', input: { path: 'result.txt', content: 'PRIVATE-ARTIFACT' } })
      ),
    });
    expect(result.record.taskVerification).toBe('passed');
    expect(result.record.budgets.modelRequests).toBe(2);
    expect(result.record.usage.reported.total).toBe(6);
    expect(result.state?.files).toEqual({ 'result.txt': 'PRIVATE-ARTIFACT' });
  });

  test('requesting approval cannot satisfy approval granted', async () => {
    const scenario = workflow();
    scenario.outcomes.deterministic = [
      { type: 'workflow_state', path: 'approvals.status', equals: 'granted' },
    ];
    const result = await runAgentWorkflow({
      workflow: scenario,
      target: target(response({ name: 'request_approval', input: { reason: 'Review required' } })),
    });
    expect(result.record.execution).toBe('completed');
    expect(result.record.taskVerification).toBe('failed');
  });

  test('the declared pending approval handoff can be verified', async () => {
    const scenario = workflow();
    scenario.outcomes.deterministic = [
      { type: 'workflow_state', path: 'approvals.status', equals: 'pending' },
      { type: 'tool_trace', tool: 'request_approval', minimum_calls: 1, maximum_calls: 1 },
    ];
    const result = await runAgentWorkflow({
      workflow: scenario,
      target: target(response({ name: 'request_approval', input: { reason: 'Review required' } })),
    });
    expect(result.record.taskVerification).toBe('passed');
  });

  test('a denied call remains a policy violation and excluded task measurement', async () => {
    const scenario = workflow();
    scenario.environment.policy.paths = { read: [], write: ['allowed.txt'] };
    const result = await runAgentWorkflow({
      workflow: scenario,
      target: target(
        response({ name: 'write_file', input: { path: 'result.txt', content: 'PRIVATE-ARTIFACT' } })
      ),
    });
    expect(result.record.policy).toBe('denied');
    expect(result.record.taskVerification).toBe('unavailable');
  });
});

function judge(text = '{"verdict":"pass"}') {
  let calls = 0;
  let probes = 0;
  const options: WorkflowJudgeOptions = {
    provider: 'independent',
    model: 'judge-model',
    limits: { maxRequests: 2, maxTokens: 100, maxOutputTokens: 20, timeoutMs: 1000 },
    client: {
      provider: 'independent',
      capabilities: async () => {
        probes++;
        return { streaming: false, functionCalling: false, toolUse: false, maxContext: 10000 };
      },
      generate: async () => {
        calls++;
        return {
          id: 'judge-response',
          text,
          model: 'judge-model',
          tokens: { prompt: 4, completion: 1, total: 5 },
          latencyMs: 1,
        };
      },
    },
  };
  return {
    options,
    get calls() {
      return calls;
    },
    get probes() {
      return probes;
    },
  };
}
function qualitative() {
  const scenario = workflow();
  scenario.outcomes.deterministic = [
    { type: 'policy', rule: 'permissions_respected', expected: 'passed' },
  ];
  scenario.outcomes.semantic = [
    { type: 'llm_judge', mode: 'strict_assurance', rubric: 'The explanation is clear.' },
  ];
  return scenario;
}

describe('session outcome orchestration and saved evidence', () => {
  test('a declared semantic criterion requires an explicitly configured judge', async () => {
    const result = await runAgentWorkflow({ workflow: qualitative(), target: target() });
    expect(result.record.taskVerification).toBe('unavailable');
    expect(result.record.outcomes.semantic.assertions[0].reason).toBe('judge_not_configured');
    expect(result.record.outcomes.task.eligible).toBe(0);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  test('judge pass, fail and malformed results stay separate from target execution and usage', async () => {
    for (const [text, expected] of [
      ['{"verdict":"pass"}', 'passed'],
      ['{"verdict":"fail"}', 'failed'],
      ['Absolutely passed!', 'invalid'],
    ] as const) {
      const j = judge(text);
      const result = await runAgentWorkflow({
        workflow: qualitative(),
        target: target(),
        semanticJudge: j.options,
      });
      expect(result.record.execution).toBe('completed');
      expect(result.record.taskVerification).toBe(expected);
      expect(result.record.usage.reported.total).toBe(3);
      expect(result.record.budgets.modelRequests).toBe(1);
      expect(result.record.outcomes.semantic.usage.reported.total).toBe(5);
      expect(result.record.outcomes.semantic.budgets.requests).toBe(1);
      expect(j.calls).toBe(1);
      expect(result.record.events.slice(-2).map((e) => e.type)).toEqual([
        'execution_finished',
        'finished',
      ]);
      expect(result.record.events.at(-1)?.phase).toBe('evaluation');
      expect(readWorkflowRecord(JSON.stringify(result.record))).toEqual(result.record);
    }
  });
  test('failed deterministic prerequisites skip judge initialization and preserve a valid failure denominator', async () => {
    const scenario = qualitative();
    scenario.outcomes.deterministic = workflow().outcomes.deterministic;
    const j = judge();
    const result = await runAgentWorkflow({
      workflow: scenario,
      target: target(),
      semanticJudge: j.options,
    });
    expect(result.record.taskVerification).toBe('failed');
    expect(result.record.outcomes.task).toEqual({ eligible: 1, passed: 0, failed: 1 });
    expect(result.record.outcomes.semantic.counts).toEqual({
      declared: 1,
      passed: 0,
      failed: 0,
      invalid: 0,
      unavailable: 1,
      valid: 0,
    });
    expect(result.record.outcomes.semantic.assertions[0].reason).toBe('prerequisite_failed');
    expect(j.calls).toBe(0);
    expect(j.probes).toBe(0);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  test('unmeasured target execution cannot trigger a judge or count as a valid task', async () => {
    const j = judge();
    const answer = response();
    if (answer.status === 'completed') answer.usageAvailable = false;
    const scenario = qualitative();
    Reflect.deleteProperty(scenario.environment.policy.budgets, 'max_tokens');
    const result = await runAgentWorkflow({
      workflow: scenario,
      target: target(answer),
      semanticJudge: j.options,
    });
    expect(result.record.execution).toBe('completed');
    expect(result.record.outcomes.reason).toBe('target_usage_unavailable');
    expect(result.record.outcomes.task.eligible).toBe(0);
    expect(j.probes).toBe(0);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  test('invalid judge limits fail before target or judge spending', async () => {
    const j = judge();
    j.options.limits.maxRequests = 0;
    let turns = 0;
    const t = target();
    t.turn = async () => {
      turns++;
      return response();
    };
    const result = await runAgentWorkflow({
      workflow: qualitative(),
      target: t,
      semanticJudge: j.options,
    });
    expect(result.record.reason).toBe('invalid_options');
    expect(turns).toBe(0);
    expect(j.probes).toBe(0);
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  test('session cancellation remains active during judge evaluation', async () => {
    const j = judge();
    let enter: () => void = () => {};
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    j.options.client.generate = async (request) => {
      enter();
      await new Promise<void>((resolve) =>
        request.signal?.addEventListener('abort', () => resolve(), { once: true })
      );
      return {
        id: 'late',
        model: 'judge-model',
        text: '{"verdict":"pass"}',
        tokens: { prompt: 4, completion: 1, total: 5 },
        latencyMs: 1,
      };
    };
    const session = createAgentWorkflowSession({
      workflow: qualitative(),
      target: target(),
      semanticJudge: j.options,
    });
    const running = session.run();
    await entered;
    session.cancel();
    const result = await running;
    expect(result.record.execution).toBe('completed');
    expect(result.record.taskVerification).toBe('unavailable');
    expect(result.record.outcomes.reason).toBe('cancelled');
    expect(result.record.outcomes.task.eligible).toBe(0);
    expect(result.record.outcomes.semantic.usage.reported.total).toBe(5);
    expect(session.state).toBe('completed');
    expect(readWorkflowRecord(result.record)).toEqual(result.record);
  });
  test('admitted judge limits are immutable across target execution', async () => {
    const j = judge();
    const t = target();
    t.turn = async () => {
      j.options.limits.maxRequests = 0;
      j.options.model = 'changed';
      return response();
    };
    const result = await runAgentWorkflow({
      workflow: qualitative(),
      target: t,
      semanticJudge: j.options,
    });
    expect(result.record.taskVerification).toBe('passed');
    expect(result.record.outcomes.semantic.judge?.requested.model.display).toBe('judge-model');
    expect(result.record.outcomes.semantic.budgets.limits?.maxRequests).toBe(2);
  });
  test('terminal observers cannot retroactively cancel a verified result', async () => {
    const scenario = qualitative();
    Reflect.deleteProperty(scenario.outcomes, 'semantic');
    const session = createAgentWorkflowSession({
      workflow: scenario,
      target: target(),
      onEvent: (event) => {
        if (event.type === 'finished') session.cancel();
      },
    });
    const result = await session.run();
    expect(result.record.taskVerification).toBe('passed');
    expect(result.record.outcomes.cancelled).toBe(false);
  });
});

test('saved outcome summaries reject inconsistent counts, seals, identities and judge accounting', async () => {
  const j = judge();
  const { record } = await runAgentWorkflow({
    workflow: qualitative(),
    target: target(),
    semanticJudge: j.options,
  });
  const mutations: ((value: typeof record) => void)[] = [
    (r) => {
      r.taskVerification = 'failed';
    },
    (r) => {
      r.droppedEvents = 1;
    },
    (r) => {
      const event = r.events.find((e) => e.type === 'model_completed');
      if (event) event.status = 'failed';
    },
    (r) => {
      r.outcomes.semantic.usage.inFlightUnknown = true;
      r.outcomes.semantic.usage.pendingOperations = 1;
    },
    (r) => {
      if (r.outcomes.semantic.budgets.limits) r.outcomes.semantic.budgets.limits.maxTokens = 1;
      r.outcomes.semantic.budgets.tokenOvershoot = 4;
    },
    (r) => {
      if (r.outcomes.semantic.judge)
        r.outcomes.semantic.judge.observed.provider = { sha256: 'a'.repeat(64) };
    },
    (r) => {
      if (r.outcomes.semantic.judge) r.outcomes.semantic.judge.observed.models = [];
    },

    (r) => {
      r.outcomes.task.eligible = 0;
    },
    (r) => {
      r.outcomes.deterministic.counts.passed++;
    },
    (r) => {
      r.outcomes.deterministic.status = 'failed';
    },
    (r) => {
      r.outcomes.semantic.usage.reported.total++;
    },
    (r) => {
      r.outcomes.semantic.usage.missingRequests++;
    },
    (r) => {
      r.outcomes.semantic.budgets.requests = 0;
    },
    (r) => {
      r.outcomes.stateSha256 = 'a'.repeat(64);
    },
    (r) => {
      r.events[r.events.length - 1].phase = 'execution';
    },
    (r) => {
      r.events[r.events.length - 2].status = 'failed';
    },
    (r) => {
      if (r.outcomes.semantic.judge)
        r.outcomes.semantic.judge.observed.models[0].sha256 = 'a'.repeat(64);
    },
    (r) => {
      r.outcomes.semantic.assertions[0].reason = 'not_satisfied';
    },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(record);
    mutate(value);
    expect(() => readWorkflowRecord(value)).toThrow('Invalid or unsupported workflow record');
  }
});

test('preflight does not score the workflow or initialize a configured judge', async () => {
  const j = judge();
  const t: AgentTarget = {
    ...target(),
    turn: async (request) => {
      const nonce = (
        request.tools[0].function.parameters as { properties: { nonce: { const: string } } }
      ).properties.nonce.const;
      const answer = response(
        request.messages.some((m) => m.role === 'tool')
          ? undefined
          : { name: 'artemis_probe', input: { nonce } }
      );
      if (answer.status === 'completed' && !answer.message.tool_calls)
        answer.message.content = nonce;
      return answer;
    },
  };
  const result = await runAgentWorkflow({
    workflow: qualitative(),
    target: t,
    preflightOnly: true,
    semanticJudge: j.options,
  });
  expect(result.record.execution).toBe('completed');
  expect(result.record.purpose).toBe('preflight');
  expect(result.record.outcomes.reason).toBe('preflight_only');
  expect(result.record.outcomes.deterministic.counts.declared).toBe(0);
  expect(result.record.outcomes.semantic.counts.declared).toBe(0);
  expect(j.probes).toBe(0);
  expect(readWorkflowRecord(result.record)).toEqual(result.record);
});

test('a valid semantic failure with later unavailable judging retains truthful coverage', async () => {
  const scenario = qualitative();
  scenario.outcomes.semantic?.push({
    type: 'llm_judge',
    mode: 'strict_assurance',
    rubric: 'Second criterion.',
  });
  const j = judge('{"verdict":"fail"}');
  j.options.limits.maxRequests = 1;
  const result = await runAgentWorkflow({
    workflow: scenario,
    target: target(),
    semanticJudge: j.options,
  });
  expect(result.record.taskVerification).toBe('failed');
  expect(result.record.outcomes.semantic.counts).toMatchObject({
    failed: 1,
    unavailable: 1,
    valid: 1,
    declared: 2,
  });
  expect(readWorkflowRecord(result.record)).toEqual(result.record);
});
