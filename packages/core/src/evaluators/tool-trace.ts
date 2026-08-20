import type { Expected } from '../scenario/schema';
import type { Evaluator, EvaluatorContext, EvaluatorResult } from './types';

type ToolTraceExpected = Extract<Expected, { type: 'tool_trace' }>;

export class ToolTraceEvaluator implements Evaluator {
  readonly type = 'tool_trace';

  async evaluate(
    _response: string,
    expected: Expected,
    context?: EvaluatorContext
  ): Promise<EvaluatorResult> {
    const expectation = expected as ToolTraceExpected;
    const calls = (context?.toolTrace ?? []).map((entry) => entry.toolCall.function.name);
    const required = expectation.requiredTools ?? [];
    const forbidden = expectation.forbiddenTools ?? [];

    const missing = required.filter((name) => !calls.includes(name));
    if (missing.length) return fail(`Required tools not called: ${missing.join(', ')}`, calls);

    const presentForbidden = forbidden.filter((name) => calls.includes(name));
    if (presentForbidden.length)
      return fail(`Forbidden tools called: ${presentForbidden.join(', ')}`, calls);

    if (expectation.maxCalls !== undefined && calls.length > expectation.maxCalls) {
      return fail(`Tool calls exceeded limit of ${expectation.maxCalls}`, calls);
    }

    if (expectation.ordered && !isOrdered(calls, required)) {
      return fail('Required tools were not called in order', calls);
    }

    return { passed: true, score: 1, reason: 'Tool trace matched expectation', details: { calls } };
  }
}

function isOrdered(calls: string[], required: string[]): boolean {
  let start = 0;
  for (const tool of required) {
    const index = calls.indexOf(tool, start);
    if (index === -1) return false;
    start = index + 1;
  }
  return true;
}

function fail(reason: string, calls: string[]): EvaluatorResult {
  return { passed: false, score: 0, reason, details: { calls } };
}
