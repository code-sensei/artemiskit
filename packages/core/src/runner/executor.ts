/**
 * Test case executor
 */

import type { CaseRedactionInfo, CaseResult } from '../artifacts/types';
import { getEvaluator } from '../evaluators';
import { type RedactionConfig, Redactor } from '../redaction';
import type { TestCase } from '../scenario/schema';
import { mergeVariables, substituteVariables } from '../scenario/variables';
import {
  DEFAULT_TOOL_LOOP_POLICY,
  FixtureToolExecutor,
  type ToolLoopSummary,
  type ToolTraceEntry,
} from '../tools';
import type { ExecutorContext } from './types';

/**
 * Merge redaction configs with priority: CLI > case > scenario
 */
function mergeRedactionConfig(
  scenarioConfig?: RedactionConfig,
  caseConfig?: RedactionConfig,
  cliConfig?: RedactionConfig
): RedactionConfig {
  // CLI config takes highest priority if enabled is explicitly set
  if (cliConfig?.enabled !== undefined) {
    return {
      enabled: cliConfig.enabled,
      patterns: cliConfig.patterns ?? caseConfig?.patterns ?? scenarioConfig?.patterns,
      redactPrompts:
        cliConfig.redactPrompts ??
        caseConfig?.redactPrompts ??
        scenarioConfig?.redactPrompts ??
        true,
      redactResponses:
        cliConfig.redactResponses ??
        caseConfig?.redactResponses ??
        scenarioConfig?.redactResponses ??
        true,
      redactMetadata:
        cliConfig.redactMetadata ??
        caseConfig?.redactMetadata ??
        scenarioConfig?.redactMetadata ??
        false,
      replacement:
        cliConfig.replacement ??
        caseConfig?.replacement ??
        scenarioConfig?.replacement ??
        '[REDACTED]',
    };
  }

  // Case config takes priority over scenario
  if (caseConfig?.enabled !== undefined) {
    return {
      enabled: caseConfig.enabled,
      patterns: caseConfig.patterns ?? scenarioConfig?.patterns,
      redactPrompts: caseConfig.redactPrompts ?? scenarioConfig?.redactPrompts ?? true,
      redactResponses: caseConfig.redactResponses ?? scenarioConfig?.redactResponses ?? true,
      redactMetadata: caseConfig.redactMetadata ?? scenarioConfig?.redactMetadata ?? false,
      replacement: caseConfig.replacement ?? scenarioConfig?.replacement ?? '[REDACTED]',
    };
  }

  // Fall back to scenario config
  if (scenarioConfig?.enabled) {
    return {
      enabled: scenarioConfig.enabled,
      patterns: scenarioConfig.patterns,
      redactPrompts: scenarioConfig.redactPrompts ?? true,
      redactResponses: scenarioConfig.redactResponses ?? true,
      redactMetadata: scenarioConfig.redactMetadata ?? false,
      replacement: scenarioConfig.replacement ?? '[REDACTED]',
    };
  }

  // Default: disabled
  return {
    enabled: false,
    redactPrompts: true,
    redactResponses: true,
    redactMetadata: false,
    replacement: '[REDACTED]',
  };
}

/**
 * Execute a single test case
 */
export async function executeCase(
  testCase: TestCase,
  context: ExecutorContext
): Promise<CaseResult> {
  const { timeout, retries = 0 } = context;
  const caseStartTime = Date.now();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await executeCaseAttempt(testCase, context, timeout);
      return result;
    } catch (error) {
      lastError = error as Error;
      if (error instanceof ToolLoopError) return error.caseResult;
      if (attempt < retries) {
        // Wait before retry with exponential backoff
        await sleep(2 ** attempt * 1000);
      }
    }
  }

  // All retries failed
  const latencyMs = Date.now() - caseStartTime;
  return {
    id: testCase.id,
    name: testCase.name,
    ok: false,
    score: 0,
    matcherType: testCase.expected.type,
    reason: `Failed after ${retries + 1} attempts: ${lastError?.message}`,
    latencyMs,
    tokens: { prompt: 0, completion: 0, total: 0 },
    prompt: testCase.prompt,
    response: '',
    expected: testCase.expected,
    tags: testCase.tags,
    error: lastError?.message,
  };
}

