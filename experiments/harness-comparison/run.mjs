import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases, taskIds } from './cases.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const live = args.includes('--live');
const repetitions = Number(option('--repetitions', '3'));
const backends = option('--backends', 'native,ai-sdk,pi,fx').split(',');
const selected = option('--cases', (live ? taskIds : cases.map((c) => c.id)).join(',')).split(',');
if (
  !Number.isInteger(repetitions) ||
  repetitions < 1 ||
  repetitions > 20 ||
  backends.some((b) => !['native', 'ai-sdk', 'pi', 'fx'].includes(b)) ||
  selected.some((id) => !cases.some((c) => c.id === id)) ||
  (live && selected.some((id) => !taskIds.includes(id)))
)
  throw new Error('Invalid experiment options');
const output = resolve(
  option('--output', join(directory, 'results', live ? 'live.json' : 'deterministic.json'))
);
const temporary = await mkdtemp(join(tmpdir(), 'artemis-harness-'));
const packageJson = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
const fileDigests = {};
for (const name of [
  'backends.mjs',
  'common.mjs',
  'cases.mjs',
  'worker.mjs',
  'run.mjs',
  'package-lock.json',
]) {
  fileDigests[name] = createHash('sha256')
    .update(await readFile(join(directory, name)))
    .digest('hex');
}
const results = [];
const report = {
  startedAt: new Date().toISOString(),
  completedAt: null,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: directory,
    encoding: 'utf8',
  }).trim(),
  runtime: {
    bun: Bun.version,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
  },
  dependencies: packageJson.dependencies,
  live,
  model: live ? 'qwen2.5-coder:3b' : 'scripted-fixture',
  fileDigests,
  fixtureTokensPerRequest: live ? null : 8,
  repetitions,
  methodology:
    'Shared ArtemisKit simulated tool policy and bounded transport; real harness loops; fx uses a Gateway-protocol translation fixture. Not a stock provider-path benchmark.',
  results,
};
if (live) {
  const modelList = await fetch('http://127.0.0.1:11434/api/tags', {
    signal: AbortSignal.timeout(5000),
  }).then((r) => r.json());
  const model = modelList.models.find((m) => m.name === report.model);
  if (!model || model.remote_host || model.remote_model)
    throw new Error('The experiment requires the installed local model');
  report.modelIdentity = {
    name: model.name,
    digest: model.digest,
    size: model.size,
    details: model.details,
  };
  report.ollama = await fetch('http://127.0.0.1:11434/api/version', {
    signal: AbortSignal.timeout(5000),
  }).then((r) => r.json());
}
async function child(options) {
  const childStarted = performance.now();
  const process = Bun.spawn(
    [processPath(), join(directory, 'worker.mjs'), JSON.stringify(options)],
    {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  let timedOut = false;
  const timer = setTimeout(
    () => {
      timedOut = true;
      process.kill('SIGKILL');
    },
    live ? 60_000 : 10_000
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  clearTimeout(timer);
  const base = {
    backend: options.backend,
    case: options.case,
    phase: options.phase ?? null,
    live,
    passed: false,
    category: taskIds.includes(options.case) ? 'task' : 'control',
    reportedStatus: timedOut ? 'watchdog_timeout' : 'worker_error',
    error: code === 0 ? null : `exit_${code}`,
  };
  let result = base;
  try {
    result = JSON.parse(stdout.trim().split('\n').at(-1));
  } catch {
    /* Worker failures remain failed coordinates. */
  }
  return {
    ...result,
    processElapsedMs: Math.round(performance.now() - childStarted),
    stderrPresent: stderr.length > 0,
    ...(timedOut ? { passed: false, reportedStatus: 'watchdog_timeout' } : {}),
  };
}
function processPath() {
  return process.execPath;
}
await mkdir(dirname(output), { recursive: true });
for (let repeat = 1; repeat <= repetitions; repeat++) {
  for (const id of selected) {
    // Rotate backend order across repetitions to reduce consistent warm-cache advantage.
    const order = [
      ...backends.slice((repeat - 1) % backends.length),
      ...backends.slice(0, (repeat - 1) % backends.length),
    ];
    for (const backend of order) {
      const coordinate = { backend, case: id, live };
      let result;
      if (id.startsWith('resume')) {
        const checkpoint = join(temporary, `${backend}-${id}-${repeat}.json`);
        const first = await child({ ...coordinate, phase: 1, checkpoint });
        const second = first.passed ? await child({ ...coordinate, phase: 2, checkpoint }) : null;
        result = {
          ...(second ?? first),
          passed: first.passed && !!second?.passed,
          phases: [first, ...(second ? [second] : [])],
        };
      } else result = await child(coordinate);
      results.push({ ...result, repeat });
      console.log(
        `${live ? 'live' : 'fixture'} ${repeat} ${backend} ${id}: ${result.passed ? 'PASS' : 'FAIL'} (${result.reportedStatus}, ${result.requests ?? '?'} requests)`
      );
      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    }
  }
}
report.completedAt = new Date().toISOString();
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Saved ${results.length} coordinates to ${output}; ${results.filter((r) => r.passed).length} passed.`
);
process.exitCode = results.every((r) => r.passed) ? 0 : 1;
