import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ScenarioValidator, parseScenarioFile } from '@artemiskit/core';

const taskRoot = import.meta.dir;

describe('minimal-failing-case-repair fixture', () => {
  it('starts valid but fails the fixture regression assertion', async () => {
    const fixturePath = join(taskRoot, 'fixture', 'scenario.yaml');
    const validation = new ScenarioValidator().validate(fixturePath);
    const scenario = await parseScenarioFile(fixturePath);

    expect(validation.valid).toBe(true);
    expect(scenario.cases[0]?.expected).toEqual(expect.objectContaining({ value: 'WAITING' }));
  });

  it('repairs only the incorrect expected value', async () => {
    const fixturePath = join(taskRoot, 'fixture', 'scenario.yaml');
    const expectedPath = join(taskRoot, 'expected', 'scenario.yaml');
    const [fixtureSource, expectedSource] = await Promise.all([
      readFile(fixturePath, 'utf8'),
      readFile(expectedPath, 'utf8'),
    ]);
    const validation = new ScenarioValidator().validate(expectedPath);
    const scenario = await parseScenarioFile(expectedPath);

    expect(validation.valid).toBe(true);
    expect(scenario.cases[0]?.expected).toEqual(expect.objectContaining({ value: 'READY' }));
    expect(fixtureSource.replace('value: WAITING', 'value: READY')).toBe(expectedSource);
  });
});
