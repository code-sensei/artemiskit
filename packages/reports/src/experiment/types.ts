import type {
  ExperimentCompletion,
  ExperimentCostLimit,
  ExperimentSummary,
} from '@artemiskit/core';
import type { ExperimentCaseLevelSummary } from './case-level';

export type ExperimentReportView = 'technical' | 'executive' | 'comprehensive';
export type ExperimentReportFormat = 'html' | 'markdown';

export interface ExperimentReportOptions {
  view?: ExperimentReportView;
}

export interface ExperimentReportFinding {
  id: string;
  level: 'strength' | 'risk' | 'limitation' | 'information';
  title: string;
  detail: string;
  recommendation: string;
  evidenceIds: string[];
}

export interface ExperimentReportEvidence {
  id: string;
  path: string;
  sha256: string;
  description: string;
}

export interface ExperimentReportRow {
  id: string;
  cells: string[];
  evidenceIds: string[];
}

export interface ExperimentReportSection {
  id: string;
  title: string;
  description: string;
  columns: string[];
  rows: ExperimentReportRow[];
}

export interface ExperimentReportSummary extends ExperimentSummary {
  /** Declared limit of coordinates in flight; 1 is serial execution. */
  concurrency: number;
  /** Recorded peak of attempts in flight for concurrent results; null for serial results. */
  peakInFlight: number | null;
  executorInvocations: number;
  reservedLiveRequests: number;
  attempts: number;
  retries: number;
  requests: number;
  tokens: number;
  cost: ExperimentCostLimit | null;
  /**
   * `not_applicable` when every target is a local deployment that declared no metered cost;
   * `unavailable` when cost was not reported; otherwise `reported`.
   */
  costStatus: 'reported' | 'unavailable' | 'not_applicable';
  validOutcomeRate: number | null;
  completion: ExperimentCompletion;
}

/** Canonical deterministic projection of one validated saved experiment result. */
export interface ExperimentReport {
  schemaVersion: '1';
  reportId: string;
  title: string;
  scope: string[];
  methodology: string[];
  /** Coordinate-level counts (task × target × repetition). */
  summary: ExperimentReportSummary;
  /** Individual scenario cases from verified per-attempt evidence, or why they are unavailable. */
  caseLevel: ExperimentCaseLevelSummary;
  findings: ExperimentReportFinding[];
  sections: ExperimentReportSection[];
  evidence: ExperimentReportEvidence[];
  limitations: string[];
}
