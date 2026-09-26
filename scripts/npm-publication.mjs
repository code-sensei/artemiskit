import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parseRemoteTag, validateReleaseManifest, verifyRelease } from './verify-release.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryURL = 'https://registry.npmjs.org';
const namePattern = /^@artemiskit\/[a-z][a-z0-9-]*$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// npm 12 returns [packument] for npm info --json; never interpret that as an empty registry.
export function normalizePackument(value) {
  const result = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    !result.versions ||
    typeof result.versions !== 'object' ||
    Array.isArray(result.versions)
  ) {
    throw new Error('Invalid registry metadata; refusing to infer unpublished versions');
  }
  return result;
}

function resolvedWorkspace(specifier, version) {
  if (!version) throw new Error('Workspace dependency is not in the candidate package map');
  if (specifier === 'workspace:*') return version;
  if (specifier === 'workspace:^') return `^${version}`;
  if (specifier === 'workspace:~') return `~${version}`;
  throw new Error('Unsupported workspace dependency range; resolve it before publication');
}

export function assertPackedDependencies(packed, source, packages) {
  if (packed.name !== source.name || packed.version !== source.version)
    throw new Error('Packed package identity differs from candidate');
  const versions = new Map(packages.map((pkg) => [pkg.name, pkg.version]));
  for (const group of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    for (const [name, value] of Object.entries(packed[group] ?? {})) {
      if (typeof value !== 'string' || value.startsWith('workspace:'))
        throw new Error(`Unresolved packed dependency: ${source.name}`);
      if (
        source[group]?.[name]?.startsWith('workspace:') &&
        value !== resolvedWorkspace(source[group][name], versions.get(name))
      )
        throw new Error(`Packed internal dependency version mismatch: ${source.name} -> ${name}`);
    }
    for (const name of Object.keys(source[group] ?? {})) {
      if (
        !source[group][name].startsWith('workspace:') &&
        packed[group]?.[name] !== source[group][name]
      )
        throw new Error(`Packed dependency specifier changed: ${source.name} -> ${name}`);
      if (
        source[group][name].startsWith('workspace:') &&
        packed[group]?.[name] !== resolvedWorkspace(source[group][name], versions.get(name))
      )
        throw new Error(`Missing packed internal dependency: ${source.name} -> ${name}`);
    }
  }
}

function publicVersion(metadata, pkg, integrity) {
  const published = normalizePackument(metadata).versions[pkg.version];
  if (!published) return false;
  if (!published.dist?.integrity || published.dist.integrity !== integrity)
    throw new Error(
      `Published payload conflicts with retained candidate: ${pkg.name}@${pkg.version}`
    );
  return metadata['dist-tags']?.latest === pkg.version;
}

function lifecycle(status, pkg) {
  if (status === 'staged')
    throw new Error(`Manual approval required: ${pkg.name}@${pkg.version}; no resubmission`);
  if (status === 'blocked' || status === 'deleted')
    throw new Error(`Publication ${status}: ${pkg.name}@${pkg.version}; no resubmission`);
}

