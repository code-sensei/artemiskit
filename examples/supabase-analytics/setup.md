# Supabase Setup for ArtemisKit Analytics

This guide walks you through setting up Supabase for ArtemisKit's advanced analytics features.

## Prerequisites

- A [Supabase](https://supabase.com) account (free tier works!)
- Supabase CLI installed (`npm install -g supabase`)
- ArtemisKit installed in your project

## Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose an organization and name your project (e.g., `artemiskit-analytics`)
4. Set a secure database password (save this!)
5. Select a region close to your CI/CD runners
6. Click "Create new project"

## Step 2: Get Your Credentials

After project creation:

1. Go to **Project Settings** → **API**
2. Copy:
   - **Project URL** (e.g., `https://xxxx.supabase.co`)
   - **anon public** key (safe for client-side use)
   - (Optional) **service_role** key for admin operations

## Step 3: Run Database Migrations

### Option A: Using Supabase CLI (Recommended)

```bash
# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
cd your-artemiskit-project
supabase db push
```

### Option B: Manual SQL Execution

Run these SQL scripts in the Supabase SQL Editor (Dashboard → SQL Editor):

#### Migration 1: Initial Schema

```sql
-- Artemis Database Schema
-- Run history and metrics storage

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

-- Case results table: stores individual test case results
CREATE TABLE case_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  case_name TEXT,

  -- Result
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error')),
  score DECIMAL(5, 4),
  matcher_type TEXT NOT NULL,
  reason TEXT,
  response TEXT,

  -- Performance
  latency_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,

  -- Error (if failed/error)
  error TEXT,

  -- Tags for filtering
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(run_id, case_id)
);

-- Baselines table: track baseline runs for comparison
CREATE TABLE baselines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  
  -- Captured metrics at baseline time
  success_rate DECIMAL(5, 4),
  median_latency_ms INTEGER,
  total_tokens INTEGER,
  passed_cases INTEGER,
  failed_cases INTEGER,
  total_cases INTEGER,
  
  -- Metadata
  tag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,

  UNIQUE(project, scenario)
);

-- Metrics history: aggregate metrics over time
CREATE TABLE metrics_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  project TEXT NOT NULL,
  scenario TEXT,

  -- Aggregated metrics (daily)
  total_runs INTEGER NOT NULL DEFAULT 0,
  total_cases INTEGER NOT NULL DEFAULT 0,
  passed_cases INTEGER NOT NULL DEFAULT 0,
  failed_cases INTEGER NOT NULL DEFAULT 0,
  
  -- Average metrics
  avg_success_rate DECIMAL(5, 4),
  avg_latency_ms INTEGER,
  avg_tokens_per_run INTEGER,
  
  -- Min/max for range visualization
  min_success_rate DECIMAL(5, 4),
  max_success_rate DECIMAL(5, 4),
  min_latency_ms INTEGER,
  max_latency_ms INTEGER,
  
  -- Totals
  total_tokens BIGINT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date, project, scenario)
);

-- Row Level Security (for future multi-tenant support)
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_history ENABLE ROW LEVEL SECURITY;

-- For now, allow all access (will add policies for auth later)
CREATE POLICY "Allow all access to runs" ON runs FOR ALL USING (true);
CREATE POLICY "Allow all access to case_results" ON case_results FOR ALL USING (true);
CREATE POLICY "Allow all access to baselines" ON baselines FOR ALL USING (true);
CREATE POLICY "Allow all access to metrics_history" ON metrics_history FOR ALL USING (true);
```

#### Migration 2: Indexes

```sql
-- Indexes for common queries

-- Runs table indexes
CREATE INDEX idx_runs_project ON runs(project);
CREATE INDEX idx_runs_scenario ON runs(scenario);
CREATE INDEX idx_runs_started_at ON runs(started_at DESC);
CREATE INDEX idx_runs_project_scenario ON runs(project, scenario);
CREATE INDEX idx_runs_success_rate ON runs(success_rate);
CREATE INDEX idx_runs_git_branch ON runs(git_branch);

-- Case results indexes
CREATE INDEX idx_case_results_run_id ON case_results(run_id);
CREATE INDEX idx_case_results_status ON case_results(status);
CREATE INDEX idx_case_results_tags ON case_results USING GIN(tags);
CREATE INDEX idx_case_results_latency ON case_results(latency_ms);

-- Baselines indexes
CREATE INDEX idx_baselines_project ON baselines(project);
CREATE INDEX idx_baselines_scenario ON baselines(scenario);

-- Metrics history indexes
CREATE INDEX idx_metrics_history_project_date ON metrics_history(project, date DESC);
CREATE INDEX idx_metrics_history_scenario ON metrics_history(scenario);
CREATE INDEX idx_metrics_history_date ON metrics_history(date DESC);

-- Full-text search on scenario names (optional)
CREATE INDEX idx_runs_scenario_search ON runs USING GIN(to_tsvector('english', scenario));
```

## Step 4: Create Storage Bucket

1. Go to **Storage** in Supabase Dashboard
2. Click "New bucket"
3. Name it `artemis-runs`
4. Set it to **Public** (or configure RLS policies for private access)
5. Click "Create bucket"

## Step 5: Configure ArtemisKit

Create or update `artemis.config.yaml`:

```yaml
# artemis.config.yaml
storage:
  type: supabase
  url: https://YOUR_PROJECT_REF.supabase.co
  anonKey: YOUR_ANON_KEY
  bucket: artemis-runs

# Or use environment variables
storage:
  type: supabase
  url: ${SUPABASE_URL}
  anonKey: ${SUPABASE_ANON_KEY}
  bucket: artemis-runs
```

Set environment variables:

```bash
# .env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 6: Verify Setup

Run a test to verify everything works:

```bash
# Run ArtemisKit with Supabase storage
bunx artemis run ./scenarios/my-scenario.yaml --storage supabase

# List runs to verify storage
bunx artemis list
```

## Troubleshooting

### "Permission denied" errors

Check RLS policies are set to allow access:

```sql
-- Verify policies exist
SELECT * FROM pg_policies WHERE tablename IN ('runs', 'case_results', 'baselines', 'metrics_history');
```

### "Table not found" errors

Ensure migrations ran successfully:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

### Storage bucket errors

Verify the bucket exists and is accessible:

```sql
-- List buckets
SELECT * FROM storage.buckets;
```

## Security Recommendations

For production use:

1. **Use service role key** only server-side (CI/CD)
2. **Configure RLS policies** for multi-tenant access
3. **Enable SSL** for all connections
4. **Set up backup** retention policies
5. **Monitor usage** via Supabase Dashboard

## Next Steps

- [Test Case Results →](./test-case-results.ts)
- [Baseline Management →](./test-baselines.ts)
- [Metrics Trending →](./test-metrics-trending.ts)
- [SQL Queries →](./sample-queries.sql)
