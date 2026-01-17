# Supabase Storage

The Supabase storage backend provides cloud-based persistence with PostgreSQL for metadata and Supabase Storage for manifest files. This is recommended for team collaboration, CI/CD pipelines, and production usage.

## Features

- **Cloud persistence** - Access run history from any machine
- **Full SQL queries** - Rich filtering and aggregation capabilities
- **Team collaboration** - Share results across team members
- **Built-in metrics** - Automatic aggregation and trending
- **Row Level Security** - Ready for multi-tenant setups

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from Settings > API

### 2. Run Database Migrations

Apply the ArtemisKit schema to your Supabase project:

```bash
# Using Supabase CLI
supabase link --project-ref your-project-ref
supabase db push
```

Or manually run the migrations in the Supabase SQL Editor:

**Migration 1: Initial Schema** (`001_initial_schema.sql`)
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Runs table: stores metadata for each test run
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id TEXT UNIQUE NOT NULL,
  project TEXT NOT NULL DEFAULT 'default',
  scenario TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Metrics
  success_rate DECIMAL(5, 4) NOT NULL,
  total_cases INTEGER NOT NULL,
  passed_cases INTEGER NOT NULL,
  failed_cases INTEGER NOT NULL,
  median_latency_ms INTEGER,
  p95_latency_ms INTEGER,
  total_tokens INTEGER,

  -- Git provenance
  git_commit TEXT,
  git_branch TEXT,
  git_dirty BOOLEAN DEFAULT false,

  -- Audit
  run_by TEXT,
  run_reason TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Storage reference
  manifest_path TEXT NOT NULL
);

-- Case results table
CREATE TABLE case_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  score DECIMAL(5, 4),
  matcher_type TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  error_message TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(run_id, case_id)
);

-- Baselines table
CREATE TABLE baselines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(project, scenario)
);

-- Metrics history table
CREATE TABLE metrics_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  date DATE NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  avg_success_rate DECIMAL(5, 4),
  avg_latency_ms INTEGER,
  total_tokens_used BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project, scenario, provider, model, date)
);

-- Enable Row Level Security
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_history ENABLE ROW LEVEL SECURITY;

-- Default policies (allow all - customize for your needs)
CREATE POLICY "Allow all access to runs" ON runs FOR ALL USING (true);
CREATE POLICY "Allow all access to case_results" ON case_results FOR ALL USING (true);
CREATE POLICY "Allow all access to baselines" ON baselines FOR ALL USING (true);
CREATE POLICY "Allow all access to metrics_history" ON metrics_history FOR ALL USING (true);
```

**Migration 2: Indexes** (`002_indexes.sql`)
```sql
-- Runs table indexes
CREATE INDEX idx_runs_project ON runs(project);
CREATE INDEX idx_runs_scenario ON runs(scenario);
CREATE INDEX idx_runs_started_at ON runs(started_at DESC);
CREATE INDEX idx_runs_project_scenario ON runs(project, scenario);
CREATE INDEX idx_runs_success_rate ON runs(success_rate);
CREATE INDEX idx_runs_git_branch ON runs(git_branch);

-- Case results indexes
CREATE INDEX idx_case_results_run_id ON case_results(run_id);
CREATE INDEX idx_case_results_passed ON case_results(passed);
CREATE INDEX idx_case_results_tags ON case_results USING GIN(tags);

-- Metrics history indexes
CREATE INDEX idx_metrics_history_project_date ON metrics_history(project, date DESC);
CREATE INDEX idx_metrics_history_scenario ON metrics_history(scenario);

-- Full-text search
CREATE INDEX idx_runs_scenario_search ON runs USING GIN(to_tsvector('english', scenario));
```

### 3. Create Storage Bucket

In Supabase Dashboard > Storage:

1. Create a new bucket named `artemis-runs`
2. Set it to private (or public if you want public report access)

### 4. Configure ArtemisKit

**Environment variables (recommended for CI/CD):**
```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=your-anon-key
export SUPABASE_BUCKET=artemis-runs  # optional
```

**Config file:**
```yaml
# artemis.config.yaml
storage:
  type: supabase
  url: ${SUPABASE_URL}
  anonKey: ${SUPABASE_ANON_KEY}
  bucket: artemis-runs
