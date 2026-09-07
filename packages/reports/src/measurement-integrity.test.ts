import { describe, expect, test } from 'bun:test';
import type { RunManifest } from '@artemiskit/core';
import { generateHTMLReport } from './html/generator';
import { generateJUnitReport } from './junit/generator';
import { generateMarkdownReport } from './markdown/generator';

const manifest: RunManifest = {
  version: '1.1',
  run_id: 'integrity-run',
  project: 'assurance',
  start_time: '2026-09-07T00:00:00.000Z',
  end_time: '2026-09-07T00:00:01.000Z',
  duration_ms: 1000,
  config: { scenario: 'mixed measurement outcomes', provider: 'fixture' },
  git: { commit: null, branch: null, dirty: false },
  environment: { os: 'test', arch: 'test', node_version: 'test' },
  provenance: { run_by: 'test', run_reason: 'release validation' },
  metrics: {
    success_rate: 0.5,
    total_attempts: 5,
    total_cases: 4,
    valid_evaluations: 2,
    invalid_evaluations: 2,
    outcome_rate_denominator: 2,
    passed_cases: 1,
    failed_cases: 1,
    median_latency_ms: 1,
    p95_latency_ms: 1,
    total_tokens: 4,
    total_prompt_tokens: 2,
    total_completion_tokens: 2,
  },
  cases: [
    {
      id: 'passed',
      ok: true,
      status: 'passed',
      score: 1,
      matcherType: 'contains',
      latencyMs: 1,
      tokens: { prompt: 1, completion: 1, total: 2 },
      prompt: 'prompt',
      response: 'response',
      expected: { type: 'contains', values: ['response'], mode: 'any' },
      tags: [],
    },
    {
      id: 'failed',
      ok: false,
      status: 'failed',
      score: 0,
      matcherType: 'contains',
      latencyMs: 1,
      tokens: { prompt: 1, completion: 1, total: 2 },
      prompt: 'prompt',
      response: 'response',
      expected: { type: 'contains', values: ['missing'], mode: 'any' },
      tags: [],
      reason: 'criterion failed',
    },
    {
      id: 'invalid',
      ok: false,
      status: 'invalid',
      score: 0,
      matcherType: 'llm_grader',
      latencyMs: 1,
      tokens: { prompt: 0, completion: 0, total: 0 },
      prompt: 'prompt',
      response: 'response',
      expected: { type: 'llm_grader', rubric: 'grade', threshold: 0.7, strict: true },
      tags: [],
      reason: 'Grader failed: malformed output',
      evidence: {
        evaluator: 'llm_grader',
        validation: { status: 'invalid', code: 'grader_failure' },
      },
    },
    {
      id: 'error',
      ok: false,
      status: 'error',
      score: 0,
      matcherType: 'contains',
      latencyMs: 1,
      tokens: { prompt: 0, completion: 0, total: 0 },
      prompt: 'prompt',
      response: '',
      expected: { type: 'contains', values: ['response'], mode: 'any' },
      tags: [],
      reason: 'provider unavailable',
      error: 'provider unavailable',
    },
  ],
};

describe('measurement-integrity reports', () => {
  test('keeps failed outcomes distinct from invalid and error measurements in Markdown and HTML', () => {
    const markdown = generateMarkdownReport(manifest, { includeDetails: false });
    const html = generateHTMLReport(manifest);

    expect(markdown).toContain('| Valid Evaluations | 2 |');
    expect(markdown).toContain('| Invalid or Incomplete | 2 |');
    expect(markdown).toContain('| Outcome Rate Denominator | 2 |');
    expect(markdown).toContain('### Failed (1)');
    expect(markdown).toContain('### Invalid or Incomplete (2)');
    expect(html).toContain('Invalid / Incomplete');
    expect(html).toContain('data-status="invalid"');
    expect(html).toContain('data-status="error"');
  });

  test('writes invalid and error measurements as JUnit errors, not outcome failures', () => {
    const junit = generateJUnitReport(manifest, {
      includeSystemOut: false,
      includeSystemErr: false,
    });

    expect(junit).toContain('tests="4" failures="1" errors="2"');
    expect(junit).toContain('artemis.outcome_rate_denominator" value="2"');
    expect(junit).toContain('<failure message="criterion failed" type="contains">');
    expect(junit).toContain('<error message="Grader failed: malformed output" type="invalid">');
    expect(junit).toContain('<error message="provider unavailable" type="error">');
  });
});
