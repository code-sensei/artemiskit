import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getWorkflowTool } from './catalog';
import {
  type WorkflowEnvironmentFactory,
  WorkflowEnvironmentInitializationError,
  isWorkflowState,
  workflowPathAllowed,
} from './environment';
import { AgentWorkflowSchema, isWorkflowJson, isWorkflowRelativePath } from './schema';
import { type SimulatedToolResult, executeSimulatedTool } from './simulated-tools';

export const WORKFLOW_SANDBOX_IMAGE = 'oven/bun:1.3.10-alpine';
export interface DockerWorkflowEnvironmentOptions {
  /** Per Docker operation. Run/session deadlines can abort sooner. Defaults to 5000. */
  operationTimeoutMs?: number;
  /** Exact owned-container cleanup deadline. Defaults to 3000; failures remain unresolved. */
  cleanupTimeoutMs?: number;
}
const LIMIT = 1_048_576;
const OWNER_LABEL = 'artemiskit.workflow.owner';

// Fixed code, never assembled from an agent command, path, file content, or environment variable.
const FILE_PROGRAM = String.raw`
const fs = require('node:fs');
const root = '/workspace';
const limit = 1048576;
const safe = p => typeof p === 'string' && p.length <= 512 && /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(p) && p.split('/').every(x => x && !['.','..','__proto__','prototype','constructor'].includes(x));
function checked(p, create=false) {
  if (!safe(p)) throw 'invalid_input';
  const parts = p.split('/'); let current = root;
  for (let i=0;i<parts.length;i++) {
    current += '/' + parts[i];
    let stat;
    try { stat = fs.lstatSync(current); } catch(e) { if(e.code !== 'ENOENT') throw 'tool_error'; }
    if (stat && (stat.isSymbolicLink() || (i<parts.length-1 ? !stat.isDirectory() : !stat.isFile()))) throw 'invalid_input';
    if (!stat && i<parts.length-1) { if(!create) throw 'not_found'; fs.mkdirSync(current, {mode: 0o700}); }
  }
  return current;
}
function write(p, content) {
  if(typeof content !== 'string' || content.length>16384) throw 'invalid_input';
  const path=checked(p,true); const fd=fs.openSync(path, fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o600);
  try { fs.writeFileSync(fd,content,'utf8'); } finally { fs.closeSync(fd); }
}
function read(p) {
  const path=checked(p); let fd;
  try { fd=fs.openSync(path,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW); } catch(e) { if(e.code==='ENOENT') throw 'not_found'; throw 'tool_error'; }
  try { const stat=fs.fstatSync(fd); if(!stat.isFile() || stat.size>65536) throw 'output_limit'; const text=fs.readFileSync(fd,'utf8'); if(text.length>16384) throw 'output_limit'; return text; } finally { fs.closeSync(fd); }
}
function snapshot() {
  const files={}; let count=0, bytes=0;
  function walk(dir, prefix, depth) {
    if(depth>16) throw 'output_limit';
    for(const name of fs.readdirSync(dir).sort()) {
      const p=prefix ? prefix+'/'+name : name;
      if(!safe(p) || ++count>1000) throw 'output_limit';
      const stat=fs.lstatSync(dir+'/'+name);
      if(stat.isSymbolicLink()) throw 'invalid_input';
      if(stat.isDirectory()) walk(dir+'/'+name,p,depth+1);
      else if(stat.isFile()) { const value=read(p); bytes+=Buffer.byteLength(value)+Buffer.byteLength(p); if(bytes>limit) throw 'output_limit'; files[p]=value; }
      else throw 'invalid_input';
    }
  }
  walk(root,'',0); return files;
}
try {
  const raw=await Bun.stdin.text(); if(Buffer.byteLength(raw)>limit) throw 'invalid_input';
  const request=JSON.parse(raw); let output;
  if(request.action==='init') { for(const [path,content] of Object.entries(request.files)) write(path,content); }
  else if(request.action==='write') { write(request.path,request.content); output={path:request.path,written:true}; }
  else if(request.action==='read') output={content:read(request.path)};
  else if(request.action!=='snapshot') throw 'invalid_input';
  const result=JSON.stringify({ok:true,files:snapshot(),...(output?{output}:{})}); if(Buffer.byteLength(result)>limit) throw 'output_limit'; process.stdout.write(result);
} catch(error) { process.stdout.write(JSON.stringify({ok:false,code:['invalid_input','not_found','output_limit'].includes(error)?error:'tool_error'})); process.exitCode=1; }
`;

