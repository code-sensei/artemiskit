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
