/**
 * Configuration file loader
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { ArtemisConfigSchema, type ArtemisConfig } from './schema';

const CONFIG_FILENAMES = ['artemis.config.yaml', 'artemis.config.yml', 'artemis.yaml'];

/**
 * Find and load the configuration file
 */
export async function loadConfig(configPath?: string): Promise<ArtemisConfig | null> {
  const path = configPath || findConfigFile();

  if (!path) {
    return null;
  }

  try {
    const content = await readFile(path, 'utf-8');
    const raw = parseYaml(content);

    // Expand environment variables
    const expanded = expandEnvVars(raw);

    const result = ArtemisConfigSchema.safeParse(expanded);

    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid config file ${path}:\n${issues}`);
    }

    return result.data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Find config file in current directory or parents
 */
function findConfigFile(): string | null {
  let dir = process.cwd();
  const root = resolve('/');

  while (dir !== root) {
    for (const filename of CONFIG_FILENAMES) {
      const path = join(dir, filename);
      if (existsSync(path)) {
        return path;
      }
    }
    dir = resolve(dir, '..');
  }

  return null;
}

/**
 * Expand environment variables in config values
 * Supports ${VAR} and ${VAR:-default} syntax
 */
function expandEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      const [varName, defaultValue] = expr.split(':-');
      return process.env[varName] || defaultValue || '';
    });
  }

  if (Array.isArray(obj)) {
    return obj.map(expandEnvVars);
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVars(value);
    }
    return result;
  }

  return obj;
}

/**
 * Get a merged config with CLI options taking precedence
 */
export function mergeConfig(
  fileConfig: ArtemisConfig | null,
  cliOptions: Partial<ArtemisConfig>
): ArtemisConfig {
  const defaults: ArtemisConfig = {
    project: 'default',
    scenariosDir: './scenarios',
  };

  return {
    ...defaults,
    ...fileConfig,
    ...Object.fromEntries(
      Object.entries(cliOptions).filter(([_, v]) => v !== undefined)
    ),
  } as ArtemisConfig;
}
