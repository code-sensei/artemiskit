import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as reports from '@artemiskit/reports';
import { ArtemisKit, createWorkflowReport, generateWorkflowReport } from '@artemiskit/sdk';

const runtime = process.versions.bun ? 'bun' : 'node';
const recovery = JSON.parse(readFileSync(`workflow-recovery-${runtime}.json`, 'utf8'))[0];
const historical = JSON.parse(readFileSync('historical-workflows.json', 'utf8')).runs[0].record;
const inputs = [
  historical,
  recovery.paused,
  recovery.resumed,
  ...['success', 'missing-artifact', 'judge-invalid', 'preflight', 'unmeasured'].map((name) =>
    JSON.parse(readFileSync(`${name}-record.json`, 'utf8'))
  ),
];
const kit = new ArtemisKit();
const fetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error('Unexpected report network access');
};
try {
  const model = createWorkflowReport(inputs);
  assert.deepEqual(model, reports.createWorkflowReport(inputs));
  assert.deepEqual(model, kit.createWorkflowReport(inputs));
  assert.deepEqual(model, createWorkflowReport([...inputs].reverse()));
  assert.equal(model.summary.supersededAttempts, 1);
  assert.equal(model.summary.historical, 1);
  assert.equal(model.summary.preflight, 1);
  assert.equal(model.summary.eligible, 3);
  assert.equal(model.summary.passed, 2);
  assert.equal(model.summary.failed, 1);
  assert.equal(model.summary.invalid, 1);
  assert.equal(model.summary.taskSuccessRate, 2 / 3);
  const files = inputs.map((record, index) => {
    const path = `report-${runtime}-input-${index}.json`;
    writeFileSync(path, JSON.stringify(record));
    return path;
  });
  const preload = resolve(`report-${runtime}-offline.mjs`);
  writeFileSync(
    preload,
    "globalThis.fetch = () => { throw new Error('Unexpected report network access'); };\n"
  );
  for (const view of ['technical', 'executive', 'comprehensive']) {
    for (const format of ['html', 'markdown']) {
      const rendered = generateWorkflowReport(inputs, { view, format });
      assert.equal(rendered, kit.generateWorkflowReport(inputs, { view, format }));
      assert.equal(
        rendered,
        format === 'html'
          ? reports.renderWorkflowReportHTML(model, { view })
          : reports.renderWorkflowReportMarkdown(model, { view })
      );
      assert.ok(!rendered.includes('sensitive-recovery-fixture'));
      assert.ok(!rendered.includes('sensitive-consumer-fixture-content'));
      const output = `assessment-${runtime}-${view}.${format === 'html' ? 'html' : 'md'}`;
      const args = [
        '--preload',
        preload,
        resolve('node_modules/.bin/akit'),
        'workflow',
        'report',
        ...files,
        '--view',
        view,
        '--format',
        format,
        '--output',
        output,
      ];
      const result = spawnSync('bun', args, {
        encoding: 'utf8',
        timeout: 15000,
        env: { PATH: process.env.PATH },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(output, 'utf8'), rendered);
      assert.equal(statSync(output).mode & 0o777, 0o600);
      assert.notEqual(
        spawnSync('bun', args, {
          encoding: 'utf8',
          timeout: 15000,
          env: { PATH: process.env.PATH },
        }).status,
        0
      );
      assert.equal(readFileSync(output, 'utf8'), rendered);
    }
  }
  assert.throws(() => generateWorkflowReport({ schemaVersion: '99' }));
  assert.throws(() => generateWorkflowReport({ version: 1, payload: { transcript: 'private' } }));
  writeFileSync(`workflow-assessment-${runtime}.json`, JSON.stringify(model, null, 2));
} finally {
  globalThis.fetch = fetch;
}
console.log(
  'PASS: installed offline reports, all CLI/SDK views and formats, V1/V2/V3 denominators, resume deduplication and no-clobber outputs'
);
