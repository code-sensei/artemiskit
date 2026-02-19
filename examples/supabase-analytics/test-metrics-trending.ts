/**
 * Metrics Trending - Supabase Analytics Examples
 *
 * This file demonstrates metrics history and trending capabilities:
 * - Saving daily metrics snapshots
 * - Querying trend data for visualization
 * - Aggregating metrics from runs
 * - Building analytics dashboards
 *
 * Run with: bun run examples/supabase-analytics/test-metrics-trending.ts
 */

import { SupabaseStorageAdapter } from '@artemiskit/core/storage';
import type {
  MetricsSnapshot,
  MetricsTrendOptions,
  TrendDataPoint,
} from '@artemiskit/core/storage';

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
// Helper: Generate date strings
// =============================================================================

function getDateString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

// =============================================================================
// Example 1: Save Daily Metrics Snapshot
// =============================================================================

async function saveDailySnapshot() {
  console.log('\n📅 Example 1: Saving daily metrics snapshot...\n');

  // Create a metrics snapshot for today
  const today = getDateString(0);

  const snapshot: MetricsSnapshot = {
    date: today,
    project: 'my-project',
    scenario: 'customer-support-agent',
    totalRuns: 12,
    totalCases: 600, // 12 runs * 50 cases each
    passedCases: 552,
    failedCases: 48,
    avgSuccessRate: 0.92,
    avgLatencyMs: 1180,
    avgTokensPerRun: 15200,
    minSuccessRate: 0.86,
    maxSuccessRate: 0.98,
    minLatencyMs: 890,
    maxLatencyMs: 1650,
    totalTokens: 182400,
  };

  const id = await storage.saveMetricsSnapshot(snapshot);
  console.log(`✅ Saved metrics snapshot for ${today} (ID: ${id})`);

  console.log('\n📊 Snapshot details:');
  console.log(`  Date:            ${snapshot.date}`);
  console.log(`  Total runs:      ${snapshot.totalRuns}`);
  console.log(`  Total cases:     ${snapshot.totalCases}`);
  console.log(`  Passed/Failed:   ${snapshot.passedCases}/${snapshot.failedCases}`);
  console.log(`  Avg success:     ${(snapshot.avgSuccessRate * 100).toFixed(1)}%`);
  console.log(`  Avg latency:     ${snapshot.avgLatencyMs}ms`);
  console.log(
    `  Success range:   ${(snapshot.minSuccessRate! * 100).toFixed(0)}% - ${(snapshot.maxSuccessRate! * 100).toFixed(0)}%`
  );
  console.log(`  Latency range:   ${snapshot.minLatencyMs}ms - ${snapshot.maxLatencyMs}ms`);

  return snapshot;
}

// =============================================================================
// Example 2: Seed Historical Data (for demo)
// =============================================================================

async function seedHistoricalData() {
  console.log('\n🌱 Example 2: Seeding historical data for trending...\n');

  // Create 30 days of historical data with realistic variations
  const snapshots: MetricsSnapshot[] = [];

  for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
    const date = getDateString(daysAgo);

    // Simulate gradual improvement with some variance
    const baseSuccessRate = 0.85 + daysAgo * -0.002 + Math.random() * 0.05;
    const successRate = Math.min(0.98, Math.max(0.8, baseSuccessRate));

    // Latency improves over time (lower is better)
    const baseLatency = 1500 - daysAgo * 5 + Math.random() * 200;
    const avgLatency = Math.round(Math.max(800, baseLatency));

    // Weekend has fewer runs
    const dayOfWeek = new Date(date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const totalRuns = isWeekend
      ? Math.floor(Math.random() * 5) + 2
      : Math.floor(Math.random() * 10) + 8;

    const totalCases = totalRuns * 50;
    const passedCases = Math.round(totalCases * successRate);

    snapshots.push({
      date,
      project: 'my-project',
      scenario: undefined, // Project-wide metrics
      totalRuns,
      totalCases,
      passedCases,
      failedCases: totalCases - passedCases,
      avgSuccessRate: successRate,
      avgLatencyMs: avgLatency,
      avgTokensPerRun: Math.round(14000 + Math.random() * 2000),
      minSuccessRate: Math.max(0.75, successRate - 0.08),
      maxSuccessRate: Math.min(1.0, successRate + 0.05),
      minLatencyMs: Math.round(avgLatency * 0.6),
      maxLatencyMs: Math.round(avgLatency * 1.4),
      totalTokens: totalRuns * Math.round(14000 + Math.random() * 2000),
    });
  }

  // Save all snapshots
  for (const snapshot of snapshots) {
    await storage.saveMetricsSnapshot(snapshot);
  }

  console.log(`✅ Seeded ${snapshots.length} days of historical data`);

  // Show summary
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  console.log('\n📈 Data range:');
  console.log(
    `  From: ${first.date} (${(first.avgSuccessRate * 100).toFixed(1)}% success, ${first.avgLatencyMs}ms)`
  );
  console.log(
    `  To:   ${last.date} (${(last.avgSuccessRate * 100).toFixed(1)}% success, ${last.avgLatencyMs}ms)`
  );

  return snapshots;
}

