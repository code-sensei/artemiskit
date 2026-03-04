# Supabase Analytics for ArtemisKit

This guide explains how to use ArtemisKit's Supabase storage adapter for advanced analytics, baseline comparisons, and metrics trending.

## Overview

The Supabase storage adapter extends ArtemisKit's capabilities beyond simple run storage to provide:

- **📊 Case-Level Analytics** - Query individual test case results with filters
- **📈 Metrics Trending** - Track quality metrics over time for dashboards
- **🔄 Baseline Comparisons** - Set baselines and detect regressions automatically
- **🔍 Granular Queries** - Filter by status, tags, date ranges, and more

## Features

### 1. Case Results Storage

Every test case result is stored individually, enabling:

```typescript
// Query failed cases across all runs
const failures = await storage.queryCaseResults({
  status: 'failed',
  limit: 50,
});

// Get cases with specific tags
const securityTests = await storage.queryCaseResults({
  tags: ['security', 'auth'],
});

// Paginate through results
const page2 = await storage.queryCaseResults({
  offset: 20,
  limit: 10,
});
```

### 2. Baseline Management

Set and compare against baselines for regression detection:

```typescript
// Set a baseline from a successful run
await storage.setBaseline('customer-support', runId, 'v1.0-release');

// Compare new run against baseline
const comparison = await storage.compareToBaseline(newRunId, 0.05);
if (comparison?.hasRegression) {
  console.error('🚨 Regression detected!');
}
```

### 3. Metrics Trending

Track metrics over time for dashboards and reporting:

```typescript
// Get 30-day trend
const trend = await storage.getMetricsTrend({
  project: 'my-project',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
});

// Aggregate daily metrics
await storage.aggregateDailyMetrics('2026-02-19', 'my-project');
```

## Database Schema

The analytics features use these tables:

| Table | Purpose |
|-------|---------|
| `runs` | Test run metadata and summary metrics |
| `case_results` | Individual test case results |
| `baselines` | Baseline runs for comparison |
| `metrics_history` | Daily aggregated metrics snapshots |

## Quick Start

1. **Setup Supabase** - See [setup.md](./setup.md) for database setup
2. **Configure ArtemisKit** - Add Supabase credentials to `artemis.config.yaml`
3. **Run tests** - Results are automatically stored with case-level detail
4. **Query & analyze** - Use the storage adapter methods or SQL queries

## Example Files

| File | Description |
|------|-------------|
| [test-case-results.ts](./test-case-results.ts) | Save and query case results |
| [test-baselines.ts](./test-baselines.ts) | Baseline management and regression detection |
| [test-metrics-trending.ts](./test-metrics-trending.ts) | Metrics history and trending |
| [sample-queries.sql](./sample-queries.sql) | Useful SQL queries for analytics |
| [run-tests.sh](./run-tests.sh) | Script to run all examples |

## Use Cases

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run ArtemisKit tests
  run: bunx artemis run --storage supabase

- name: Check for regressions
  run: bunx artemis compare --baseline
```

### Analytics Dashboard

Build dashboards using the metrics history:

```sql
-- 7-day success rate trend
SELECT date, avg_success_rate 
FROM metrics_history 
WHERE project = 'my-project'
ORDER BY date DESC 
LIMIT 7;
```

### Quality Monitoring

Set up alerts based on metrics:

```typescript
const trend = await storage.getMetricsTrend({
  project: 'my-project',
  limit: 1,
});

if (trend[0]?.successRate < 0.90) {
  // Send alert
}
```

## Configuration

Add to `artemis.config.yaml`:

```yaml
storage:
  type: supabase
  url: ${SUPABASE_URL}
  anonKey: ${SUPABASE_ANON_KEY}
  bucket: artemis-runs
```

## Learn More

- [ArtemisKit Documentation](https://github.com/code-sensei/artemiskit)
- [Supabase Documentation](https://supabase.com/docs)
- [Storage Adapter API Reference](../../packages/core/src/storage/types.ts)
