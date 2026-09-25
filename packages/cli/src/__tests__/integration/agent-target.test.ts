import { describe, expect, test } from 'bun:test';
import { LingAdapter } from '../../../../adapters/ling/src/client';
import { OpenAIAdapter } from '../../../../adapters/openai/src/client';
import {
  type AgentTurnRequest,
  createModelClientTarget,
} from '../../../../core/src/agent-workflow/target';

describe('agent targets through real adapter HTTP transports', () => {
  for (const provider of ['openai', 'ling'] as const) {
    test(`${provider} preserves tool calls and result IDs across turns`, async () => {
      const bodies: { messages: Record<string, unknown>[]; tools: unknown[]; model: string }[] = [];
      const call = {
        id: 'call-document-1',
        type: 'function',
        function: { name: 'read_document', arguments: '{"id":"doc-1"}' },
      };
      const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(req) {
          bodies.push(await req.json());
          const first = bodies.length === 1;
          return Response.json({
            id: `completion-${bodies.length}`,
            object: 'chat.completion',
            created: 1,
            model: 'fixture-observed',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: first ? null : 'Document reviewed.',
                  ...(first ? { tool_calls: [call] } : {}),
                },
                finish_reason: first ? 'tool_calls' : 'stop',
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          });
        },
      });
      try {
        const config = {
          provider,
          apiKey: 'localhost-fixture',
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          maxRetries: 0,
          timeout: 1000,
        };
        const target = createModelClientTarget(
          provider === 'openai' ? new OpenAIAdapter(config) : new LingAdapter(config)
        );
        const request: AgentTurnRequest = {
          messages: [{ role: 'user', content: 'Read document doc-1.' }],
          model: 'fixture-requested',
          tools: [
            {
              type: 'function',
              function: {
                name: 'read_document',
                parameters: {
                  type: 'object',
                  properties: { id: { type: 'string' } },
                  required: ['id'],
                },
              },
            },
          ],
          generation: { maxTokens: 100 },
          budgets: { timeoutMs: 2000, maxToolCalls: 1 },
        };
        const first = await target.turn(request);
        expect(first.status).toBe('completed');
        if (first.status !== 'completed') throw new Error('First turn failed');
        expect(first.message.tool_calls).toEqual([call]);
        const second = await target.turn({
          ...request,
          messages: [
            ...request.messages,
            first.message,
            { role: 'tool', content: '{"text":"Declared fixture document"}', toolCallId: call.id },
          ],
        });
        expect(second.status).toBe('completed');
        if (second.status !== 'completed') throw new Error('Second turn failed');
        expect(second.model).toBe('fixture-observed');
        expect(second.tokens).toEqual({ prompt: 10, completion: 5, total: 15 });
        expect(second.message.content).toBe('Document reviewed.');
        expect(bodies).toHaveLength(2);
        expect(bodies[0].tools).toEqual(request.tools);
        expect(bodies[0].model).toBe('fixture-requested');
        expect(bodies[1].messages[1].tool_calls).toEqual([call]);
        expect(bodies[1].messages[2].tool_call_id).toBe(call.id);
        expect(JSON.stringify(second)).not.toContain('raw');
      } finally {
        server.stop(true);
      }
    });
  }
});
