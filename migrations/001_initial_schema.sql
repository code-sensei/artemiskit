-- Initial ArtemisKit schema (reference only - runs table already exists)
-- This migration documents the existing schema for reference

-- Note: If starting fresh, uncomment and run this migration first

/*
CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  success_rate REAL NOT NULL,
  total_cases INTEGER NOT NULL,
  passed_cases INTEGER NOT NULL,
  failed_cases INTEGER NOT NULL,
  median_latency_ms REAL NOT NULL,
  p95_latency_ms REAL NOT NULL,
  total_tokens INTEGER NOT NULL,
  git_commit TEXT,
  git_branch TEXT,
  git_dirty BOOLEAN,
  run_by TEXT,
  run_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  manifest_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_runs_project ON runs(project);
CREATE INDEX idx_runs_scenario ON runs(scenario);
CREATE INDEX idx_runs_started_at ON runs(started_at DESC);
*/