async function executeCaseAttempt(
  testCase: TestCase,
  context: ExecutorContext,
  timeout?: number
): Promise<CaseResult> {
  const { client, scenario, redaction: cliRedaction, toolExecutor } = context;

  // Merge scenario-level and case-level variables (case overrides scenario)
  const variables = mergeVariables(scenario.variables, testCase.variables);

  // Apply variable substitution to prompt
  let prompt = substituteVariables(testCase.prompt, variables);

  // Build prompt with system prompt if present
  if (scenario.setup?.systemPrompt && typeof prompt === 'string') {
    const systemPrompt = substituteVariables(scenario.setup.systemPrompt, variables);
    prompt = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: prompt },
    ];
  }

  // Generate response with optional timeout
  const tools = scenario.setup?.tools;
  const fixtures = scenario.setup?.fixtures;
  const policy = { ...DEFAULT_TOOL_LOOP_POLICY, ...scenario.setup?.toolLoop };
  const toolTrace: ToolTraceEntry[] = [];
  let toolLoop: ToolLoopSummary | undefined;
  let loopPrompt =
    typeof prompt === 'string' ? [{ role: 'user' as const, content: prompt }] : prompt;
  const generate = () =>
    client.generate({
      prompt: loopPrompt,
      model: testCase.model || scenario.model,
      temperature: scenario.temperature,
      maxTokens: scenario.maxTokens,
      seed: scenario.seed,
      tools,
    });
  const generatePromise = generate();

  let result = timeout
    ? await Promise.race([generatePromise, createTimeout(timeout)])
    : await generatePromise;

  if (policy.enabled) {
    if (!tools || (!fixtures && !toolExecutor)) {
      throw createToolLoopError(
        testCase,
        toolTrace,
        {
          status: 'error',
          steps: 0,
          terminationReason: 'tool_error',
        },
        'TOOL_EXECUTOR_REQUIRED'
      );
    }
    const executor =
      toolExecutor ??
      new FixtureToolExecutor({
        tools,
        fixtures: fixtures ?? {},
        maxToolResultBytes: policy.maxToolResultBytes,
      });
    const seenCalls = new Set<string>();
    const loopStartedAt = Date.now();
    for (let step = 0; result.toolCalls?.length && step < policy.maxSteps; step++) {
      const calls = result.toolCalls;
      loopPrompt.push({ role: 'assistant', content: result.text, tool_calls: calls });
      for (const call of calls) {
        const fingerprint = `${call.function.name}:${call.function.arguments}`;
        if (policy.rejectDuplicateCalls && seenCalls.has(fingerprint)) {
          throw createToolLoopError(
            testCase,
            toolTrace,
            {
              status: 'error',
              steps: step,
              terminationReason: 'duplicate_call',
            },
            'TOOL_DUPLICATE_CALL'
          );
        }
        seenCalls.add(fingerprint);
        const toolStart = Date.now();
        const execution = await executor.execute(call, { caseId: testCase.id, step });
        const traceEntry: ToolTraceEntry = {
          step,
          toolCall: call,
          result: execution.result,
          error: execution.error,
          latencyMs: Date.now() - toolStart,
        };
        toolTrace.push(traceEntry);
        if (execution.status === 'error') {
          if (execution.error?.code === 'TOOL_EXECUTION_FAILED') {
            loopPrompt.push({
              role: 'tool',
              name: call.function.name,
              toolCallId: call.id,
              content: JSON.stringify({ error: execution.error.message }),
            });
            continue;
          }
          throw createToolLoopError(
            testCase,
            toolTrace,
            {
              status: 'error',
              steps: step + 1,
              terminationReason:
                execution.error?.code === 'TOOL_UNKNOWN'
                  ? 'unknown_tool'
                  : execution.error?.code?.startsWith('TOOL_ARGUMENTS')
                    ? 'invalid_arguments'
                    : 'tool_error',
            },
            execution.error?.code ?? 'TOOL_EXECUTION_FAILED'
          );
        }
        const content = JSON.stringify(execution.result ?? {});
        loopPrompt.push({
          role: 'tool',
          name: call.function.name,
          toolCallId: call.id,
          content,
        });
      }
      const remainingLoopTime = policy.timeoutMs - (Date.now() - loopStartedAt);
      if (remainingLoopTime <= 0) {
        throw createToolLoopError(
          testCase,
          toolTrace,
          { status: 'error', steps: step + 1, terminationReason: 'timeout' },
          'TOOL_LOOP_TIMEOUT'
        );
      }
      const requestTimeout = timeout ? Math.min(timeout, remainingLoopTime) : remainingLoopTime;
      result = await Promise.race([generate(), createTimeout(requestTimeout)]);
    }
    if (result.toolCalls?.length) {
      throw createToolLoopError(
        testCase,
        toolTrace,
        {
          status: 'error',
          steps: policy.maxSteps,
          terminationReason: 'max_steps',
        },
        'TOOL_LOOP_MAX_STEPS'
      );
    }
    toolLoop = { status: 'completed', steps: toolTrace.length, terminationReason: 'completed' };
  }

  // Evaluate response
  const evaluator = getEvaluator(testCase.expected.type);
  const evalResult = await evaluator.evaluate(result.text, testCase.expected, {
    client,
    testCase,
    toolTrace,
  });

  // Determine effective redaction config (CLI > case > scenario)
  const effectiveRedaction = mergeRedactionConfig(
    scenario.redaction,
    testCase.redaction,
    cliRedaction
  );

  // Apply redaction if enabled
  let finalPrompt: string | object = testCase.prompt;
  let finalResponse = result.text;
  let redactionInfo: CaseRedactionInfo | undefined;

  if (effectiveRedaction.enabled) {
    const redactor = new Redactor(effectiveRedaction);

    let promptRedacted = false;
    let responseRedacted = false;
    let totalRedactions = 0;

    // Redact prompt if configured
    if (effectiveRedaction.redactPrompts) {
      if (typeof finalPrompt === 'string') {
        const promptResult = redactor.redactPrompt(finalPrompt);
        finalPrompt = promptResult.text;
        promptRedacted = promptResult.wasRedacted;
        totalRedactions += promptResult.redactionCount;
      } else if (Array.isArray(finalPrompt)) {
        // Handle chat message array
        finalPrompt = finalPrompt.map((msg) => {
          if (typeof msg === 'object' && 'content' in msg && typeof msg.content === 'string') {
            const promptResult = redactor.redactPrompt(msg.content);
            if (promptResult.wasRedacted) {
              promptRedacted = true;
              totalRedactions += promptResult.redactionCount;
            }
            return { ...msg, content: promptResult.text };
          }
          return msg;
        });
      }
    }

    // Redact response if configured
    if (effectiveRedaction.redactResponses) {
      const responseResult = redactor.redactResponse(finalResponse);
      finalResponse = responseResult.text;
      responseRedacted = responseResult.wasRedacted;
      totalRedactions += responseResult.redactionCount;
    }

    redactionInfo = {
      redacted: promptRedacted || responseRedacted,
      promptRedacted,
      responseRedacted,
      redactionCount: totalRedactions,
    };
  }

  return {
    id: testCase.id,
    name: testCase.name,
    ok: evalResult.passed,
    score: evalResult.score,
    matcherType: testCase.expected.type,
    reason: evalResult.reason,
    latencyMs: result.latencyMs,
    tokens: result.tokens,
    prompt: finalPrompt,
    response: finalResponse,
    expected: testCase.expected,
    tags: testCase.tags,
    redaction: redactionInfo,
    toolTrace: toolTrace.length ? toolTrace : undefined,
    toolLoop,
  };
}

function createToolLoopError(
  testCase: TestCase,
  toolTrace: ToolTraceEntry[],
  toolLoop: ToolLoopSummary,
  code: string
): ToolLoopError {
  return new ToolLoopError(code, {
    id: testCase.id,
    name: testCase.name,
    ok: false,
    score: 0,
    matcherType: testCase.expected.type,
    reason: code,
    latencyMs: 0,
    tokens: { prompt: 0, completion: 0, total: 0 },
    prompt: testCase.prompt,
    response: '',
    expected: testCase.expected,
    tags: testCase.tags,
    error: code,
    toolTrace,
    toolLoop,
  });
}

class ToolLoopError extends Error {
  constructor(
    message: string,
    readonly caseResult: CaseResult
  ) {
    super(message);
  }
}

function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
