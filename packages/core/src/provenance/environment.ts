/**
 * Environment information utilities
 */

/**
 * Get environment information
 */
export function getEnvironmentInfo(): {
  node_version: string;
  platform: string;
  arch: string;
} {
  return {
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}
