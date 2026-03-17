/**
 * local-storage.ts
 *
 * Demonstrates using local file storage with the ArtemisKit SDK.
 *
 * Storage enables:
 * - Persisting test run results
 * - Accessing run history
 * - Comparing runs for regression detection
 * - Managing baselines
 *
 * @since v0.3.2
 *
 * Usage:
 *   bun run examples/05-sdk/storage/local-storage.ts
 */

import { resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import {
  ArtemisKit,
  type StorageConfig,
  type RunManifest,
  type RunListItem,
} from '@artemiskit/sdk';

// Demo storage path
const STORAGE_PATH = '/tmp/artemiskit-storage-demo';

async function main() {
  console.log('🏹 ArtemisKit SDK - Local Storage Example\n');

  // Clean up and create storage directory
  await rm(STORAGE_PATH, { recursive: true, force: true });
  await mkdir(STORAGE_PATH, { recursive: true });

  // ========================================
  // Example 1: Initialize with local storage
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 1: Initialize with Local Storage');
  console.log('─'.repeat(60));

  const storageConfig: StorageConfig = {
    type: 'local',
    basePath: STORAGE_PATH,
  };

  const kit = new ArtemisKit({
    project: 'storage-demo',
    provider: 'openai',
    model: 'gpt-4',
    storage: storageConfig,
  });

  console.log('ArtemisKit initialized with storage config:');
  console.log(`  Type: ${storageConfig.type}`);
  console.log(`  Base Path: ${storageConfig.basePath}`);

  // ========================================
  // Example 2: Run and save results
  // ========================================
  console.log('\n' + '─'.repeat(60));
  console.log('Example 2: Run and Save Results');
  console.log('─'.repeat(60));

  // Note: This would run actual tests. For demo, we show the pattern.
  console.log(`
To run and save results:

  const result = await kit.run({
    scenario: './scenarios/example.yaml',
    save: true,  // Enable saving to storage
  });

  console.log('Run ID:', result.manifest.run_id);
  console.log('Saved to storage');

The manifest is automatically saved to:
  ${STORAGE_PATH}/{project}/{run_id}.json
`);

  // ========================================
  // Example 3: Storage directory structure
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 3: Storage Directory Structure');
  console.log('─'.repeat(60));

  console.log(`
Local storage directory structure:

  ${STORAGE_PATH}/
  ├── storage-demo/                    # Project directory
  │   ├── run-2026-03-17-001.json     # Run manifest
  │   ├── run-2026-03-17-002.json     # Another run manifest
  │   └── run-2026-03-18-001.json     # Next day's run
  ├── another-project/                 # Different project
  │   └── run-2026-03-17-001.json
  └── baselines.json                   # Baseline mappings
`);

  // ========================================
  // Example 4: Accessing storage directly
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 4: Accessing Storage API');
  console.log('─'.repeat(60));

  console.log(`
The SDK provides access to the storage adapter for direct operations:

  // List all runs
  const runs = await kit.history.list({ limit: 10 });

  // Load a specific run
  const manifest = await kit.history.get('run-2026-03-17-001');

  // Compare runs
  const comparison = await kit.compare({
    baseline: 'run-2026-03-17-001',
    current: 'run-2026-03-18-001',
    threshold: 0.05,
  });

  // Manage baselines (planned for v0.3.4)
  await kit.baseline.create({
    name: 'production-baseline',
    runId: 'run-2026-03-17-001',
  });
`);

  // ========================================
  // Example 5: Custom storage path patterns
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 5: Storage Configuration Options');
  console.log('─'.repeat(60));

  // Different storage configurations
  const configExamples = [
    {
      name: 'Project root storage',
      config: { type: 'local', basePath: './artemis-runs' },
    },
    {
      name: 'Absolute path storage',
      config: { type: 'local', basePath: '/var/data/artemiskit' },
    },
    {
      name: 'User home storage',
      config: { type: 'local', basePath: '~/.artemiskit/runs' },
    },
    {
      name: 'CI/CD artifacts',
      config: { type: 'local', basePath: './artifacts/test-results' },
    },
  ];

  console.log('Common storage configurations:\n');
  for (const example of configExamples) {
    console.log(`  ${example.name}:`);
    console.log(`    storage: { type: 'local', basePath: '${example.config.basePath}' }`);
    console.log('');
  }

  // ========================================
  // Example 6: Supabase storage (cloud)
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 6: Supabase Storage (Cloud)');
  console.log('─'.repeat(60));

  console.log(`
For cloud storage with Supabase:

  const kit = new ArtemisKit({
    project: 'my-project',
    provider: 'openai',
    model: 'gpt-4',
    storage: {
      type: 'supabase',
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_ANON_KEY,
    },
  });

Benefits of cloud storage:
  - Team-wide access to results
  - Historical analytics
  - Integration with Supabase dashboard
  - Automatic backups
`);

  // ========================================
  // Example 7: Working with run history
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 7: Working with Run History');
  console.log('─'.repeat(60));

  console.log(`
Common operations with run history:

  // List recent runs
  const recentRuns = await kit.history.list({
    limit: 20,
    project: 'my-project',
  });

  for (const run of recentRuns) {
    console.log(run.run_id, run.success_rate, run.start_time);
  }

  // Get run details
  const runDetails = await kit.history.get('run-id-here');
  console.log('Cases:', runDetails.cases.length);
  console.log('Pass rate:', runDetails.metrics.pass_rate);

  // Find runs by criteria
  const failedRuns = recentRuns.filter(r => r.success_rate < 0.8);
`);

  // Clean up
  await rm(STORAGE_PATH, { recursive: true, force: true });

  console.log('\n' + '─'.repeat(60));
  console.log('✅ Storage examples completed');
  console.log('─'.repeat(60));
}

main().catch(console.error);
