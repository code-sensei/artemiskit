/**
 * JSON Report Generator
 */

import type { RunManifest } from '@artemiskit/core';

export interface JSONReportOptions {
  pretty?: boolean;
  includeRaw?: boolean;
}

export function generateJSONReport(manifest: RunManifest, options: JSONReportOptions = {}): string {
  const { pretty = true, includeRaw = false } = options;

  // If not including raw, filter it out from cases
  const outputManifest = includeRaw
    ? manifest
    : {
        ...manifest,
        cases: manifest.cases.map((c) => {
          const { ...rest } = c;
          return rest;
        }),
      };

  return pretty ? JSON.stringify(outputManifest, null, 2) : JSON.stringify(outputManifest);
}
