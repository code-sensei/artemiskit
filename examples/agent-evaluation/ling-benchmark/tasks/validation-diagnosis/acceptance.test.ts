import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { ScenarioValidator } from '@artemiskit/core';

const taskRoot = import.meta.dir;

describe('validation-diagnosis fixture', () => {
  it('contains one deterministic validation failure', () => {
    const validation = new ScenarioValidator().validate(join(taskRoot, 'fixture', 'scenario.yaml'));

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual([
      expect.objectContaining({
        line: 7,
        message: 'Invalid input',
        rule: 'schema-invalid_union',
        severity: 'error',
      }),
    ]);
  });

  it('expects a structured evidence-backed diagnosis', async () => {
    const diagnosis = await Bun.file(join(taskRoot, 'expected', 'diagnosis.json')).json();

    expect(diagnosis).toEqual({
      command: 'akit validate scenario.yaml',
      exitCode: 1,
      valid: false,
      issue: {
        line: 7,
        rule: 'schema-invalid_union',
        messageContains: 'Invalid input',
      },
      recommendedFix: {
        path: 'cases[0].expected.type',
        from: 'includes',
        to: 'contains',
      },
    });
  });
});