class DockerFailure extends Error {
  constructor(
    readonly code: 'aborted' | 'timeout' | 'unavailable' | 'output_limit',
    readonly uncertain = false
  ) {
    super(`sandbox_${code}`);
  }
}
interface CommandResult {
  code: number;
  stdout: string;
}

/** Fixed local Docker image and host-owned tools. No command, environment, mount, or image override. */
export function createDockerWorkflowEnvironmentFactory(
  options: DockerWorkflowEnvironmentOptions = {}
): WorkflowEnvironmentFactory {
  const operationTimeoutMs = options.operationTimeoutMs ?? 5000;
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 3000;
  if (
    Object.keys(options).some((key) => !['operationTimeoutMs', 'cleanupTimeoutMs'].includes(key)) ||
    !Number.isInteger(operationTimeoutMs) ||
    operationTimeoutMs < 1 ||
    operationTimeoutMs > 30_000 ||
    !Number.isInteger(cleanupTimeoutMs) ||
    cleanupTimeoutMs < 1 ||
    cleanupTimeoutMs > 10_000
  )
    throw new TypeError('Invalid Docker workflow environment options');
  return async ({ workflow, initialState, signal }) => {
    const parsed = AgentWorkflowSchema.safeParse(workflow);
    if (
      !parsed.success ||
      parsed.data.environment.type !== 'sandbox' ||
      !isWorkflowState(initialState) ||
      signal.aborted
    )
      throw new WorkflowEnvironmentInitializationError({
        status: 'completed',
        artifacts: 'discarded',
        pendingOperations: 0,
      });
    const configuration = parsed.data;
    let state = structuredClone(initialState);
    const files = state.files ?? {};
    if (
      !isWorkflowState(files) ||
      Object.entries(files).some(
        ([path, content]) =>
          !isWorkflowRelativePath(path) || typeof content !== 'string' || content.length > 16_384
      ) ||
      Object.keys(files).length > 1000
    )
      throw new WorkflowEnvironmentInitializationError({
        status: 'completed',
        artifacts: 'discarded',
        pendingOperations: 0,
      });
    const owner = randomUUID();
    const name = `artemiskit-workflow-${owner}`;
    const children = new Set<ReturnType<typeof spawn>>();
    let closed = false;
    let closing = false;
    let creationAttempted = false;
    let creationUncertain = false;
    let busy = false;
    const command = (
      args: string[],
      input: string,
      commandSignal: AbortSignal,
      timeoutMs = operationTimeoutMs
    ): Promise<CommandResult> => {
      if (commandSignal.aborted) return Promise.reject(new DockerFailure('aborted'));
      if (Buffer.byteLength(input) > LIMIT)
        return Promise.reject(new DockerFailure('output_limit'));
      return new Promise((resolve, reject) => {
        let child: ReturnType<typeof spawn>;
        try {
          child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
        } catch {
          reject(new DockerFailure('unavailable'));
          return;
        }
        children.add(child);
        const output: Buffer[] = [];
        let size = 0;
        let failure: DockerFailure | undefined;
        let settled = false;
        const stop = (error: DockerFailure) => {
          failure ??= error;
          child.kill('SIGKILL');
        };
        const abort = () => stop(new DockerFailure('aborted', true));
        const timer = setTimeout(() => stop(new DockerFailure('timeout', true)), timeoutMs);
        commandSignal.addEventListener('abort', abort, { once: true });
        child.stdout?.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > LIMIT) stop(new DockerFailure('output_limit', true));
          else output.push(Buffer.from(chunk));
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > LIMIT) stop(new DockerFailure('output_limit', true));
        });
        child.stdin?.on('error', () => {
          /* EPIPE is handled by process exit; no raw diagnostics. */
        });
        const finish = (code: number | null, error?: DockerFailure) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          commandSignal.removeEventListener('abort', abort);
          children.delete(child);
          if (error || failure) reject(error ?? failure);
          else resolve({ code: code ?? 1, stdout: Buffer.concat(output).toString('utf8') });
        };
        child.once('error', () => finish(null, new DockerFailure('unavailable')));
        child.once('close', (code) => finish(code));
        child.stdin?.end(input);
        if (commandSignal.aborted) abort();
      });
    };
    async function close(closeSignal: AbortSignal) {
      if (closed) return { status: 'completed' as const, artifacts: 'discarded' as const };
      closing = true;
      for (const child of children) child.kill('SIGKILL');
      const cleanupController = new AbortController();
      const onAbort = () => cleanupController.abort();
      closeSignal.addEventListener('abort', onAbort, { once: true });
      if (closeSignal.aborted) cleanupController.abort();
      const timer = setTimeout(onAbort, cleanupTimeoutMs);
      try {
        if (!creationAttempted) {
          closed = true;
          state = {};
          return { status: 'completed' as const, artifacts: 'discarded' as const };
        }
        const inspected = await command(
          ['inspect', '--format', `{{index .Config.Labels "${OWNER_LABEL}"}}`, name],
          '',
          cleanupController.signal,
          cleanupTimeoutMs
        );
        if (inspected.code === 0) {
          if (inspected.stdout.trim() !== owner)
            return { status: 'unresolved' as const, artifacts: 'unknown' as const };
          const removed = await command(
            ['rm', '--force', name],
            '',
            cleanupController.signal,
            cleanupTimeoutMs
          );
          if (removed.code !== 0)
            return { status: 'unresolved' as const, artifacts: 'unknown' as const };
          creationUncertain = false;
        }
        const remaining = await command(
          ['ps', '--all', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'],
          '',
          cleanupController.signal,
          cleanupTimeoutMs
        );
        if (
          remaining.code !== 0 ||
          remaining.stdout.trim() ||
          creationUncertain ||
          children.size > 0
        )
          return { status: 'unresolved' as const, artifacts: 'unknown' as const };
        closed = true;
        state = {};
        return { status: 'completed' as const, artifacts: 'discarded' as const };
      } catch {
        return { status: 'unresolved' as const, artifacts: 'unknown' as const };
      } finally {
        clearTimeout(timer);
        closeSignal.removeEventListener('abort', onAbort);
      }
    }
    async function fileOperation(request: Record<string, unknown>, operationSignal: AbortSignal) {
      const result = await command(
        ['exec', '--interactive', name, 'bun', '--eval', FILE_PROGRAM],
        JSON.stringify(request),
        operationSignal
      );
      let response: unknown;
      try {
        response = JSON.parse(result.stdout);
      } catch {
        throw new DockerFailure('unavailable');
      }
      if (!isWorkflowState(response)) throw new DockerFailure('unavailable');
      if (
        response.ok === false &&
        ['invalid_input', 'not_found', 'output_limit', 'tool_error'].includes(String(response.code))
      )
        return {
          ok: false as const,
          code: response.code as 'invalid_input' | 'not_found' | 'output_limit' | 'tool_error',
        };
      if (
        result.code !== 0 ||
        response.ok !== true ||
        !isWorkflowState(response.files) ||
        Object.entries(response.files).some(
          ([path, content]) =>
            !isWorkflowRelativePath(path) || typeof content !== 'string' || content.length > 16_384
        )
      )
        throw new DockerFailure('unavailable');
      const next = { ...state, files: response.files };
      if (!isWorkflowState(next)) throw new DockerFailure('output_limit');
      state = structuredClone(next);
      return { ok: true as const, output: response.output };
    }
    try {
      const image = await command(
        ['image', 'inspect', WORKFLOW_SANDBOX_IMAGE, '--format', '{{.Id}}'],
        '',
        signal
      );
      if (image.code !== 0 || !/^sha256:[a-f0-9]{64}\s*$/.test(image.stdout))
        throw new DockerFailure('unavailable');
      // Pin the inspected local content ID so a concurrent tag update cannot change the selected image.
      creationAttempted = true;
      let created: CommandResult;
      try {
        created = await command(
          [
            'create',
            '--pull=never',
            '--name',
            name,
            '--label',
            'artemiskit.workflow=true',
            '--label',
            `${OWNER_LABEL}=${owner}`,
            '--network',
            'none',
            '--read-only',
            '--cap-drop',
            'ALL',
            '--security-opt',
            'no-new-privileges',
            '--memory',
            '128m',
            '--memory-swap',
            '128m',
            '--cpus',
            '0.5',
            '--pids-limit',
            '64',
            '--user',
            '1000:1000',
            '--tmpfs',
            '/workspace:rw,noexec,nosuid,nodev,size=16777216,uid=1000,gid=1000,mode=0700',
            '--tmpfs',
            '/tmp:rw,noexec,nosuid,nodev,size=8388608,uid=1000,gid=1000,mode=0700',
            '--workdir',
            '/workspace',
            '--entrypoint',
            'bun',
            image.stdout.trim(),
            '--eval',
            'setInterval(() => {}, 1000)',
          ],
          '',
          signal
        );
      } catch (error) {
        creationUncertain = error instanceof DockerFailure && error.uncertain;
        throw error;
      }
      if (created.code !== 0) throw new DockerFailure('unavailable');
      const started = await command(['start', name], '', signal);
      if (started.code !== 0) throw new DockerFailure('unavailable');
      const initialized = await fileOperation({ action: 'init', files }, signal);
      if (!initialized.ok) throw new DockerFailure('unavailable');
    } catch {
      const cleanup = await close(new AbortController().signal);
      throw new WorkflowEnvironmentInitializationError({
        ...cleanup,
        pendingOperations: children.size + (creationUncertain ? 1 : 0),
      });
    }
    return {
      type: 'sandbox',
      capabilities: {
        network: 'denied',
        commands: 'denied',
        externalSideEffects: 'denied',
        isolation: 'container',
      },
      async execute(request, operationSignal): Promise<SimulatedToolResult> {
        const tool = getWorkflowTool(request.tool)?.id ?? 'unknown';
        const failure = (
          status: 'denied' | 'invalid' | 'failed',
          code: 'permission_denied' | 'invalid_input' | 'tool_error' | 'not_found' | 'output_limit'
        ): SimulatedToolResult => ({
          status,
          code,
          evidence: { tool, version: '1', status, code },
        });
        if (closed || closing || busy || operationSignal.aborted || signal.aborted)
          return failure('failed', 'tool_error');
        const checked = executeSimulatedTool({
          tool: request.tool,
          input: request.input,
          state,
          policy: configuration.environment.policy,
          declaredTools: configuration.tools,
        });
        if (checked.status !== 'succeeded') return checked;
        if (!workflowPathAllowed(configuration, request.tool, request.input))
          return failure('denied', 'permission_denied');
        busy = true;
        try {
          if (request.tool === 'read_file' || request.tool === 'write_file') {
            if (!isWorkflowState(request.input)) return failure('invalid', 'invalid_input');
            const result = await fileOperation(
              { action: request.tool === 'read_file' ? 'read' : 'write', ...request.input },
              operationSignal
            );
            if (!result.ok)
              return failure(result.code === 'invalid_input' ? 'invalid' : 'failed', result.code);
            if (!isWorkflowJson(result.output)) return failure('failed', 'tool_error');
            return {
              status: 'succeeded',
              output: structuredClone(result.output),
              state: structuredClone(state),
              evidence: { tool, version: '1', status: 'succeeded' },
            };
          }
          state = structuredClone(checked.state);
          return checked;
        } catch {
          return failure('failed', 'tool_error');
        } finally {
          busy = false;
        }
      },
      async snapshot(snapshotSignal) {
        if (closed || closing || busy || snapshotSignal.aborted)
          throw new DockerFailure('unavailable');
        busy = true;
        try {
          const result = await fileOperation({ action: 'snapshot' }, snapshotSignal);
          if (!result.ok) throw new DockerFailure('unavailable');
          return structuredClone(state);
        } finally {
          busy = false;
        }
      },
      close,
    };
  };
}
export const createDockerWorkflowEnvironment: WorkflowEnvironmentFactory =
  createDockerWorkflowEnvironmentFactory();
