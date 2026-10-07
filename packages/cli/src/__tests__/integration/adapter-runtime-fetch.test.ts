import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

/**
 * Published adapters are bundled for Node, where the provider SDKs fall back to a bundled
 * node-fetch shim that calls the deprecated url.parse(). That prints a DEP0169 warning to the
 * user's stderr on every request. Exercise the built bundles in a fresh process so the default
 * SDK transport is what runs.
 */
const adaptersRoot = resolve(import.meta.dir, '../../../../adapters');

const ADAPTERS = [
  { name: 'openai', exportName: 'OpenAIAdapter', baseUrlPath: '/v1' },
  { name: 'ling', exportName: 'LingAdapter', baseUrlPath: '/v1' },
  { name: 'anthropic', exportName: 'AnthropicAdapter', baseUrlPath: '' },
] as const;

let server: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === '/v1/messages') {
        return Response.json({
          id: 'msg_fixture',
          type: 'message',
          role: 'assistant',
          model: 'fixture-model',
          content: [{ type: 'text', text: 'fixture-reply' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 2, output_tokens: 1 },
        });
      }
      return Response.json({
        id: 'chatcmpl-fixture',
        object: 'chat.completion',
        created: 0,
        model: 'fixture-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'fixture-reply' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      });
    },
  });
});

afterAll(() => {
  server.stop(true);
});

describe('built adapter transport', () => {
  for (const adapter of ADAPTERS) {
    test(`${adapter.name} requests complete without runtime warnings on stderr`, async () => {
      const bundle = resolve(adaptersRoot, adapter.name, 'dist/index.js');
      const script = `
        const { ${adapter.exportName} } = await import(${JSON.stringify(bundle)});
        const client = new ${adapter.exportName}({
          provider: ${JSON.stringify(adapter.name)},
          apiKey: 'fixture-only',
          baseUrl: ${JSON.stringify(`http://127.0.0.1:${server.port}${adapter.baseUrlPath}`)},
          maxRetries: 0,
          timeout: 5000,
        });
        const result = await client.generate({ prompt: 'Say hi', model: 'fixture-model' });
        process.stdout.write(result.text);
      `;
      const child = Bun.spawn([process.execPath, '-e', script], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);

      expect({ exitCode, stdout, stderr }).toEqual({
        exitCode: 0,
        stdout: 'fixture-reply',
        stderr: '',
      });
    });
  }
});
