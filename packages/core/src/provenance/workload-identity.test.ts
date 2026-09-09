import { describe, expect, test } from 'bun:test';
import { validateScenario } from '../scenario';
import { createWorkloadIdentity } from './workload-identity';

const baseScenario = () =>
  validateScenario({
    name: 'Customer-service policy test',
    version: '2026-09',
    providerConfig: { apiKey: 'sk-live-very-secret-value' },
    setup: {
      systemPrompt: 'Use token=internal-secret only for this fixture.',
    },
    cases: [
      {
        id: 'refund-policy',
        prompt: 'Can I receive a refund?',
        expected: {
          type: 'llm_grader',
          rubric: 'Approve only eligible refunds.',
          strict: true,
          threshold: 0.8,
        },
      },
    ],
  });

describe('createWorkloadIdentity', () => {
  test('is deterministic for equivalent declared scenario material', () => {
    const first = createWorkloadIdentity(baseScenario());
    const second = createWorkloadIdentity(baseScenario());

    expect(first).toEqual(second);
    expect(first.workload.digest).toHaveLength(64);
    expect(first.rubric.digest).toHaveLength(64);
  });

  test('separates workload changes from rubric changes', () => {
    const base = baseScenario();
    const changedPrompt = structuredClone(base);
    changedPrompt.cases[0].prompt = 'Can I receive a replacement?';
    const changedRubric = structuredClone(base);
    changedRubric.cases[0].expected = {
      type: 'llm_grader',
      rubric: 'Approve only eligible replacements.',
      strict: true,
      threshold: 0.8,
    };

    const baseIdentity = createWorkloadIdentity(base);
    const promptIdentity = createWorkloadIdentity(changedPrompt);
    const rubricIdentity = createWorkloadIdentity(changedRubric);

    expect(promptIdentity.workload.digest).not.toBe(baseIdentity.workload.digest);
    expect(promptIdentity.rubric.digest).toBe(baseIdentity.rubric.digest);
    expect(rubricIdentity.workload.digest).toBe(baseIdentity.workload.digest);
    expect(rubricIdentity.rubric.digest).not.toBe(baseIdentity.rubric.digest);
  });

  test('excludes sensitive configuration and recognized secret text before hashing', () => {
    const first = baseScenario();
    first.cases[0].metadata = { author: 'ArtemisKit', authToken: 'fixture-token-one' };
    const second = structuredClone(first);
    second.providerConfig = { apiKey: 'sk-live-another-secret-value' };
    second.setup = { systemPrompt: 'Use token=different-secret only for this fixture.' };
    second.cases[0].metadata = { author: 'ArtemisKit', authToken: 'fixture-token-two' };

    expect(createWorkloadIdentity(second)).toEqual(createWorkloadIdentity(first));
  });
});