export async function publishPackages(
  { packages, candidate, manifest, dryRun = false, timeoutMs = 600_000 },
  io
) {
  if (!/^[a-f0-9]{40,64}$/.test(candidate) || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('Invalid publication candidate or polling deadline');
  for (const pkg of packages) {
    if (!namePattern.test(pkg.name) || !versionPattern.test(pkg.version))
      throw new Error('Invalid publication package identity');
  }
  if (new Set(packages.map((pkg) => pkg.name)).size !== packages.length)
    throw new Error('Duplicate publication package');
  const selected = [];
  for (const pkg of packages) {
    const metadata = normalizePackument(await io.registry(pkg.name));
    const receipt = await io.load(pkg);
    const declared = manifest?.packages.some(
      (entry) => entry.name === pkg.name && entry.version === pkg.version
    );
    if (manifest && !declared) continue;
    // Historical unchanged versions are excluded. A receipt reopens only this candidate's work.
    if (!manifest && metadata.versions[pkg.version] && receipt?.candidate !== candidate) continue;
    if (receipt && receipt.candidate !== candidate)
      throw new Error(
        `Retained publication belongs to another candidate: ${pkg.name}@${pkg.version}`
      );
    selected.push({ pkg, receipt });
  }
  if (manifest && selected.length !== manifest.packages.length)
    throw new Error('Publication candidate does not cover the milestone manifest');
  const tags = selected.map(({ pkg }) => `${pkg.name}@${pkg.version}`);
  if (manifest) tags.push(manifest.tag);
  for (const tag of tags) await io.checkTag(tag, candidate);
  if (dryRun)
    return { status: 'dry-run', packages: selected.map(({ pkg }) => `${pkg.name}@${pkg.version}`) };

  for (const item of selected) {
    const { pkg } = item;
    const packed = await io.pack(pkg, item.receipt);
    let receipt = item.receipt;
    if (
      receipt &&
      (receipt.name !== pkg.name ||
        receipt.version !== pkg.version ||
        receipt.integrity !== packed.integrity ||
        !['prepared', 'attempted', 'accepted', 'published'].includes(receipt.state))
    )
      throw new Error(`Retained publication identity mismatch: ${pkg.name}@${pkg.version}`);
    receipt ??= {
      schema_version: 1,
      candidate,
      name: pkg.name,
      version: pkg.version,
      integrity: packed.integrity,
      state: 'prepared',
    };
    await io.save(pkg, receipt);
    item.receipt = receipt;
    item.packed = packed;
  }

  for (const { pkg, packed, receipt: preparedReceipt } of selected) {
    let receipt = preparedReceipt;
    let metadata = normalizePackument(await io.registry(pkg.name));
    if (publicVersion(metadata, pkg, receipt.integrity)) {
      await io.save(pkg, { ...receipt, state: 'published' });
      continue;
    }
    if (metadata.versions[pkg.version]) {
      throw new Error(
        `Published version is not latest: ${pkg.name}@${pkg.version}; no tag mutation`
      );
    }
    if (receipt.state === 'prepared') {
      const status = await io.status(pkg);
      lifecycle(status, pkg);
      if (status === 'validating' || status === 'published')
        throw new Error(
          `Unrecorded publication pending: ${pkg.name}@${pkg.version}; reconcile before continuing`
        );
      // Persist before invoking npm: crash/timeout is an uncertain upload, never an automatic retry.
      receipt = { ...receipt, state: 'attempted' };
      await io.save(pkg, receipt);
      try {
        await io.publish(pkg, packed.archive);
        receipt = { ...receipt, state: 'accepted' };
        await io.save(pkg, receipt);
      } catch {
        io.log(
          `Upload outcome uncertain: ${pkg.name}@${pkg.version}; reconciling without resubmission`
        );
      }
    }
    const deadline = io.now() + timeoutMs;
    let verified = false;
    do {
      metadata = normalizePackument(await io.registry(pkg.name));
      if (publicVersion(metadata, pkg, receipt.integrity)) {
        verified = true;
        break;
      }
      const status = await io.status(pkg);
      lifecycle(status, pkg);
      io.log(
        `Publication pending: ${pkg.name}@${pkg.version} (${status ?? 'registry propagation'})`
      );
      const remaining = deadline - io.now();
      if (remaining <= 0) break;
      await io.sleep(Math.min(15_000, remaining));
    } while (io.now() <= deadline);
    if (!verified)
      throw new Error(
        `Publication pending after timeout: ${pkg.name}@${pkg.version}; rerun the same candidate to reconcile, never resubmit manually`
      );
    await io.save(pkg, { ...receipt, state: 'published' });
  }
  // Recheck the entire set before any tag; partial publication never produces release tags.
  for (const { pkg } of selected) {
    const receipt = await io.load(pkg);
    if (!publicVersion(normalizePackument(await io.registry(pkg.name)), pkg, receipt.integrity))
      throw new Error(`Final publication verification pending: ${pkg.name}@${pkg.version}`);
  }
  for (const tag of tags) await io.checkTag(tag, candidate);
  for (const tag of tags) await io.tag(tag, candidate);
  return { status: 'published', packages: selected.map(({ pkg }) => `${pkg.name}@${pkg.version}`) };
}

async function command(program, args, cwd = root) {
  try {
    return (
      await exec(program, args, {
        cwd,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, CI: 'true' },
      })
    ).stdout.trim();
  } catch {
    // npm output/errors may echo configuration. Never print raw subprocess output.
    throw new Error(`${program} operation failed; inspect registry state before retrying`);
  }
}

export async function packCandidate(pkg, packages, archive, receipt) {
  if (!receipt)
    await command(
      'bun',
      ['pm', 'pack', '--ignore-scripts', '--filename', archive, '--quiet'],
      pkg.location
    );
  const integrity = `sha512-${createHash('sha512')
    .update(await readFile(archive))
    .digest('base64')}`;
  if (receipt && integrity !== receipt.integrity)
    throw new Error('Retained tarball integrity mismatch');
  const packed = JSON.parse(await command('tar', ['-xOf', archive, 'package/package.json']));
  assertPackedDependencies(packed, pkg, packages);
  return { archive, integrity };
}

