/**
 * DeepAgents Adapter
 * Wraps DeepAgents multi-agent systems for ArtemisKit testing
 */

import type {
  AdapterConfig,
  GenerateOptions,
  GenerateResult,
  ModelCapabilities,
  ModelClient,
} from '@artemiskit/core';
import { nanoid } from 'nanoid';
import type {
  DeepAgentsAdapterConfig,
  DeepAgentsCallbacks,
  DeepAgentsExecutionMetadata,
  DeepAgentsMessage,
  DeepAgentsOutput,
  DeepAgentsSystem,
  DeepAgentsTrace,
} from './types';

/**
 * Adapter for testing DeepAgents multi-agent systems with ArtemisKit
 *
 * @example
 * ```typescript
 * import { DeepAgentsAdapter } from '@artemiskit/adapter-deepagents';
 * import { createTeam } from 'deepagents';
 *
 * // Create a DeepAgents team
 * const team = createTeam({
 *   agents: [researcher, writer, editor],
 *   workflow: 'sequential',
 * });
 *
 * // Wrap with ArtemisKit adapter
 * const adapter = new DeepAgentsAdapter(
 *   { provider: 'deepagents', name: 'content-team' },
 *   team
 * );
 *
 * // Use in ArtemisKit tests
 * const result = await adapter.generate({
 *   prompt: 'Write an article about AI testing',
 * });
 * ```
 */
export class DeepAgentsAdapter implements ModelClient {
  private system: DeepAgentsSystem;
  private config: DeepAgentsAdapterConfig;
  readonly provider = 'deepagents';

  // Execution tracking
  private traces: DeepAgentsTrace[] = [];
  private messages: DeepAgentsMessage[] = [];

  constructor(config: AdapterConfig, system: DeepAgentsSystem) {
    this.config = config as DeepAgentsAdapterConfig;
    this.system = system;
    this.validateSystem(system);
  }

