import { types } from 'node:util';
import { createExperimentReport } from './model';
import { renderExperimentReportHTML, renderExperimentReportMarkdown } from './render';
import type { ExperimentReportFormat, ExperimentReportOptions } from './types';

export interface GenerateExperimentReportOptions extends ExperimentReportOptions {
  format?: ExperimentReportFormat;
}

/** Generate a report without loading a task, provider, credential, environment, or network. */
export function generateExperimentReport(
  input: unknown,
  options: GenerateExperimentReportOptions = {}
): string {
  if (!options || typeof options !== 'object' || types.isProxy(options))
    throw new Error('Invalid experiment report options');
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error('Invalid experiment report options');
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) =>
        typeof key !== 'string' ||
        !['format', 'view'].includes(key) ||
        !('value' in descriptors[key])
    )
  )
    throw new Error('Invalid experiment report options');
  const format = descriptors.format?.value ?? 'html';
  const view = descriptors.view?.value ?? 'comprehensive';
  if (
    !['html', 'markdown'].includes(format) ||
    !['technical', 'executive', 'comprehensive'].includes(view)
  )
    throw new Error('Invalid experiment report options');
  const report = createExperimentReport(input);
  return format === 'html'
    ? renderExperimentReportHTML(report, { view })
    : renderExperimentReportMarkdown(report, { view });
}
