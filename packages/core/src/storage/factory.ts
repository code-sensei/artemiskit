/**
 * Storage factory for creating storage adapters
 */

import type { StorageAdapter, StorageConfig } from './types';
import { SupabaseStorageAdapter } from './supabase';
import { LocalStorageAdapter } from './local';
import { ArtemisError } from '../utils/errors';

/**
 * Create a storage adapter from configuration
 */
export function createStorageAdapter(config: StorageConfig): StorageAdapter {
  switch (config.type) {
    case 'supabase':
      if (!config.url || !config.anonKey) {
        throw new ArtemisError(
          'Supabase storage requires url and anonKey configuration',
          'CONFIG_ERROR'
        );
      }
      return new SupabaseStorageAdapter({
        url: config.url,
        anonKey: config.anonKey,
        bucket: config.bucket,
      });

    case 'local':
      return new LocalStorageAdapter(config.basePath);

    default:
      throw new ArtemisError(`Unknown storage type: ${config.type}`, 'CONFIG_ERROR');
  }
}

/**
 * Create storage adapter from environment variables
 */
export function createStorageFromEnv(): StorageAdapter {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    return new SupabaseStorageAdapter({
      url: supabaseUrl,
      anonKey: supabaseKey,
      bucket: process.env.SUPABASE_BUCKET,
    });
  }

  return new LocalStorageAdapter(process.env.ARTEMIS_STORAGE_PATH || './artemis-runs');
}
