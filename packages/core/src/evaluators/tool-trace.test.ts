import { describe, expect, it } from 'bun:test';
import { ToolTraceEvaluator } from './tool-trace';

const trace = ['lookup_customer', 'create_ticket'].map((name, step) => ({
  step,
  toolCall: { id: `call-${step}`, type: 'function' as const, function: { name, arguments: '{}' } },
  latencyMs: 1,
}));

describe('ToolTraceEvaluator', () => {
  it('accepts required ordered calls', async () => {
    await expect(
      new ToolTraceEvaluator().evaluate(
        '',
        {
          type: 'tool_trace',
          requiredTools: ['lookup_customer', 'create_ticket'],
          ordered: true,
          maxCalls: 2,
        },
        { toolTrace: trace }
      )
    ).resolves.toMatchObject({ passed: true });
  });

  it('rejects missing, forbidden, and excessive calls', async () => {
    const evaluator = new ToolTraceEvaluator();
    await expect(
      evaluator.evaluate(
        '',
        { type: 'tool_trace', requiredTools: ['delete_customer'] },
        { toolTrace: trace }
      )
    ).resolves.toMatchObject({
      passed: false,
      reason: 'Required tools not called: delete_customer',
    });
    await expect(
      evaluator.evaluate(
        '',
        { type: 'tool_trace', forbiddenTools: ['create_ticket'] },
        { toolTrace: trace }
      )
    ).resolves.toMatchObject({ passed: false, reason: 'Forbidden tools called: create_ticket' });
  });
});
