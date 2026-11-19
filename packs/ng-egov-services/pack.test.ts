/**
 * Integrity checks for the ng-egov-services pack (draft, unreviewed).
 *
 * The shared contract verifies the experiment manifest, digests and identities, pack tags,
 * deterministic-only scoring, and that every case accepts its reference answer while rejecting
 * wrong decisions, the listed fail answers and prose-wrapped answers.
 */

import { definePackContractTests } from '../_tools/pack-contract';

definePackContractTests({
  packDir: import.meta.dir,
  packId: 'ng-egov-services',
  domain: 'egov',
  language: 'en-NG',
  minTasks: 50,
  casesPerTask: { min: 3, max: 6 },
});