// =============================================================================
// Example 3: Get Trend Data for Visualization
// =============================================================================

async function getTrendData() {
  console.log('\n📈 Example 3: Getting trend data for visualization...\n');

  // Get last 7 days of trend data
  const options: MetricsTrendOptions = {
    project: 'my-project',
    startDate: getDateString(7),
    endDate: getDateString(0),
  };

  const trend = await storage.getMetricsTrend(options);

  console.log(`Found ${trend.length} data points\n`);

  // Display as ASCII chart
  console.log('Success Rate Trend (last 7 days):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  trend.forEach((point) => {
    const barLength = Math.round(point.successRate * 40);
    const bar = '█'.repeat(barLength) + '░'.repeat(40 - barLength);
    const emoji = point.successRate >= 0.9 ? '✅' : point.successRate >= 0.8 ? '⚠️' : '❌';
    console.log(`  ${point.date} │ ${bar} ${(point.successRate * 100).toFixed(1)}% ${emoji}`);
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Latency trend
  console.log('\nLatency Trend (ms):');
  const maxLatency = Math.max(...trend.map((p) => p.latencyMs));

  trend.forEach((point) => {
    const barLength = Math.round((point.latencyMs / maxLatency) * 30);
    const bar = '█'.repeat(barLength);
    console.log(`  ${point.date} │ ${bar} ${point.latencyMs}ms`);
  });

  return trend;
}

// =============================================================================
// Example 4: Aggregate Metrics from Runs
// =============================================================================

async function aggregateMetrics() {
  console.log('\n🔄 Example 4: Aggregating daily metrics from runs...\n');

  const today = getDateString(0);

  // This aggregates all runs for the given date and saves a snapshot
  const snapshot = await storage.aggregateDailyMetrics(today, 'my-project');

  console.log(`📊 Aggregated metrics for ${today}:`);
  console.log(`  Total runs:      ${snapshot.totalRuns}`);
  console.log(`  Total cases:     ${snapshot.totalCases}`);
  console.log(`  Passed/Failed:   ${snapshot.passedCases}/${snapshot.failedCases}`);
  console.log(`  Avg success:     ${(snapshot.avgSuccessRate * 100).toFixed(1)}%`);
  console.log(`  Avg latency:     ${snapshot.avgLatencyMs}ms`);
  console.log(`  Total tokens:    ${snapshot.totalTokens}`);

  // Can also aggregate for specific scenario
  console.log('\n  Aggregating for specific scenario...');
  const scenarioSnapshot = await storage.aggregateDailyMetrics(
    today,
    'my-project',
    'customer-support-agent'
  );
  console.log(`  Scenario runs: ${scenarioSnapshot.totalRuns}`);

  return snapshot;
}

// =============================================================================
// Example 5: Build Analytics Dashboard Data
// =============================================================================

async function buildDashboardData() {
  console.log('\n📊 Example 5: Building analytics dashboard data...\n');

  // Get various metrics for a dashboard

  // 1. 30-day overview
  const thirtyDayTrend = await storage.getMetricsTrend({
    project: 'my-project',
    startDate: getDateString(30),
    endDate: getDateString(0),
  });

  // 2. Calculate week-over-week change
  const thisWeek = thirtyDayTrend.slice(-7);
  const lastWeek = thirtyDayTrend.slice(-14, -7);

  const thisWeekAvg = thisWeek.reduce((sum, p) => sum + p.successRate, 0) / thisWeek.length;
  const lastWeekAvg = lastWeek.reduce((sum, p) => sum + p.successRate, 0) / lastWeek.length;
  const weekOverWeekChange = thisWeekAvg - lastWeekAvg;

  // 3. Get today's snapshot for real-time stats
  const todaySnapshot = await storage.getMetricsSnapshot(getDateString(0), 'my-project');

  // Dashboard data structure
  const dashboard = {
    overview: {
      totalRunsToday: todaySnapshot?.totalRuns || 0,
      successRateToday: todaySnapshot?.avgSuccessRate || 0,
      avgLatencyToday: todaySnapshot?.avgLatencyMs || 0,
    },
    trends: {
      successRate: {
        current: thisWeekAvg,
        change: weekOverWeekChange,
        trend:
          weekOverWeekChange > 0 ? 'improving' : weekOverWeekChange < 0 ? 'declining' : 'stable',
      },
      dataPoints: thirtyDayTrend,
    },
    alerts: [] as string[],
  };

  // Check for alerts
  if (thisWeekAvg < 0.85) {
    dashboard.alerts.push('⚠️ Success rate below 85% threshold');
  }
  if (weekOverWeekChange < -0.05) {
    dashboard.alerts.push('⚠️ Week-over-week decline of more than 5%');
  }
  if (todaySnapshot && todaySnapshot.avgLatencyMs > 2000) {
    dashboard.alerts.push('⚠️ Average latency exceeds 2000ms');
  }

  // Output dashboard summary
  console.log('┌─────────────────────────────────────────────────┐');
  console.log('│              📊 ANALYTICS DASHBOARD              │');
  console.log('├─────────────────────────────────────────────────┤');
  console.log(
    `│  Today's Runs:     ${String(dashboard.overview.totalRunsToday).padStart(6)}                     │`
  );
  console.log(
    `│  Success Rate:     ${(dashboard.overview.successRateToday * 100).toFixed(1).padStart(5)}%                     │`
  );
  console.log(
    `│  Avg Latency:      ${String(dashboard.overview.avgLatencyToday).padStart(5)}ms                    │`
  );
  console.log('├─────────────────────────────────────────────────┤');
  console.log(
    `│  Week Avg:         ${(dashboard.trends.successRate.current * 100).toFixed(1).padStart(5)}%                     │`
  );
  console.log(
    `│  Week Change:      ${dashboard.trends.successRate.change >= 0 ? '+' : ''}${(dashboard.trends.successRate.change * 100).toFixed(1).padStart(4)}% (${dashboard.trends.successRate.trend.padEnd(10)})  │`
  );
  console.log('├─────────────────────────────────────────────────┤');

  if (dashboard.alerts.length > 0) {
    console.log('│  ALERTS:                                        │');
    dashboard.alerts.forEach((alert) => {
      console.log(`│    ${alert.padEnd(43)}│`);
    });
  } else {
    console.log('│  ✅ No alerts - all metrics healthy             │');
  }

  console.log('└─────────────────────────────────────────────────┘');

  return dashboard;
}

// =============================================================================
// Example 6: Export for External Tools
// =============================================================================

async function exportForExternalTools() {
  console.log('\n📤 Example 6: Exporting data for external tools...\n');

  const trend = await storage.getMetricsTrend({
    project: 'my-project',
    startDate: getDateString(30),
    endDate: getDateString(0),
  });

  // Export as CSV
  console.log('CSV Export (for Excel/Sheets):');
  console.log('date,success_rate,latency_ms,total_runs,total_tokens');
  trend.forEach((p) => {
    console.log(`${p.date},${p.successRate},${p.latencyMs},${p.totalRuns},${p.totalTokens}`);
  });

  // Export as JSON (for custom dashboards)
  console.log('\n\nJSON Export (for custom dashboards):');
  const jsonExport = {
    project: 'my-project',
    exportedAt: new Date().toISOString(),
    period: {
      start: getDateString(30),
      end: getDateString(0),
    },
    metrics: trend,
  };
  console.log(JSON.stringify(jsonExport, null, 2).slice(0, 500) + '...');

  // Prometheus metrics format
  console.log('\n\nPrometheus Metrics (for monitoring):');
  const latest = trend[trend.length - 1];
  if (latest) {
    console.log(`# HELP artemis_success_rate Agent test success rate`);
    console.log(`# TYPE artemis_success_rate gauge`);
    console.log(`artemis_success_rate{project="my-project"} ${latest.successRate}`);
    console.log(`# HELP artemis_latency_ms Agent response latency in milliseconds`);
    console.log(`# TYPE artemis_latency_ms gauge`);
    console.log(`artemis_latency_ms{project="my-project"} ${latest.latencyMs}`);
  }
}

// =============================================================================
// Main Runner
// =============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ArtemisKit Supabase Analytics - Metrics Trending Examples');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Example 1: Save a daily snapshot
    await saveDailySnapshot();

    // Example 2: Seed historical data
    await seedHistoricalData();

    // Example 3: Get trend data
    await getTrendData();

    // Example 4: Aggregate metrics
    await aggregateMetrics();

    // Example 5: Build dashboard data
    await buildDashboardData();

    // Example 6: Export for external tools
    await exportForExternalTools();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
main();
