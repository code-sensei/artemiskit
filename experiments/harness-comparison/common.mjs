import { createHash } from 'node:crypto';
import { executeSimulatedTool, getWorkflowTool } from '../../packages/core/dist/index.js';
import { initialState, instructions } from './cases.mjs';

export const toolIds = [
  'read_document',
  'query_records',
  'write_file',
  'request_approval',
  'calculator',
];
export const descriptors = toolIds.map(getWorkflowTool);

export function context(spec, live = false, saved = undefined) {
  const controller = new AbortController();
  const c = {
    spec,
    live,
    controller,
    state: structuredClone(saved?.state ?? initialState),
    trace: [],
    requests: saved?.requests ?? 0,
    usage: saved?.usage ?? 0,
    usageKnown: saved?.usageKnown ?? true,
    guardStops: [],
    cancelled: false,
    events: [],
    historyObserved: [],
    admittedActions: saved?.admittedActions ?? 0,
    receipts: [],
    inputs: [],
    pendingTools: new Set(),
    scriptIndex: saved?.scriptIndex ?? 0,
    async execute(name, input) {
      if (spec.cancelTool) {
        setTimeout(() => {
          c.cancelled = true;
          controller.abort();
        }, 5);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      let result;
      if (controller.signal.aborted) result = { status: 'denied', code: 'cancelled' };
      else if (c.admittedActions >= (spec.maxActions ?? 8)) {
        result = { status: 'denied', code: 'action_budget' };
      } else {
        c.admittedActions++;
        result = executeSimulatedTool({
          tool: name,
          input,
          state: c.state,
          declaredTools: toolIds,
          policy: {
            network: 'denied',
            side_effects: 'denied',
            permissions: {
              documents: 'read',
              records: 'read',
              files: spec.noWrite ? 'read' : 'write',
              workflow_state: 'write',
            },
            budgets: { max_actions: spec.maxActions ?? 8, timeout_ms: 60_000 },
          },
        });
      }
      c.trace.push({
        tool: name,
        status: result.status,
        ...(result.code ? { code: result.code } : {}),
      });
      if (result.status === 'succeeded') {
        c.state = result.state;
        c.receipts.push({ tool: name, output: result.output });
        return result.output;
      }
      return { status: result.status, code: result.code };
    },
    async generate(messages) {
      if (controller.signal.aborted) throw new Error('cancelled');
      for (const [name, exceeded] of [
        ['request_budget', c.requests >= (spec.maxRequests ?? 8)],
        ['token_budget', !c.usageKnown || c.usage >= (spec.maxTokens ?? 4096)],
      ]) {
        if (exceeded) {
          c.guardStops.push(name);
          throw new Error(name);
        }
      }
      c.requests++;
      c.historyObserved.push(JSON.stringify(messages).includes('resume-marker'));
      c.inputs.push({
        digest: createHash('sha256').update(JSON.stringify(messages)).digest('hex'),
        roles: messages.map((m) => m.role),
        instructionsPresent: messages.some(
          (m) => m.role === 'system' && m.content === instructions
        ),
      });
      if (live) {
        const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'qwen2.5-coder:3b',
            messages,
            temperature: 0,
            max_tokens: 128,
            stream: false,
            tools: descriptors.map((d) => ({
              type: 'function',
              function: { name: d.id, description: d.description, parameters: d.inputSchema },
            })),
          }),
        });
        if (!response.ok) throw new Error(`local_http_${response.status}`);
        const data = await response.json();
        const total = data.usage?.total_tokens;
        c.usageKnown = Number.isSafeInteger(total) && total >= 0;
        if (c.usageKnown) c.usage += total;
        return {
          text: data.choices[0].message.content ?? '',
          calls: (data.choices[0].message.tool_calls ?? []).map((t) => ({
            id: t.id,
            name: t.function.name,
            input: JSON.parse(t.function.arguments),
          })),
          usage: {
            prompt: data.usage?.prompt_tokens ?? 0,
            completion: data.usage?.completion_tokens ?? 0,
            total: total ?? 0,
          },
        };
      }
      const action = spec.script[c.scriptIndex++];
      if (spec.missingUsage) {
        c.usageKnown = false;
        return {
          text: '',
          calls: [{ ...action, id: `call-${c.requests}` }],
          usage: { prompt: 0, completion: 0, total: 0 },
        };
      }
      c.usage += 8;
      return {
        text: action ? '' : 'Done.',
        calls: action ? [{ ...action, id: `call-${c.requests}` }] : [],
        usage: { prompt: 5, completion: 3, total: 8 },
      };
    },
  };
  const execute = c.execute;
  c.execute = (name, input) => {
    const pending = execute(name, input);
    c.pendingTools.add(pending);
    pending.then(
      () => c.pendingTools.delete(pending),
      () => c.pendingTools.delete(pending)
    );
    return pending;
  };
  return c;
}

/** Normalize provider-bound histories for the shared local transport. No hidden tool authority. */
export function messagesToOpenAI(messages) {
  return messages.flatMap((m) => {
    if (m.role === 'toolResult')
      return [
        {
          role: 'tool',
          tool_call_id: m.toolCallId,
          content: m.content
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('\n'),
        },
      ];
    if (m.role === 'tool') {
      if (typeof m.content === 'string')
        return [{ role: 'tool', tool_call_id: m.toolCallId ?? m.tool_call_id, content: m.content }];
      return m.content.map((p) => ({
        role: 'tool',
        tool_call_id: p.toolCallId,
        content: JSON.stringify(p.output?.value ?? p.result ?? p.output),
      }));
    }
    const content =
      typeof m.content === 'string'
        ? m.content
        : (m.content ?? [])
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('\n');
    const calls =
      typeof m.content === 'string'
        ? (m.tool_calls ?? [])
        : (m.content ?? [])
            .filter((p) => p.type === 'tool-call' || p.type === 'toolCall')
            .map((p) => ({
              id: p.toolCallId ?? p.id,
              type: 'function',
              function: {
                name: p.toolName ?? p.name,
                arguments:
                  typeof p.input === 'string' ? p.input : JSON.stringify(p.arguments ?? p.input),
              },
            }));
    return [{ role: m.role, content, ...(calls.length ? { tool_calls: calls } : {}) }];
  });
}
