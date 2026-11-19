import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const manifestFilePattern = /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\.json$/;
// Sequential milestone releases begin at 0.6.0; earlier versions predate milestone manifests.
const FIRST_MILESTONE = [0, 6, 0];

function versionParts(version) {
  const match = typeof version === 'string' ? versionPattern.exec(version) : null;
  const parts = match ? match.slice(1).map(Number) : null;
  return parts?.every(Number.isSafeInteger) ? parts : null;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/** True for a stable version at or after the first sequential milestone (0.6.0). */
export function isMilestoneVersion(version) {
  const parts = versionParts(version);
  return !!parts && compareVersions(parts, FIRST_MILESTONE) >= 0;
}

/** True when `previous` belongs to the milestone line immediately before `milestone`'s line. */
function isPrecedingLine(previous, milestone) {
  const [major, minor] = milestone;
  if (minor > 0) return previous[0] === major && previous[1] === minor - 1;
  return previous[0] === major - 1;
}

/**
 * The milestone a release must name as `previous`, derived from the recorded milestone sequence
 * (`docs/releases/<version>.json`). A patch names the patch before it; a line's first milestone
 * names the latest recorded milestone of the preceding line (0.7.0 names 0.6.4); 0.6.0 names none.
 * Throws when that milestone is not recorded, so a skipped milestone or line cannot be released.
 */
export function expectedPreviousMilestone(milestone, recordedMilestones) {
  const current = versionParts(milestone);
  if (!current || !isMilestoneVersion(milestone)) throw new Error('Invalid release milestone');
  if (compareVersions(current, FIRST_MILESTONE) === 0) return null;
  const recorded = recordedMilestones
    .map(versionParts)
    .filter((parts) => parts && compareVersions(parts, FIRST_MILESTONE) >= 0);
  const candidates =
    current[2] > 0
      ? recorded.filter((parts) => parts[0] === current[0] && parts[1] === current[1])
      : recorded.filter((parts) => isPrecedingLine(parts, current));
  const earlier = candidates.filter((parts) => compareVersions(parts, current) < 0);
  const latest = earlier.sort(compareVersions).at(-1);
  if (!latest || (current[2] > 0 && latest[2] !== current[2] - 1)) {
    throw new Error('Preceding milestone manifest is not recorded; milestones cannot be skipped');
  }
  return latest.join('.');
}

/**
 * Validate a milestone release manifest. Without `recordedMilestones` only the shape of `previous`
 * is checked; with them, `previous` must equal {@link expectedPreviousMilestone}.
 */
export function validateReleaseManifest(value, recordedMilestones) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'draft' in value) {
    throw new Error('Release manifest is a DRAFT; finalize its package map before verification');
  }
  const keys = ['schema_version', 'milestone', 'tag', 'previous', 'packages'];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    value.schema_version !== 1 ||
    !isMilestoneVersion(value.milestone) ||
    value.tag !== `v${value.milestone}` ||
    !Array.isArray(value.packages) ||
    !value.packages.length
  ) {
    throw new Error('Invalid milestone release manifest');
  }
  const current = versionParts(value.milestone);
  const previous = value.previous === null ? null : versionParts(value.previous);
  const plausible =
    compareVersions(current, FIRST_MILESTONE) === 0
      ? value.previous === null
      : !!previous &&
        (current[2] > 0
          ? compareVersions(previous, [current[0], current[1], current[2] - 1]) === 0
          : isPrecedingLine(previous, current));
  if (
    !plausible ||
    (recordedMilestones &&
      value.previous !== expectedPreviousMilestone(value.milestone, recordedMilestones))
  ) {
    throw new Error('Release manifest must name the immediately preceding milestone');
  }
  const names = new Set();
  for (const pkg of value.packages) {
    if (
      !pkg ||
      typeof pkg !== 'object' ||
      Array.isArray(pkg) ||
      Object.keys(pkg).some((key) => !['name', 'version'].includes(key)) ||
      !/^@artemiskit\/[a-z][a-z0-9-]*$/.test(pkg.name ?? '') ||
      !versionPattern.test(pkg.version ?? '') ||
      names.has(pkg.name)
    ) {
      throw new Error('Release packages must have unique names and stable versions');
    }
    names.add(pkg.name);
  }
  if (
    !value.packages.some(
      (pkg) => pkg.name === '@artemiskit/core' && pkg.version === value.milestone
    )
  ) {
    throw new Error('Core package version must identify the release milestone');
  }
  return value;
}

