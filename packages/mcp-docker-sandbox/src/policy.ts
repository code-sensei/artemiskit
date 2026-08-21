import { isAbsolute, relative, resolve, sep } from 'node:path';

export const SANDBOX_ERROR_CODES = {
  akitBundleInvalid: 'SANDBOX_AKIT_BUNDLE_INVALID',
  akitBundleRequired: 'SANDBOX_AKIT_BUNDLE_REQUIRED',
  commandBudgetExceeded: 'SANDBOX_COMMAND_BUDGET_EXCEEDED',
  commandDenied: 'SANDBOX_COMMAND_DENIED',
  commandFailed: 'SANDBOX_COMMAND_FAILED',
  commandTimeout: 'SANDBOX_COMMAND_TIMEOUT',
  cleanupUnconfirmed: 'SANDBOX_CLEANUP_UNCONFIRMED',
  disposed: 'SANDBOX_DISPOSED',
  fileTooLarge: 'SANDBOX_FILE_TOO_LARGE',
  fixtureInvalid: 'SANDBOX_FIXTURE_INVALID',
  internalError: 'SANDBOX_INTERNAL_ERROR',
  invalidArgument: 'SANDBOX_INVALID_ARGUMENT',
  operationBudgetExceeded: 'SANDBOX_OPERATION_BUDGET_EXCEEDED',
  operationTimeout: 'SANDBOX_OPERATION_TIMEOUT',
  outputLimitExceeded: 'SANDBOX_OUTPUT_LIMIT_EXCEEDED',
  patchConflict: 'SANDBOX_PATCH_CONFLICT',
  pathDenied: 'SANDBOX_PATH_DENIED',
  pathNotFound: 'SANDBOX_PATH_NOT_FOUND',
  remoteBindingDenied: 'SANDBOX_REMOTE_BINDING_DENIED',
  secretDenied: 'SANDBOX_SECRET_DENIED',
  symlinkDenied: 'SANDBOX_SYMLINK_DENIED',
  toolNotFound: 'SANDBOX_TOOL_NOT_FOUND',
} as const;

export type SandboxErrorCode = (typeof SANDBOX_ERROR_CODES)[keyof typeof SANDBOX_ERROR_CODES];

export class SandboxError extends Error {
  readonly code: SandboxErrorCode;

  constructor(code: SandboxErrorCode, message = code, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SandboxError';
    this.code = code;
  }
}

export interface AllowedCommand {
  executable: string;
  args: string[];
  requiresAkitBundle: boolean;
}

const SHELL_CONTROL = /[;&|>`$(){}\r\n\\'\"]/;
const ALLOWED_AKIT_FLAGS = new Set(['--json', '--strict', '--quiet', '-q']);
const SENSITIVE_NAMES = new Set([
  '.env',
  '.npmrc',
  '.pypirc',
  '.netrc',
  'credentials',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'id_rsa',
]);

export function assertWorkspacePath(root: string, candidate: string): string {
  if (!candidate || candidate.includes('\0') || /[\r\n]/.test(candidate)) {
    throw new SandboxError(SANDBOX_ERROR_CODES.pathDenied);
  }

  const rootPath = resolve(root);
  const path = resolve(rootPath, candidate);
  const relativePath = relative(rootPath, path);
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new SandboxError(SANDBOX_ERROR_CODES.pathDenied);
  }

  const segments = relativePath.split(sep);
  if (segments.includes('.git')) {
    throw new SandboxError(SANDBOX_ERROR_CODES.pathDenied);
  }
  if (segments.some(isSensitiveName)) {
    throw new SandboxError(SANDBOX_ERROR_CODES.secretDenied);
  }
  return path;
}

export function assertAllowedCommand(command: string): AllowedCommand {
  if (!command || command !== command.trim() || SHELL_CONTROL.test(command)) {
    throw new SandboxError(SANDBOX_ERROR_CODES.commandDenied);
  }

  const tokens = command.split(/[ \t]+/);
  if (tokens[0] === 'bun' && tokens[1] === 'test') {
    const testPaths = tokens.slice(2);
    testPaths.forEach(assertSafeRelativeArgument);
    return { executable: 'bun', args: ['test', ...testPaths], requiresAkitBundle: false };
  }

  if (
    tokens[0] === 'bun' &&
    tokens[1] === 'run' &&
    (tokens[2] === 'typecheck' || tokens[2] === 'build') &&
    tokens.length === 3
  ) {
    return { executable: 'bun', args: ['run', tokens[2]], requiresAkitBundle: false };
  }

  if (tokens[0] === 'akit' && tokens[1] === 'validate') {
    const validationArgs = tokens.slice(2);
    const paths = validationArgs.filter((argument) => !argument.startsWith('-'));
    if (paths.length !== 1) {
      throw new SandboxError(SANDBOX_ERROR_CODES.commandDenied);
    }
    assertSafeRelativeArgument(paths[0]);
    if (
      validationArgs.some(
        (argument) => argument.startsWith('-') && !ALLOWED_AKIT_FLAGS.has(argument)
      )
    ) {
      throw new SandboxError(SANDBOX_ERROR_CODES.commandDenied);
    }
    return {
      executable: 'bun',
      args: ['/opt/artemiskit/akit', 'validate', ...validationArgs],
      requiresAkitBundle: true,
    };
  }

  if (command === 'git status') {
    return { executable: 'git', args: ['status'], requiresAkitBundle: false };
  }
  if (command === 'git diff') {
    return { executable: 'git', args: ['diff'], requiresAkitBundle: false };
  }

  throw new SandboxError(SANDBOX_ERROR_CODES.commandDenied);
}

function assertSafeRelativeArgument(argument: string): void {
  if (!argument || argument.startsWith('-') || argument.includes('\0') || isAbsolute(argument)) {
    throw new SandboxError(SANDBOX_ERROR_CODES.commandDenied);
  }
  const normalized = resolve('/workspace', argument);
  const relativePath = relative('/workspace', normalized);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`)) {
    throw new SandboxError(SANDBOX_ERROR_CODES.commandDenied);
  }
  if (relativePath.split(sep).some(isSensitiveName)) {
    throw new SandboxError(SANDBOX_ERROR_CODES.commandDenied);
  }
}

function isSensitiveName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    SENSITIVE_NAMES.has(normalized) ||
    (normalized.startsWith('.env.') && normalized !== '.env.example') ||
    normalized.endsWith('.pem') ||
    normalized.endsWith('.key')
  );
}
