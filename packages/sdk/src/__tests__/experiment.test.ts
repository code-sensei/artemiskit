import { afterEach, describe, expect, mock, setDefaultTimeout, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExperimentRunResult, GenerateResult, ModelClient } from '@artemiskit/core';
import * as realCore from '../../../core/src/index';

// Bun shares module mocks across test files in one run, and earlier SDK test files stub
// `@artemiskit/core` (for example `runScenario` and `createAdapter`) without restoring them.
// These tests exercise the real experiment pipeline, so rebind the real implementations.
mock.module('@artemiskit/core', () => ({ ...realCore }));

import {
  EXPERIMENT_EXIT_CODES,
  ExperimentSurfaceError,
  LOCAL_ENDPOINT_PLACEHOLDER_API_KEY,
  LOOPBACK_REQUIRED_MESSAGE,
  createExperimentLiveAuthorization,
  formatExperimentRunSummary,
  reportExperimentResult,
  runExperimentFile,
  validateExperimentFile,
} from '../index';
import {
  FIXTURE_WORKFLOW,
  LIVE_CONTROLS,
  LOOPBACK_BASE_URL,
  sha256,
  writeExperimentFixture,
} from './experiment-fixtures';

// Tests here run up to a dozen real scenario attempts and exceeded the 5 s default with machine
// load ~31. This file-scoped timeout keeps them from failing on time alone.
setDefaultTimeout(30_000);

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Replace fetch with a recorder that refuses every request. */
function forbidNetwork(): { calls: number } {
  const counter = { calls: 0 };
  globalThis.fetch = (() => {
    counter.calls += 1;
    throw new Error('NETWORK-FORBIDDEN');
  }) as unknown as typeof fetch;
  return counter;
}

function liveOverrides(extra: Record<string, unknown> = {}) {
  return {
    mode: 'live',
    budgets: { max_requests: 20, max_tokens: 10_000 },
    live: LIVE_CONTROLS,
    ...extra,
  };
}

function inMemoryClient(text: string, calls: string[]): (target: { id: string }) => ModelClient {
  return (target) => ({
    provider: 'in-memory',
    capabilities: async () => ({
      streaming: false,
      functionCalling: false,
      toolUse: false,
      maxContext: 1000,
    }),
    generate: async (): Promise<GenerateResult> => {
      calls.push(target.id);
      return {
        id: 'in-memory',
        model: 'in-memory',
        text,
        tokens: { prompt: 3, completion: 2, total: 5 },
        usageAvailable: true,
        latencyMs: 1,
      };
    },
  });
}

