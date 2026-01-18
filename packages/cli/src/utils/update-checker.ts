/**
 * Non-blocking update checker for ArtemisKit CLI
 */

import chalk from 'chalk';
import { version as currentVersion } from '../../package.json';

const PACKAGE_NAME = '@artemiskit/cli';
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
const FETCH_TIMEOUT_MS = 3000; // 3 second timeout to avoid blocking

// Brand color
const brandColor = chalk.hex('#fb923c');

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

/**
 * Fetches the latest version from npm registry with a timeout
 */
async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(NPM_REGISTRY_URL, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { version?: string };
    return data.version || null;
  } catch {
    // Silently fail - network issues shouldn't block CLI usage
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Compares two semver versions
 * Returns true if latest > current
 */
function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.replace(/^v/, '').split('.').map(Number);
  const latestParts = latest.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

/**
 * Check for updates (non-blocking)
 * Returns update info or null if check fails
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const latestVersion = await fetchLatestVersion();

  if (!latestVersion) {
    return null;
  }

  return {
    currentVersion,
    latestVersion,
    updateAvailable: isNewerVersion(currentVersion, latestVersion),
  };
}

/**
 * Get the current CLI version
 */
export function getCurrentVersion(): string {
  return currentVersion;
}

/**
 * Format version display string
 */
export function formatVersionDisplay(version: string): string {
  return `${chalk.bold('ArtemisKit CLI')} ${brandColor(`v${version}`)}`;
}

/**
 * Format update available message
 */
export function formatUpdateMessage(current: string, latest: string): string {
  return (
    '\n' +
    chalk.yellow('╭─────────────────────────────────────────────────────╮') +
    '\n' +
    chalk.yellow('│') +
    chalk.yellow('  Update available! ') +
    chalk.gray(`${current}`) +
    chalk.yellow(' → ') +
    brandColor.bold(`${latest}`) +
    ' '.repeat(24 - current.length - latest.length) +
    chalk.yellow('│') +
    '\n' +
    chalk.yellow('│') +
    chalk.white('  Run ') +
    chalk.cyan('npm install -g @artemiskit/cli') +
    chalk.white(' to update  ') +
    chalk.yellow('│') +
    '\n' +
    chalk.yellow('╰─────────────────────────────────────────────────────╯')
  );
}

/**
 * Non-blocking update check that prints message if update available
 * Use this to fire-and-forget an update check
 */
export function checkForUpdateAndNotify(): void {
  // Fire and forget - don't await
  checkForUpdate()
    .then((info) => {
      if (info?.updateAvailable) {
        console.log(formatUpdateMessage(info.currentVersion, info.latestVersion));
      }
    })
    .catch(() => {
      // Silently ignore errors
    });
}
