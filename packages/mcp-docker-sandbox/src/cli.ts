#!/usr/bin/env bun

import { SANDBOX_ERROR_CODES, SandboxError } from './policy';
import { startMcpSandboxServer } from './server';

export const MCP_SANDBOX_HELP = `Usage: mcp-docker-sandbox --fixture <path> [options]

Serve one disposable Docker workspace over Streamable HTTP MCP.

Options:
  --fixture <path>       Fixture directory copied into the disposable workspace (required)
  --akit-bundle <file>   Operator-supplied standalone akit bundle, mounted read-only
  --host <hostname>      HTTP host (default: 127.0.0.1 loopback)
  --port <number>        HTTP port (default: 3000; use 0 for an ephemeral port)
  --max-commands <count> Maximum workspace_run calls (default: 20)
  --timeout-ms <number>  Per-command timeout in milliseconds (default: 60000)
  --allow-remote         Explicitly permit a non-loopback host; exposes an unauthenticated server
  --help                 Show this help

Agent tool input never controls host mount paths. The fixture is copied, and the optional akit
artifact is mounted read-only. Container commands run without network access or a shell.`;

export type ParsedMcpSandboxCliArgs =
  | { help: true }
  | {
      help: false;
      fixturePath: string;
      akitBundlePath?: string;
      hostname: string;
      port: number;
      maxCommands: number;
      commandTimeoutMs: number;
      allowRemoteBinding: boolean;
    };

export function parseMcpSandboxCliArgs(args: string[]): ParsedMcpSandboxCliArgs {
  if (args.includes('--help')) return { help: true };

  let fixturePath: string | undefined;
  let akitBundlePath: string | undefined;
  let hostname = '127.0.0.1';
  let port = 3_000;
  let maxCommands = 20;
  let commandTimeoutMs = 60_000;
  let allowRemoteBinding = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--fixture':
        fixturePath = requireOptionValue(args, ++index);
        break;
      case '--akit-bundle':
        akitBundlePath = requireOptionValue(args, ++index);
        break;
      case '--host':
        hostname = requireOptionValue(args, ++index);
        break;
      case '--port':
        port = parseIntegerOption(requireOptionValue(args, ++index), 0, 65_535);
        break;
      case '--max-commands':
        maxCommands = parseIntegerOption(requireOptionValue(args, ++index), 1, 10_000);
        break;
      case '--timeout-ms':
        commandTimeoutMs = parseIntegerOption(requireOptionValue(args, ++index), 1, 600_000);
        break;
      case '--allow-remote':
        allowRemoteBinding = true;
        break;
      default:
        throw new SandboxError(SANDBOX_ERROR_CODES.invalidArgument);
    }
  }

  if (!fixturePath) throw new SandboxError(SANDBOX_ERROR_CODES.invalidArgument);
  return {
    help: false,
    fixturePath,
    akitBundlePath,
    hostname,
    port,
    maxCommands,
    commandTimeoutMs,
    allowRemoteBinding,
  };
}

function requireOptionValue(args: string[], index: number): string {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new SandboxError(SANDBOX_ERROR_CODES.invalidArgument);
  }
  return value;
}

function parseIntegerOption(value: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new SandboxError(SANDBOX_ERROR_CODES.invalidArgument);
  }
  return parsed;
}

async function main(): Promise<void> {
  const options = parseMcpSandboxCliArgs(Bun.argv.slice(2));
  if (options.help) {
    console.log(MCP_SANDBOX_HELP);
    return;
  }

  const server = await startMcpSandboxServer(options);
  console.log(`MCP sandbox listening at ${server.url.toString()}`);
  let isClosing = false;
  const close = async (): Promise<void> => {
    if (isClosing) return;
    isClosing = true;
    await server.close();
  };
  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const code = error instanceof SandboxError ? error.code : SANDBOX_ERROR_CODES.internalError;
    console.error(code);
    process.exitCode = 1;
  });
}
