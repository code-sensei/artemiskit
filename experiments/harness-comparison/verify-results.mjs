import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const load = async (name) =>
  JSON.parse(await readFile(new URL(`./results/${name}.json`, import.meta.url), 'utf8'));
const baseline = await load('deterministic');
const coercion = await load('coercion');
const live = await load('live');
const protocol = await load('protocol-probe');
for (const [report, expected] of [
  [baseline, 192],
  [coercion, 24],
  [live, 48],
]) {
  assert.ok(report.completedAt);
  assert.equal(report.results.length, expected);
  for (const name of [
    'backends.mjs',
    'common.mjs',
    'cases.mjs',
    'worker.mjs',
    'run.mjs',
    'package-lock.json',
  ]) {
    const bytes = await readFile(new URL(`./${name}`, import.meta.url));
    assert.equal(report.fileDigests[name], createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(
    new Set(report.results.map((r) => `${r.backend}/${r.case}/${r.repeat}`)).size,
    expected
  );
  for (const r of report.results) {
    assert.notEqual(r.reportedStatus, 'watchdog_timeout');
    assert.notEqual(r.reportedStatus, 'worker_error');
    assert.equal(r.paidProviderCostUsd, 0);
    assert.equal(r.localComputeCostUsd, null);
    assert.ok(r.inputs.every((input) => input.instructionsPresent));
  }
}
assert.ok(baseline.results.every((r) => r.passed));
assert.equal(
  baseline.results.filter((r) => r.case === 'false_success' && r.taskOutcome === 'failed').length,
  12
);
assert.equal(
  baseline.results.filter((r) => r.case === 'missing_usage' && r.tokens === null && !r.usageKnown)
    .length,
  12
);
for (const r of baseline.results.filter((r) => r.case.startsWith('resume'))) {
  assert.equal(r.phases.length, 2);
  assert.ok(r.phases.every((phase) => phase.passed));
}
const failures = coercion.results.filter((r) => !r.passed);
assert.equal(failures.length, 3);
assert.ok(
  failures.every(
    (r) =>
      r.backend === 'pi' && r.case === 'coerced_arguments' && r.finalFiles.includes('number.txt')
  )
);
assert.equal(
  coercion.results.filter(
    (r) =>
      r.backend === 'pi' &&
      r.case === 'strict_coerced_arguments' &&
      r.passed &&
      r.guardStops.includes('rewritten_arguments')
  ).length,
  3
);
assert.ok(
  live.results.every(
    (r) => !r.passed && r.taskOutcome === 'failed' && r.requests === 1 && r.trace.length === 0
  )
);
assert.ok(
  protocol.results.every((r) => r.structuredToolCalls.length === 0 && r.finishReason === 'stop')
);
// Check the initial provider-bound histories match, not merely the user-facing prompts.
for (const id of ['document', 'records', 'artifact', 'approval']) {
  assert.equal(
    new Set(live.results.filter((r) => r.case === id).map((r) => r.inputs[0].digest)).size,
    1
  );
}
console.log(
  'Verified all 264 matched coordinates, retained failures, restart phases, usage availability and protocol diagnostics.'
);
