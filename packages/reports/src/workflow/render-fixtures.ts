import type { WorkflowReport } from './types';

/** Synthetic renderer test data, never an assessment of a real model or saved run. */
export function rendererFixture(): WorkflowReport {
  return {
    schemaVersion: '1',
    reportId: 'synthetic-renderer-fixture',
    title: 'Synthetic workflow assessment — renderer test data',
    scope: [
      'Three saved records from two logical runs; test data only.',
      'External services and live model behavior were not evaluated.',
    ],
    methodology: [
      'Canonical saved evidence; no new model calls.',
      'Eligible task outcomes are counted once per logical run.',
    ],
    summary: {
      records: 3,
      logicalRuns: 2,
      eligible: 2,
      passed: 1,
      failed: 1,
      invalid: 0,
      unavailable: 0,
      preflight: 0,
      historical: 0,
      duplicateRecords: 0,
      supersededAttempts: 1,
      taskSuccessRate: 0.5,
    },
    findings: [
      {
        id: 'f-strength',
        level: 'strength',
        title: 'Recovered task completed',
        detail: 'The saved task outcome passed after one bounded retry.',
        recommendation: 'Retain the declared retry limit and inspect linked recovery evidence.',
        evidenceIds: ['e-recovery'],
      },
      {
        id: 'f-risk',
        level: 'risk',
        title: 'Required artifact missing',
        detail: 'A runtime completion did not satisfy the artifact assertion.',
        recommendation: 'Correct the artifact-producing step and rerun the assertion.',
        evidenceIds: ['e-artifact'],
      },
      {
        id: 'f-limit',
        level: 'limitation',
        title: 'Cost unavailable',
        detail: 'Saved usage does not include authoritative pricing.',
        recommendation: 'Keep target and judge usage separate; do not infer monetary cost.',
        evidenceIds: ['e-usage'],
      },
      {
        id: 'f-info',
        level: 'information',
        title: 'Offline saved evidence',
        detail: 'This is a deterministic projection of synthetic test facts.',
        recommendation: 'Read the scope before interpreting the outcome.',
        evidenceIds: [],
      },
    ],
    sections: [
      {
        id: 'runs',
        title: 'Run outcomes',
        description: 'Runtime and task outcomes are independent.',
        columns: ['Run', 'Runtime', 'Task', 'Measurement'],
        rows: [
          {
            id: 'r-one',
            cells: ['synthetic-run-1', 'completed', 'passed', 'valid'],
            evidenceIds: ['e-recovery'],
          },
          {
            id: 'r-two',
            cells: ['synthetic-run-2', 'completed', 'failed', 'valid'],
            evidenceIds: ['e-artifact'],
          },
        ],
      },
      {
        id: 'usage',
        title: 'Usage and cost',
        description: 'Unavailable does not mean zero.',
        columns: ['Role', 'Tokens', 'Cost'],
        rows: [
          { id: 'r-target', cells: ['Target', '120', 'Unavailable'], evidenceIds: ['e-usage'] },
          {
            id: 'r-judge',
            cells: ['Judge', 'Unavailable', 'Unavailable'],
            evidenceIds: ['e-usage'],
          },
        ],
      },
      {
        id: 'recovery',
        title: 'Recovery',
        description: 'No claim of external-system exactly-once effects.',
        columns: ['Run', 'Retries', 'State'],
        rows: [
          {
            id: 'r-recovery',
            cells: ['synthetic-run-1', '1', 'completed'],
            evidenceIds: ['e-recovery'],
          },
        ],
      },
    ],
    evidence: [
      {
        id: 'e-recovery',
        recordId: 'synthetic-record-1',
        path: '/recovery',
        sha256: 'a'.repeat(64),
        description: 'Bounded retry metadata and saved task outcome.',
      },
      {
        id: 'e-artifact',
        recordId: 'synthetic-record-2',
        path: '/outcomes/assertions/0',
        sha256: 'b'.repeat(64),
        description: 'Failed artifact assertion.',
      },
      {
        id: 'e-usage',
        recordId: 'synthetic-record-1',
        path: '/usage',
        sha256: 'c'.repeat(64),
        description: 'Target usage and unavailable judge/cost attribution.',
      },
    ],
    limitations: [
      'Synthetic test data; no inference about real target quality.',
      'Evidence digests identify content, not authorship or certification.',
      'Two eligible tasks are not evidence of broad deployment readiness.',
    ],
  };
}
