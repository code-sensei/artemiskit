/**
 * Tests for DeepAgents adapter
 */

import { describe, expect, it, mock } from 'bun:test';
import { DeepAgentsAdapter, createDeepAgentsAdapter } from './client';
import type { DeepAgentsCallbacks, DeepAgentsOutput, DeepAgentsSystem } from './types';

// Mock system factory for testing
function createMockSystem(
  outputOrFn:
    | string
    | DeepAgentsOutput
    | ((input: unknown, config?: { callbacks?: DeepAgentsCallbacks }) => Promise<DeepAgentsOutput>),
  options?: { supportsStreaming?: boolean; method?: 'invoke' | 'run' | 'execute' }
): DeepAgentsSystem {
  const execFn = mock(async (input, config) => {
    // Trigger callbacks if provided
    if (config?.callbacks) {
      config.callbacks.onAgentStart?.('agent1', input);
      config.callbacks.onAgentEnd?.('agent1', 'result');
    }

    if (typeof outputOrFn === 'function') {
      return outputOrFn(input, config);
    }
    if (typeof outputOrFn === 'string') {
      return { result: outputOrFn };
    }
    return outputOrFn;
  });

  const system: DeepAgentsSystem = {};
  const method = options?.method ?? 'invoke';

  if (method === 'invoke') {
    system.invoke = execFn;
  } else if (method === 'run') {
    system.run = execFn;
  } else {
    system.execute = execFn;
  }

  if (options?.supportsStreaming) {
    system.stream = mock(async function* (input) {
      yield { type: 'agent_start', agent: 'agent1', timestamp: Date.now() };
      yield { type: 'token', content: 'Hello' };
      yield { type: 'token', content: ' World' };
      yield { type: 'agent_end', agent: 'agent1', timestamp: Date.now() };
      yield { type: 'done' };
    });
  }

  return system;
}

