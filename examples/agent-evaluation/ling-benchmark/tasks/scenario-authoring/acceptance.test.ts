import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { ScenarioValidator, parseScenarioFile } from '@artemiskit/core';

const taskRoot = import.meta.dir;

describe('scenario-authoring fixture', () => {
  it('starts with an invalid empty case list', () => {
    const validation = new ScenarioValidator().validate(join(taskRoot, 'fixture', 'scenario.yaml'));

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContainEqual(
      expect.objectContaining({ rule: 'schema-too_small', severity: 'error' })
    );
  });

  it('ends with the requested deterministic routing scenario', async () => {
    const expectedPath = join(taskRoot, 'expected', 'scenario.yaml');
    const validation = new ScenarioValidator().validate(expectedPath);
    const scenario = await parseScenarioFile(expectedPath);

    expect(validation.valid).toBe(true);
    expect(scenario.temperature).toBe(0);
    expect(scenario.cases).toEqual([
      expect.objectContaining({
        id: 'route-billing-request',
        prompt: 'Classify this request with exactly one word: I need a copy of invoice INV-1042.',
        expected: expect.objectContaining({ type: 'exact', value: 'billing' }),
      }),
    ]);
  });
});
