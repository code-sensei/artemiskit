import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run after the workspace build. Pack real candidates and retain the isolated consumer for review.
// This installs dependencies from npm but executes only deterministic, loopback-provider checks.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(join(tmpdir(), 'artemis-package-consumer-'));
const fixtures = join(root, 'scripts/fixtures/package-consumers');
function run(command, args, cwd = directory, timeout = 120_000) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, CI: '1' },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.error?.message ?? result.status}\n${result.stdout}\n${result.stderr}`
    );
  }
  return result.stdout.trim();
}
console.log(`Fresh package consumer: ${directory}`);
console.log(run('node', [join(fixtures, 'declarations.mjs')], root));
const packageDirectories = [];
for (const entry of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const location = join(root, 'packages', entry.name);
  if (existsSync(join(location, 'package.json'))) packageDirectories.push(location);
  else if (entry.name === 'adapters') {
    for (const adapter of readdirSync(location)) {
      if (existsSync(join(location, adapter, 'package.json')))
        packageDirectories.push(join(location, adapter));
    }
  }
}
const packages = packageDirectories
  .map((location) => ({
    location,
    manifest: JSON.parse(readFileSync(join(location, 'package.json'), 'utf8')),
  }))
  .filter(({ manifest }) => !manifest.private);
const archives = [];
for (const { location, manifest } of packages) {
  assert.ok(existsSync(join(location, 'dist/index.js')), `Build first: ${manifest.name}`);
  const archive = join(directory, `${manifest.name.replace(/[@/]/g, '-')}-${manifest.version}.tgz`);
  run('bun', ['pm', 'pack', '--ignore-scripts', '--filename', archive, '--quiet'], location);
  archives.push(archive);
}
writeFileSync(
  join(directory, 'package.json'),
  JSON.stringify(
    {
      name: 'artemis-fresh-package-consumer',
      private: true,
      type: 'module',
    },
    null,
    2
  )
);
run(
  'npm',
  ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=optional', ...archives],
  directory,
  300_000
);
for (const { manifest } of packages) {
  const installedPath = join(directory, 'node_modules', manifest.name);
  assert.ok(realpathSync(installedPath).startsWith(realpathSync(directory)), manifest.name);
  const installed = JSON.parse(readFileSync(join(installedPath, 'package.json'), 'utf8'));
  assert.equal(installed.version, manifest.version);
  for (const dependency of Object.values(installed.dependencies ?? {})) {
    assert.ok(
      !dependency.startsWith('workspace:'),
      `Untranslated workspace dependency: ${manifest.name}`
    );
  }
}
for (const file of ['runtime.mjs', 'types.mts']) {
  copyFileSync(join(fixtures, file), join(directory, file));
}
// Invoke installed bin entry points, including their declared Bun runtime.
const cli = join(directory, 'node_modules/.bin/akit');
console.log(run('bun', [cli, '--version']));
assert.match(run('bun', [cli, 'tools', 'list']), /request_approval/);
run('bun', [
  cli,
  'init',
  'agent-workflow',
  '--yes',
  '--name',
  'packed-consumer',
  '--provider',
  'openai',
  '--model',
  'gpt-4o-mini',
  '--tools',
  'request_approval',
  '--expect-state',
  'approvals.requested',
  '--equals',
  'true',
  '--output',
  'workflow.yaml',
]);
run('bun', [cli, 'scenario', 'validate', 'workflow.yaml']);
console.log('PASS: installed CLI version, tools, scaffold and validation');
for (const runtime of ['node', 'bun']) {
  console.log(`${runtime}: ${run(runtime, ['runtime.mjs'], directory, 30_000)}`);
}
const compiler = join(root, 'node_modules/typescript/bin/tsc');
for (const [module, resolution] of [
  ['NodeNext', 'NodeNext'],
  ['ESNext', 'bundler'],
]) {
  writeFileSync(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module,
        moduleResolution: resolution,
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: [],
      },
      files: ['types.mts'],
    })
  );
  run('node', [compiler, '--project', 'tsconfig.json']);
  console.log(`PASS: isolated TypeScript ${resolution} public API consumer`);
}
const report = {
  completedAt: new Date().toISOString(),
  repositoryRevision: run('git', ['rev-parse', 'HEAD'], root),
  runtimes: { node: run('node', ['--version']), bun: run('bun', ['--version']) },
  packages: Object.fromEntries(packages.map(({ manifest }) => [manifest.name, manifest.version])),
  checks: [
    'node-imports',
    'bun-imports',
    'workflow-schema',
    'approval-permissions',
    'openai-tool-continuation',
    'ling-tool-continuation',
    'bun-cli',
    'typescript-nodenext',
    'typescript-bundler',
    'declaration-finalizer',
  ],
  limitations: [
    'No external model calls; other providers import-only.',
    'CLI/MCP retain Bun runtime; no Docker daemon exercised.',
    'TypeScript uses skipLibCheck for third-party declarations.',
  ],
};
writeFileSync(join(directory, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `PASS: fresh-package verification; evidence at ${join(directory, 'verification.json')}`
);