async function packageVersions() {
  const versions = new Map();
  for (const parent of ['packages', 'packages/adapters']) {
    for (const entry of await readdir(join(repository, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const pkg = JSON.parse(
          await readFile(join(repository, parent, entry.name, 'package.json'), 'utf8')
        );
        if (!pkg.private) versions.set(pkg.name, pkg.version);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  return versions;
}

/** Milestones with a recorded manifest in docs/releases (validation and publication files excluded). */
async function recordedMilestones() {
  const files = await readdir(join(repository, 'docs/releases'));
  return files.flatMap((file) => {
    const version = manifestFilePattern.exec(file)?.[1];
    return version && isMilestoneVersion(version) ? [version] : [];
  });
}

async function registryPackage(name) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`npm registry check failed for ${name}: HTTP ${response.status}`);
  return response.json();
}

async function remoteTag(tag) {
  const { stdout } = await exec(
    'git',
    ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
    {
      cwd: repository,
      timeout: 15_000,
      maxBuffer: 64_000,
    }
  );
  return parseRemoteTag(stdout, tag);
}

export function parseRemoteTag(stdout, tag) {
  const refs = new Map(
    stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split(/\s+/);
        return [ref, sha];
      })
  );
  const object = refs.get(`refs/tags/${tag}`);
  const commit = refs.get(`refs/tags/${tag}^{}`);
  return { exists: !!object, annotated: !!commit, commit: commit ?? object ?? null };
}

export async function verifyRelease(mode, manifest, dependencies = {}) {
  const milestones = await (dependencies.recordedMilestones ?? recordedMilestones)();
  const release = validateReleaseManifest(manifest, milestones);
  const local = dependencies.packageVersions ?? packageVersions;
  const registry = dependencies.registryPackage ?? registryPackage;
  const tag = dependencies.remoteTag ?? remoteTag;
  const previousManifest =
    dependencies.previousManifest ??
    (async (version) =>
      validateReleaseManifest(
        JSON.parse(await readFile(join(repository, 'docs/releases', `${version}.json`), 'utf8'))
      ));
  const head =
    dependencies.head ??
    (async () => (await exec('git', ['rev-parse', 'HEAD'], { cwd: repository })).stdout.trim());
  async function requireCompleted(completed) {
    const milestoneTag = await tag(completed.tag);
    if (!milestoneTag.exists || !milestoneTag.annotated)
      throw new Error(
        'Previous milestone must be published to npm and tagged on origin before this release'
      );
    for (const pkg of completed.packages) {
      const published = await registry(pkg.name);
      const packageTag = await tag(`${pkg.name}@${pkg.version}`);
      if (
        !published.versions?.[pkg.version]?.dist?.integrity ||
        !packageTag.exists ||
        !packageTag.annotated ||
        packageTag.commit !== milestoneTag.commit
      )
        throw new Error(`Previous milestone package publication is incomplete: ${pkg.name}`);
    }
  }
  if (mode === 'local' || mode === 'prepublish') {
    const versions = await local();
    for (const pkg of release.packages) {
      if (versions.get(pkg.name) !== pkg.version)
        throw new Error(`Local release version mismatch: ${pkg.name}`);
    }
  }
  if (mode === 'prepublish' && release.previous) {
    const previousRelease = validateReleaseManifest(
      await previousManifest(release.previous),
      milestones
    );
    if (previousRelease.milestone !== release.previous)
      throw new Error('Previous milestone manifest mismatch');
    await requireCompleted(previousRelease);
  }
  if (mode === 'completed') await requireCompleted(release);
  if (mode === 'prepublish') {
    const candidate = await head();
    for (const name of [
      release.tag,
      ...release.packages.map((pkg) => `${pkg.name}@${pkg.version}`),
    ]) {
      const existing = await tag(name);
      if (existing.exists && (!existing.annotated || existing.commit !== candidate))
        throw new Error(`Release tag already identifies a different revision: ${name}`);
    }
    // Changesets can publish every unpublished workspace version, not just listed entries.
    for (const [name, version] of await local()) {
      if (release.packages.some((pkg) => pkg.name === name)) continue;
      const published = await registry(name);
      if (!published.versions?.[version]?.dist?.integrity) {
        throw new Error(`Unpublished workspace package is missing from release manifest: ${name}`);
      }
    }
  }
  if (mode === 'registry') {
    for (const pkg of release.packages) {
      const published = await registry(pkg.name);
      if (
        !published.versions?.[pkg.version]?.dist?.integrity ||
        published['dist-tags']?.latest !== pkg.version
      ) {
        throw new Error(`Published version/latest verification failed: ${pkg.name}@${pkg.version}`);
      }
    }
  }
  if (mode === 'tags') {
    const commit = await head();
    for (const name of [
      release.tag,
      ...release.packages.map((pkg) => `${pkg.name}@${pkg.version}`),
    ]) {
      const remote = await tag(name);
      if (!remote.exists || !remote.annotated || remote.commit !== commit) {
        throw new Error(`Remote release tag does not identify this revision: ${name}`);
      }
    }
  }
  if (!['local', 'prepublish', 'registry', 'tags', 'completed'].includes(mode))
    throw new Error('Unknown release verification mode');
  return {
    milestone: release.milestone,
    mode,
    packages: release.packages.length,
    status: 'passed',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, file] = process.argv.slice(2);
    if (!file)
      throw new Error(
        'Usage: bun scripts/verify-release.mjs <local|prepublish|registry|tags|completed> <manifest.json>'
      );
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    console.log(JSON.stringify(await verifyRelease(mode, manifest)));
  } catch (error) {
    // Child-process errors can contain transport configuration. Emit only controlled messages.
    console.error(
      error.cmd || error.cause ? 'Release verification transport failed' : error.message
    );
    process.exitCode = 1;
  }
}
