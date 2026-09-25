import { isDeepStrictEqual } from 'node:util';
import { Agent } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { ToolLoopAgent, jsonSchema, stepCountIs, tool } from 'ai';
import { createFxAgent } from 'libfx';
import { createModelClientTarget } from '../../packages/core/dist/index.js';
import { instructions } from './cases.mjs';
import { descriptors, messagesToOpenAI } from './common.mjs';

export async function session(backend, c, saved) {
  const signal = c.controller.signal;
  if (backend === 'native') {
    const messages = saved ?? [{ role: 'system', content: instructions }];
    const target = createModelClientTarget({
      provider: 'experiment',
      capabilities: async () => ({
        toolUse: true,
        functionCalling: true,
        streaming: false,
        maxContext: 32768,
      }),
      generate: async (options) => {
        const r = await c.generate(messagesToOpenAI(options.prompt));
        return {
          id: `response-${c.requests}`,
          model: c.live ? 'qwen2.5-coder:3b' : 'fixture',
          text: r.text,
          tokens: r.usage,
          latencyMs: 0,
          finishReason: r.calls.length ? 'tool_calls' : 'stop',
          toolCalls: r.calls.map((t) => ({
            id: t.id,
            type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.input) },
          })),
        };
      },
    });
    return {
      async ask(prompt) {
        messages.push({ role: 'user', content: prompt });
        while (!signal.aborted) {
          const r = await target.turn(
            {
              messages,
              tools: descriptors.map((d) => ({
                type: 'function',
                function: { name: d.id, description: d.description, parameters: d.inputSchema },
              })),
              generation: { maxTokens: 128, temperature: 0 },
              budgets: { timeoutMs: 60_000, maxToolCalls: 8 },
            },
            signal
          );
          if (r.status !== 'completed') return { status: r.code, text: '' };
          messages.push(r.message);
          if (!r.message.tool_calls?.length)
            return { status: 'completed', text: r.message.content };
          for (const t of r.message.tool_calls) {
            c.events.push({ type: 'tool_start', id: t.id });
            const output = await c.execute(t.function.name, JSON.parse(t.function.arguments));
            c.events.push({ type: 'tool_end', id: t.id });
            messages.push({ role: 'tool', content: JSON.stringify(output), toolCallId: t.id });
          }
        }
        return { status: 'cancelled', text: '' };
      },
      snapshot: async () => structuredClone(messages),
      close: async () => {},
    };
  }
  if (backend === 'ai-sdk') {
    let messages = saved ?? [];
    const agent = new ToolLoopAgent({
      model: {
        specificationVersion: 'v3',
        provider: 'experiment',
        modelId: 'fixture',
        supportedUrls: {},
        async doGenerate(options) {
          const r = await c.generate(messagesToOpenAI(options.prompt));
          return {
            content: [
              ...(r.text ? [{ type: 'text', text: r.text }] : []),
              ...r.calls.map((t) => ({
                type: 'tool-call',
                toolCallId: t.id,
                toolName: t.name,
                input: JSON.stringify(t.input),
              })),
            ],
            finishReason: { unified: r.calls.length ? 'tool-calls' : 'stop', raw: undefined },
            usage: {
              inputTokens: { total: r.usage.prompt },
              outputTokens: { total: r.usage.completion },
            },
            warnings: [],
          };
        },
      },
      instructions,
      maxRetries: 0,
      stopWhen: stepCountIs(12),
      tools: Object.fromEntries(
        descriptors.map((d) => [
          d.id,
          tool({
            description: d.description,
            inputSchema: jsonSchema(d.inputSchema),
            execute: (input) => c.execute(d.id, input),
          }),
        ])
      ),
      onStepFinish(step) {
        c.events.push(
          ...step.toolCalls.map((t) => ({ type: 'tool_start', id: t.toolCallId })),
          ...step.toolResults.map((t) => ({ type: 'tool_end', id: t.toolCallId }))
        );
      },
    });
    return {
      async ask(prompt) {
        const pending = [...messages, { role: 'user', content: prompt }];
        const result = await agent.generate({ messages: pending, abortSignal: signal });
        messages = [...pending, ...result.response.messages];
        return { status: result.finishReason, text: result.text };
      },
      snapshot: async () => structuredClone(messages),
      close: async () => {},
    };
  }
  if (backend === 'pi') {
    const model = {
      id: 'fixture',
      name: 'fixture',
      api: 'openai-completions',
      provider: 'experiment',
      baseUrl: 'http://127.0.0.1',
      reasoning: false,
      input: ['text'],
      contextWindow: 32768,
      maxTokens: 128,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const tools = descriptors.map((d) => ({
      name: d.id,
      label: d.id,
      description: d.description,
      parameters: d.inputSchema,
      execute: async (_id, input) => ({
        content: [{ type: 'text', text: JSON.stringify(await c.execute(d.id, input)) }],
        details: {},
      }),
    }));
    const agent = new Agent({
      initialState: {
        systemPrompt: instructions,
        model,
        tools,
        ...(saved ? { messages: saved } : {}),
      },
      toolExecution: 'sequential',
      beforeToolCall: c.spec.strictRawArguments
        ? ({ toolCall, args }) => {
            // Pi deliberately coerces schema values. Strict assessment must observe that change.
            if (!isDeepStrictEqual(toolCall.arguments, args)) {
              c.guardStops.push('rewritten_arguments');
              return { block: true, terminate: true, reason: 'Raw tool arguments were rewritten' };
            }
          }
        : undefined,
      streamFn(_model, ctx) {
        const stream = createAssistantMessageEventStream();
        (async () => {
          const base = {
            role: 'assistant',
            api: model.api,
            provider: model.provider,
            model: model.id,
            timestamp: Date.now(),
            content: [],
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          };
          try {
            const r = await c.generate(messagesToOpenAI(ctx.messages));
            const message = {
              ...base,
              content: [
                ...(r.text ? [{ type: 'text', text: r.text }] : []),
                ...r.calls.map((t) => ({
                  type: 'toolCall',
                  id: t.id,
                  name: t.name,
                  arguments: t.input,
                })),
              ],
              stopReason: r.calls.length ? 'toolUse' : 'stop',
              usage: {
                ...base.usage,
                input: r.usage.prompt,
                output: r.usage.completion,
                totalTokens: r.usage.total,
              },
            };
            stream.push({ type: 'done', reason: message.stopReason, message });
            stream.end(message);
          } catch {
            const error = {
              ...base,
              stopReason: signal.aborted ? 'aborted' : 'error',
              errorMessage: 'experiment_transport_stopped',
            };
            stream.push({ type: 'error', reason: error.stopReason, error });
            stream.end(error);
          }
        })();
        return stream;
      },
    });
    agent.state.tools = tools;
    const abort = () => agent.abort();
    signal.addEventListener('abort', abort);
    agent.subscribe((event) => {
      if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end')
        c.events.push({
          type: event.type === 'tool_execution_start' ? 'tool_start' : 'tool_end',
          id: event.toolCallId,
        });
    });
    return {
      async ask(prompt) {
        await agent.prompt(prompt);
        const message = agent.state.messages.filter((m) => m.role === 'assistant').at(-1);
        return {
          status: message?.stopReason ?? 'unavailable',
          text:
            message?.content
              .filter((p) => p.type === 'text')
              .map((p) => p.text)
              .join('') ?? '',
        };
      },
      snapshot: async () => JSON.parse(JSON.stringify(agent.state.messages)),
      async close() {
        signal.removeEventListener('abort', abort);
        agent.abort();
        await agent.waitForIdle();
      },
    };
  }
  if (backend === 'fx') {
    const agent = await createFxAgent({
      apiKey: 'offline-fixture-only',
      model: 'sdk/tool-model',
      backend: 'native',
      instructions,
      ...(saved ? { checkpoint: Buffer.from(saved, 'base64') } : {}),
      tools: descriptors.map((d) => ({
        name: d.id,
        description: d.description,
        inputSchema: d.inputSchema,
        execute: (input) => c.execute(d.id, input),
      })),
      fetch: async (_url, init = {}) => {
        if ((init.method ?? 'GET').toUpperCase() === 'GET')
          return Response.json({
            object: 'list',
            data: [{ id: 'sdk/tool-model', type: 'language', tags: ['tool-use'] }],
          });
        const body = JSON.parse(
          typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body)
        );
        const r = await c.generate(messagesToOpenAI(body.prompt ?? body.messages));
        const events = [
          ...(r.text ? [{ type: 'text-delta', delta: r.text }] : []),
          ...r.calls.map((t) => ({
            type: 'tool-call',
            toolCallId: t.id,
            toolName: t.name,
            input: t.input,
          })),
          {
            type: 'finish',
            finishReason: { unified: r.calls.length ? 'tool-calls' : 'stop', raw: 'fixture' },
            usage: {
              inputTokens: { total: r.usage.prompt },
              outputTokens: { total: r.usage.completion },
            },
          },
        ];
        return new Response(
          `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}data: [DONE]\n\n`,
          { headers: { 'content-type': 'text/event-stream' } }
        );
      },
    });
    return {
      async ask(prompt) {
        const turn = agent.prompt(prompt, { signal });
        let text = '';
        for await (const e of turn) {
          if (e.type === 'text_delta') text += e.delta;
          if (e.type === 'tool_start' || e.type === 'tool_end')
            c.events.push({ type: e.type, id: e.id });
        }
        const result = await turn.result;
        return { status: result.stopReason, text };
      },
      snapshot: async () => Buffer.from(await agent.checkpoint()).toString('base64'),
      close: () => agent.close(),
    };
  }
  throw new Error('Unknown backend');
}
