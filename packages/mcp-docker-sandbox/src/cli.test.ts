import { describe, expect, it } from 'bun:test';
import { MCP_SANDBOX_HELP, parseMcpSandboxCliArgs } from './cli';

describe('MCP sandbox CLI', () => {
  it('exports CLI parsing and help', async () => {
    const cliModule = await import('./cli').catch(() => undefined);

    expect(cliModule?.parseMcpSandboxCliArgs).toBeFunction();
    expect(cliModule?.MCP_SANDBOX_HELP).toContain('loopback');
  });

  it('parses bounded server and operator artifact options', () => {
    expect(
      parseMcpSandboxCliArgs([
        '--fixture',
        'fixtures/task',
        '--akit-bundle',
        '/opt/artifacts/akit.js',
        '--port',
        '3210',
        '--max-commands',
        '4',
        '--timeout-ms',
        '5000',
      ])
    ).toEqual({
      help: false,
      fixturePath: 'fixtures/task',
      akitBundlePath: '/opt/artifacts/akit.js',
      hostname: '127.0.0.1',
      port: 3210,
      maxCommands: 4,
      commandTimeoutMs: 5000,
      allowRemoteBinding: false,
    });
    expect(
      parseMcpSandboxCliArgs(['--fixture', 'fixtures/task', '--host', '0.0.0.0', '--allow-remote'])
    ).toMatchObject({ hostname: '0.0.0.0', allowRemoteBinding: true });
  });

  it('rejects missing, unknown, and invalid CLI arguments with a stable code', () => {
    for (const args of [
      [],
      ['--fixture'],
      ['--fixture', 'fixture', '--unknown'],
      ['--fixture', 'fixture', '--port', '-1'],
      ['--fixture', 'fixture', '--max-commands', '0'],
      ['--fixture', 'fixture', '--timeout-ms', 'none'],
    ]) {
      expect(() => parseMcpSandboxCliArgs(args)).toThrow('SANDBOX_INVALID_ARGUMENT');
    }
  });

  it('documents remote binding and the isolated read-only akit artifact', () => {
    expect(parseMcpSandboxCliArgs(['--help'])).toEqual({ help: true });
    expect(MCP_SANDBOX_HELP).toContain('--allow-remote');
    expect(MCP_SANDBOX_HELP).toContain('read-only');
    expect(MCP_SANDBOX_HELP).toContain('--akit-bundle');
  });
});
