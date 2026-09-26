import { describe, expect, test } from 'bun:test';
import { WorkflowEnvironmentInitializationError } from './environment';
import { validateAgentWorkflow } from './parser';
import { createDockerWorkflowEnvironment, createDockerWorkflowEnvironmentFactory } from './sandbox';

function workflow() {
  return validateAgentWorkflow({
    version: '1',
    kind: 'agent_workflow',
    name: 'sandbox',
    target: { provider: 'custom', model: 'fixture' },
    environment: {
      type: 'sandbox',
      policy: {
        network: 'denied',
        side_effects: 'denied',
        permissions: { files: 'write' },
        budgets: { max_actions: 5, timeout_ms: 1000 },
      },
    },
    tools: ['read_file', 'write_file'],
    workflow: {
      system_instructions: 'Use declared tools.',
      initial_state: {},
      turns: [{ role: 'user', content: 'Read.' }],
    },
    outcomes: {
      deterministic: [{ type: 'policy', rule: 'permissions_respected', expected: 'passed' }],
    },
    evidence: { trace: 'summary', artifacts: 'checksums', redact: true },
  });
}
describe('Docker workflow environment offline admission', () => {
  test('accepts qualified default cleanup and explicit bounded timeouts', () => {
    expect(typeof createDockerWorkflowEnvironmentFactory()).toBe('function');
    expect(
      typeof createDockerWorkflowEnvironmentFactory({
        operationTimeoutMs: 5000,
        cleanupTimeoutMs: 3000,
      })
    ).toBe('function');
  });
  test.each([0, -1, 30_001, Number.NaN, 1.5])(
    'rejects invalid operation timeout %s',
    (operationTimeoutMs) => {
      expect(() => createDockerWorkflowEnvironmentFactory({ operationTimeoutMs })).toThrow(
        'Invalid Docker'
      );
    }
  );
  test.each([0, -1, 10_001, Number.NaN, 1.5])(
    'rejects invalid cleanup timeout %s',
    (cleanupTimeoutMs) => {
      expect(() => createDockerWorkflowEnvironmentFactory({ cleanupTimeoutMs })).toThrow(
        'Invalid Docker'
      );
    }
  );
  test('rejects executable, image, environment and command overrides', () => {
    for (const key of ['image', 'dockerCommand', 'env', 'command', 'mount'])
      expect(() =>
        createDockerWorkflowEnvironmentFactory({ [key]: 'untrusted' } as never)
      ).toThrow();
  });
  test('pre-cancelled startup never needs Docker or claims remaining resources', async () => {
    const controller = new AbortController();
    controller.abort();
    try {
      await createDockerWorkflowEnvironment({
        workflow: workflow(),
        initialState: {},
        signal: controller.signal,
      });
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowEnvironmentInitializationError);
      expect((error as WorkflowEnvironmentInitializationError).cleanup).toEqual({
        status: 'completed',
        artifacts: 'discarded',
        pendingOperations: 0,
      });
    }
  });
  test.each([
    { files: { '../escape.txt': 'no' } },
    { files: { 'x.txt': 3 } },
    { files: { 'x.txt': 'x'.repeat(16385) } },
    { files: [] },
  ])('rejects invalid fixture before Docker access', async (initialState) => {
    await expect(
      createDockerWorkflowEnvironment({
        workflow: workflow(),
        initialState,
        signal: new AbortController().signal,
      })
    ).rejects.toBeInstanceOf(WorkflowEnvironmentInitializationError);
  });
  test('rejects wrong environment and ungranted policy before Docker access', async () => {
    const value = workflow();
    value.environment.type = 'simulated';
    await expect(
      createDockerWorkflowEnvironment({
        workflow: value,
        initialState: {},
        signal: new AbortController().signal,
      })
    ).rejects.toBeInstanceOf(WorkflowEnvironmentInitializationError);
  });
});
