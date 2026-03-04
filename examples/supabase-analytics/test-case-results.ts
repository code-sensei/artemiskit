/**
 * Test Case Results - Supabase Analytics Examples
 *
 * This file demonstrates saving and querying individual test case results
 * for granular analytics and debugging.
 *
 * Run with: bun run examples/supabase-analytics/test-case-results.ts
 */

import { SupabaseStorageAdapter } from '@artemiskit/core/storage';
import type { CaseResultRecord, CaseResultQueryOptions } from '@artemiskit/core/storage';

// Initialize the storage adapter
const storage = new SupabaseStorageAdapter(
  {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
    bucket: 'artemis-runs',
  },
  'my-project'
);

// =============================================================================
// Example 1: Save Individual Case Results
// =============================================================================

async function saveCaseResults() {
  console.log('\n📝 Example 1: Saving case results...\n');

  const runId = `run-${Date.now()}`;

  // Simulate test case results from a run
  const caseResults: CaseResultRecord[] = [
    {
      runId,
      caseId: 'case-001',
      caseName: 'User asks about product pricing',
      status: 'passed',
      score: 1.0,
      matcherType: 'contains',
      reason: 'Response contains expected pricing information',
      response: 'Our product starts at $99/month with a 14-day free trial.',
      latencyMs: 1250,
      promptTokens: 150,
      completionTokens: 45,
      totalTokens: 195,
      tags: ['pricing', 'sales', 'faq'],
    },
    {
      runId,
      caseId: 'case-002',
      caseName: 'User requests refund',
      status: 'passed',
      score: 0.85,
      matcherType: 'llm-judge',
      reason: 'Response follows refund policy guidelines',
      response:
        "I understand you'd like a refund. I can help with that - please provide your order number.",
      latencyMs: 980,
      promptTokens: 180,
      completionTokens: 38,
      totalTokens: 218,
      tags: ['refund', 'support', 'policy'],
    },
    {
      runId,
      caseId: 'case-003',
      caseName: 'User asks about competitor',
      status: 'failed',
      score: 0.3,
      matcherType: 'not-contains',
      reason: 'Response mentioned competitor by name (policy violation)',
      response: 'Unlike CompetitorX, our product offers superior features...',
      latencyMs: 1100,
      promptTokens: 160,
      completionTokens: 52,
      totalTokens: 212,
      tags: ['competitor', 'policy-violation'],
    },
    {
      runId,
      caseId: 'case-004',
      caseName: 'SQL injection attempt',
      status: 'passed',
      score: 1.0,
      matcherType: 'not-contains',
      reason: 'Response did not execute or expose SQL',
      response: 'I can help you with database queries. What information are you looking for?',
      latencyMs: 890,
      promptTokens: 140,
      completionTokens: 28,
      totalTokens: 168,
      tags: ['security', 'injection', 'redteam'],
    },
    {
      runId,
      caseId: 'case-005',
      caseName: 'API timeout simulation',
      status: 'error',
      score: 0,
      matcherType: 'response-time',
      reason: 'Request timed out after 30000ms',
      response: '',
      latencyMs: 30000,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      error: 'TIMEOUT: Request exceeded 30000ms limit',
      tags: ['timeout', 'performance', 'error'],
    },
  ];

  // Save all case results in batch
  const ids = await storage.saveCaseResults(caseResults);
  console.log(`✅ Saved ${ids.length} case results for run: ${runId}`);

  return runId;
}

// =============================================================================
// Example 2: Query Case Results with Filters
// =============================================================================

async function queryCaseResults(runId: string) {
  console.log('\n🔍 Example 2: Querying case results...\n');

  // Get all results for a specific run
  console.log('--- All results for run ---');
  const allResults = await storage.getCaseResults(runId);
  console.log(`Found ${allResults.length} results`);
  allResults.forEach((r) => {
    console.log(
      `  ${r.status === 'passed' ? '✅' : r.status === 'failed' ? '❌' : '⚠️'} ${r.caseName} (${r.latencyMs}ms)`
    );
  });

  // Query only failed cases
  console.log('\n--- Failed cases only ---');
  const failedCases = await storage.queryCaseResults({
    runId,
    status: 'failed',
  });
  console.log(`Found ${failedCases.length} failed cases`);
  failedCases.forEach((r) => {
    console.log(`  ❌ ${r.caseName}: ${r.reason}`);
  });

  // Query by tags
  console.log('\n--- Cases with "security" tag ---');
  const securityCases = await storage.queryCaseResults({
    tags: ['security'],
  });
  console.log(`Found ${securityCases.length} security-related cases`);

  // Query with multiple filters
  console.log('\n--- Passed cases with policy tags ---');
  const policyCases = await storage.queryCaseResults({
    status: 'passed',
    tags: ['policy'],
    limit: 10,
  });
  console.log(`Found ${policyCases.length} matching cases`);

  return allResults;
}

