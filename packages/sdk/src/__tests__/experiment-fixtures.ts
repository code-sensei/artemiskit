/**
 * Test helper: write a self-contained two-target experiment directory.
 * Shared by the SDK and CLI experiment tests.
 */

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Passes against the fixture client, whose responses start with "Fixture response". */
export const PASSING_SCENARIO = `name: fixture-pass
cases:
  - id: echo
    prompt: "Reply with anything."
    expected:
      type: contains
      values: ["Fixture response"]
`;

/** A valid measurement that fails against the fixture client. */
export const FAILING_SCENARIO = `name: fixture-fail
cases:
  - id: capital
    prompt: "What is the capital of Nigeria?"
    expected:
      type: contains
      values: ["Abuja"]
`;

/**
 * Agent workflow that passes against the fixture client, which accepts tools but never calls
 * one: the target must answer without reading the brief and without any undeclared tool.
 */
export const FIXTURE_WORKFLOW = `version: '1'
kind: agent_workflow
name: fixture-workflow
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

export const LOOPBACK_BASE_URL = 'http://127.0.0.1:11434/v1';

export interface ExperimentFixtureOptions {
  /** Override manifest fields after the defaults are built. */
  overrides?: Record<string, unknown>;
  /** Replace a task's declared digest. */
  digestOverride?: Record<string, string>;
  /** Skip writing these source files. */
  omitSources?: string[];
  /** Target transforms applied to both default targets. */
  target?: (target: Record<string, unknown>) => Record<string, unknown>;
  /** Manifest file name (default `experiment.yaml`; the content is JSON, which YAML accepts). */
  fileName?: string;
  /**
   * Declare one scenario task (`pass`) and one agent workflow task (`workflow`) instead of the
   * two scenario tasks.
   */
  workflow?: boolean;
}

export interface ExperimentFixture {
  directory: string;
  file: string;
  manifest: Record<string, unknown>;
}

const SOURCES: Record<string, string> = {
  'tasks/pass.yaml': PASSING_SCENARIO,
  'tasks/fail.yaml': FAILING_SCENARIO,
  'tasks/workflow.yaml': FIXTURE_WORKFLOW,
};

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function localTarget(id: string, model: string): Record<string, unknown> {
  return {
    id,
    provider: 'openai',
    model,
    capabilities: ['text'],
    settings: { base_url: LOOPBACK_BASE_URL },
    deployment: { locality: 'local', runtime: 'ollama', cost_basis: 'not_applicable' },
    publisher: { id: 'qwen', name: 'Qwen (Alibaba Cloud)' },
    weights: { availability: 'open', license: 'Apache-2.0' },
  };
}

/** Live controls every live manifest must declare. */
export const LIVE_CONTROLS = {
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

export async function writeExperimentFixture(
  options: ExperimentFixtureOptions = {}
): Promise<ExperimentFixture> {
  const directory = await mkdtemp(path.join(tmpdir(), 'akit-experiment-'));
  await mkdir(path.join(directory, 'tasks'), { recursive: true });
  for (const [relative, content] of Object.entries(SOURCES)) {
    if (!options.omitSources?.includes(relative)) {
      await writeFile(path.join(directory, relative), content);
    }
  }
  const task = (id: string, sourcePath: string, kind = 'scenario_evaluation') => ({
    id,
    kind,
    source: {
      kind,
      path: sourcePath,
      artifact: {
        schema_version: '1',
        algorithm: 'sha256',
        digest: options.digestOverride?.[id] ?? sha256(SOURCES[sourcePath]),
      },
    },
    required_capabilities: ['text'],
  });
  const transform = options.target ?? ((target) => target);
  const fixed = (digit: string) => ({
    schema_version: '1',
    algorithm: 'sha256',
    digest: digit.repeat(64),
  });
  const manifest: Record<string, unknown> = {
    schema_version: '1',
    id: 'two-target-fixture',
    mode: 'fixture',
    identities: { schema_version: '1', workload: fixed('a'), rubric: fixed('b') },
    tasks: [
      task('pass', 'tasks/pass.yaml'),
      options.workflow
        ? task('workflow', 'tasks/workflow.yaml', 'agent_workflow')
        : task('fail', 'tasks/fail.yaml'),
    ],
    targets: [
      transform(localTarget('qwen-small', 'qwen3.5:4b')),
      transform(localTarget('qwen-large', 'qwen3.5:9b')),
    ],
    repetitions: 1,
    concurrency: 1,
    exclusions: [],
    retry_policy: { max_attempts: 1, retry_on: [] },
    budgets: { max_requests: 100 },
    ...options.overrides,
  };
  const file = path.join(directory, options.fileName ?? 'experiment.yaml');
  await writeFile(file, JSON.stringify(manifest, null, 2));
  return { directory, file, manifest };
}
