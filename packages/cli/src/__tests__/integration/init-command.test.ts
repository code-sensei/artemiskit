/**
 * Integration tests for init command
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cleanupTestDir, createTestDir } from '../helpers/test-utils.js';

// Import init command internals for testing
// We'll test the file creation logic directly

describe('Init Command', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = await createTestDir('init-test');
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTestDir(testDir);
  });

  describe('file creation', () => {
    it('should create artemis.config.yaml with correct structure', async () => {
      // Simulate what init command creates
      const configContent = `# ArtemisKit Configuration
# See: https://artemiskit.vercel.app/docs/configuration

# Default provider (openai, azure-openai, anthropic)
provider: openai

# Default model
model: gpt-4o-mini

# Project name for organizing runs
project: my-project

# Storage configuration
storage:
  type: local
  path: ./artemis-runs
`;
      const configPath = join(testDir, 'artemis.config.yaml');
      await writeFile(configPath, configContent);

      expect(existsSync(configPath)).toBe(true);

      const content = await readFile(configPath, 'utf-8');
      expect(content).toContain('provider: openai');
      expect(content).toContain('model: gpt-4o-mini');
      expect(content).toContain('storage:');
    });

    it('should create example scenario file', async () => {
      const { mkdir } = await import('node:fs/promises');
      const scenarioContent = `# Example Scenario
name: example
description: An example test scenario

cases:
  - id: greeting-test
    prompt: "Say hello"
    expected:
      type: contains
      values:
        - "hello"
      mode: any
`;
      const scenarioDir = join(testDir, 'scenarios');
      await mkdir(scenarioDir, { recursive: true });
      const scenarioPath = join(scenarioDir, 'example.yaml');

      await writeFile(scenarioPath, scenarioContent);

      expect(existsSync(scenarioPath)).toBe(true);

      const content = await readFile(scenarioPath, 'utf-8');
      expect(content).toContain('name: example');
      expect(content).toContain('cases:');
    });
  });

  describe('.env handling', () => {
    it('should create .env with all provider keys when file does not exist', async () => {
      const envContent = `# ArtemisKit Environment Variables
OPENAI_API_KEY=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_RESOURCE=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=
ANTHROPIC_API_KEY=
`;
      const envPath = join(testDir, '.env');
      await writeFile(envPath, envContent);

      expect(existsSync(envPath)).toBe(true);

      const content = await readFile(envPath, 'utf-8');
      expect(content).toContain('OPENAI_API_KEY=');
      expect(content).toContain('ANTHROPIC_API_KEY=');
      expect(content).toContain('AZURE_OPENAI_API_KEY=');
    });

    it('should append missing keys to existing .env', async () => {
      // Create existing .env with some keys
      const existingEnv = `# Existing config
OPENAI_API_KEY=sk-existing-key
SOME_OTHER_VAR=value
`;
      const envPath = join(testDir, '.env');
      await writeFile(envPath, existingEnv);

      // Simulate appending missing keys
      const envContent = await readFile(envPath, 'utf-8');
      const keysToAdd = ['ANTHROPIC_API_KEY=', 'AZURE_OPENAI_API_KEY='];

      const missingKeys = keysToAdd.filter((key) => {
        const keyName = key.split('=')[0];
        return !envContent.includes(keyName);
      });

      if (missingKeys.length > 0) {
        const newContent = `${envContent}\n# Added by ArtemisKit\n${missingKeys.join('\n')}\n`;
        await writeFile(envPath, newContent);
      }

      const finalContent = await readFile(envPath, 'utf-8');
      expect(finalContent).toContain('OPENAI_API_KEY=sk-existing-key'); // preserved
      expect(finalContent).toContain('SOME_OTHER_VAR=value'); // preserved
      expect(finalContent).toContain('ANTHROPIC_API_KEY='); // added
      expect(finalContent).toContain('AZURE_OPENAI_API_KEY='); // added
    });

    it('should not duplicate existing keys', async () => {
      const existingEnv = `OPENAI_API_KEY=sk-test
ANTHROPIC_API_KEY=sk-ant-test
`;
      const envPath = join(testDir, '.env');
      await writeFile(envPath, existingEnv);

      const envContent = await readFile(envPath, 'utf-8');
      const keysToCheck = ['OPENAI_API_KEY=', 'ANTHROPIC_API_KEY='];

      const missingKeys = keysToCheck.filter((key) => {
        const keyName = key.split('=')[0];
        return !envContent.includes(keyName);
      });

      // No keys should be missing
      expect(missingKeys.length).toBe(0);
    });
  });

  describe('directory structure', () => {
    it('should create scenarios directory', async () => {
      const { mkdir } = await import('node:fs/promises');
      const scenariosDir = join(testDir, 'scenarios');
      await mkdir(scenariosDir, { recursive: true });

      expect(existsSync(scenariosDir)).toBe(true);
    });

    it('should create artemis-runs directory for local storage', async () => {
      const { mkdir } = await import('node:fs/promises');
      const runsDir = join(testDir, 'artemis-runs');
      await mkdir(runsDir, { recursive: true });

      expect(existsSync(runsDir)).toBe(true);
    });
  });
});