```

## Usage

Once configured, ArtemisKit automatically uses Supabase storage. All CLI commands work the same way:

```bash
# Run tests - results saved to Supabase
artemiskit run scenarios/my-test.yaml

# View history - fetched from Supabase
artemiskit history --limit 20

# Compare runs
artemiskit compare ar-20260115-abc123 ar-20260116-def456
```

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `runs` | Run metadata (project, scenario, metrics, git info) |
| `case_results` | Individual test case results |
| `baselines` | Baseline runs for regression comparison |
| `metrics_history` | Aggregated daily metrics |

### Key Fields in `runs`

| Field | Type | Description |
|-------|------|-------------|
| `run_id` | TEXT | Unique run identifier (e.g., `ar-20260115-abc123`) |
| `project` | TEXT | Project name |
| `scenario` | TEXT | Scenario filename |
| `provider` | TEXT | LLM provider used |
| `model` | TEXT | Model used |
| `success_rate` | DECIMAL | Pass rate (0-1) |
| `total_cases` | INTEGER | Total test cases |
| `passed_cases` | INTEGER | Passed test cases |
| `failed_cases` | INTEGER | Failed test cases |
| `median_latency_ms` | INTEGER | Median response latency |
| `p95_latency_ms` | INTEGER | 95th percentile latency |
| `git_commit` | TEXT | Git commit hash |
| `git_branch` | TEXT | Git branch name |
| `manifest_path` | TEXT | Path to full manifest in storage |

## Programmatic Usage

```typescript
import { SupabaseStorageAdapter } from '@artemiskit/core';

const storage = new SupabaseStorageAdapter({
  url: process.env.SUPABASE_URL!,
  anonKey: process.env.SUPABASE_ANON_KEY!,
  bucket: 'artemis-runs',
});

// Save a manifest
const path = await storage.save(manifest);

// Load a manifest
const loaded = await storage.load('ar-20260115-abc123');

// List runs with filtering
const runs = await storage.list({
  project: 'my-project',
  scenario: 'auth-tests',
  limit: 10,
  offset: 0,
});

// Compare runs
const comparison = await storage.compare(
  'ar-20260115-abc123',
  'ar-20260116-def456'
);

// Delete a run
await storage.delete('ar-20260115-abc123');
```

## Custom Queries

Access the Supabase client directly for custom queries:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Get runs with low success rate
const { data } = await supabase
  .from('runs')
  .select('*')
  .lt('success_rate', 0.9)
  .order('started_at', { ascending: false });

// Get metrics trend for a scenario
const { data: metrics } = await supabase
  .from('metrics_history')
  .select('*')
  .eq('scenario', 'my-scenario')
  .order('date', { ascending: false })
  .limit(30);

// Get failed cases with tags
const { data: failures } = await supabase
  .from('case_results')
  .select('*, runs!inner(scenario)')
  .eq('passed', false)
  .contains('tags', ['critical']);
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/eval.yml
name: LLM Evaluation

on: [push, pull_request]

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
      
      - run: bun install
      
      - name: Run evaluations
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: |
          artemiskit run scenarios/ --project ${{ github.repository }}
```

## Troubleshooting

### Connection Error

```
Error: Failed to connect to Supabase
```

Verify your `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct.

### Permission Denied

```
Error: new row violates row-level security policy
```

Check that RLS policies are correctly configured. For development, you can use permissive policies:

```sql
CREATE POLICY "Allow all" ON runs FOR ALL USING (true);
```

### Storage Upload Failed

```
Error: Failed to upload manifest
```

Ensure the storage bucket exists and the anon key has permission to upload.

### Table Not Found

```
Error: relation "runs" does not exist
```

Run the database migrations to create the required tables.
