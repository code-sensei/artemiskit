import { describe, expect, test } from 'bun:test';
import { type WorkflowAssertionCounts, decideWorkflowOutcome } from './outcome-status';

const counts = (changes: Partial<WorkflowAssertionCounts> = {}): WorkflowAssertionCounts => ({
  declared: 0,
  passed: 0,
  failed: 0,
  invalid: 0,
  unavailable: 0,
  valid: 0,
  ...changes,
});
function options(): Parameters<typeof decideWorkflowOutcome>[0] {
  return {
    purpose: 'workflow',
    cancelled: false,
    record: {
      execution: 'completed',
      policy: 'passed',
      usage: {
        status: 'reported',
        reported: { prompt: 1, completion: 1, total: 2 },
        missingRequests: 0,
        inFlightUnknown: false,
        preflight: { prompt: 0, completion: 0, total: 0 },
      },
      cleanup: { status: 'completed', pendingOperations: 0, artifacts: 'discarded' },
      artifacts: { state: 'available', stateSha256: 'a'.repeat(64) },
      configuration: {
        sha256: 'b'.repeat(64),
        provider: { sha256: 'c'.repeat(64) },
        model: { sha256: 'd'.repeat(64) },
        generation: { maxTokens: 256, temperature: 0 },
        limits: { max_actions: 10, timeout_ms: 1000 },
      },
    },
    deterministic: counts({ declared: 1, passed: 1, valid: 1 }),
    semantic: counts(),
  };
}
describe('task outcome and denominator rules', () => {
  test('all required outcomes pass; no semantic declaration needs no judge', () => {
    expect(decideWorkflowOutcome(options())).toEqual({
      status: 'passed',
      reason: 'verified',
      task: { eligible: 1, passed: 1, failed: 0 },
    });
  });
  test('known failure remains eligible while skipped semantic coverage remains unavailable', () => {
    const value = options();
    value.deterministic = counts({ declared: 1, failed: 1, valid: 1 });
    value.semantic = counts({ declared: 1, unavailable: 1 });
    expect(decideWorkflowOutcome(value)).toEqual({
      status: 'failed',
      reason: 'required_outcome_failed',
      task: { eligible: 1, passed: 0, failed: 1 },
    });
  });
  test('missing and invalid judge measurements are excluded; valid judge failure is included', () => {
    for (const status of ['invalid', 'unavailable', 'failed'] as const) {
      const value = options();
      value.semantic = counts({ declared: 1, [status]: 1, valid: status === 'failed' ? 1 : 0 });
      const result = decideWorkflowOutcome(value);
      expect(result.status).toBe(status);
      expect(result.task.eligible).toBe(status === 'failed' ? 1 : 0);
    }
  });
  test('policy/runtime/measurement/cleanup/cancellation cannot be overridden by passing assertions', () => {
    const cases: Parameters<typeof decideWorkflowOutcome>[0][] = [];
    const policy = options();
    policy.record.policy = 'denied';
    cases.push(policy);
    const runtime = options();
    runtime.record.execution = 'failed';
    cases.push(runtime);
    const usage = options();
    usage.record.usage.status = 'unavailable';
    cases.push(usage);
    const cleanup = options();
    cleanup.record.cleanup.status = 'unresolved';
    cases.push(cleanup);
    const pending = options();
    pending.record.cleanup.pendingOperations = 1;
    cases.push(pending);
    const snapshot = options();
    snapshot.record.artifacts = { state: 'unavailable' };
    cases.push(snapshot);
    const configuration = options();
    configuration.record.configuration = undefined;
    cases.push(configuration);
    const cancellation = options();
    cancellation.cancelled = true;
    cases.push(cancellation);
    const preflight = options();
    preflight.purpose = 'preflight';
    cases.push(preflight);
    for (const value of cases) {
      const result = decideWorkflowOutcome(value);
      expect(result.status).toBe('unavailable');
      expect(result.task).toEqual({ eligible: 0, passed: 0, failed: 0 });
    }
  });
  test('empty requirements and inconsistent count arithmetic cannot become verified', () => {
    for (const deterministic of [
      counts(),
      counts({ declared: 1, passed: 1 }),
      counts({ declared: 1, passed: 2, valid: 2 }),
    ]) {
      const result = decideWorkflowOutcome({ ...options(), deterministic });
      expect(result.status).toBe('invalid');
      expect(result.task.eligible).toBe(0);
    }
  });
});