describe('validateExperimentFile', () => {
  test('accepts a two-target local experiment and verifies every source and target', async () => {
    const fixture = await writeExperimentFixture();
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(true);
    expect(validation.exitCode).toBe(0);
    expect(validation.root).toBe(fixture.directory);
    expect(validation.experimentId).toBe('two-target-fixture');
    expect(validation.mode).toBe('fixture');
    expect(validation.checks.map((check) => [check.subject, check.id, check.code])).toEqual([
      ['manifest', undefined, 'manifest_valid'],
      ['task', 'pass', 'source_verified'],
      ['task', 'fail', 'source_verified'],
      ['target', 'qwen-small', 'loopback_verified'],
      ['target', 'qwen-large', 'loopback_verified'],
    ]);
  });

  test('reports a digest mismatch without echoing file contents', async () => {
    const fixture = await writeExperimentFixture({ digestOverride: { pass: 'f'.repeat(64) } });
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(false);
    expect(validation.exitCode).toBe(2);
    const check = validation.checks.find((item) => item.id === 'pass');
    expect(check?.status).toBe('error');
    expect(check?.code).toBe('source_digest_mismatch');
  });

  test('reports a missing task source', async () => {
    const fixture = await writeExperimentFixture({ omitSources: ['tasks/fail.yaml'] });
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.exitCode).toBe(2);
    expect(validation.checks.find((item) => item.id === 'fail')?.code).toBe('source_missing');
  });

  test('refuses cost-not-applicable targets off loopback and never echoes the URL', async () => {
    const fixture = await writeExperimentFixture({
      target: (target) =>
        target.id === 'qwen-small'
          ? { ...target, settings: { base_url: 'https://user:pw@models.example.com/v1' } }
          : { ...target, settings: {} },
    });
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(false);
    const targets = validation.checks.filter((check) => check.subject === 'target');
    expect(targets.map((check) => check.code)).toEqual([
      'cost_not_applicable_requires_loopback',
      'cost_not_applicable_requires_loopback',
    ]);
    for (const check of targets) expect(check.message).toContain(LOOPBACK_REQUIRED_MESSAGE);
    expect(JSON.stringify(validation.checks)).not.toContain('models.example.com');
  });

  test('rejects an unknown reasoning_effort target setting', async () => {
    const fixture = await writeExperimentFixture({
      target: (target) =>
        target.id === 'qwen-small'
          ? { ...target, settings: { ...target.settings, reasoning_effort: 'maximum' } }
          : target,
    });
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(false);
    expect(validation.checks.find((check) => check.id === 'qwen-small')?.code).toBe(
      'invalid_reasoning_effort'
    );
  });

  test('accepts in-range target generation settings and lists them', async () => {
    const fixture = await writeExperimentFixture({
      target: (target) =>
        target.id === 'qwen-large'
          ? {
              ...target,
              settings: {
                base_url: LOOPBACK_BASE_URL,
                reasoning_effort: 'medium',
                temperature: 1,
                top_p: 0.95,
                presence_penalty: 1.5,
                max_output_tokens: 32768,
              },
            }
          : target,
    });
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(true);
    expect(validation.checks.filter((check) => check.code === 'generation_settings')).toEqual([
      {
        subject: 'target',
        id: 'qwen-large',
        status: 'ok',
        code: 'generation_settings',
        message:
          'temperature 1, top_p 0.95, presence_penalty 1.5, max_output_tokens 32768 replace task values for this target',
      },
    ]);
  });

  test.each([
    [
      { temperature: 2.5 },
      'invalid_generation_setting',
      'settings.temperature must be a number from 0 to 2',
    ],
    [{ top_p: -0.1 }, 'invalid_generation_setting', 'settings.top_p must be a number from 0 to 1'],
    [{ top_k: 0 }, 'invalid_generation_setting', 'settings.top_k must be an integer of at least 1'],
    [{ min_p: 2 }, 'invalid_generation_setting', 'settings.min_p must be a number from 0 to 1'],
    [
      { presence_penalty: 3 },
      'invalid_generation_setting',
      'settings.presence_penalty must be a number from -2 to 2',
    ],
    [
      { max_output_tokens: 200000 },
      'invalid_generation_setting',
      'settings.max_output_tokens must be an integer from 1 to 131072',
    ],
    [
      { max_tokens: 4096 },
      'unknown_generation_setting',
      'settings.max_tokens is not supported; use max_output_tokens',
    ],
    [
      { num_predict: 512 },
      'unknown_generation_setting',
      'settings.num_predict is not supported; use max_output_tokens',
    ],
    [{ seed: 1 }, 'unknown_generation_setting', 'declare the experiment seed'],
    [
      { frequency_penalty: 0.5 },
      'unknown_generation_setting',
      'not a supported generation setting',
    ],
    [{ top_k: 20 }, 'generation_setting_unsupported', "Ollama's /v1 endpoint) have no top_k field"],
    [{ min_p: 0 }, 'generation_setting_unsupported', 'Modelfile PARAMETER min_p'],
  ])('rejects target settings %p with %s', async (extra, code, message) => {
    const fixture = await writeExperimentFixture({
      target: (target) =>
        target.id === 'qwen-small'
          ? { ...target, settings: { base_url: LOOPBACK_BASE_URL, ...extra } }
          : target,
    });
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(false);
    expect(validation.exitCode).toBe(2);
    const errors = validation.checks.filter((check) => check.status === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ subject: 'target', id: 'qwen-small', code });
    expect(errors[0].message).toContain(message);
  });

  test('rejects presence_penalty for a provider whose adapter does not send it', async () => {
    const fixture = await writeExperimentFixture({
      target: (target) =>
        target.id === 'qwen-small'
          ? {
              ...target,
              provider: 'anthropic',
              settings: { base_url: LOOPBACK_BASE_URL, presence_penalty: 1 },
            }
          : target,
    });
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(false);
    expect(validation.checks.find((check) => check.status === 'error')).toMatchObject({
      code: 'generation_setting_unsupported',
      message: 'settings.presence_penalty is not sent by the anthropic adapter; remove it',
    });
  });

  test('warns about a non-generation setting that is never sent', async () => {
    const fixture = await writeExperimentFixture({
      target: (target) =>
        target.id === 'qwen-small'
          ? { ...target, settings: { base_url: LOOPBACK_BASE_URL, quantization: 'q4_K_M' } }
          : target,
    });
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(true);
    expect(validation.checks.find((check) => check.status === 'warning')).toMatchObject({
      code: 'target_setting_unused',
      message: 'settings.quantization is recorded with the target but not sent to the model',
    });
  });

  test('distinguishes an unreadable file (1) from an invalid manifest (2)', async () => {
    const fixture = await writeExperimentFixture({ overrides: { concurrency: 9 } });
    const missing = await validateExperimentFile(path.join(fixture.directory, 'absent.yaml'));
    const invalid = await validateExperimentFile(fixture.file);

    expect(missing.exitCode).toBe(1);
    expect(missing.checks[0]?.code).toBe('file_unreadable');
    expect(invalid.exitCode).toBe(2);
    expect(invalid.checks.some((check) => check.message.startsWith('concurrency:'))).toBe(true);
  });
});

