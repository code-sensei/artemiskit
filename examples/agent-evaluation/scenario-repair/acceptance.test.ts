import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkScenarioRepair } from './acceptance';

const exampleRoot = import.meta.dir;

async function checkExpectedVariant(replace: (source: string) => string) {
  const workspacePath = await mkdtemp(join(tmpdir(), 'artemiskit-scenario-repair-'));
  try {
    const expected = await readFile(join(exampleRoot, 'expected', 'scenario.yaml'), 'utf8');
    await writeFile(join(workspacePath, 'scenario.yaml'), replace(expected));
    return await checkScenarioRepair(workspacePath);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
}

describe('scenario repair acceptance', () => {
  it('rejects the intentionally broken fixture through the ArtemisKit validator', async () => {
    const result = await checkScenarioRepair(join(exampleRoot, 'fixture'));

    expect(result.passed).toBe(false);
    expect(result.id).toBe('scenario-matches-expected');
    expect(result.status).toBe('failed');
    expect(result.scenarioValid).toBe(false);
    expect(result.expectationType).toBeUndefined();
  });

  it('accepts the expected one-line repair through the ArtemisKit parser', async () => {
    const result = await checkScenarioRepair(join(exampleRoot, 'expected'));

    expect(result.passed).toBe(true);
    expect(result.id).toBe('scenario-matches-expected');
    expect(result.status).toBe('passed');
    expect(result.scenarioValid).toBe(true);
    expect(result.expectationType).toBe('contains');
  });

  it('rejects a valid but incorrect not_contains replacement', async () => {
    const result = await checkExpectedVariant((source) =>
      source.replace('type: contains', 'type: not_contains')
    );

    expect(result.scenarioValid).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issueRules).toContain('scenario-does-not-match-expected');
  });

  it('rejects a schema-valid unknown top-level field', async () => {
    const result = await checkExpectedVariant((source) => `${source}unrelated: true\n`);

    expect(result.scenarioValid).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.issueRules).toContain('scenario-does-not-match-expected');
  });

  it('rejects unrelated prompt and description edits', async () => {
    const unrelatedEdits = [
      ['A deterministic scenario', 'An unrelated scenario'],
      ['Reply with the word hello.', 'Reply with the word goodbye.'],
    ] as const;

    for (const [original, replacement] of unrelatedEdits) {
      const result = await checkExpectedVariant((source) => source.replace(original, replacement));

      expect(result.scenarioValid).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.issueRules).toContain('scenario-does-not-match-expected');
    }
  });
});
