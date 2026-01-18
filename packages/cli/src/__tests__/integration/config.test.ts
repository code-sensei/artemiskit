/**
 * Integration tests for CLI configuration loading
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../../config/loader.js';
import { cleanupTestDir, createTestDir } from '../helpers/test-utils.js';

describe('Config Loader', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    testDir = await createTestDir('config-test');
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTestDir(testDir);
  });

  describe('loadConfig', () => {
    it('should return null when no config file exists', async () => {
      const config = await loadConfig();
      expect(config).toBeNull();
    });

    it('should load artemis.config.yaml from current directory', async () => {
      const configContent = `
provider: openai
model: gpt-4o-mini
project: test-project
`;
      await writeFile(join(testDir, 'artemis.config.yaml'), configContent);

      const config = await loadConfig();
      expect(config).toBeDefined();
      expect(config?.provider).toBe('openai');
      expect(config?.model).toBe('gpt-4o-mini');
      expect(config?.project).toBe('test-project');
    });

    it('should load artemis.config.yml (yml extension)', async () => {
      const configContent = `
provider: azure-openai
model: gpt-4
`;
      await writeFile(join(testDir, 'artemis.config.yml'), configContent);

      const config = await loadConfig();
      expect(config).toBeDefined();
      expect(config?.provider).toBe('azure-openai');
    });

    it('should load config from explicit path', async () => {
      const customPath = join(testDir, 'custom-config.yaml');
      const configContent = `
provider: anthropic
model: claude-3-sonnet
`;
      await writeFile(customPath, configContent);

      const config = await loadConfig(customPath);
      expect(config).toBeDefined();
      expect(config?.provider).toBe('anthropic');
      expect(config?.model).toBe('claude-3-sonnet');
    });

    it('should load nested azure configuration', async () => {
      const configContent = `
provider: azure-openai
model: gpt-4
providers:
  azure-openai:
    resourceName: my-resource
    deploymentName: my-deployment
    apiVersion: "2024-02-15-preview"
`;
      await writeFile(join(testDir, 'artemis.config.yaml'), configContent);

      const config = await loadConfig();
      expect(config).toBeDefined();
      expect(config?.providers?.['azure-openai']?.resourceName).toBe('my-resource');
      expect(config?.providers?.['azure-openai']?.deploymentName).toBe('my-deployment');
    });

    it('should load storage configuration', async () => {
      const configContent = `
provider: openai
storage:
  type: local
  basePath: ./my-runs
`;
      await writeFile(join(testDir, 'artemis.config.yaml'), configContent);

      const config = await loadConfig();
      expect(config).toBeDefined();
      expect(config?.storage?.type).toBe('local');
      expect(config?.storage?.basePath).toBe('./my-runs');
    });

    it('should throw error for invalid YAML', async () => {
      const invalidYaml = `
provider: openai
  model: gpt-4  # invalid indentation
invalid: [unclosed
`;
      await writeFile(join(testDir, 'artemis.config.yaml'), invalidYaml);

      await expect(loadConfig()).rejects.toThrow();
    });

    it('should prefer .yaml over .yml when both exist', async () => {
      await writeFile(join(testDir, 'artemis.config.yaml'), 'provider: openai');
      await writeFile(join(testDir, 'artemis.config.yml'), 'provider: anthropic');

      const config = await loadConfig();
      expect(config?.provider).toBe('openai');
    });
  });
});