describe('runExperimentFile (fixture mode)', () => {
  test('runs a two-target experiment end to end with zero network calls', async () => {
    const network = forbidNetwork();
    const fixture = await writeExperimentFixture();
    const outputDir = path.join(fixture.directory, 'out');

    const outcome = await runExperimentFile({ experiment: fixture.file, outputDir });

    expect(network.calls).toBe(0);
    expect(outcome.status).toBe('complete');
    expect(outcome.exitCode).toBe(0);
    const result = outcome.result as ExperimentRunResult;
    expect(result.mode).toBe('fixture');
    expect(result.summaries.overall).toMatchObject({ planned: 4, valid: 4, passed: 2 });
    expect(result.summaries.overall.task_failed).toBe(2);

    const saved = JSON.parse(await readFile(path.join(outputDir, 'result.json'), 'utf8'));
    expect(saved).toEqual(JSON.parse(JSON.stringify(result)));
    expect(outcome.resultPath).toBe(path.join(outputDir, 'result.json'));

    expect(outcome.evidence).toHaveLength(4);
    for (const record of outcome.evidence) {
      const bytes = await readFile(record.path);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
      expect(path.basename(record.path)).toBe(`${record.sha256}.json`);
    }
    const attemptDigests = result.results.flatMap((coordinate) =>
      coordinate.attempts.map((attempt) =>
        attempt.evidence.availability === 'available' ? attempt.evidence.artifact.digest : null
      )
    );
    expect(attemptDigests.sort()).toEqual(outcome.evidence.map((item) => item.sha256).sort());
    expect((await stat(path.join(outputDir, 'result.json'))).mode & 0o777).toBe(0o600);
  });

  test('defaults the output directory under artemis-output/experiments/<id>/', async () => {
    forbidNetwork();
    const fixture = await writeExperimentFixture();
    const outcome = await runExperimentFile({ experiment: fixture.file, cwd: fixture.directory });

    const base = path.join(
      fixture.directory,
      'artemis-output',
      'experiments',
      'two-target-fixture'
    );
    expect(path.dirname(outcome.outputDir as string)).toBe(base);
    expect((await readdir(outcome.outputDir as string)).sort()).toEqual([
      'evidence',
      'result.json',
    ]);
  });

  test('refuses to run an invalid experiment and creates no output', async () => {
    const fixture = await writeExperimentFixture({ digestOverride: { fail: '0'.repeat(64) } });
    const outputDir = path.join(fixture.directory, 'out');
    const outcome = await runExperimentFile({ experiment: fixture.file, outputDir });

    expect(outcome.status).toBe('invalid');
    expect(outcome.exitCode).toBe(EXPERIMENT_EXIT_CODES.invalid);
    expect(outcome.result).toBeUndefined();
    await expect(stat(outputDir)).rejects.toThrow();
  });

  test('refuses to reuse a non-empty output directory', async () => {
    forbidNetwork();
    const fixture = await writeExperimentFixture();
    const error = await runExperimentFile({
      experiment: fixture.file,
      outputDir: fixture.directory,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ExperimentSurfaceError);
    expect(error.exitCode).toBe(1);
  });

  test('exit code 5 when declared exclusions leave coverage incomplete', async () => {
    forbidNetwork();
    const fixture = await writeExperimentFixture({
      overrides: {
        exclusions: [{ id: 'skip-large', reason: 'declared for test', target_id: 'qwen-large' }],
      },
    });
    const outcome = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'out'),
    });

    expect(outcome.status).toBe('coverageIncomplete');
    expect(outcome.exitCode).toBe(5);
    expect(outcome.result?.completion.valid_measurement_coverage_complete).toBe(false);
  });

  test('exit code 4 when the request budget stops execution early', async () => {
    forbidNetwork();
    const fixture = await writeExperimentFixture({ overrides: { budgets: { max_requests: 1 } } });
    const outcome = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'out'),
    });

    expect(outcome.status).toBe('stopped');
    expect(outcome.exitCode).toBe(4);
    expect(outcome.result?.stop_reason).toBe('request_budget_exhausted');
  });

  test('summary labels local targets and makes no ranking claim', async () => {
    forbidNetwork();
    const fixture = await writeExperimentFixture();
    const outcome = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'out'),
    });
    const summary = formatExperimentRunSummary(outcome.result as ExperimentRunResult);

    expect(summary).toContain('fixture mode');
    expect(summary).toContain('open-weight, run locally via ollama; cost not applicable');
    expect(summary).toContain('published by Qwen (Alibaba Cloud)');
    expect(summary).toContain('valid 2/2 planned; passed 1 and task-failed 1 of 2 valid');
    expect(summary).toContain('Stop reason: none');
    expect(summary).toContain('cost not applicable (local targets only)');
    expect(summary).toContain('No ranking or winner is implied');
    expect(summary.indexOf('qwen-small')).toBeLessThan(summary.indexOf('qwen-large'));
  });
});

