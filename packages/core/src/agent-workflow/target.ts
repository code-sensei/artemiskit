import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import { z } from 'zod';
import type { GenerateOptions, ModelClient, TokenUsage, ToolCall } from '../adapters/types';
import { getWorkflowTool } from './catalog';

const identifier = z.string().min(1).max(256);
const toolName = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/);
const text = z.string().max(1_000_000);
const toolCallSchema = z
  .object({
    id: identifier,
    type: z.literal('function'),
    function: z.object({ name: toolName, arguments: text }).strict(),
  })
  .strict();
const messageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: text,
    toolCallId: identifier.optional(),
    tool_calls: z.array(toolCallSchema).min(1).max(100).optional(),
  })
  .strict();
const timeoutSchema = z.number().int().min(1).max(2_147_483_647);
export const agentTurnRequestSchema = z
  .object({
    messages: z.array(messageSchema).min(1).max(1000),
    tools: z
      .array(
        z
          .object({
            type: z.literal('function'),
            function: z
              .object({
                name: toolName,
                description: z.string().max(10_000).optional(),
                parameters: z.record(z.unknown()),
              })
              .strict(),
          })
          .strict()
      )
      .max(100),
    model: identifier.optional(),
    generation: z
      .object({
        maxTokens: z.number().int().positive().max(1_000_000),
        temperature: z.number().finite().min(0).max(2).optional(),
        topP: z.number().finite().min(0).max(1).optional(),
        seed: z.number().int().safe().optional(),
        stop: z.array(z.string().min(1).max(1000)).max(16).optional(),
      })
      .strict(),
    budgets: z
      .object({
        timeoutMs: timeoutSchema,
        maxToolCalls: z.number().int().min(0).max(100),
      })
      .strict(),
  })
  .strict();
const resultSchema = z.object({
  usageAvailable: z.boolean().optional(),
  id: identifier,
  model: identifier,
  text,
  tokens: z.object({
    prompt: z.number().int().nonnegative().safe(),
    completion: z.number().int().nonnegative().safe(),
    total: z.number().int().nonnegative().safe(),
  }),
  latencyMs: z.number().finite().nonnegative(),
  finishReason: z
    .enum(['stop', 'length', 'function_call', 'tool_calls', 'content_filter'])
    .optional(),
  toolCalls: z.array(toolCallSchema).max(100).optional(),
  functionCall: z.unknown().optional(),
});

export type AgentTurnRequest = z.infer<typeof agentTurnRequestSchema>;
export type AgentTargetFailure = {
  rejectedCall?: {
    requestedCallIdHash: string;
    tool: string;
    reason: 'undeclared_tool' | 'invalid_arguments' | 'duplicate_id';
  };
  tokens?: TokenUsage;
  usageAvailable?: boolean;
  status: 'unsupported' | 'invalid' | 'error';
  code:
    | 'invalid_request'
    | 'tool_use_unsupported'
    | 'invalid_response'
    | 'target_error'
    | 'timeout'
    | 'aborted';
};
export type AgentTargetCapabilities = {
  status: 'available';
  toolUse: boolean;
  transportCancellation: boolean;
};
export type AgentTurnResult =
  | AgentTargetFailure
  | {
      status: 'completed';
      id: string;
      model: string;
      message: { role: 'assistant'; content: string; tool_calls?: ToolCall[] };
      /** Adapter-reported counts only; zero can mean unavailable in existing adapters. */
      tokens: TokenUsage;
      usageAvailable?: boolean;
      latencyMs: number;
      finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
    };

/** One bounded model turn. Tool execution, policy enforcement, and scoring belong to the harness. */
export interface AgentTarget {
  readonly provider: string;
  capabilities(
    options: { timeoutMs: number },
    signal?: AbortSignal
  ): Promise<AgentTargetCapabilities | AgentTargetFailure>;
  turn(request: AgentTurnRequest, signal?: AbortSignal): Promise<AgentTurnResult>;
  /** Wait for underlying callbacks hidden behind a bounded turn facade. */
  drain?(options: { timeoutMs: number }): Promise<{ pendingOperations: number }>;
}