async function workspacePackages() {
  const packages = [];
  for (const parent of ['packages', 'packages/adapters']) {
    for (const entry of await readdir(join(root, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const location = join(root, parent, entry.name);
      try {
        const pkg = JSON.parse(await readFile(join(location, 'package.json'), 'utf8'));
        if (!pkg.private) packages.push({ ...pkg, location });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  return packages;
}

export async function registryRequest(name, fetcher = fetch) {
  const response = await fetcher(`${registryURL}/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return { versions: {}, 'dist-tags': {} };
  if (!response.ok) throw new Error(`Registry metadata unavailable: HTTP ${response.status}`);
  return normalizePackument(await response.json());
}

export async function statusRequest(pkg, token, fetcher = fetch) {
  const response = await fetcher(
    `${registryURL}/-/package/${encodeURIComponent(pkg.name)}/version/${pkg.version}/status`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }
  );
  if ([403, 404, 429, 500, 503].includes(response.status)) return null;
  if (!response.ok) throw new Error(`Publication status unavailable: HTTP ${response.status}`);
  const data = await response.json();
  if (
    data.packageName !== pkg.name ||
    data.version !== pkg.version ||
    !['published', 'validating', 'staged', 'blocked', 'deleted'].includes(data.status)
  )
    throw new Error('Invalid publication status response');
  return data.status;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const packageRelease = args.includes('--package-release');
  if (args.some((arg) => !['--dry-run', '--package-release'].includes(arg)))
    throw new Error('Unknown publication option');
  const packages = await workspacePackages();
  const core = packages.find((pkg) => pkg.name === '@artemiskit/core');
  let manifest;
  if (core?.version.startsWith('0.6.')) {
    const current = validateReleaseManifest(
      JSON.parse(await readFile(join(root, 'docs/releases', `${core.version}.json`), 'utf8'))
    );
    await verifyRelease(packageRelease ? 'completed' : 'prepublish', current);
    if (!packageRelease) manifest = current;
  } else if (packageRelease)
    throw new Error('Independent package mode requires a completed 0.6.x milestone');
  const candidate = await command('git', ['rev-parse', 'HEAD']);
  if (!dryRun && (await command('git', ['status', '--porcelain'])))
    throw new Error(
      'Publication requires a clean committed candidate; --force only bypasses preliminary checks'
    );
  const common = resolve(root, await command('git', ['rev-parse', '--git-common-dir']));
  const directory = join(common, 'npm-publication');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, 'lock');
  try {
    await mkdir(lock);
  } catch {
    throw new Error(
      'Another publisher or retained lock exists; inspect git-common-dir/npm-publication/lock before recovery'
    );
  }
  try {
    const key = (pkg) => `${pkg.name.replace('/', '-')}-${pkg.version}`;
    const receiptPath = (pkg) => join(directory, `${key(pkg)}.json`);
    const load = async (pkg) => {
      try {
        return JSON.parse(await readFile(receiptPath(pkg), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw new Error('Cannot read retained publication receipt');
      }
    };
    const checkTag = async (tag, head) => {
      const remote = parseRemoteTag(
        await command('git', [
          'ls-remote',
          '--tags',
          'origin',
          `refs/tags/${tag}`,
          `refs/tags/${tag}^{}`,
        ]),
        tag
      );
      const local = await command('git', [
        'for-each-ref',
        '--format=%(objecttype) %(objectname) %(*objectname)',
        `refs/tags/${tag}`,
      ]);
      if (
        (remote.exists && (!remote.annotated || remote.commit !== head)) ||
        (local && local !== `tag ${local.split(' ')[1]} ${head}`)
      )
        throw new Error(`Existing publication tag conflicts with candidate: ${tag}`);
    };
    const token = process.env.NPM_TOKEN || process.env.NPM_API_KEY;
    if (!dryRun && !token) throw new Error('Publishing credential required');
    const io = {
      registry: registryRequest,
      load,
      save: async (pkg, receipt) => {
        const file = receiptPath(pkg);
        await writeFile(`${file}.tmp`, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      },
      pack: (pkg, receipt) =>
        packCandidate(pkg, packages, join(directory, `${key(pkg)}.tgz`), receipt),
      status: (pkg) => statusRequest(pkg, token),
      publish: (_pkg, archive) =>
        command('npm', [
          'publish',
          archive,
          '--ignore-scripts',
          '--access',
          'public',
          '--tag',
          'latest',
          '--json',
          '--fetch-retries=0',
          `--registry=${registryURL}`,
        ]),
      checkTag,
      tag: async (tag, head) => {
        const existing = await command('git', ['tag', '--list', tag]);
        if (!existing) await command('git', ['tag', '-a', tag, '-m', tag, head]);
      },
      now: Date.now,
      sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
      log: console.log,
    };
    console.log(
      JSON.stringify(await publishPackages({ packages, candidate, manifest, dryRun }, io))
    );
  } finally {
    await rmdir(lock);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      error.cause
        ? 'Publication transport failed; retained attempts must be reconciled'
        : error.message
    );
    process.exitCode = 1;
  });
}
