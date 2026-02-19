-- Migration: Add metrics_history table for aggregated daily metrics
-- Enables trending and historical analysis

CREATE TABLE IF NOT EXISTS metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  project TEXT NOT NULL,
  scenario TEXT,
  
  -- Aggregated metrics
  total_runs INTEGER NOT NULL DEFAULT 0,
  total_cases INTEGER NOT NULL DEFAULT 0,
  passed_cases INTEGER NOT NULL DEFAULT 0,
  failed_cases INTEGER NOT NULL DEFAULT 0,
  
  -- Averaged metrics
  avg_success_rate REAL NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
  avg_tokens_per_run REAL NOT NULL DEFAULT 0,
  
  -- Min/Max for range analysis
  min_success_rate REAL,
  max_success_rate REAL,
  min_latency_ms REAL,
  max_latency_ms REAL,
  
  -- Totals
  total_tokens BIGINT NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One record per date+project+scenario combination
  UNIQUE(date, project, scenario)
);

-- Indexes for common queries
CREATE INDEX idx_metrics_history_date ON metrics_history(date DESC);
CREATE INDEX idx_metrics_history_project ON metrics_history(project);
CREATE INDEX idx_metrics_history_scenario ON metrics_history(scenario);
CREATE INDEX idx_metrics_history_date_project ON metrics_history(date, project);
CREATE INDEX idx_metrics_history_date_range ON metrics_history(date, project, scenario);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_metrics_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS metrics_history_updated_at ON metrics_history;
CREATE TRIGGER metrics_history_updated_at
  BEFORE UPDATE ON metrics_history
  FOR EACH ROW
  EXECUTE FUNCTION update_metrics_history_updated_at();

COMMENT ON TABLE metrics_history IS 'Aggregated daily metrics for trending and historical analysis';
COMMENT ON COLUMN metrics_history.scenario IS 'Optional scenario filter; NULL means project-wide aggregation';
COMMENT ON COLUMN metrics_history.avg_tokens_per_run IS 'Average tokens consumed per run';
