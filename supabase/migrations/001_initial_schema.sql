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

  -- Result
  passed BOOLEAN NOT NULL,
  score DECIMAL(5, 4),
  matcher_type TEXT NOT NULL,

  -- Performance
  latency_ms INTEGER NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,

  -- Error (if failed)
  error_message TEXT,

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,

  UNIQUE(project, scenario)
);

-- Metrics history: aggregate metrics over time
CREATE TABLE metrics_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Aggregated metrics (daily)
  date DATE NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  avg_success_rate DECIMAL(5, 4),
  avg_latency_ms INTEGER,
  total_tokens_used BIGINT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(project, scenario, provider, model, date)
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
