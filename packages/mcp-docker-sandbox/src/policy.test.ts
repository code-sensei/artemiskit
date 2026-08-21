import { describe, expect, it } from 'bun:test';
import { assertAllowedCommand, assertWorkspacePath } from './policy';
describe('Docker sandbox policy', () => {
  it('allows only workspace paths and validation commands', () => {
    expect(() => assertWorkspacePath('/tmp/fixture', 'scenarios/a.yaml')).not.toThrow();
    expect(() => assertAllowedCommand('akit validate scenarios')).not.toThrow();
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
});