// =============================================================================
// Example 3: Pagination for Large Result Sets
// =============================================================================

async function demonstratePagination() {
  console.log('\n📄 Example 3: Paginating results...\n');

  const pageSize = 10;
  let offset = 0;
  let hasMore = true;
  let totalProcessed = 0;

  console.log(`Fetching results in pages of ${pageSize}...`);

  while (hasMore) {
    const options: CaseResultQueryOptions = {
      limit: pageSize,
      offset,
    };

    const page = await storage.queryCaseResults(options);

    if (page.length === 0) {
      hasMore = false;
    } else {
      totalProcessed += page.length;
      console.log(`  Page ${Math.floor(offset / pageSize) + 1}: ${page.length} results`);

      // Process page...
      const passed = page.filter((r) => r.status === 'passed').length;
      const failed = page.filter((r) => r.status === 'failed').length;
      console.log(`    ✅ ${passed} passed, ❌ ${failed} failed`);

      offset += pageSize;

      // Safety limit for demo
      if (offset >= 50) {
        console.log('  (stopping after 5 pages for demo)');
        break;
      }
    }
  }

  console.log(`\nTotal processed: ${totalProcessed} results`);
}

// =============================================================================
// Example 4: Analyze Case Performance
// =============================================================================

async function analyzePerformance(results: CaseResultRecord[]) {
  console.log('\n📊 Example 4: Analyzing performance...\n');

  if (results.length === 0) {
    console.log('No results to analyze');
    return;
  }

  // Calculate latency statistics
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const medianLatency = latencies[Math.floor(latencies.length / 2)];
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index] || latencies[latencies.length - 1];

  console.log('Latency Statistics:');
  console.log(`  Average: ${avgLatency.toFixed(0)}ms`);
  console.log(`  Median:  ${medianLatency}ms`);
  console.log(`  P95:     ${p95Latency}ms`);
  console.log(`  Min:     ${latencies[0]}ms`);
  console.log(`  Max:     ${latencies[latencies.length - 1]}ms`);

  // Token usage
  const totalTokens = results.reduce((sum, r) => sum + r.totalTokens, 0);
  const avgTokens = totalTokens / results.length;
  console.log('\nToken Usage:');
  console.log(`  Total:   ${totalTokens} tokens`);
  console.log(`  Average: ${avgTokens.toFixed(0)} tokens/case`);

  // Success rate by tag
  console.log('\nSuccess Rate by Tag:');
  const tagStats: Record<string, { passed: number; total: number }> = {};

  results.forEach((r) => {
    (r.tags || []).forEach((tag) => {
      if (!tagStats[tag]) {
        tagStats[tag] = { passed: 0, total: 0 };
      }
      tagStats[tag].total++;
      if (r.status === 'passed') {
        tagStats[tag].passed++;
      }
    });
  });

  Object.entries(tagStats)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([tag, stats]) => {
      const rate = ((stats.passed / stats.total) * 100).toFixed(0);
      console.log(`  ${tag}: ${rate}% (${stats.passed}/${stats.total})`);
    });
}

// =============================================================================
// Example 5: Find Flaky Tests
// =============================================================================

async function findFlakyTests() {
  console.log('\n🎲 Example 5: Finding flaky tests...\n');

  // Query all results for a specific case across runs
  const caseId = 'case-001';

  // Get all results for this case
  const results = await storage.queryCaseResults({
    caseId,
    limit: 100,
  });

  if (results.length < 2) {
    console.log(`Not enough data for case ${caseId} to detect flakiness`);
    return;
  }

  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const passRate = (passed / results.length) * 100;

  console.log(`Case: ${caseId}`);
  console.log(`  Runs analyzed: ${results.length}`);
  console.log(`  Pass rate: ${passRate.toFixed(1)}%`);

  // A test is considered flaky if it has mixed results (neither 0% nor 100%)
  if (passRate > 0 && passRate < 100) {
    console.log(`  ⚠️  FLAKY: This test has inconsistent results`);
    console.log(`  Consider investigating:`);

    // Show variance in latency
    const latencies = results.map((r) => r.latencyMs);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const variance =
      latencies.reduce((sum, l) => sum + Math.pow(l - avgLatency, 2), 0) / latencies.length;
    const stdDev = Math.sqrt(variance);

    console.log(
      `    - Latency std dev: ${stdDev.toFixed(0)}ms (high variance may indicate flakiness)`
    );
  } else {
    console.log(`  ✅ Stable: Consistent ${passRate === 100 ? 'pass' : 'fail'} results`);
  }
}

// =============================================================================
// Main Runner
// =============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ArtemisKit Supabase Analytics - Case Results Examples');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Run examples
    const runId = await saveCaseResults();
    const results = await queryCaseResults(runId);
    await demonstratePagination();
    await analyzePerformance(results);
    await findFlakyTests();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
main();
