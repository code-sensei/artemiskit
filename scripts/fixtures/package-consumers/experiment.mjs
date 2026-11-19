// Fresh-consumer experiment checks for the installed @artemiskit/sdk (0.7.0 milestone surface).
//
// Usage (from the consumer directory): <node|bun> experiment.mjs <pack-experiment.yaml>...
// Writes a self-contained two-target experiment (one scenario task, one agent workflow task) under
// ./experiment-<runtime>/, then validates, runs in fixture mode and reports it through the SDK,
// confirms a live manifest without approval is refused before anything runs, and validates each
// given benchmark-pack experiment. Fetch and raw sockets are disabled: fixture mode must not reach
// any network, including a local model server. Prints one JSON summary line for CLI parity checks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Passes against the SDK fixture client, whose responses start with "Fixture response". */
const PASSING_SCENARIO = `name: consumer-fixture-pass
cases:
  - id: echo
    prompt: "Reply with anything."
    expected:
      type: contains
      values: ["Fixture response"]
`;

/** Passes against the fixture client, which accepts tools but never calls one. */
const FIXTURE_WORKFLOW = `version: '1'
kind: agent_workflow
name: consumer-fixture-workflow
target:
  provider: openai
  model: declared-model
environment:
  type: simulated
  policy:
    network: denied
    side_effects: denied
    permissions:
      documents: read
    budgets:
      max_actions: 4
      max_model_requests: 2
      timeout_ms: 10000
tools:
  - read_document
workflow:
  system_instructions: Answer from the conversation; read the brief only when asked to.
  initial_state:
    documents:
      brief: Fixture brief.
  turns:
    - role: user
      content: Reply with anything.
outcomes:
  deterministic:
    - type: tool_trace
      tool: read_document
      minimum_calls: 0
      maximum_calls: 0
    - type: policy
      rule: no_undeclared_tool
      expected: passed
evidence:
  trace: summary
  artifacts: checksums
  redact: true
`;

const SOURCES = { 'tasks/pass.yaml': PASSING_SCENARIO, 'tasks/workflow.yaml': FIXTURE_WORKFLOW };

/** Stop conditions every live manifest must declare. */
const LIVE_CONTROLS = {
  concurrency_ceiling: 1,
  stop_conditions: [
    'request_budget_exhausted',
    'token_budget_exhausted',
    'cost_budget_exhausted',
    'usage_unreported',
    'usage_invalid',
    'budget_exceeded',
  ],
};

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function localTarget(id, model) {
  return {
    id,
    provider: 'openai',
    model,
    capabilities: ['text'],
    settings: { base_url: 'http://127.0.0.1:11434/v1' },
    deployment: { locality: 'local', runtime: 'ollama', cost_basis: 'not_applicable' },
    publisher: { id: 'qwen', name: 'Qwen (Alibaba Cloud)' },
    weights: { availability: 'open', license: 'Apache-2.0' },
  };
}

function task(id, path, kind) {
  return {
    id,
    kind,
    source: {
      kind,
      path,
      artifact: { schema_version: '1', algorithm: 'sha256', digest: sha256(SOURCES[path]) },
    },
    required_capabilities: ['text'],
  };
}

/**
 * Write the two-target, two-task-kind experiment into `directory` and return the manifest paths.
 * `live.yaml` declares live mode with budgets and controls but is never approved by the checks.
 * @param {string} directory
 * @returns {{ fixture: string, live: string }}
 */
export function writeConsumerExperiment(directory) {
  mkdirSync(join(directory, 'tasks'), { recursive: true });
  for (const [relative, content] of Object.entries(SOURCES)) {
    writeFileSync(join(directory, relative), content);
  }
  const fixed = (digit) => ({ schema_version: '1', algorithm: 'sha256', digest: digit.repeat(64) });
  const manifest = {
    schema_version: '1',
    id: 'consumer-two-target-fixture',
    mode: 'fixture',
    identities: { schema_version: '1', workload: fixed('a'), rubric: fixed('b') },
    tasks: [
      task('pass', 'tasks/pass.yaml', 'scenario_evaluation'),
      task('workflow', 'tasks/workflow.yaml', 'agent_workflow'),
    ],
    targets: [localTarget('qwen-small', 'qwen3.5:4b'), localTarget('qwen-large', 'qwen3.5:9b')],
    repetitions: 1,
    concurrency: 1,
    exclusions: [],
    retry_policy: { max_attempts: 1, retry_on: [] },
    budgets: { max_requests: 100 },
  };
  const fixture = join(directory, 'experiment.yaml');
  const live = join(directory, 'live.yaml');
  // JSON is valid YAML; the SDK accepts either.
  writeFileSync(fixture, JSON.stringify(manifest, null, 2));
  writeFileSync(
    live,
    JSON.stringify(
      {
        ...manifest,
        mode: 'live',
        budgets: { max_requests: 20, max_tokens: 10_000 },
        live: LIVE_CONTROLS,
      },
      null,
      2
    )
  );
  return { fixture, live };
}

