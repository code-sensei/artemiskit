/**
 * JSON Report Generator
 */

import type { AnyManifest, RedTeamManifest, RunManifest, StressManifest } from '@artemiskit/core';

export interface JSONReportOptions {
  pretty?: boolean;
  includeRaw?: boolean;
}

export function generateJSONReport(manifest: RunManifest, options?: JSONReportOptions): string;
export function generateJSONReport(manifest: RedTeamManifest, options?: JSONReportOptions): string;
export function generateJSONReport(manifest: StressManifest, options?: JSONReportOptions): string;
export function generateJSONReport(manifest: AnyManifest, options: JSONReportOptions = {}): string {
  const { pretty = true } = options;
  return pretty ? JSON.stringify(manifest, null, 2) : JSON.stringify(manifest);
}
