# ArtemisKit Database Migrations

This folder contains SQL migrations for Supabase/PostgreSQL.

## Running Migrations

Migrations should be run in order against your Supabase project:

```bash
# Using Supabase CLI
supabase db push --db-url postgresql://...

# Or manually via psql
psql $DATABASE_URL -f migrations/001_initial_schema.sql
psql $DATABASE_URL -f migrations/002_case_results.sql
psql $DATABASE_URL -f migrations/003_baselines.sql
psql $DATABASE_URL -f migrations/004_metrics_history.sql
```

## Migration Files

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Reference schema for the existing `runs` table |
| `002_case_results.sql` | Individual test case results for granular analytics |
| `003_baselines.sql` | Baseline runs for regression comparison |
| `004_metrics_history.sql` | Aggregated daily metrics for trending |

## Schema Overview

### Tables

#### `runs` (existing)
Core table for storing run metadata.

#### `case_results` (new)
Stores individual test case results for each run:
- Links to `runs` via `run_id`
- Tracks status (passed/failed/error), score, latency, tokens
- Supports tags for filtering and analysis

#### `baselines` (new)
Stores baseline runs for regression comparison:
- One baseline per project+scenario
- Captures key metrics at baseline time
- Supports optional tags/descriptions

#### `metrics_history` (new)
Stores aggregated daily metrics for trending:
- One record per date+project+scenario
- Includes averages, min/max, totals
- Auto-updates `updated_at` on changes

## New Storage Methods

The `SupabaseStorageAdapter` now implements `AnalyticsStorageAdapter` with:

- `saveCaseResult()` / `saveCaseResults()` - Save individual case results
- `getCaseResults()` / `queryCaseResults()` - Query case results
- `setBaseline()` / `getBaseline()` - Manage baselines
- `listBaselines()` / `removeBaseline()` - List and remove baselines
- `saveMetricsSnapshot()` - Save daily metrics
- `getMetricsTrend()` - Get trend data for visualization
- `aggregateDailyMetrics()` - Aggregate metrics from runs