/** A mixed fixture whose workflow task source is replaced by `content` (digest kept valid). */
async function writeWorkflowFixture(
  content: string,
  overrides: Record<string, unknown> = {}
): Promise<Awaited<ReturnType<typeof writeExperimentFixture>>> {
  const fixture = await writeExperimentFixture({ workflow: true, overrides });
  await writeFile(path.join(fixture.directory, 'tasks/workflow.yaml'), content);
  const tasks = fixture.manifest.tasks as Array<{ source: { artifact: { digest: string } } }>;
  tasks[1].source.artifact.digest = sha256(content);
  await writeFile(fixture.file, JSON.stringify(fixture.manifest, null, 2));
  return fixture;
}

describe('agent_workflow tasks', () => {
  test('validation parses a workflow source and routes nothing to the network', async () => {
    const network = forbidNetwork();
    const fixture = await writeExperimentFixture({ workflow: true });
    const validation = await validateExperimentFile(fixture.file);

    expect(network.calls).toBe(0);
    expect(validation.valid).toBe(true);
    expect(validation.checks).toContainEqual({
      subject: 'task',
      id: 'workflow',
      status: 'ok',
      code: 'source_verified',
      message:
        'tasks/workflow.yaml: digest verified; agent workflow parsed (simulated environment, network denied)',
    });
    expect(validation.checks.some((check) => check.status === 'warning')).toBe(false);
  });

  test('validation rejects an invalid workflow without echoing its content', async () => {
    const fixture = await writeWorkflowFixture(
      `${FIXTURE_WORKFLOW.replace('network: denied', 'network: allowed')}# secret-marker\n`
    );
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(false);
    expect(validation.exitCode).toBe(2);
    const check = validation.checks.find((item) => item.id === 'workflow');
    expect(check).toMatchObject({ status: 'error', code: 'workflow_invalid' });
    expect(JSON.stringify(validation.checks)).not.toContain('secret-marker');
  });

  test('validation warns about controls the workflow engine cannot honour', async () => {
    const semantic = FIXTURE_WORKFLOW.replace(
      'evidence:',
      `  semantic:
    - type: llm_judge
      rubric: Replies.
      mode: strict_assurance
evidence:`
    );
    const fixture = await writeWorkflowFixture(semantic, {
      seed: { value: 7, strategy: 'fixed', require_support: false },
    });
    const manifest = fixture.manifest as { targets: Array<Record<string, unknown>> };
    manifest.targets[0].settings = { base_url: LOOPBACK_BASE_URL, top_p: 0.8 };
    await writeFile(fixture.file, JSON.stringify(manifest, null, 2));
    const validation = await validateExperimentFile(fixture.file);

    expect(validation.valid).toBe(true);
    const warnings = validation.checks.filter((check) => check.status === 'warning');
    expect(warnings.map((check) => [check.code, check.id])).toEqual([
      ['semantic_judge_unavailable', 'workflow'],
      ['workflow_seed_unsupported', undefined],
      ['workflow_setting_unsupported', 'qwen-small'],
    ]);
  });

  test('runs one scenario and one workflow task on two targets with zero network calls', async () => {
    const network = forbidNetwork();
    const fixture = await writeExperimentFixture({ workflow: true });
    const outputDir = path.join(fixture.directory, 'out');

    const outcome = await runExperimentFile({ experiment: fixture.file, outputDir });

    expect(network.calls).toBe(0);
    expect(outcome.status).toBe('complete');
    expect(outcome.exitCode).toBe(0);
    const result = outcome.result as ExperimentRunResult;
    expect(result.summaries.overall).toMatchObject({ planned: 4, valid: 4, passed: 4 });
    const kinds = result.results.map((item) => [
      item.coordinate.task_kind,
      item.coordinate.target_id,
      item.status,
    ]);
    expect(kinds).toEqual([
      ['scenario_evaluation', 'qwen-small', 'passed'],
      ['scenario_evaluation', 'qwen-large', 'passed'],
      ['agent_workflow', 'qwen-small', 'passed'],
      ['agent_workflow', 'qwen-large', 'passed'],
    ]);

    expect(outcome.evidence).toHaveLength(4);
    for (const coordinate of result.results) {
      const [attempt] = coordinate.attempts;
      expect(attempt.evidence).toMatchObject({
        kind: coordinate.coordinate.task_kind,
        availability: 'available',
      });
      const digest = attempt.evidence.availability === 'available' && attempt.evidence.artifact;
      const file = outcome.evidence.find(
        (item) => item.coordinate_id === coordinate.coordinate.coordinate_id
      );
      expect(file?.sha256).toBe((digest as { digest: string }).digest);
      const bytes = await readFile(file?.path as string);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file?.sha256 as string);
      const saved = JSON.parse(bytes.toString('utf8'));
      if (coordinate.coordinate.task_kind === 'agent_workflow') {
        expect(saved).toMatchObject({
          engine: 'native',
          execution: 'completed',
          policy: 'passed',
          taskVerification: 'passed',
          environment: 'simulated',
        });
        expect(saved.configuration.model.display).toBe(
          coordinate.coordinate.target_id === 'qwen-small' ? 'qwen3.5:4b' : 'qwen3.5:9b'
        );
        expect(bytes.toString('utf8')).not.toContain('Fixture brief');
      }
    }
  });

  test('a workflow task whose state fixture is missing is recorded invalid, not run', async () => {
    forbidNetwork();
    const declaredState = '  initial_state:\n    documents:\n      brief: Fixture brief.\n';
    expect(FIXTURE_WORKFLOW).toContain(declaredState);
    const fixture = await writeWorkflowFixture(
      FIXTURE_WORKFLOW.replace(declaredState, '  initial_state: missing/state.json\n')
    );
    const outcome = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'out'),
    });
    const result = outcome.result as ExperimentRunResult;
    const workflow = result.results.filter(
      (item) => item.coordinate.task_kind === 'agent_workflow'
    );
    expect(workflow.map((item) => item.status)).toEqual(['invalid', 'invalid']);
    expect(workflow[0].attempts[0]).toMatchObject({
      error_code: 'workflow_fixture_invalid',
      usage: { requests: 0, tokens: 0 },
    });
    expect(outcome.evidence).toHaveLength(2);
  });
});

