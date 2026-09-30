import type {
  ExperimentCompletion,
  ExperimentCostLimit,
  ExperimentSummary,
} from '@artemiskit/core';

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
  executorInvocations: number;
  reservedLiveRequests: number;
  attempts: number;
  retries: number;
  requests: number;
  tokens: number;
  cost: ExperimentCostLimit | null;
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
  summary: ExperimentReportSummary;
  findings: ExperimentReportFinding[];
  sections: ExperimentReportSection[];
  evidence: ExperimentReportEvidence[];
  limitations: string[];
}
