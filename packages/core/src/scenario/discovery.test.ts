/**
 * Tests for scenario discovery
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverScenarios, matchScenarioGlob, resolveScenarioPaths } from './discovery';

describe('Scenario Discovery', () => {
  const testDir = join(tmpdir(), `artemis-discovery-test-${Date.now()}`);

  beforeAll(async () => {
    // Create test directory structure
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, 'scenarios'), { recursive: true });
    await mkdir(join(testDir, 'scenarios', 'auth'), { recursive: true });
    await mkdir(join(testDir, 'scenarios', 'api'), { recursive: true });
    await mkdir(join(testDir, 'node_modules'), { recursive: true });
    await mkdir(join(testDir, 'drafts'), { recursive: true });

    // Create test scenario files
    const scenarioContent =
      'name: test\ncases:\n  - id: t1\n    prompt: test\n    expected:\n      type: exact\n      value: test';

    await writeFile(join(testDir, 'scenarios', 'basic.yaml'), scenarioContent);
    await writeFile(join(testDir, 'scenarios', 'advanced.yml'), scenarioContent);
    await writeFile(join(testDir, 'scenarios', 'auth', 'login.yaml'), scenarioContent);
    await writeFile(join(testDir, 'scenarios', 'auth', 'logout.yaml'), scenarioContent);
    await writeFile(join(testDir, 'scenarios', 'api', 'users.yaml'), scenarioContent);
    await writeFile(join(testDir, 'scenarios', 'api', 'posts.yml'), scenarioContent);
    await writeFile(join(testDir, 'node_modules', 'ignored.yaml'), scenarioContent);
    await writeFile(join(testDir, 'drafts', 'draft.yaml'), scenarioContent);
    await writeFile(join(testDir, 'scenarios', 'skip.draft.yaml'), scenarioContent);
    await writeFile(join(testDir, 'scenarios', 'readme.md'), '# Not a scenario');
  });

  afterAll(async () => {
    // Cleanup test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('discoverScenarios', () => {
    test('finds all yaml and yml files in directory', async () => {
      const files = await discoverScenarios(join(testDir, 'scenarios'));
      expect(files.length).toBe(7); // 2 root + 2 auth + 2 api + 1 draft
    });

    test('excludes node_modules by default', async () => {
      const files = await discoverScenarios(testDir);
      const nodeModulesFiles = files.filter((f) => f.includes('node_modules'));
      expect(nodeModulesFiles.length).toBe(0);
    });

    test('respects custom exclude patterns', async () => {
      const files = await discoverScenarios(join(testDir, 'scenarios'), {
        exclude: ['*.draft.yaml'],
      });
      const draftFiles = files.filter((f) => f.includes('.draft.yaml'));
      expect(draftFiles.length).toBe(0);
    });

    test('respects custom extensions', async () => {
      const files = await discoverScenarios(join(testDir, 'scenarios'), {
        extensions: ['.yaml'],
      });
      const ymlFiles = files.filter((f) => f.endsWith('.yml'));
      expect(ymlFiles.length).toBe(0);
    });

    test('respects maxDepth option', async () => {
      const files = await discoverScenarios(join(testDir, 'scenarios'), {
        maxDepth: 0,
      });
      // Should only find files in the root scenarios directory
      expect(files.length).toBe(3); // basic.yaml, advanced.yml, skip.draft.yaml
    });

    test('throws error for non-directory path', async () => {
      await expect(discoverScenarios(join(testDir, 'scenarios', 'basic.yaml'))).rejects.toThrow(
        'not a directory'
      );
    });

    test('returns sorted results', async () => {
      const files = await discoverScenarios(join(testDir, 'scenarios'));
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });
  });

  describe('matchScenarioGlob', () => {
    test('matches simple wildcard pattern', async () => {
      const files = await matchScenarioGlob('scenarios/*.yaml', testDir);
      expect(files.length).toBe(2); // basic.yaml, skip.draft.yaml
    });

    test('matches recursive pattern with **', async () => {
      const files = await matchScenarioGlob('scenarios/**/*.yaml', testDir);
      expect(files.length).toBeGreaterThan(2);
    });

    test('matches specific prefix pattern', async () => {
      const files = await matchScenarioGlob('scenarios/auth/*.yaml', testDir);
      expect(files.length).toBe(2); // login.yaml, logout.yaml
    });

    test('returns single file for non-glob file path', async () => {
      const files = await matchScenarioGlob('scenarios/basic.yaml', testDir);
      expect(files.length).toBe(1);
      expect(files[0]).toContain('basic.yaml');
    });

    test('returns all files for non-glob directory path', async () => {
      const files = await matchScenarioGlob('scenarios/auth', testDir);
      expect(files.length).toBe(2);
    });

    test('returns empty array for non-existent path', async () => {
      const files = await matchScenarioGlob('nonexistent/*.yaml', testDir);
      expect(files.length).toBe(0);
    });

    test('matches single character with ?', async () => {
      const files = await matchScenarioGlob('scenarios/api/?????.yaml', testDir);
      expect(files.length).toBe(1); // users.yaml (5 chars)
    });
  });

  describe('resolveScenarioPaths', () => {
    test('resolves single file', async () => {
      const files = await resolveScenarioPaths(join(testDir, 'scenarios', 'basic.yaml'));
      expect(files.length).toBe(1);
    });

    test('resolves directory', async () => {
      const files = await resolveScenarioPaths(join(testDir, 'scenarios', 'auth'));
      expect(files.length).toBe(2);
    });

    test('resolves glob pattern', async () => {
      const files = await resolveScenarioPaths('scenarios/*.yaml', testDir);
      expect(files.length).toBe(2);
    });

    test('throws for non-existent path', async () => {
      await expect(resolveScenarioPaths(join(testDir, 'nonexistent.yaml'))).rejects.toThrow(
        'not found'
      );
    });
  });
});