describe('runExperimentFile (live mode)', () => {
  test('refuses without approval before creating any client', async () => {
    const calls: string[] = [];
    let created = 0;
    const fixture = await writeExperimentFixture({ overrides: liveOverrides() });
    const outputDir = path.join(fixture.directory, 'out');
    const outcome = await runExperimentFile({
      experiment: fixture.file,
      outputDir,
      createClient: (target) => {
        created += 1;
        return inMemoryClient('x', calls)(target);
      },
    });

    expect(outcome.status).toBe('unauthorized');
    expect(outcome.exitCode).toBe(3);
    expect(created).toBe(0);
    expect(calls).toEqual([]);
    await expect(stat(outputDir)).rejects.toThrow();
  });

  test('refuses a malformed approval object', async () => {
    const fixture = await writeExperimentFixture({ overrides: liveOverrides() });
    const outcome = await runExperimentFile({
      experiment: fixture.file,
      liveAuthorization: {
        approved: true,
        decision_id: 'Not Valid',
        decided_at: 'yesterday',
        approved_by: '',
        reason: '',
      },
      createClient: () => {
        throw new Error('must not be called');
      },
    });

    expect(outcome.exitCode).toBe(3);
  });

  test('runs with approval and records the authorization in the result', async () => {
    const calls: string[] = [];
    const fixture = await writeExperimentFixture({ overrides: liveOverrides() });
    const authorization = createExperimentLiveAuthorization({
      approvedBy: 'test-operator',
      reason: 'in-memory clients only',
    });
    const outcome = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'out'),
      liveAuthorization: authorization,
      createClient: inMemoryClient('Fixture response, Abuja', calls),
    });

    expect(outcome.exitCode).toBe(0);
    expect(calls).toEqual(['qwen-small', 'qwen-large', 'qwen-small', 'qwen-large']);
    expect(outcome.result?.live_authorization).toEqual(authorization);
    expect(outcome.result?.summaries.overall.passed).toBe(4);
  });

  test('binds loopback targets with a placeholder key, never the ambient OpenAI key', async () => {
    const seen: { authorization: string | null; model: string }[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as { model: string };
        seen.push({ authorization: request.headers.get('authorization'), model: body.model });
        return Response.json({
          id: 'local',
          object: 'chat.completion',
          created: 0,
          model: body.model,
          choices: [
            { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Abuja' } },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        });
      },
    });
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-ambient-must-not-leak';
    try {
      const baseUrl = `http://127.0.0.1:${server.port}/v1`;
      const fixture = await writeExperimentFixture({
        overrides: liveOverrides(),
        target: (target) => ({ ...target, settings: { base_url: baseUrl } }),
      });
      const outcome = await runExperimentFile({
        experiment: fixture.file,
        outputDir: path.join(fixture.directory, 'out'),
        liveAuthorization: createExperimentLiveAuthorization({
          approvedBy: 'test-operator',
          reason: 'loopback stub server only',
        }),
      });

      expect(outcome.exitCode).toBe(0);
      expect(seen).toHaveLength(4);
      for (const request of seen) {
        expect(request.authorization).toBe(`Bearer ${LOCAL_ENDPOINT_PLACEHOLDER_API_KEY}`);
      }
      expect(seen.map((request) => request.model).sort()).toEqual([
        'qwen3.5:4b',
        'qwen3.5:4b',
        'qwen3.5:9b',
        'qwen3.5:9b',
      ]);
    } finally {
      if (previousKey === undefined) Reflect.deleteProperty(process.env, 'OPENAI_API_KEY');
      else process.env.OPENAI_API_KEY = previousKey;
      server.stop(true);
    }
  });
  test('raises the adapter HTTP timeout to the per-case timeout for slow loopback targets', async () => {
    // The stub answers after STUB_DELAY_MS; the resolver stands in for an adapter transport
    // default shorter than that, as the OpenAI adapter's 60 s default is for local thinking runs.
    const STUB_DELAY_MS = 600;
    const SHORT_TRANSPORT_TIMEOUT_MS = 150;
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as { model: string };
        await Bun.sleep(STUB_DELAY_MS);
        return Response.json({
          id: 'slow-local',
          object: 'chat.completion',
          created: 0,
          model: body.model,
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: 'Fixture response, Abuja' },
            },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
        });
      },
    });
    try {
      const baseUrl = `http://127.0.0.1:${server.port}/v1`;
      const run = async (timeoutMs: number | undefined) => {
        const fixture = await writeExperimentFixture({
          overrides: liveOverrides(),
          target: (target) => ({ ...target, settings: { base_url: baseUrl } }),
        });
        return runExperimentFile({
          experiment: fixture.file,
          outputDir: path.join(fixture.directory, 'out'),
          liveAuthorization: createExperimentLiveAuthorization({
            approvedBy: 'test-operator',
            reason: 'loopback stub server only',
          }),
          resolveTargetConfig: () => ({ timeout: SHORT_TRANSPORT_TIMEOUT_MS }),
          timeoutMs,
        });
      };

      const withPerCaseTimeout = await run(10_000);
      expect(withPerCaseTimeout.exitCode).toBe(0);
      expect(withPerCaseTimeout.result?.stop_reason).toBeUndefined();
      expect(withPerCaseTimeout.result?.summaries.overall.passed).toBe(4);

      // Control: without a per-case timeout the transport default stands and aborts the request.
      const withoutPerCaseTimeout = await run(undefined);
      expect(withoutPerCaseTimeout.result?.stop_reason).toBe('usage_unreported');
      expect(withoutPerCaseTimeout.result?.summaries.overall.passed).toBe(0);
    } finally {
      server.stop(true);
    }
  });

  test('saves the declared reasoning_effort in the evidence of each attempt that sent it', async () => {
    const sent: unknown[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as { model: string; reasoning_effort?: string };
        sent.push(body.reasoning_effort);
        return Response.json({
          id: 'local',
          object: 'chat.completion',
          created: 0,
          model: body.model,
          choices: [
            { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Abuja' } },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        });
      },
    });
    try {
      const baseUrl = `http://127.0.0.1:${server.port}/v1`;
      const fixture = await writeExperimentFixture({
        overrides: liveOverrides(),
        target: (target) => ({
          ...target,
          settings: { base_url: baseUrl, reasoning_effort: 'none' },
        }),
      });
      const outcome = await runExperimentFile({
        experiment: fixture.file,
        outputDir: path.join(fixture.directory, 'out'),
        liveAuthorization: createExperimentLiveAuthorization({
          approvedBy: 'test-operator',
          reason: 'loopback stub server only',
        }),
      });

      expect(outcome.exitCode).toBe(0);
      expect(sent).toEqual(['none', 'none', 'none', 'none']);
      expect(outcome.evidence).toHaveLength(4);
      for (const file of outcome.evidence) {
        const saved = JSON.parse(await readFile(file.path, 'utf8'));
        expect(saved.resolved_config.reasoning_effort).toBe('none');
      }
    } finally {
      server.stop(true);
    }
  });

  test('sends each target generation settings and repetition seed, and saves them as evidence', async () => {
    const bodies: Record<string, unknown>[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        return Response.json({
          id: 'local',
          object: 'chat.completion',
          created: 0,
          model: body.model,
          choices: [
            { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Abuja' } },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
        });
      },
    });
    try {
      const baseUrl = `http://127.0.0.1:${server.port}/v1`;
      const thinking = {
        reasoning_effort: 'medium',
        temperature: 1,
        top_p: 0.95,
        presence_penalty: 1.5,
        max_output_tokens: 32768,
      };
      const fixture = await writeExperimentFixture({
        overrides: liveOverrides({
          repetitions: 3,
          seed: { value: 40, strategy: 'increment_by_repetition', require_support: false },
        }),
        target: (target) => ({
          ...target,
          settings:
            target.id === 'qwen-large'
              ? { base_url: baseUrl, ...thinking }
              : { base_url: baseUrl, reasoning_effort: 'none' },
        }),
      });
      const outcome = await runExperimentFile({
        experiment: fixture.file,
        outputDir: path.join(fixture.directory, 'out'),
        liveAuthorization: createExperimentLiveAuthorization({
          approvedBy: 'test-operator',
          reason: 'loopback stub server only',
        }),
      });

      expect(outcome.status).not.toBe('invalid');
      expect(bodies).toHaveLength(12);
      const sampling = (body: Record<string, unknown>) => ({
        temperature: body.temperature,
        top_p: body.top_p,
        top_k: body.top_k,
        min_p: body.min_p,
        presence_penalty: body.presence_penalty,
        max_tokens: body.max_tokens,
        reasoning_effort: body.reasoning_effort,
      });
      const large = bodies.filter((body) => body.model === 'qwen3.5:9b');
      const small = bodies.filter((body) => body.model === 'qwen3.5:4b');
      for (const body of large) {
        expect(sampling(body)).toEqual({
          temperature: 1,
          top_p: 0.95,
          top_k: undefined,
          min_p: undefined,
          presence_penalty: 1.5,
          max_tokens: 32768,
          reasoning_effort: 'medium',
        });
      }
      // The fixture tasks declare no temperature or max tokens, so nothing else is sent.
      for (const body of small) {
        expect(sampling(body)).toEqual({
          temperature: undefined,
          top_p: undefined,
          top_k: undefined,
          min_p: undefined,
          presence_penalty: undefined,
          max_tokens: undefined,
          reasoning_effort: 'none',
        });
      }
      for (const group of [large, small]) {
        expect(group.map((body) => body.seed).sort()).toEqual([40, 40, 41, 41, 42, 42]);
      }

      expect(outcome.evidence).toHaveLength(12);
      for (const file of outcome.evidence) {
        const saved = JSON.parse(await readFile(file.path, 'utf8'));
        const repetition = saved.attempt_evidence.repetition.index;
        if (saved.config.model === 'qwen3.5:9b') {
          expect(saved.resolved_config).toMatchObject({
            temperature: 1,
            top_p: 0.95,
            presence_penalty: 1.5,
            max_tokens: 32768,
            seed: 39 + repetition,
            reasoning_effort: 'medium',
          });
        } else {
          expect(saved.resolved_config).toEqual({
            provider: 'openai',
            model: 'qwen3.5:4b',
            seed: 39 + repetition,
            reasoning_effort: 'none',
            source: {},
          });
        }
      }
    } finally {
      server.stop(true);
    }
  });

  test('awaits an async target config resolver for non-loopback live targets', async () => {
    const resolved: string[] = [];
    const fixture = await writeExperimentFixture({
      overrides: liveOverrides({
        budgets: { max_requests: 20, max_tokens: 10_000, max_cost: { amount: 1, currency: 'USD' } },
      }),
      target: (target) => ({
        ...target,
        settings: { base_url: 'https://models.example.com/v1' },
        deployment: { locality: 'remote', cost_basis: 'metered' },
        weights: undefined,
      }),
    });
    const outcome = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'out'),
      liveAuthorization: createExperimentLiveAuthorization({
        approvedBy: 'test-operator',
        reason: 'resolver failure path only',
      }),
      resolveTargetConfig: async (target) => {
        resolved.push(target.id);
        throw new Error('no transport configured');
      },
    });

    expect(resolved[0]).toBe('qwen-small');
    // The client is unavailable, so the metered attempt reports neither usage nor cost.
    expect(outcome.result?.stop_reason).toBe('usage_unreported');
    expect(outcome.exitCode).toBe(EXPERIMENT_EXIT_CODES.stopped);
  });
});

