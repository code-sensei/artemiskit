/**
 * Git provenance utilities
 */

import { execSync } from 'child_process';
import type { GitInfo } from '../artifacts/types';

/**
 * Get git information for the current repository
 */
export function getGitInfo(): GitInfo {
  try {
    const commit = execGit('rev-parse HEAD');
    const branch = execGit('rev-parse --abbrev-ref HEAD');
    const dirty = execGit('status --porcelain').length > 0;
    const remote = execGit('remote get-url origin', true);

    return {
      commit,
      branch,
      dirty,
      remote: remote || undefined,
    };
  } catch {
    return {
      commit: 'unknown',
      branch: 'unknown',
      dirty: false,
    };
  }
}

/**
 * Execute a git command
 */
function execGit(command: string, allowFailure = false): string {
  try {
    return execSync(`git ${command}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    if (allowFailure) {
      return '';
    }
    throw new Error(`Git command failed: ${command}`);
  }
}
