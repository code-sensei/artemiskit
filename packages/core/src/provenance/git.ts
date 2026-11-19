/**
 * Git provenance utilities
 */

import { execSync } from 'node:child_process';
import type { GitInfo } from '../artifacts/types';

/**
 * Runs `git <args>` in `cwd` and returns its trimmed stdout. Throws when git fails.
 */
export type GitCommandRunner = (args: string, cwd: string) => string;

/**
 * Reads git provenance for a working directory.
 */
export interface GitInfoReader {
  /** Git provenance for `cwd` (default: `process.cwd()`), read at most once per directory. */
  getGitInfo(cwd?: string): GitInfo;
  /** Forget every cached directory so the next call reads git again. */
  clearCache(): void;
}

const UNKNOWN_GIT_INFO: GitInfo = {
  commit: 'unknown',
  branch: 'unknown',
  dirty: false,
};

const runGitWithExecSync: GitCommandRunner = (args, cwd) =>
  execSync(`git ${args}`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

/**
 * Create a git provenance reader that caches its result per working directory.
 *
 * Reading provenance spawns four git processes. Every run manifest records it, and an
 * experiment writes one manifest per scenario attempt, so reading it once per directory
 * removes thousands of subprocesses from a benchmark. Each directory is cached for the
 * reader's lifetime, including the `unknown` result outside a repository. A commit or edit
 * made after the first read is not seen until `clearCache()` is called.
 */
export function createGitInfoReader(runGit: GitCommandRunner = runGitWithExecSync): GitInfoReader {
  const cache = new Map<string, GitInfo>();

  return {
    getGitInfo(cwd = process.cwd()) {
      let info = cache.get(cwd);
      if (!info) {
        info = readGitInfo(runGit, cwd);
        cache.set(cwd, info);
      }
      // Callers get their own copy so one manifest cannot change another's provenance.
      return { ...info };
    },
    clearCache() {
      cache.clear();
    },
  };
}

function readGitInfo(runGit: GitCommandRunner, cwd: string): GitInfo {
  try {
    const commit = runGit('rev-parse HEAD', cwd);
    const branch = runGit('rev-parse --abbrev-ref HEAD', cwd);
    const dirty = runGit('status --porcelain', cwd).length > 0;
    const remote = runOptionalGit(runGit, 'remote get-url origin', cwd);

    return {
      commit,
      branch,
      dirty,
      remote: remote || undefined,
    };
  } catch {
    return { ...UNKNOWN_GIT_INFO };
  }
}

function runOptionalGit(runGit: GitCommandRunner, args: string, cwd: string): string {
  try {
    return runGit(args, cwd);
  } catch {
    // A repository without an `origin` remote is normal; the manifest omits `remote`.
    return '';
  }
}

const processGitInfoReader = createGitInfoReader();

/**
 * Get git information for the current working directory.
 *
 * Cached per `process.cwd()` for the life of the process (see `createGitInfoReader`).
 * Long-lived processes that need a fresh read after the working tree changes call
 * `clearGitInfoCache()` first.
 */
export function getGitInfo(): GitInfo {
  return processGitInfoReader.getGitInfo();
}

/**
 * Forget cached git provenance so the next `getGitInfo()` call reads git again.
 */
export function clearGitInfoCache(): void {
  processGitInfoReader.clearCache();
}