describe('runExperimentFile (concurrent live mode)', () => {
  const concurrentLive = () =>
    writeExperimentFixture({
      overrides: liveOverrides({
        concurrency: 2,
        live: { ...LIVE_CONTROLS, concurrency_ceiling: 2 },
      }),
      target: (target) => ({
        ...target,
        settings: { ...(target.settings as object), max_output_tokens: 16 },
      }),
    });

  test('refuses unless the approval names the declared concurrency', async () => {
    const fixture = await concurrentLive();
    for (const maxConcurrency of [undefined, 1]) {
      let created = 0;
      const outcome = await runExperimentFile({
        experiment: fixture.file,
        outputDir: path.join(fixture.directory, `out-${maxConcurrency}`),
        liveAuthorization: createExperimentLiveAuthorization({
          approvedBy: 'test-operator',
          reason: 'in-memory clients only',
          maxConcurrency,
        }),
        createClient: () => {
          created += 1;
          throw new Error('must not be called');
        },
      });
      expect(outcome.status).toBe('unauthorized');
      expect(outcome.exitCode).toBe(3);
      expect(outcome.message).toContain('--max-concurrency 2');
      expect(created).toBe(0);
    }
  });

  test('runs with an approved concurrency, records it and lists evidence in matrix order', async () => {
    const fixture = await concurrentLive();
    const calls: string[] = [];
    const base = inMemoryClient('Fixture response, Abuja', calls);
    const authorization = createExperimentLiveAuthorization({
      approvedBy: 'test-operator',
      reason: 'in-memory clients only',
      maxConcurrency: 2,
    });
    const outcome = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'out'),
      liveAuthorization: authorization,
      createClient: (target) => {
        const client = base(target);
        return {
          ...client,
          generate: async (options) => {
            // The first target answers slowly, so attempts finish out of matrix order.
            await new Promise((resolve) =>
              setTimeout(resolve, target.id === 'qwen-small' ? 15 : 1)
            );
            return client.generate(options);
          },
        };
      },
    });

    expect(outcome.exitCode).toBe(0);
    const result = outcome.result as ExperimentRunResult;
    expect(result.live_authorization).toEqual(authorization);
    expect(result.live_authorization?.approved_concurrency).toBe(2);
    expect(result.execution?.peak_in_flight).toBe(2);
    expect(calls[0]).toBe('qwen-large');
    expect(outcome.evidence.map((item) => item.coordinate_id)).toEqual(
      result.results.map((item) => item.coordinate.coordinate_id)
    );
    const summary = formatExperimentRunSummary(result);
    expect(summary).toContain(
      'Concurrency: up to 2 coordinates in flight (declared limit); recorded peak 2'
    );
  });
});

