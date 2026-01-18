/**
 * Mock adapter for CLI integration tests
 */

import type { LLMAdapter, LLMResponse } from '@artemiskit/core';

export interface MockResponse {
  content: string;
  latencyMs?: number;
  tokens?: { input: number; output: number };
}

export interface MockAdapterOptions {
  responses?: Map<string, MockResponse>;
  defaultResponse?: MockResponse;
  shouldFail?: boolean;
  failureMessage?: string;
}

/**
 * Creates a mock LLM adapter for testing
 */
export function createMockAdapter(options: MockAdapterOptions = {}): LLMAdapter {
  const {
    responses = new Map(),
    defaultResponse = {
      content: 'Hello! How can I help you today?',
      latencyMs: 100,
      tokens: { input: 10, output: 15 },
    },
    shouldFail = false,
    failureMessage = 'Mock adapter failure',
  } = options;

  return {
    chat: async (messages): Promise<LLMResponse> => {
      if (shouldFail) {
        throw new Error(failureMessage);
      }

      // Get the last user message to determine response
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
      const prompt = lastUserMessage?.content || '';

      // Check for specific response mapping
      const mockResponse = responses.get(prompt) || defaultResponse;

      // Simulate latency
      if (mockResponse.latencyMs) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(mockResponse.latencyMs!, 50)));
      }

      return {
        content: mockResponse.content,
        usage: mockResponse.tokens || { input: 10, output: 15 },
      };
    },
  };
}

/**
 * Preset responses for common test scenarios
 */
export const mockResponses = {
  greeting: {
    content: 'Hello! How can I help you today?',
    latencyMs: 50,
    tokens: { input: 5, output: 8 },
  },
  capitals: {
    content: 'The capital of France is Paris.',
    latencyMs: 75,
    tokens: { input: 10, output: 8 },
  },
  math: {
    content: 'The answer is 4.',
    latencyMs: 30,
    tokens: { input: 8, output: 5 },
  },
  json: {
    content: '{"name": "John", "age": 30}',
    latencyMs: 60,
    tokens: { input: 15, output: 12 },
  },
  code: {
    content: 'function add(a, b) { return a + b; }',
    latencyMs: 80,
    tokens: { input: 20, output: 15 },
  },
};
