/**
 * Tests for LangChain adapter
 */

import { describe, expect, it, mock, spyOn } from 'bun:test';
import { LangChainAdapter, createLangChainAdapter } from './client';
import type { LangChainRunnable, LangChainRunnableOutput } from './types';

// Mock runnable factory for testing
function createMockRunnable(
  outputOrFn:
    | string
    | LangChainRunnableOutput
    | ((input: unknown) => Promise<LangChainRunnableOutput>),
  options?: { supportsStreaming?: boolean }
): LangChainRunnable {
  const runnable: LangChainRunnable = {
    invoke: mock(async (input) => {
      if (typeof outputOrFn === 'function') {
        return outputOrFn(input);
      }
      if (typeof outputOrFn === 'string') {
        return outputOrFn as unknown as LangChainRunnableOutput;
      }
      return outputOrFn;
    }),
  };

  if (options?.supportsStreaming) {
    runnable.stream = mock(async function* (input) {
      const result = typeof outputOrFn === 'string' ? outputOrFn : 'streamed content';
      for (const char of result) {
        yield { content: char };
      }
    });
  }

  return runnable;
}

describe('LangChainAdapter', () => {
  describe('constructor', () => {
    it('should create adapter with runnable', () => {
      const runnable = createMockRunnable('test output');
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      expect(adapter.provider).toBe('langchain');
    });

    it('should detect agent type from properties', () => {
      const agentRunnable = {
        ...createMockRunnable('test'),
        agent: {},
      } as LangChainRunnable;

      const adapter = new LangChainAdapter({ provider: 'langchain' }, agentRunnable);
      expect(adapter.provider).toBe('langchain');
    });

    it('should use configured runnable type', () => {
      const runnable = createMockRunnable('test');
      const adapter = new LangChainAdapter(
        { provider: 'langchain', runnableType: 'chain' },
        runnable
      );

      expect(adapter.provider).toBe('langchain');
    });
  });

  describe('generate', () => {
    it('should call runnable.invoke with string prompt', async () => {
      const runnable = createMockRunnable({ output: 'Hello, world!' });
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      const result = await adapter.generate({ prompt: 'Say hello' });

      expect(runnable.invoke).toHaveBeenCalledWith({ input: 'Say hello' });
      expect(result.text).toBe('Hello, world!');
      expect(result.finishReason).toBe('stop');
    });

    it('should handle chat message array prompts', async () => {
      const runnable = createMockRunnable({ output: 'Response' });
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      const result = await adapter.generate({
        prompt: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(runnable.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'Hello',
          system: 'You are helpful',
        })
      );
      expect(result.text).toBe('Response');
    });

    it('should handle direct string responses (StringOutputParser)', async () => {
      const runnable = createMockRunnable('Direct string response');
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.text).toBe('Direct string response');
    });

    it('should handle content property responses', async () => {
      const runnable = createMockRunnable({ content: 'Content response' });
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.text).toBe('Content response');
    });

    it('should handle text property responses', async () => {
      const runnable = createMockRunnable({ text: 'Text response' });
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.text).toBe('Text response');
    });

    it('should handle custom input/output keys', async () => {
      const runnable = createMockRunnable({ answer: 'Custom output' });
      const adapter = new LangChainAdapter(
        { provider: 'langchain', inputKey: 'question', outputKey: 'answer' },
        runnable
      );

      const result = await adapter.generate({ prompt: 'What is 2+2?' });

      expect(runnable.invoke).toHaveBeenCalledWith({ question: 'What is 2+2?' });
      expect(result.text).toBe('Custom output');
    });

    it('should capture intermediate steps from agent execution', async () => {
      const agentOutput: LangChainRunnableOutput = {
        output: 'Final answer',
        intermediateSteps: [
          {
            action: { tool: 'calculator', toolInput: { query: '2+2' } },
            observation: '4',
          },
          {
            action: { tool: 'search', toolInput: { query: 'meaning of life' } },
            observation: '42',
          },
        ],
      };

      const runnable = createMockRunnable(agentOutput);
      const adapter = new LangChainAdapter(
        { provider: 'langchain', runnableType: 'agent' },
        runnable
      );

      const result = await adapter.generate({ prompt: 'Complex question' });

      expect(result.text).toBe('Final answer');
      expect(result.raw).toMatchObject({
        metadata: {
          runnableType: 'agent',
          toolsUsed: ['calculator', 'search'],
          totalToolCalls: 2,
        },
      });
    });

    it('should track latency', async () => {
      const runnable = createMockRunnable(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { output: 'Delayed response' };
      });

      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);
      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.latencyMs).toBeGreaterThanOrEqual(10);
    });

    it('should include model name in result', async () => {
      const runnable = createMockRunnable({ output: 'Test' });
      const adapter = new LangChainAdapter(
        { provider: 'langchain', name: 'my-rag-chain' },
        runnable
      );

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.model).toBe('my-rag-chain');
    });

    it('should fallback to JSON for complex outputs', async () => {
      const complexOutput = { data: { nested: 'value' }, count: 42 };
      const runnable = createMockRunnable(complexOutput as unknown as LangChainRunnableOutput);
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.text).toBe(JSON.stringify(complexOutput));
    });
  });

  describe('stream', () => {
    it('should stream chunks when supported', async () => {
      const runnable = createMockRunnable('streaming', { supportsStreaming: true });
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      for await (const chunk of adapter.stream({ prompt: 'Test' }, onChunk)) {
        // Collect
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBe('streaming');
    });

    it('should fallback to generate when streaming not supported', async () => {
      const runnable = createMockRunnable({ output: 'non-streaming' });
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      for await (const chunk of adapter.stream({ prompt: 'Test' }, onChunk)) {
        // Collect
      }

      expect(chunks).toEqual(['non-streaming']);
    });
  });

  describe('capabilities', () => {
    it('should report streaming capability based on runnable', async () => {
      const streamingRunnable = createMockRunnable('test', { supportsStreaming: true });
      const adapter = new LangChainAdapter({ provider: 'langchain' }, streamingRunnable);

      const caps = await adapter.capabilities();
      expect(caps.streaming).toBe(true);
    });

    it('should report no streaming when not supported', async () => {
      const runnable = createMockRunnable('test');
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      const caps = await adapter.capabilities();
      expect(caps.streaming).toBe(false);
    });

    it('should report tool capabilities for agents', async () => {
      const runnable = createMockRunnable('test');
      const adapter = new LangChainAdapter(
        { provider: 'langchain', runnableType: 'agent' },
        runnable
      );

      const caps = await adapter.capabilities();
      expect(caps.functionCalling).toBe(true);
      expect(caps.toolUse).toBe(true);
    });

    it('should report no tool capabilities for chains', async () => {
      const runnable = createMockRunnable('test');
      const adapter = new LangChainAdapter(
        { provider: 'langchain', runnableType: 'chain' },
        runnable
      );

      const caps = await adapter.capabilities();
      expect(caps.functionCalling).toBe(false);
      expect(caps.toolUse).toBe(false);
    });
  });

  describe('close', () => {
    it('should complete without error', async () => {
      const runnable = createMockRunnable('test');
      const adapter = new LangChainAdapter({ provider: 'langchain' }, runnable);

      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });
});

describe('createLangChainAdapter', () => {
  it('should create adapter with factory function', () => {
    const runnable = createMockRunnable('test');
    const adapter = createLangChainAdapter(runnable, { name: 'test-chain' });

    expect(adapter).toBeInstanceOf(LangChainAdapter);
    expect(adapter.provider).toBe('langchain');
  });

  it('should work with minimal options', () => {
    const runnable = createMockRunnable('test');
    const adapter = createLangChainAdapter(runnable);

    expect(adapter).toBeInstanceOf(LangChainAdapter);
  });
});
