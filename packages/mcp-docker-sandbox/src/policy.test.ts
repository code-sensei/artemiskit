import { describe, expect, it } from 'bun:test';
import { assertAllowedCommand, assertWorkspacePath } from './policy';

describe('Docker sandbox policy', () => {
  it('allows workspace paths and translates validation commands to argv', () => {
    expect(() => assertWorkspacePath('/tmp/fixture', 'scenarios/a.yaml')).not.toThrow();
    expect(assertAllowedCommand('bun test scenarios/a.test.ts')).toEqual({
      executable: 'bun',
      args: ['test', 'scenarios/a.test.ts'],
      requiresAkitBundle: false,
    });
    expect(assertAllowedCommand('bun run typecheck')).toEqual({
      executable: 'bun',
      args: ['run', 'typecheck'],
      requiresAkitBundle: false,
    });
    expect(assertAllowedCommand('akit validate scenarios/a.yaml --strict')).toEqual({
      executable: 'bun',
      args: ['/opt/artemiskit/akit', 'validate', 'scenarios/a.yaml', '--strict'],
      requiresAkitBundle: true,
    });
  });

  it('rejects path escape, network, installs, and remote git', () => {
    expect(() => assertWorkspacePath('/tmp/fixture', '../secret')).toThrow('SANDBOX_PATH_DENIED');
    for (const command of [
      'curl https://example.test',
      'bun add x',
      'git push origin main',
      'rm -rf .',
    ])
      expect(() => assertAllowedCommand(command)).toThrow('SANDBOX_COMMAND_DENIED');
  });

  it('returns stable error codes for denied paths and commands', () => {
    expect(captureError(() => assertWorkspacePath('/tmp/fixture', '.env'))).toMatchObject({
      code: 'SANDBOX_SECRET_DENIED',
      message: 'SANDBOX_SECRET_DENIED',
    });
    expect(captureError(() => assertWorkspacePath('/tmp/fixture', '.git/config'))).toMatchObject({
      code: 'SANDBOX_PATH_DENIED',
      message: 'SANDBOX_PATH_DENIED',
    });
    expect(captureError(() => assertAllowedCommand('bun run typecheck --watch'))).toMatchObject({
      code: 'SANDBOX_COMMAND_DENIED',
      message: 'SANDBOX_COMMAND_DENIED',
    });
  });

  it('rejects arguments that could expand command authority', () => {
    for (const command of [
      'bun test --preload ./escape.ts',
      'akit validate ../secret.yaml',
      'akit validate scenarios/a.yaml --export junit',
      'git status --ignored',
    ]) {
      expect(() => assertAllowedCommand(command)).toThrow('SANDBOX_COMMAND_DENIED');
    }
  });

  it('rejects shell control characters after an allowed command prefix', () => {
    for (const command of [
      'bun test; env',
      'bun test && env',
      'bun test | env',
      'bun test > output.txt',
      'bun test\nenv',
    ]) {
      expect(() => assertAllowedCommand(command)).toThrow('SANDBOX_COMMAND_DENIED');
    }
  });
});

function captureError(callback: () => unknown): unknown {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return undefined;
}