  /**
   * Validate that the system has a usable execution method
   */
  private validateSystem(system: DeepAgentsSystem): void {
    const hasMethod =
      typeof system.invoke === 'function' ||
      typeof system.run === 'function' ||
      typeof system.execute === 'function';

    if (!hasMethod) {
      throw new Error('DeepAgents system must have an invoke(), run(), or execute() method');
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();

    // Reset tracking for this execution
    this.traces = [];
    this.messages = [];

    // Prepare input
    const input = this.prepareInput(options);

    // Create callbacks for tracking if enabled
    const callbacks = this.createCallbacks();

    // Execute the system
    const execConfig = {
      timeout: this.config.executionTimeout ?? 300000,
      callbacks,
    };

    const response = await this.executeSystem(input, execConfig);

    const latencyMs = Date.now() - startTime;

    // Extract output
    const text = this.extractOutput(response);

    // Build metadata
    const metadata = this.extractMetadata(response);

    // Extract token usage if available
    const tokens = {
      prompt: response.tokenUsage?.prompt ?? 0,
      completion: response.tokenUsage?.completion ?? 0,
      total: response.tokenUsage?.total ?? 0,
    };

    return {
      id: nanoid(),
      model: this.config.name || 'deepagents:system',
      text,
      tokens,
      latencyMs,
      finishReason: 'stop',
      raw: {
        response,
        metadata,
      },
    };
  }

  /**
   * Execute the DeepAgents system using available method
   */
  private async executeSystem(
    input: Record<string, unknown>,
    config: Record<string, unknown>
  ): Promise<DeepAgentsOutput> {
    // Try methods in order of preference
    if (typeof this.system.invoke === 'function') {
      return this.system.invoke(input, config);
    }
    if (typeof this.system.run === 'function') {
      return this.system.run(input, config);
    }
    if (typeof this.system.execute === 'function') {
      return this.system.execute(input, config);
    }

    throw new Error('No execution method available on DeepAgents system');
  }

  async *stream(options: GenerateOptions, onChunk: (chunk: string) => void): AsyncIterable<string> {
    if (!this.system.stream) {
      // Fallback to non-streaming
      const result = await this.generate(options);
      onChunk(result.text);
      yield result.text;
      return;
    }

    // Reset tracking
    this.traces = [];
    this.messages = [];

    const input = this.prepareInput(options);
    const stream = this.system.stream(input, {
      timeout: this.config.executionTimeout ?? 300000,
    });

    for await (const event of stream) {
      // Track events
      if (event.type === 'agent_start' || event.type === 'agent_end') {
        this.traces.push({
          agent: event.agent || 'unknown',
          action: event.type,
          output: event.data,
          timestamp: event.timestamp || Date.now(),
        });
      }

      if (event.type === 'message' && event.data) {
        const msgData = event.data as DeepAgentsMessage;
        this.messages.push(msgData);
      }

      // Emit text content
      if (event.type === 'token' && event.content) {
        onChunk(event.content);
        yield event.content;
      }
    }
  }

  async capabilities(): Promise<ModelCapabilities> {
    return {
      streaming: typeof this.system.stream === 'function',
      functionCalling: true, // Multi-agent systems typically use tools
      toolUse: true,
      maxContext: 128000, // Varies by underlying models
      vision: false, // Depends on underlying agents
      jsonMode: false,
    };
  }

  async close(): Promise<void> {
    // No cleanup needed for most DeepAgents systems
  }

  /**
   * Prepare input for the DeepAgents system
   */
  private prepareInput(options: GenerateOptions): Record<string, unknown> {
    // Handle string prompts
    if (typeof options.prompt === 'string') {
      return {
        task: options.prompt,
        query: options.prompt,
        input: options.prompt,
      };
    }

    // Handle chat message array
    const messages = options.prompt;
    const lastUserMessage = messages.findLast((m) => m.role === 'user');
    const systemMessage = messages.find((m) => m.role === 'system');

    const input: Record<string, unknown> = {
      task: lastUserMessage?.content || '',
      query: lastUserMessage?.content || '',
      input: lastUserMessage?.content || '',
    };

    if (systemMessage) {
      input.context = { systemPrompt: systemMessage.content };
    }

    // Include full message history for context
    input.messages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    return input;
  }

  /**
   * Extract text output from DeepAgents response
   */
  private extractOutput(response: DeepAgentsOutput): string {
    // Check common output keys
    const possibleKeys = ['result', 'output', 'response', 'answer', 'content'];

    for (const key of possibleKeys) {
      const value = response[key];
      if (typeof value === 'string') {
        return value;
      }
    }

    // If we have traces, use the last agent's output
    if (response.traces?.length) {
      const lastTrace = response.traces[response.traces.length - 1];
      if (lastTrace.output) {
        return typeof lastTrace.output === 'string'
          ? lastTrace.output
          : JSON.stringify(lastTrace.output);
      }
    }

    // Fallback to JSON
    return JSON.stringify(response);
  }

  /**
   * Create callbacks for execution tracking
   */
  private createCallbacks(): DeepAgentsCallbacks {
    const callbacks: DeepAgentsCallbacks = {};

    if (this.config.captureTraces !== false) {
      callbacks.onAgentStart = (agent, input) => {
        this.traces.push({
          agent,
          action: 'start',
          input,
          timestamp: Date.now(),
        });
      };

      callbacks.onAgentEnd = (agent, output) => {
        this.traces.push({
          agent,
          action: 'end',
          output,
          timestamp: Date.now(),
        });
      };

      callbacks.onToolUse = (agent, tool, input) => {
        this.traces.push({
          agent,
          action: 'tool_use',
          input: { tool, toolInput: input },
          toolsUsed: [tool],
          timestamp: Date.now(),
        });
      };
    }

    if (this.config.captureMessages !== false) {
      callbacks.onMessage = (from, to, message) => {
        this.messages.push({
          from,
          to,
          content: typeof message === 'string' ? message : JSON.stringify(message),
          timestamp: Date.now(),
        });
      };
    }

    return callbacks;
  }

  /**
   * Extract execution metadata
   */
  private extractMetadata(response: DeepAgentsOutput): DeepAgentsExecutionMetadata {
    // Combine response traces with our tracked traces
    const allTraces = [...(response.traces || []), ...this.traces];
    const allMessages = [...(response.messages || []), ...this.messages];

    // Extract unique agents
    const agentsSet = new Set<string>();
    for (const trace of allTraces) {
      agentsSet.add(trace.agent);
    }
    for (const msg of allMessages) {
      agentsSet.add(msg.from);
      agentsSet.add(msg.to);
    }
    if (response.agents) {
      for (const agent of response.agents) {
        agentsSet.add(agent);
      }
    }

    // Extract tools used
    const toolsSet = new Set<string>();
    let toolCallCount = 0;
    for (const trace of allTraces) {
      if (trace.toolsUsed) {
        for (const tool of trace.toolsUsed) {
          toolsSet.add(tool);
        }
        toolCallCount += trace.toolsUsed.length;
      }
    }

    return {
      name: this.config.name,
      agentsInvolved: Array.from(agentsSet),
      totalAgentCalls: allTraces.filter((t) => t.action === 'start' || t.action === 'end').length,
      totalMessages: allMessages.length,
      totalToolCalls: toolCallCount,
      toolsUsed: Array.from(toolsSet),
      traces: this.config.captureTraces !== false ? allTraces : undefined,
      messages: this.config.captureMessages !== false ? allMessages : undefined,
      executionTimeMs: response.executionTimeMs,
    };
  }
}

/**
 * Factory function to create a DeepAgents adapter
 *
 * @example
 * ```typescript
 * const adapter = createDeepAgentsAdapter(myTeam, {
 *   name: 'research-team',
 *   captureTraces: true,
 * });
 * ```
 */
export function createDeepAgentsAdapter(
  system: DeepAgentsSystem,
  options?: Partial<DeepAgentsAdapterConfig>
): DeepAgentsAdapter {
  const config: DeepAgentsAdapterConfig = {
    provider: 'deepagents',
    ...options,
  };

  return new DeepAgentsAdapter(config, system);
}