describe('createExperimentLiveAuthorization', () => {
  test('builds a bounded decision record', () => {
    const authorization = createExperimentLiveAuthorization({
      approvedBy: ' operator ',
      reason: ' local run ',
      decidedAt: new Date('2026-11-19T10:00:00Z'),
    });
    expect(authorization).toMatchObject({
      approved: true,
      approved_by: 'operator',
      reason: 'local run',
      decided_at: '2026-11-19T10:00:00.000Z',
    });
    expect(authorization.decision_id).toMatch(/^live-20261119100000-[a-f0-9]{8}$/);
  });

  test('records an approved concurrency from 1 to 8', () => {
    expect(
      createExperimentLiveAuthorization({ approvedBy: 'x', reason: 'y', maxConcurrency: 4 })
    ).toMatchObject({ approved_concurrency: 4 });
    expect(
      'approved_concurrency' in createExperimentLiveAuthorization({ approvedBy: 'x', reason: 'y' })
    ).toBe(false);
  });

  test('rejects a missing approver or reason with exit code 3', () => {
    for (const options of [
      { approvedBy: '', reason: 'x' },
      { approvedBy: 'x', reason: '  ' },
      { approvedBy: 'x', reason: 'y', decisionId: 'UPPER' },
      { approvedBy: 'x', reason: 'y', maxConcurrency: 0 },
      { approvedBy: 'x', reason: 'y', maxConcurrency: 9 },
      { approvedBy: 'x', reason: 'y', maxConcurrency: 1.5 },
    ]) {
      const error = (() => {
        try {
          createExperimentLiveAuthorization(options);
        } catch (caught) {
          return caught as ExperimentSurfaceError;
        }
      })();
      expect(error?.exitCode).toBe(3);
    }
  });
});

