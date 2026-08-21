import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertAllowedCommand } from './policy';

export interface DockerWorkspace {
  root: string;
  run(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  dispose(): Promise<void>;
}

export async function createDockerWorkspace(): Promise<DockerWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'artemiskit-agent-'));
  await mkdir(root, { recursive: true });
  return {
    root,
    async run(command) {
      assertAllowedCommand(command);
      const child = Bun.spawn(
        [
          'docker',
          'run',
          '--rm',
          '--network',
          'none',
          '--read-only',
          '--tmpfs',
          '/tmp',
          '-v',
          `${root}:/workspace:rw`,
          '-w',
          '/workspace',
          'oven/bun:1.3.10',
          'sh',
          '-lc',
          command,
        ],
        { stdout: 'pipe', stderr: 'pipe' }
      );
      return {
        exitCode: await child.exited,
        stdout: await new Response(child.stdout).text(),
        stderr: await new Response(child.stderr).text(),
      };
    },
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