describe('DeepAgentsAdapter', () => {
  describe('constructor', () => {
    it('should create adapter with system', () => {
      const system = createMockSystem('test output');
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      expect(adapter.provider).toBe('deepagents');
    });

    it('should accept system with run() method', () => {
      const system = createMockSystem('test', { method: 'run' });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      expect(adapter.provider).toBe('deepagents');
    });

    it('should accept system with execute() method', () => {
      const system = createMockSystem('test', { method: 'execute' });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      expect(adapter.provider).toBe('deepagents');
    });

    it('should throw if system has no execution method', () => {
      expect(() => {
        new DeepAgentsAdapter({ provider: 'deepagents' }, {} as DeepAgentsSystem);
      }).toThrow('must have an invoke(), run(), or execute() method');
    });
  });

  describe('generate', () => {
    it('should call system.invoke with string prompt', async () => {
      const system = createMockSystem({ result: 'Generated content' });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const result = await adapter.generate({ prompt: 'Create something' });

      expect(system.invoke).toHaveBeenCalled();
      expect(result.text).toBe('Generated content');
      expect(result.finishReason).toBe('stop');
    });

    it('should handle chat message array prompts', async () => {
      const system = createMockSystem({ result: 'Response' });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const result = await adapter.generate({
        prompt: [
          { role: 'system', content: 'You are a helpful team' },
          { role: 'user', content: 'Create content' },
        ],
      });

      expect(system.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'Create content',
          context: { systemPrompt: 'You are a helpful team' },
        }),
        expect.anything()
      );
      expect(result.text).toBe('Response');
    });

    it('should extract output from various response shapes', async () => {
      const shapes = [
        { result: 'from result' },
        { output: 'from output' },
        { response: 'from response' },
        { answer: 'from answer' },
      ];

      for (const shape of shapes) {
        const system = createMockSystem(shape);
        const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);
        const result = await adapter.generate({ prompt: 'Test' });
        expect(result.text).toBe(Object.values(shape)[0]);
      }
    });

    it('should extract output from traces when no direct output', async () => {
      const system = createMockSystem({
        traces: [{ agent: 'writer', action: 'generate', output: 'Final output from trace' }],
      });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.text).toBe('Final output from trace');
    });

    it('should capture traces when enabled', async () => {
      const system = createMockSystem({
        result: 'Done',
        traces: [
          { agent: 'researcher', action: 'search', toolsUsed: ['web_search'] },
          { agent: 'writer', action: 'write', output: 'Article' },
        ],
      });
      const adapter = new DeepAgentsAdapter(
        { provider: 'deepagents', captureTraces: true },
        system
      );

      const result = await adapter.generate({ prompt: 'Research and write' });

      expect(result.raw.metadata.toolsUsed).toContain('web_search');
    });

    it('should capture messages between agents', async () => {
      const system = createMockSystem({
        result: 'Final',
        messages: [
          { from: 'coordinator', to: 'researcher', content: 'Find info', type: 'delegation' },
          { from: 'researcher', to: 'coordinator', content: 'Here is info', type: 'response' },
        ],
      });
      const adapter = new DeepAgentsAdapter(
        { provider: 'deepagents', captureMessages: true },
        system
      );

      const result = await adapter.generate({ prompt: 'Do research' });

      expect(result.raw.metadata.totalMessages).toBe(2);
      expect(result.raw.metadata.agentsInvolved).toContain('coordinator');
      expect(result.raw.metadata.agentsInvolved).toContain('researcher');
    });

    it('should track latency', async () => {
      const system = createMockSystem(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { result: 'Delayed' };
      });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.latencyMs).toBeGreaterThanOrEqual(10);
    });

    it('should include model name in result', async () => {
      const system = createMockSystem({ result: 'Test' });
      const adapter = new DeepAgentsAdapter(
        { provider: 'deepagents', name: 'research-team' },
        system
      );

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.model).toBe('research-team');
    });

    it('should extract token usage when available', async () => {
      const system = createMockSystem({
        result: 'Test',
        tokenUsage: { prompt: 100, completion: 50, total: 150 },
      });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.tokens).toEqual({ prompt: 100, completion: 50, total: 150 });
    });

    it('should use run() when invoke() not available', async () => {
      const system = createMockSystem({ result: 'From run' }, { method: 'run' });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(system.run).toHaveBeenCalled();
      expect(result.text).toBe('From run');
    });

    it('should use execute() when invoke() and run() not available', async () => {
      const system = createMockSystem({ result: 'From execute' }, { method: 'execute' });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(system.execute).toHaveBeenCalled();
      expect(result.text).toBe('From execute');
    });

    it('should trigger callback tracking', async () => {
      let callbacksCalled = false;
      const system = createMockSystem(async (input, config) => {
        if (config?.callbacks?.onAgentStart) {
          config.callbacks.onAgentStart('testAgent', input);
          callbacksCalled = true;
        }
        return { result: 'Done' };
      });

      const adapter = new DeepAgentsAdapter(
        { provider: 'deepagents', captureTraces: true },
        system
      );

      await adapter.generate({ prompt: 'Test' });

      expect(callbacksCalled).toBe(true);
    });
  });

  describe('stream', () => {
    it('should stream chunks when supported', async () => {
      const system = createMockSystem('test', { supportsStreaming: true });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      for await (const chunk of adapter.stream({ prompt: 'Test' }, onChunk)) {
        // Collect
      }

      expect(chunks.join('')).toBe('Hello World');
    });

    it('should fallback to generate when streaming not supported', async () => {
      const system = createMockSystem({ result: 'non-streaming result' });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const chunks: string[] = [];
      const onChunk = (chunk: string) => chunks.push(chunk);

      for await (const chunk of adapter.stream({ prompt: 'Test' }, onChunk)) {
        // Collect
      }

      expect(chunks).toEqual(['non-streaming result']);
    });
  });

  describe('capabilities', () => {
    it('should report streaming capability based on system', async () => {
      const streamingSystem = createMockSystem('test', { supportsStreaming: true });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, streamingSystem);

      const caps = await adapter.capabilities();
      expect(caps.streaming).toBe(true);
    });

    it('should report no streaming when not supported', async () => {
      const system = createMockSystem('test');
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const caps = await adapter.capabilities();
      expect(caps.streaming).toBe(false);
    });

    it('should report tool capabilities', async () => {
      const system = createMockSystem('test');
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const caps = await adapter.capabilities();
      expect(caps.functionCalling).toBe(true);
      expect(caps.toolUse).toBe(true);
    });
  });

  describe('close', () => {
    it('should complete without error', async () => {
      const system = createMockSystem('test');
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      await expect(adapter.close()).resolves.toBeUndefined();
    });
  });

  describe('metadata extraction', () => {
    it('should extract unique agents from traces and messages', async () => {
      const system = createMockSystem({
        result: 'Done',
        agents: ['coordinator'],
        traces: [{ agent: 'researcher', action: 'search' }],
        messages: [{ from: 'writer', to: 'editor', content: 'Review this' }],
      });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const result = await adapter.generate({ prompt: 'Test' });

      const agents = result.raw.metadata.agentsInvolved;
      expect(agents).toContain('coordinator');
      expect(agents).toContain('researcher');
      expect(agents).toContain('writer');
      expect(agents).toContain('editor');
    });

    it('should count tool calls correctly', async () => {
      const system = createMockSystem({
        result: 'Done',
        traces: [
          { agent: 'agent1', action: 'use_tool', toolsUsed: ['search', 'fetch'] },
          { agent: 'agent2', action: 'use_tool', toolsUsed: ['calculate'] },
        ],
      });
      const adapter = new DeepAgentsAdapter({ provider: 'deepagents' }, system);

      const result = await adapter.generate({ prompt: 'Test' });

      expect(result.raw.metadata.totalToolCalls).toBe(3);
      expect(result.raw.metadata.toolsUsed).toContain('search');
      expect(result.raw.metadata.toolsUsed).toContain('fetch');
      expect(result.raw.metadata.toolsUsed).toContain('calculate');
    });
  });
});

describe('createDeepAgentsAdapter', () => {
  it('should create adapter with factory function', () => {
    const system = createMockSystem('test');
    const adapter = createDeepAgentsAdapter(system, { name: 'test-team' });

    expect(adapter).toBeInstanceOf(DeepAgentsAdapter);
    expect(adapter.provider).toBe('deepagents');
  });

  it('should work with minimal options', () => {
    const system = createMockSystem('test');
    const adapter = createDeepAgentsAdapter(system);

    expect(adapter).toBeInstanceOf(DeepAgentsAdapter);
  });
});
