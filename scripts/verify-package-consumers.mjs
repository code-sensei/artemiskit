import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
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
import { assertPackedFileList } from './npm-publication.mjs';

// Default: qualify built tarballs. --registry: qualify exact workspace versions from npm.
// Both modes retain an isolated installation and execute only loopback-provider checks.
const arguments_ = process.argv.slice(2);
assert.ok(
  new Set(arguments_).size === arguments_.length &&
    arguments_.every((value) => ['--registry', '--docker'].includes(value)),
  'Usage: node scripts/verify-package-consumers.mjs [--registry] [--docker]'
);
const registry = arguments_.includes('--registry');
const docker = arguments_.includes('--docker');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = mkdtempSync(
  join(tmpdir(), registry ? 'artemis-registry-consumer-' : 'artemis-package-consumer-')
);
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
if (!registry) console.log(run('node', [join(fixtures, 'declarations.mjs')], root));
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
const candidates = [];
for (const { location, manifest } of packages) {
  if (registry) {
    candidates.push(`${manifest.name}@${manifest.version}`);
    continue;
  }
  assert.ok(existsSync(join(location, 'dist/index.js')), `Build first: ${manifest.name}`);
  const archive = join(directory, `${manifest.name.replace(/[@/]/g, '-')}-${manifest.version}.tgz`);
  run('bun', ['pm', 'pack', '--ignore-scripts', '--filename', archive, '--quiet'], location);
  assertPackedFileList(run('tar', ['-tf', archive], root));
  candidates.push(archive);
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
  [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--omit=optional',
    '--registry=https://registry.npmjs.org',
    '--fetch-retries=0',
    '--fetch-timeout=15000',
    ...candidates,
  ],
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
  for (const [name, specifier] of Object.entries(manifest.dependencies ?? {})) {
    if (specifier !== 'workspace:*') continue;
    const expected = packages.find((pkg) => pkg.manifest.name === name)?.manifest.version;
    assert.equal(
      installed.dependencies[name],
      expected,
      `Stale packed workspace dependency: ${manifest.name} -> ${name}; synchronize bun.lock versions`
    );
  }
}
for (const file of [
  'experiment.mjs',
  'runtime.mjs',
  'types.mts',
  'workflow-cli.mjs',
  'workflow-recovery.mjs',
  'workflow-report.mjs',
]) {
  copyFileSync(join(fixtures, file), join(directory, file));
}
copyFileSync(
  join(root, 'docs/releases/0.6.1-local-models.json'),
  join(directory, 'historical-workflows.json')
);
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
  console.log(
    `${runtime}: ${run(runtime, ['runtime.mjs', ...(docker ? ['--docker'] : [])], directory, 60_000)}`
  );
}
for (const runtime of ['node', 'bun']) {
  console.log(
    `${runtime}: ${run(runtime, ['workflow-recovery.mjs', ...(docker ? ['--docker'] : [])], directory, 180_000)}`
  );
}
console.log(run('node', ['workflow-cli.mjs', ...(docker ? ['--docker'] : [])], directory, 120_000));
for (const runtime of ['node', 'bun']) {
  console.log(`${runtime}: ${run(runtime, ['workflow-report.mjs'], directory, 120_000)}`);
}
// Benchmark-pack experiments (templates are generator inputs, not experiments) validate from the
// installed CLI and SDK; a two-kind fixture experiment runs and reports through both with parity.
const packExperiments = [];
for (const pack of readdirSync(join(root, 'packs'), { withFileTypes: true })) {
  if (!pack.isDirectory() || pack.name.startsWith('_')) continue;
  const experiments = readdirSync(join(root, 'packs', pack.name)).filter(
    (file) => /^experiment(\..+)?\.yaml$/.test(file) && file !== 'experiment.template.yaml'
  );
  if (!experiments.length) continue;
  cpSync(join(root, 'packs', pack.name), join(directory, 'packs', pack.name), { recursive: true });
  packExperiments.push(...experiments.map((file) => `packs/${pack.name}/${file}`));
}
assert.ok(packExperiments.length, 'No benchmark-pack experiments found');
// Experiment commands run with fetch and raw sockets disabled, so the installed CLI is shown to make
// no network attempt (pack and fixture targets declare a local model server that must stay untouched).
writeFileSync(
  join(directory, 'offline-preload.mjs'),
  `import net from 'node:net';
globalThis.fetch = () => { throw new Error('NETWORK-FORBIDDEN'); };
net.Socket.prototype.connect = function () { throw new Error('NETWORK-FORBIDDEN'); };
`
);
function experimentCli(args) {
  const result = spawnSync(
    'bun',
    ['--preload', './offline-preload.mjs', cli, 'experiment', ...args],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, CI: '1' },
    }
  );
  assert.ok(!result.error, `akit experiment ${args[0]} failed to start: ${result.error?.message}`);
  assert.ok(
    !`${result.stdout}${result.stderr}`.includes('NETWORK-FORBIDDEN'),
    `akit experiment ${args[0]} attempted a network connection`
  );
  return result;
}
function experimentCliSucceeds(args) {
  const result = experimentCli(args);
  assert.equal(
    result.status,
    0,
    `akit experiment ${args.join(' ')}\n${result.stdout}\n${result.stderr}`
  );
  return result.stdout.trim();
}
for (const file of packExperiments) {
  const validation = JSON.parse(experimentCliSucceeds(['validate', file, '--json']));
  assert.equal(validation.valid, true, `Installed CLI rejected ${file}`);
}
console.log(`PASS: installed CLI validated ${packExperiments.length} pack experiments`);
const sdkExperiments = {};
for (const runtime of ['node', 'bun']) {
  const output = run(runtime, ['experiment.mjs', ...packExperiments], directory, 180_000);
  sdkExperiments[runtime] = JSON.parse(output.split('\n').at(-1));
  console.log(`${runtime}: PASS SDK experiment validate/run/report/live refusal: ${output}`);
}
experimentCliSucceeds([
  'run',
  sdkExperiments.node.experiment,
  '--output-dir',
  'experiment-cli/run',
]);
const cliResult = JSON.parse(
  readFileSync(join(directory, 'experiment-cli/run/result.json'), 'utf8')
);
const cliOverall = cliResult.summaries.overall;
for (const runtime of ['node', 'bun']) {
  assert.deepEqual(
    { planned: cliOverall.planned, valid: cliOverall.valid, passed: cliOverall.passed },
    sdkExperiments[runtime].overall,
    `CLI and ${runtime} SDK experiment summaries differ`
  );
}
experimentCliSucceeds([
  'report',
  'experiment-cli/run/result.json',
  '--output-dir',
  'experiment-cli/report',
]);
assert.deepEqual(
  readdirSync(join(directory, 'experiment-cli/report')).sort(),
  [
    'comprehensive.html',
    'comprehensive.md',
    'executive.html',
    'executive.md',
    'technical.html',
    'technical.md',
  ],
  'CLI experiment report must write three views in HTML and Markdown'
);
const refused = experimentCli([
  'run',
  sdkExperiments.node.experiment.replace(/experiment\.yaml$/, 'live.yaml'),
  '--output-dir',
  'experiment-cli/live',
]);
assert.equal(refused.status, 3, 'Installed CLI must refuse an unapproved live experiment');
assert.ok(!existsSync(join(directory, 'experiment-cli/live/result.json')));
console.log(
  'PASS: installed CLI experiment run/report agree with the Node and Bun SDK; unapproved live run refused offline'
);
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
  source: registry ? 'npm-registry' : 'local-tarballs',
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
    'native-workflow-sessions',
    'deterministic-outcomes-and-json-schema',
    'explicit-semantic-judge-and-separate-usage',
    'saved-v1-v2-v3-compatibility',
    'offline-workflow-reports-three-views-html-markdown-cli-sdk',
    'report-resume-denominators-evidence-links-redaction-no-clobber',
    'separate-process-sdk-checkpoint-resume-node-bun',
    'checkpoint-identity-budgets-cursor-terminal-refusal-privacy',
    'task-outcome-cli-exits-and-judge-cancellation',
    'experiment-pack-validation-cli-sdk-node-bun',
    'experiment-fixture-run-report-two-kinds-cli-sdk-parity',
    'experiment-live-refused-without-approval',
    'bun-cli',
    'workflow-cli-execution-preflight-interruption',
    ...(docker ? ['real-docker-node-bun-sdk-and-cli'] : []),
    'typescript-nodenext',
    'typescript-bundler',
    ...(!registry ? ['declaration-finalizer'] : []),
  ],
  limitations: [
    'No external model calls; other providers import-only.',
    'CLI/MCP retain Bun runtime.',
    ...(docker
      ? ['Docker requires the fixed local image and a trusted local daemon.']
      : ['No Docker daemon exercised.']),
    'TypeScript uses skipLibCheck for third-party declarations.',
  ],
};
writeFileSync(join(directory, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `PASS: fresh-package verification; evidence at ${join(directory, 'verification.json')}`
);
