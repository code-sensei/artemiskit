import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
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
import { LIVE_CONTROLS, writeExperimentFixture } from './experiment-fixtures';

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

  test('distinguishes an unreadable file (1) from an invalid manifest (2)', async () => {
    const fixture = await writeExperimentFixture({ overrides: { concurrency: 4 } });
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

  test('rejects a missing approver or reason with exit code 3', () => {
    for (const options of [
      { approvedBy: '', reason: 'x' },
      { approvedBy: 'x', reason: '  ' },
      { approvedBy: 'x', reason: 'y', decisionId: 'UPPER' },
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