describe('reportExperimentResult', () => {
  test('regenerates all views and formats offline from a saved result', async () => {
    forbidNetwork();
    const fixture = await writeExperimentFixture();
    const run = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'out'),
    });
    const network = forbidNetwork();
    const reportDir = path.join(fixture.directory, 'reports');

    const reports = await reportExperimentResult({
      result: run.resultPath as string,
      outputDir: reportDir,
    });

    expect(network.calls).toBe(0);
    expect(reports.map((report) => `${report.view}.${report.format}`)).toEqual([
      'technical.html',
      'technical.markdown',
      'executive.html',
      'executive.markdown',
      'comprehensive.html',
      'comprehensive.markdown',
    ]);
    expect((await readdir(reportDir)).sort()).toEqual([
      'comprehensive.html',
      'comprehensive.md',
      'executive.html',
      'executive.md',
      'technical.html',
      'technical.md',
    ]);
    for (const report of reports) {
      expect(await readFile(report.path as string, 'utf8')).toBe(report.content);
    }
  });

  test('selects views and formats', async () => {
    forbidNetwork();
    const fixture = await writeExperimentFixture();
    const run = await runExperimentFile({
      experiment: fixture.file,
      outputDir: path.join(fixture.directory, 'out'),
    });
    const reports = await reportExperimentResult({
      result: run.result as ExperimentRunResult,
      views: ['executive'],
      formats: ['markdown'],
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]?.path).toBeUndefined();
    expect(reports[0]?.content.startsWith('#')).toBe(true);
  });

  test('maps unreadable input to exit code 1 and invalid input to exit code 2', async () => {
    const fixture = await writeExperimentFixture();
    const missing = await reportExperimentResult({
      result: path.join(fixture.directory, 'missing.json'),
    }).catch((error) => error);
    const invalid = await reportExperimentResult({ result: fixture.file }).catch((error) => error);

    expect(missing).toBeInstanceOf(ExperimentSurfaceError);
    expect(missing.exitCode).toBe(1);
    expect(invalid).toBeInstanceOf(ExperimentSurfaceError);
    expect(invalid.exitCode).toBe(2);
  });
});
