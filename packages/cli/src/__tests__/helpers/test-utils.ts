/**
 * Test utilities for CLI integration tests
 */

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Creates a temporary directory for test isolation
 */
export async function createTestDir(prefix = 'artemis-test'): Promise<string> {
  const testDir = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
  return testDir;
}

/**
 * Cleans up a test directory
 */
export async function cleanupTestDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Creates a test scenario file
 */
export async function createScenarioFile(
  dir: string,
  name: string,
  content: string
): Promise<string> {
  const scenariosDir = join(dir, 'scenarios');
  await mkdir(scenariosDir, { recursive: true });
  const filePath = join(scenariosDir, `${name}.yaml`);
  await writeFile(filePath, content);
  return filePath;
}

/**
 * Creates a test config file
 */
export async function createConfigFile(
  dir: string,
  config: Record<string, unknown>
): Promise<string> {
  const filePath = join(dir, 'artemis.config.yaml');
  const yaml = Object.entries(config)
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        const nested = Object.entries(value as Record<string, unknown>)
          .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
          .join('\n');
        return `${key}:\n${nested}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join('\n');
  await writeFile(filePath, yaml);
  return filePath;
}

/**
 * Sample scenario templates for testing
 */
export const scenarioTemplates = {
  simple: `
name: simple-test
description: A simple test scenario

cases:
  - id: test-1
    prompt: "Say hello"
    expected:
      type: contains
      values:
        - "hello"
      mode: any
`,

  multiCase: `
name: multi-case-test
description: Multiple test cases

cases:
  - id: case-1
    prompt: "What is 2+2?"
    expected:
      type: contains
      values:
        - "4"
      mode: any

  - id: case-2
    prompt: "What is the capital of France?"
    expected:
      type: contains
      values:
        - "Paris"
      mode: any

  - id: case-3
    prompt: "Say hello"
    expected:
      type: contains
      values:
        - "hello"
      mode: any
`,

  withProvider: `
name: provider-test
description: Test with provider config
provider: openai
model: gpt-4o-mini

cases:
  - id: test-1
    prompt: "Hello"
    expected:
      type: contains
      values:
        - "hello"
      mode: any
`,

  exactMatch: `
name: exact-match-test
description: Test exact matching

cases:
  - id: exact-1
    prompt: "Return exactly: hello world"
    expected:
      type: exact
      value: "hello world"
`,

  regexMatch: `
name: regex-test
description: Test regex matching

cases:
  - id: regex-1
    prompt: "Return a number"
    expected:
      type: regex
      pattern: "\\\\d+"
`,

  failing: `
name: failing-test
description: A test that should fail

cases:
  - id: will-fail
    prompt: "Say hello"
    expected:
      type: exact
      value: "this will not match"
`,
};

/**
 * Captures console output during test execution
 */
export class OutputCapture {
  private originalLog: typeof console.log = console.log;
  private originalError: typeof console.error = console.error;
  private logs: string[] = [];
  private errors: string[] = [];

  start(): void {
    this.originalLog = console.log;
    this.originalError = console.error;
    this.logs = [];
    this.errors = [];

    console.log = (...args: unknown[]) => {
      this.logs.push(args.map(String).join(' '));
    };

    console.error = (...args: unknown[]) => {
      this.errors.push(args.map(String).join(' '));
    };
  }

  stop(): { logs: string[]; errors: string[] } {
    console.log = this.originalLog;
    console.error = this.originalError;
    return { logs: this.logs, errors: this.errors };
  }

  getOutput(): string {
    return this.logs.join('\n');
  }

  getErrors(): string {
    return this.errors.join('\n');
  }
}
