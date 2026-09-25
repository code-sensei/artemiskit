import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bun 1.3.10 retains old workspace versions after Changesets changes only versions.
// Packing then resolves workspace:* to those old versions. Preserve every other byte.
export function syncWorkspaceVersions(source, versions) {
  const remaining = new Set(versions.keys());
  const result = source.replace(
    /^( {4}"([^"\n]+)": \{\n {6}"name": "[^"\n]+",\n {6}"version": ")([^"\n]+)(",)/gm,
    (match, prefix, path, _old, suffix) => {
      const version = versions.get(path);
      if (!version) return match;
      if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
        throw new Error(`Invalid workspace version: ${path}`);
      remaining.delete(path);
      return prefix + version + suffix;
    }
  );
  if (remaining.size)
    throw new Error(`Unrecognized Bun workspace lock entries: ${[...remaining].join(', ')}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const versions = new Map();
  for (const parent of ['packages', 'packages/adapters']) {
    for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = `${parent}/${entry.name}`;
      try {
        const pkg = JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8'));
        versions.set(path, pkg.version);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  const file = join(root, 'bun.lock');
  const original = readFileSync(file, 'utf8');
  const updated = syncWorkspaceVersions(original, versions);
  if (original !== updated) writeFileSync(file, updated);
  console.log(`Synchronized ${versions.size} workspace versions in bun.lock`);
}
