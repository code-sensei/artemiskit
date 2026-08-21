import { resolve, sep } from 'node:path';

const ALLOWED = [
  /^bun test(?:\s|$)/,
  /^bun run (typecheck|build)(?:\s|$)/,
  /^akit validate(?:\s|$)/,
  /^git (status|diff)(?:\s|$)/,
];
const FORBIDDEN =
  /(?:\b(curl|wget|npm|pnpm|yarn|docker|ssh|scp|git\s+(push|clone|fetch)|rm\s+-rf|&|\||;|>)\b)/;

export function assertWorkspacePath(root: string, candidate: string): string {
  const rootPath = resolve(root) + sep;
  const path = resolve(root, candidate);
  if (!path.startsWith(rootPath)) throw new Error('SANDBOX_PATH_DENIED');
  return path;
}

export function assertAllowedCommand(command: string): void {
  if (FORBIDDEN.test(command) || !ALLOWED.some((pattern) => pattern.test(command))) {
    throw new Error('SANDBOX_COMMAND_DENIED');
  }
}
