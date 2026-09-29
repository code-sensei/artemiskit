import { types } from 'node:util';
import { createWorkflowReport } from './model';
import { renderWorkflowReportHTML, renderWorkflowReportMarkdown } from './render';
import type { WorkflowReportFormat, WorkflowReportOptions } from './types';

export interface GenerateWorkflowReportOptions extends WorkflowReportOptions {
  format?: WorkflowReportFormat;
}

/** Generate a standalone assessment without loading workflows, providers or private checkpoints. */
export function generateWorkflowReport(
  input: unknown,
  options: GenerateWorkflowReportOptions = {}
): string {
  if (!options || typeof options !== 'object' || types.isProxy(options)) {
    throw new Error('Invalid workflow report options');
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error('Invalid workflow report options');
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) =>
        typeof key !== 'string' ||
        !['format', 'view'].includes(key) ||
        !('value' in descriptors[key])
    )
  ) {
    throw new Error('Invalid workflow report options');
  }
  const format = descriptors.format?.value === undefined ? 'html' : descriptors.format.value;
  const view = descriptors.view?.value === undefined ? 'comprehensive' : descriptors.view.value;
  if (
    !['html', 'markdown'].includes(format) ||
    !['technical', 'executive', 'comprehensive'].includes(view)
  ) {
    throw new Error('Invalid workflow report options');
  }
  const report = createWorkflowReport(input);
  return format === 'html'
    ? renderWorkflowReportHTML(report, { view })
    : renderWorkflowReportMarkdown(report, { view });
}
