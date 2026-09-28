/** Canonical, deterministic projection of validated saved workflow evidence. */
export type WorkflowReportView = 'technical' | 'executive' | 'comprehensive';
export type WorkflowReportFormat = 'html' | 'markdown';
export interface WorkflowReportOptions {
  view?: WorkflowReportView;
}
export interface WorkflowReportFinding {
  id: string;
  level: 'strength' | 'risk' | 'limitation' | 'information';
  title: string;
  detail: string;
  recommendation: string;
  evidenceIds: string[];
}
export interface WorkflowReportEvidence {
  id: string;
  recordId: string;
  path: string;
  sha256: string;
  description: string;
}
export interface WorkflowReportRow {
  id: string;
  cells: string[];
  evidenceIds: string[];
}
export interface WorkflowReportSection {
  id: string;
  title: string;
  description: string;
  columns: string[];
  rows: WorkflowReportRow[];
}
export interface WorkflowReport {
  schemaVersion: '1';
  reportId: string;
  title: string;
  scope: string[];
  methodology: string[];
  summary: {
    records: number;
    logicalRuns: number;
    eligible: number;
    passed: number;
    failed: number;
    invalid: number;
    unavailable: number;
    preflight: number;
    historical: number;
    duplicateRecords: number;
    supersededAttempts: number;
    /** Null when no eligible tasks; no omitted, historical or preflight work is a pass. */
    taskSuccessRate: number | null;
  };
  findings: WorkflowReportFinding[];
  sections: WorkflowReportSection[];
  evidence: WorkflowReportEvidence[];
  limitations: string[];
}
