-- Migration: Add baselines table for regression comparison
-- Stores baseline runs for comparing against new runs

CREATE TABLE IF NOT EXISTS baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project TEXT NOT NULL,
  scenario TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  
  -- Captured metrics at baseline time
  success_rate REAL NOT NULL,
  median_latency_ms REAL NOT NULL,
  total_tokens INTEGER NOT NULL,
  passed_cases INTEGER NOT NULL,
  failed_cases INTEGER NOT NULL,
  total_cases INTEGER NOT NULL,
  
  -- Metadata
  tag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  
  -- Only one baseline per project+scenario combination
  UNIQUE(project, scenario)
);

-- Indexes for common queries
CREATE INDEX idx_baselines_project ON baselines(project);
CREATE INDEX idx_baselines_scenario ON baselines(scenario);
CREATE INDEX idx_baselines_run_id ON baselines(run_id);
CREATE INDEX idx_baselines_project_scenario ON baselines(project, scenario);

COMMENT ON TABLE baselines IS 'Baseline runs for regression comparison';
COMMENT ON COLUMN baselines.tag IS 'Optional tag/description for the baseline';
COMMENT ON COLUMN baselines.created_by IS 'User or system that created the baseline';
