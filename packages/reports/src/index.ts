/**
 * @artemiskit/reports
 * Report generation for Artemis Agent Reliability Toolkit
 */

// Standard run reports
export { generateHTMLReport } from './html/generator';
export { generateJSONReport, type JSONReportOptions } from './json/generator';

// Red team reports
export { generateRedTeamHTMLReport } from './html/redteam-generator';

// Stress test reports
export { generateStressHTMLReport } from './html/stress-generator';

// Comparison reports
export {
  generateCompareHTMLReport,
  buildComparisonData,
  type ComparisonData,
  type CaseComparison,
} from './html/compare-generator';

// Markdown reports
export {
  generateMarkdownReport,
  generateRedTeamMarkdownReport,
  type MarkdownReportOptions,
} from './markdown/generator';

// JUnit XML reports (CI integration)
export {
  generateJUnitReport,
  generateRedTeamJUnitReport,
  generateValidationJUnitReport,
  type JUnitReportOptions,
} from './junit/generator';

// Offline workflow assessments from sanitized saved records.
export { createWorkflowReport } from './workflow/model';
export { renderWorkflowReportHTML, renderWorkflowReportMarkdown } from './workflow/render';
export { generateWorkflowReport, type GenerateWorkflowReportOptions } from './workflow/generator';
export type {
  WorkflowReport,
  WorkflowReportView,
  WorkflowReportFormat,
  WorkflowReportOptions,
  WorkflowReportFinding,
  WorkflowReportEvidence,
  WorkflowReportRow,
  WorkflowReportSection,
} from './workflow/types';
