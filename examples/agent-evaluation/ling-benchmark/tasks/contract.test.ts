import { describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { isAbsolute, join, normalize, sep } from 'node:path';

const taskRoot = import.meta.dir;
const taskIds = [
  'minimal-failing-case-repair',
  'scenario-authoring',
  'tool-trace-authoring',
  'validation-diagnosis',
] as const;
const allowedTools = [
  'workspace_read',
  'workspace_patch',
  'workspace_status',
  'workspace_diff',
  'workspace_run',
] as const;

interface ArtifactCheck {
  id: string;
  path: string;
  expectedPath: string;
}

interface TaskManifest {
  id: string;
  instructions: string;
  fixturePath: string;
  allowedPaths: string[];
  allowedTools: string[];
  maxActions: number;
  timeoutMs: number;
  acceptanceCommands: string[];
  requiredArtifactChecks: string[];
  artifactChecks: ArtifactCheck[];
  models: string[];
}

async function readManifest(taskId: string): Promise<TaskManifest> {
  const source = await Bun.file(join(taskRoot, taskId, 'task.yaml')).text();
  return Bun.YAML.parse(source) as TaskManifest;
}

function isSafeRelativePath(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes('\\')) return false;
  const normalized = normalize(path);
  return normalized === path && normalized !== '..' && !normalized.startsWith(`..${sep}`);
}

describe('Ling benchmark task contract', () => {
  it('contains exactly the four contracted scenario directories', async () => {
    const directories = (await readdir(taskRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(directories).toEqual([...taskIds]);
  });

  it('retains AgentTask fields and uses only the existing five workspace tools', async () => {
    for (const taskId of taskIds) {
      const task = await readManifest(taskId);

      expect(task.id).toBe(taskId);
      expect(task.instructions.trim().length).toBeGreaterThan(0);
      expect(task.fixturePath).toBe('fixture');
      expect(task.allowedPaths.length).toBeGreaterThan(0);
      expect(task.allowedTools).toEqual([...allowedTools]);
      expect(task.maxActions).toBeGreaterThan(0);
      expect(task.timeoutMs).toBeGreaterThan(0);
      expect(task.acceptanceCommands.length).toBeGreaterThan(0);
      expect(task.requiredArtifactChecks.length).toBeGreaterThan(0);
      expect(task.artifactChecks.length).toBeGreaterThan(0);
    }
  });

  it('keeps artifact checks unique, relative, and backed by existing files', async () => {
    const allIds = new Set<string>();

    for (const taskId of taskIds) {
      const task = await readManifest(taskId);
      const taskDirectory = join(taskRoot, taskId);
      const artifactIds = task.artifactChecks.map((check) => check.id);

      expect(task.requiredArtifactChecks).toEqual(artifactIds);
      expect(new Set(artifactIds).size).toBe(artifactIds.length);

      for (const check of task.artifactChecks) {
        expect(allIds.has(check.id)).toBe(false);
        allIds.add(check.id);
        expect(isSafeRelativePath(check.path)).toBe(true);
        expect(isSafeRelativePath(check.expectedPath)).toBe(true);
        expect(check.expectedPath.startsWith(`expected${sep}`)).toBe(true);
        expect(task.allowedPaths).toContain(check.path);
        expect(await Bun.file(join(taskDirectory, task.fixturePath, check.path)).exists()).toBe(
          true
        );
        expect(await Bun.file(join(taskDirectory, check.expectedPath)).exists()).toBe(true);
      }

      for (const allowedPath of task.allowedPaths) {
        expect(isSafeRelativePath(allowedPath)).toBe(true);
        expect(await Bun.file(join(taskDirectory, task.fixturePath, allowedPath)).exists()).toBe(
          true
        );
      }
    }
  });

  it('uses only validation and test commands within the established ceiling', async () => {
    for (const taskId of taskIds) {
      const task = await readManifest(taskId);
      for (const command of task.acceptanceCommands) {
        expect(command).toMatch(/^(?:akit validate|bun test) [a-z0-9./-]+$/);
        expect(command).not.toContain('..');
      }
    }
  });

  it('keeps intentionally failing fixture checks explicit and outside automatic discovery', async () => {
    for (const taskId of ['minimal-failing-case-repair', 'validation-diagnosis']) {
      const taskDirectory = join(taskRoot, taskId);
      const task = await readManifest(taskId);

      expect(await Bun.file(join(taskDirectory, 'fixture', 'acceptance.ts')).exists()).toBe(true);
      expect(await Bun.file(join(taskDirectory, 'fixture', 'acceptance.test.ts')).exists()).toBe(
        false
      );
      expect(task.acceptanceCommands).toContain('bun test ./acceptance.ts');
    }
  });

  it('covers Flash everywhere and limits Tiny to compact tasks', async () => {
    const modelsByTask = new Map(
      await Promise.all(
        taskIds.map(async (taskId) => [taskId, (await readManifest(taskId)).models])
      )
    );

    for (const models of modelsByTask.values()) {
      expect(models).toContain('Ling-3.0-flash');
    }
    expect(modelsByTask.get('scenario-authoring')).toContain('Ling-3.0-tiny');
    expect(modelsByTask.get('validation-diagnosis')).toContain('Ling-3.0-tiny');
    expect(modelsByTask.get('minimal-failing-case-repair')).not.toContain('Ling-3.0-tiny');
    expect(modelsByTask.get('tool-trace-authoring')).not.toContain('Ling-3.0-tiny');
  });
});