/** Make every HTTP or raw socket attempt fail loudly and count it. */
function forbidNetwork() {
  const attempts = { count: 0 };
  globalThis.fetch = () => {
    attempts.count += 1;
    throw new Error('NETWORK-FORBIDDEN');
  };
  net.Socket.prototype.connect = () => {
    attempts.count += 1;
    throw new Error('NETWORK-FORBIDDEN');
  };
  return attempts;
}

async function main(packExperiments) {
  const runtime = typeof Bun === 'undefined' ? 'node' : 'bun';
  const network = forbidNetwork();
  const sdk = await import('@artemiskit/sdk');
  const directory = resolve(`experiment-${runtime}`);
  assert.ok(!existsSync(directory), `Consumer experiment directory already exists: ${directory}`);
  const { fixture, live } = writeConsumerExperiment(directory);

  const validation = await sdk.validateExperimentFile(fixture);
  assert.equal(validation.valid, true, 'fixture experiment must validate');
  assert.equal(validation.exitCode, sdk.EXPERIMENT_EXIT_CODES.complete);
  assert.ok(
    validation.checks.some((check) => check.id === 'workflow' && check.code === 'source_verified'),
    'agent workflow source must be digest-verified and parsed'
  );

  const outputDir = join(directory, 'run');
  const outcome = await sdk.runExperimentFile({ experiment: fixture, outputDir });
  assert.equal(outcome.status, 'complete');
  assert.equal(outcome.exitCode, sdk.EXPERIMENT_EXIT_CODES.complete);
  const overall = outcome.result.summaries.overall;
  assert.deepEqual(
    { planned: overall.planned, valid: overall.valid, passed: overall.passed },
    { planned: 4, valid: 4, passed: 4 }
  );
  assert.deepEqual(outcome.result.results.map((item) => item.coordinate.task_kind).sort(), [
    'agent_workflow',
    'agent_workflow',
    'scenario_evaluation',
    'scenario_evaluation',
  ]);
  assert.equal(outcome.evidence.length, 4);
  assert.ok(existsSync(outcome.resultPath), 'result.json must be saved');

  // Report regeneration reads only the saved result and evidence.
  const reports = await sdk.reportExperimentResult({
    result: outcome.resultPath,
    outputDir: join(directory, 'report'),
  });
  assert.equal(reports.length, 6, 'three views in HTML and Markdown');
  for (const report of reports) {
    assert.ok(report.content.length > 0 && existsSync(report.path), report.view);
  }

  const refused = await sdk.runExperimentFile({
    experiment: live,
    outputDir: join(directory, 'live-run'),
  });
  assert.equal(refused.status, 'unauthorized');
  assert.equal(refused.exitCode, sdk.EXPERIMENT_EXIT_CODES.unauthorized);
  assert.equal(refused.result, undefined);
  assert.ok(!existsSync(join(directory, 'live-run', 'result.json')));

  for (const file of packExperiments) {
    const pack = await sdk.validateExperimentFile(resolve(file));
    assert.equal(pack.valid, true, `pack experiment must validate: ${file}`);
  }
  assert.equal(network.count, 0, 'fixture experiments must make no network attempt');

  console.log(
    JSON.stringify({
      runtime,
      experiment: fixture,
      overall: { planned: overall.planned, valid: overall.valid, passed: overall.passed },
      reports: reports.map((report) => `${report.view}.${report.format}`).sort(),
      packsValidated: packExperiments.length,
    })
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