const failure = (
  status: AgentTargetFailure['status'],
  code: AgentTargetFailure['code']
): AgentTargetFailure => ({ status, code });

/** Do not expose provider exception text, which can contain credentials or customer content. */
function bounded<T>(
  run: () => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T | AgentTargetFailure> {
  if (signal?.aborted) return Promise.resolve(failure('error', 'aborted'));
  return new Promise((resolve) => {
    let finished = false;
    const finish = (value: T | AgentTargetFailure) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(value);
    };
    const abort = () => finish(failure('error', 'aborted'));
    const timer = setTimeout(() => finish(failure('error', 'timeout')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then<T | AgentTargetFailure>(() => (signal?.aborted ? failure('error', 'aborted') : run()))
      .then(finish, () => finish(failure('error', 'target_error')));
  });
}

export function validWorkflowTranscript(messages: AgentTurnRequest['messages']): boolean {
  const seen = new Set<string>();
  const pending = new Set<string>();
  for (const message of messages) {
    if (message.role === 'tool') {
      if (!message.toolCallId || message.tool_calls || !pending.delete(message.toolCallId))
        return false;
      continue;
    }
    if (message.toolCallId || pending.size || (message.tool_calls && message.role !== 'assistant'))
      return false;
    for (const call of message.tool_calls ?? []) {
      if (seen.has(call.id)) return false;
      try {
        const args: unknown = JSON.parse(call.function.arguments);
        if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
      } catch {
        return false;
      }
      seen.add(call.id);
      pending.add(call.id);
    }
  }
  return pending.size === 0;
}

/**
 * Bridge existing adapters without provider-specific dispatch. Workflow calls disable supported
 * transport retries and propagate abort only when the adapter declares transport cancellation.
 * Returned text/tool arguments are working conversation data, not sanitized retained evidence.
 */
export function createModelClientTarget(client: ModelClient): AgentTarget {
  if (
    !client ||
    !identifier.safeParse(client.provider).success ||
    typeof client.generate !== 'function' ||
    typeof client.capabilities !== 'function'
  ) {
    throw new TypeError('Invalid ModelClient');
  }
  const pending = new Set<Promise<unknown>>();
  const track = <T>(promise: Promise<T>): Promise<T> => {
    pending.add(promise);
    void promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise)
    );
    return promise;
  };
  const readCapabilities = async (): Promise<AgentTargetCapabilities | AgentTargetFailure> => {
    const value = await track(client.capabilities());
    if (!value || typeof value.toolUse !== 'boolean') return failure('invalid', 'invalid_response');
    return {
      status: 'available',
      toolUse: value.toolUse,
      transportCancellation: value.transportCancellation === true,
    };
  };
  return {
    provider: client.provider,
    async drain({ timeoutMs }) {
      if (!timeoutSchema.safeParse(timeoutMs).success) return { pendingOperations: pending.size };
      await bounded(() => Promise.allSettled([...pending]), timeoutMs);
      return { pendingOperations: pending.size };
    },
    async capabilities(options, signal) {
      if (!timeoutSchema.safeParse(options?.timeoutMs).success)
        return failure('invalid', 'invalid_request');
      return bounded(readCapabilities, options.timeoutMs, signal);
    },
    async turn(request, signal) {
      let parsed: ReturnType<typeof agentTurnRequestSchema.safeParse>;
      try {
        parsed = agentTurnRequestSchema.safeParse(request);
      } catch {
        return failure('invalid', 'invalid_request');
      }
      if (!parsed.success || !validWorkflowTranscript(parsed.data.messages))
        return failure('invalid', 'invalid_request');
      const input = parsed.data;
      const validators = new Map<string, ReturnType<Ajv['compile']>>();
      try {
        const ajv = new Ajv({ strict: false, allErrors: false, validateFormats: false });
        for (const tool of input.tools) {
          if (validators.has(tool.function.name)) return failure('invalid', 'invalid_request');
          // Compile a detached JSON schema without remote loading or async validation.
          const schema = JSON.parse(JSON.stringify(tool.function.parameters));
          if (schema.$async) return failure('invalid', 'invalid_request');
          const validate = ajv.compile(schema);
          if ('$async' in validate && validate.$async) return failure('invalid', 'invalid_request');
          validators.set(tool.function.name, validate);
        }
      } catch {
        return failure('invalid', 'invalid_request');
      }
      const started = Date.now();
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) controller.abort();
      const timer = setTimeout(abort, input.budgets.timeoutMs);
      return bounded(
        async (): Promise<AgentTurnResult> => {
          const capabilities = await readCapabilities();
          if (capabilities.status !== 'available') return capabilities;
          if (input.tools.length && !capabilities.toolUse)
            return failure('unsupported', 'tool_use_unsupported');
          if (signal?.aborted) return failure('error', 'aborted');
          if (Date.now() - started >= input.budgets.timeoutMs) return failure('error', 'timeout');
          const options: GenerateOptions = {
            maxRetries: 0,
            prompt: input.messages,
            tools: input.tools,
            model: input.model,
            ...input.generation,
            ...(capabilities.transportCancellation ? { signal: controller.signal } : {}),
          };
          const generated = resultSchema.safeParse(await track(client.generate(options)));
          if (!generated.success) return failure('invalid', 'invalid_response');
          const result = generated.data;
          const calls = result.toolCalls ?? [];
          if (
            result.functionCall !== undefined ||
            result.finishReason === 'function_call' ||
            (result.finishReason === 'tool_calls' && calls.length === 0) ||
            calls.length > input.budgets.maxToolCalls ||
            result.tokens.total !== result.tokens.prompt + result.tokens.completion
          )
            return failure('invalid', 'invalid_response');
          const ids = new Set(
            input.messages.flatMap((message) => message.tool_calls?.map((call) => call.id) ?? [])
          );
          const rejected = (
            call: ToolCall,
            reason: NonNullable<AgentTargetFailure['rejectedCall']>['reason']
          ): AgentTargetFailure => ({
            ...failure('invalid', 'invalid_response'),
            tokens: result.tokens,
            ...(result.usageAvailable !== undefined
              ? { usageAvailable: result.usageAvailable }
              : {}),
            rejectedCall: {
              requestedCallIdHash: createHash('sha256').update(call.id).digest('hex'),
              tool: getWorkflowTool(call.function.name)?.id ?? 'unknown',
              reason,
            },
          });
          for (const call of calls) {
            if (ids.has(call.id)) return rejected(call, 'duplicate_id');
            ids.add(call.id);
            const validate = validators.get(call.function.name);
            if (!validate) return rejected(call, 'undeclared_tool');
            try {
              const args: unknown = JSON.parse(call.function.arguments);
              if (
                !args ||
                typeof args !== 'object' ||
                Array.isArray(args) ||
                !validate ||
                validate(args) !== true
              )
                return rejected(call, 'invalid_arguments');
            } catch {
              return rejected(call, 'invalid_arguments');
            }
          }
          return {
            status: 'completed',
            id: result.id,
            model: result.model,
            message: {
              role: 'assistant',
              content: result.text,
              ...(calls.length ? { tool_calls: calls } : {}),
            },
            tokens: result.tokens,
            ...(result.usageAvailable !== undefined
              ? { usageAvailable: result.usageAvailable }
              : {}),
            latencyMs: result.latencyMs,
            finishReason: result.finishReason,
          };
        },
        input.budgets.timeoutMs,
        signal
      )
        .then((result) =>
          controller.signal.aborted
            ? failure('error', signal?.aborted ? 'aborted' : 'timeout')
            : result
        )
        .finally(() => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
        });
    },
  };
}
