import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { ScenarioValidator, parseScenarioFile } from '@artemiskit/core';

const taskRoot = import.meta.dir;

describe('tool-trace-authoring fixture', () => {
  it('starts without the required expectation', () => {
    const validation = new ScenarioValidator().validate(join(taskRoot, 'fixture', 'scenario.yaml'));

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContainEqual(
      expect.objectContaining({ rule: 'schema-invalid_union', severity: 'error' })
    );
  });

  it('adds a bounded ordered tool-trace expectation', async () => {
    const expectedPath = join(taskRoot, 'expected', 'scenario.yaml');
    const validation = new ScenarioValidator().validate(expectedPath);
    const scenario = await parseScenarioFile(expectedPath);

    expect(validation.valid).toBe(true);
    expect(scenario.setup?.toolLoop).toEqual(
      expect.objectContaining({ enabled: true, maxSteps: 3, rejectDuplicateCalls: true })
    );
    expect(scenario.cases[0]?.expected).toEqual({
      type: 'tool_trace',
      requiredTools: ['lookup_invoice', 'search_invoices'],
      forbiddenTools: ['delete_invoice'],
      ordered: true,
      maxCalls: 2,
    });
  });
});
