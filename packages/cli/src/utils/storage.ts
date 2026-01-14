/**
 * Shared storage configuration builder
 *
 * Config precedence (top wins):
 * 1. artemis.config.yaml storage section
 * 2. Environment variables
 * 3. Defaults
 */

import { type StorageAdapter, createStorageAdapter } from '@artemiskit/core';
import type { ArtemisConfig } from '../config/schema';

export interface StorageOptions {
  /** Config from artemis.config.yaml */
  fileConfig?: ArtemisConfig | null;
}

/**
 * Create storage adapter with config file support
 *
 * Resolution order:
 * fileConfig.storage > environment variables > default (local)
 */
export function createStorage(options: StorageOptions = {}): StorageAdapter {
  const { fileConfig } = options;

  // Check config file first
  if (fileConfig?.storage) {
    const storageConfig = fileConfig.storage;

    if (storageConfig.type === 'supabase') {
      // For Supabase, config values override env vars
      return createStorageAdapter({
        type: 'supabase',
        url: storageConfig.url || process.env.SUPABASE_URL,
        anonKey: storageConfig.anonKey || process.env.SUPABASE_ANON_KEY,
        bucket: storageConfig.bucket || process.env.SUPABASE_BUCKET,
      });
    }

    if (storageConfig.type === 'local') {
      return createStorageAdapter({
        type: 'local',
        basePath: storageConfig.basePath || process.env.ARTEMIS_STORAGE_PATH || './artemis-runs',
      });
    }
  }

  // Fall back to environment variables
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    return createStorageAdapter({
      type: 'supabase',
      url: supabaseUrl,
      anonKey: supabaseKey,
      bucket: process.env.SUPABASE_BUCKET,
    });
  }

  // Default to local storage
  return createStorageAdapter({
    type: 'local',
    basePath: process.env.ARTEMIS_STORAGE_PATH || './artemis-runs',
  });
}
