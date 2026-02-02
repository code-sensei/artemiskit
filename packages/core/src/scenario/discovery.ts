/**
 * Scenario discovery - find scenario files by directory scanning and glob patterns
 */

import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Options for scenario discovery
 */
export interface DiscoveryOptions {
  /** File extensions to include (default: ['.yaml', '.yml']) */
  extensions?: string[];
  /** Maximum directory depth to scan (default: 10) */
  maxDepth?: number;
  /** Patterns to exclude (glob-like, e.g., 'node_modules', '*.draft.yaml') */
  exclude?: string[];
}

const DEFAULT_EXTENSIONS = ['.yaml', '.yml'];
const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_EXCLUDE = ['node_modules', '.git', 'dist', 'build', 'coverage'];

/**
 * Check if a path matches any of the exclude patterns
 */
function matchesExcludePattern(name: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple wildcard matching
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
      if (regex.test(name)) return true;
    } else {
      // Exact match
      if (name === pattern) return true;
    }
  }
  return false;
}

/**
 * Check if a filename has a valid scenario extension
 */
function hasValidExtension(filename: string, extensions: string[]): boolean {
  return extensions.some((ext) => filename.endsWith(ext));
}

/**
 * Recursively scan a directory for scenario files
 */
async function scanDirectoryRecursive(
  dirPath: string,
  options: Required<DiscoveryOptions>,
  currentDepth: number
): Promise<string[]> {
  if (currentDepth > options.maxDepth) {
    return [];
  }

  const results: string[] = [];
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    // Skip excluded patterns
    if (matchesExcludePattern(entry.name, options.exclude)) {
      continue;
    }

    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      const subResults = await scanDirectoryRecursive(fullPath, options, currentDepth + 1);
      results.push(...subResults);
    } else if (entry.isFile() && hasValidExtension(entry.name, options.extensions)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Discover scenario files in a directory
 *
 * @param dirPath - Path to the directory to scan
 * @param options - Discovery options
 * @returns Array of absolute paths to scenario files
 *
 * @example
 * ```ts
 * // Scan a directory for all .yaml and .yml files
 * const files = await discoverScenarios('./scenarios');
 *
 * // Scan with custom options
 * const files = await discoverScenarios('./tests', {
 *   extensions: ['.yaml'],
 *   maxDepth: 3,
 *   exclude: ['drafts', '*.skip.yaml']
 * });
 * ```
 */
export async function discoverScenarios(
  dirPath: string,
  options: DiscoveryOptions = {}
): Promise<string[]> {
  const resolvedPath = resolve(dirPath);
  const pathStat = await stat(resolvedPath);

  if (!pathStat.isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`);
  }

  const fullOptions: Required<DiscoveryOptions> = {
    extensions: options.extensions ?? DEFAULT_EXTENSIONS,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    exclude: [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])],
  };

  const files = await scanDirectoryRecursive(resolvedPath, fullOptions, 0);

  // Sort for consistent ordering
  return files.sort();
}

/**
 * Match scenario files using glob-like patterns
 *
 * Supports basic glob patterns:
 * - `*` matches any characters except path separator
 * - `**` matches any characters including path separator (recursive)
 * - `?` matches single character
 *
 * @param pattern - Glob pattern to match
 * @param basePath - Base path to resolve relative patterns (default: cwd)
 * @returns Array of absolute paths to matching scenario files
 *
 * @example
 * ```ts
 * // Match all yaml files in scenarios directory
 * const files = await matchScenarioGlob('scenarios/*.yaml');
 *
 * // Match recursively
 * const files = await matchScenarioGlob('tests/**\/*.yaml');
 *
 * // Match specific patterns
 * const files = await matchScenarioGlob('scenarios/auth-*.yaml');
 * ```
 */
export async function matchScenarioGlob(
  pattern: string,
  basePath: string = process.cwd()
): Promise<string[]> {
  const resolvedBase = resolve(basePath);

  // Check if the pattern contains glob characters
  const hasGlob = /[*?]/.test(pattern);

  if (!hasGlob) {
    // Not a glob pattern - check if it's a file or directory
    const fullPath = resolve(resolvedBase, pattern);
    try {
      const pathStat = await stat(fullPath);
      if (pathStat.isFile()) {
        return [fullPath];
      }
      if (pathStat.isDirectory()) {
        return discoverScenarios(fullPath);
      }
    } catch {
      // Path doesn't exist
      return [];
    }
    return [];
  }

  // Convert glob pattern to regex
  const globToRegex = (glob: string): RegExp => {
    const regexStr = glob
      // Escape special regex characters except * and ?
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      // Convert ** to match any path
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      // Convert * to match any characters except /
      .replace(/\*/g, '[^/]*')
      // Convert ? to match single character
      .replace(/\?/g, '.')
      // Restore ** as match-all including /
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');

    return new RegExp(`^${regexStr}$`);
  };

  // Check if pattern is an absolute path
  const isAbsolute = pattern.startsWith('/');

  // Extract the base directory (non-glob prefix)
  const patternParts = pattern.split('/');
  let baseDir = isAbsolute ? '/' : resolvedBase;
  let globPart = pattern;

  // Start from index 1 if absolute path (skip empty string from leading /)
  const startIndex = isAbsolute ? 1 : 0;

  for (let i = startIndex; i < patternParts.length; i++) {
    const part = patternParts[i];
    if (/[*?]/.test(part)) {
      // Found first glob character - everything before is base
      globPart = patternParts.slice(i).join('/');
      break;
    }
    baseDir = join(baseDir, part);
  }

  // Check if base directory exists
  try {
    const baseStat = await stat(baseDir);
    if (!baseStat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  // Scan from base directory and filter by pattern
  const allFiles = await discoverScenarios(baseDir, { maxDepth: 20 });
  const regex = globToRegex(globPart);

  const matchedFiles = allFiles.filter((filePath) => {
    // Get relative path from base directory
    const relativePath = filePath.slice(baseDir.length + 1);
    return regex.test(relativePath);
  });

  return matchedFiles.sort();
}

/**
 * Resolve a scenario path argument which can be:
 * - A single file path
 * - A directory path
 * - A glob pattern
 *
 * @param pathArg - Path argument from CLI
 * @param basePath - Base path for relative resolution
 * @returns Array of resolved scenario file paths
 */
export async function resolveScenarioPaths(
  pathArg: string,
  basePath: string = process.cwd()
): Promise<string[]> {
  const resolvedBase = resolve(basePath);
  const hasGlob = /[*?]/.test(pathArg);

  if (hasGlob) {
    return matchScenarioGlob(pathArg, resolvedBase);
  }

  const fullPath = resolve(resolvedBase, pathArg);

  try {
    const pathStat = await stat(fullPath);

    if (pathStat.isFile()) {
      return [fullPath];
    }

    if (pathStat.isDirectory()) {
      return discoverScenarios(fullPath);
    }
  } catch {
    // Path doesn't exist
    throw new Error(`Scenario path not found: ${pathArg}`);
  }

  return [];
}
