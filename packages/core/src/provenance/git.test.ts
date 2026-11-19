import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import * as childProcess from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type GitCommandRunner, clearGitInfoCache, createGitInfoReader, getGitInfo } from './git';

const GIT_COMMANDS_PER_READ = 4;

function fakeRepositories(repositories: Record<string, Record<string, string>>) {
  const calls: Array<{ args: string; cwd: string }> = [];
  const runGit: GitCommandRunner = (args, cwd) => {
    calls.push({ args, cwd });
    const output = repositories[cwd]?.[args];
    if (output === undefined) {
      throw new Error(`fatal: git ${args} failed in ${cwd}`);
    }
    return output;
  };
  return { calls, runGit };
}

const REPOSITORY_A = {
  'rev-parse HEAD': 'aaaaaaa',
  'rev-parse --abbrev-ref HEAD': 'main',
  'status --porcelain': '',
  'remote get-url origin': 'https://example.test/a.git',
};

const REPOSITORY_B = {
  'rev-parse HEAD': 'bbbbbbb',
  'rev-parse --abbrev-ref HEAD': 'feature',
  'status --porcelain': ' M file.ts',
};

describe('createGitInfoReader', () => {
  test('reads git once per working directory however often it is asked', () => {
    const { calls, runGit } = fakeRepositories({ '/repo/a': REPOSITORY_A });
    const reader = createGitInfoReader(runGit);

    for (let i = 0; i < 5; i++) {
      expect(reader.getGitInfo('/repo/a')).toEqual({
        commit: 'aaaaaaa',
        branch: 'main',
        dirty: false,
        remote: 'https://example.test/a.git',
      });
    }

    expect(calls).toHaveLength(GIT_COMMANDS_PER_READ);
    expect(calls.every((call) => call.cwd === '/repo/a')).toBe(true);
  });

  test('keeps each working directory separate', () => {
    const { calls, runGit } = fakeRepositories({
      '/repo/a': REPOSITORY_A,
      '/repo/b': REPOSITORY_B,
    });
    const reader = createGitInfoReader(runGit);

    const a = reader.getGitInfo('/repo/a');
    const b = reader.getGitInfo('/repo/b');
    reader.getGitInfo('/repo/a');
    reader.getGitInfo('/repo/b');

    expect(a.commit).toBe('aaaaaaa');
    expect(b).toEqual({ commit: 'bbbbbbb', branch: 'feature', dirty: true, remote: undefined });
    expect(calls).toHaveLength(2 * GIT_COMMANDS_PER_READ);
  });

  test('reads git again after the cache is cleared', () => {
    const repository = { ...REPOSITORY_A };
    const { calls, runGit } = fakeRepositories({ '/repo/a': repository });
    const reader = createGitInfoReader(runGit);

    expect(reader.getGitInfo('/repo/a').dirty).toBe(false);
    repository['status --porcelain'] = '?? new-file.ts';
    expect(reader.getGitInfo('/repo/a').dirty).toBe(false);

    reader.clearCache();
    expect(reader.getGitInfo('/repo/a').dirty).toBe(true);
    expect(calls).toHaveLength(2 * GIT_COMMANDS_PER_READ);
  });

  test('records unknown provenance outside a repository and caches that too', () => {
    const { calls, runGit } = fakeRepositories({});
    const reader = createGitInfoReader(runGit);

    expect(reader.getGitInfo('/not-a-repo')).toEqual({
      commit: 'unknown',
      branch: 'unknown',
      dirty: false,
    });
    reader.getGitInfo('/not-a-repo');

    expect(calls.map((call) => call.args)).toEqual(['rev-parse HEAD']);
  });

  test('returns a copy so one caller cannot change what the next one gets', () => {
    const { runGit } = fakeRepositories({ '/repo/a': REPOSITORY_A });
    const reader = createGitInfoReader(runGit);

    const first = reader.getGitInfo('/repo/a');
    first.commit = 'tampered';

    expect(reader.getGitInfo('/repo/a').commit).toBe('aaaaaaa');
  });
});

describe('getGitInfo', () => {
  let repositoryDir: string;
  let outsideDir: string;
  const originalCwd = process.cwd();
  const originalCeiling = process.env.GIT_CEILING_DIRECTORIES;

  beforeAll(async () => {
    repositoryDir = await realpath(await mkdtemp(path.join(tmpdir(), 'akit-git-info-')));
    outsideDir = await realpath(await mkdtemp(path.join(tmpdir(), 'akit-no-git-')));
    const git = (...args: string[]) =>
      childProcess.execFileSync('git', args, { cwd: repositoryDir, stdio: 'pipe' });
    git('init', '--quiet', '--initial-branch=fixture');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--quiet',
      '--no-verify',
      '--allow-empty',
      '-m',
      'fixture'
    );
    git('remote', 'add', 'origin', 'https://example.test/fixture.git');
    await writeFile(path.join(repositoryDir, 'untracked.txt'), 'dirty\n');
    // Keep the outside directory from inheriting a repository that happens to contain tmpdir.
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(outsideDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    clearGitInfoCache();
  });

  afterAll(async () => {
    if (originalCeiling === undefined) {
      Reflect.deleteProperty(process.env, 'GIT_CEILING_DIRECTORIES');
    } else {
      process.env.GIT_CEILING_DIRECTORIES = originalCeiling;
    }
    await rm(repositoryDir, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  });

  test('spawns git once per process working directory and returns the same values', () => {
    const execSync = spyOn(childProcess, 'execSync');
    try {
      clearGitInfoCache();
      process.chdir(repositoryDir);
      const first = getGitInfo();
      for (let i = 0; i < 10; i++) {
        expect(getGitInfo()).toEqual(first);
      }

      expect(first).toEqual({
        commit: childProcess
          .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryDir, encoding: 'utf-8' })
          .trim(),
        branch: 'fixture',
        dirty: true,
        remote: 'https://example.test/fixture.git',
      });
      expect(execSync).toHaveBeenCalledTimes(GIT_COMMANDS_PER_READ);

      process.chdir(outsideDir);
      expect(getGitInfo()).toEqual({ commit: 'unknown', branch: 'unknown', dirty: false });
      getGitInfo();
      // Outside a repository the first command fails and the result is cached.
      expect(execSync).toHaveBeenCalledTimes(GIT_COMMANDS_PER_READ + 1);

      process.chdir(repositoryDir);
      expect(getGitInfo()).toEqual(first);
      expect(execSync).toHaveBeenCalledTimes(GIT_COMMANDS_PER_READ + 1);
    } finally {
      execSync.mockRestore();
    }
  });
});
