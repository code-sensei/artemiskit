import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { checkScenarioRepair } from './acceptance';

const exampleRoot = import.meta.dir;

describe('scenario repair acceptance', () => {
  it('rejects the intentionally broken fixture through the ArtemisKit validator', async () => {
    const result = await checkScenarioRepair(join(exampleRoot, 'fixture'));

    expect(result.passed).toBe(false);
    expect(result.scenarioValid).toBe(false);
    expect(result.expectationType).toBeUndefined();
  });

  it('accepts the expected one-line repair through the ArtemisKit parser', async () => {
    const result = await checkScenarioRepair(join(exampleRoot, 'expected'));

    expect(result.passed).toBe(true);
    expect(result.scenarioValid).toBe(true);
    expect(result.expectationType).toBe('contains');
  });
});
