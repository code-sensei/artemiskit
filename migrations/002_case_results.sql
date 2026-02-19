-- Migration: Add case_results table for individual test case results
-- This enables granular analytics on individual test cases

CREATE TABLE IF NOT EXISTS case_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  case_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error')),
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  matcher_type TEXT NOT NULL,
  reason TEXT,
  response TEXT NOT NULL,
  latency_ms REAL NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique case per run
  UNIQUE(run_id, case_id)
);

-- Indexes for common queries
CREATE INDEX idx_case_results_run_id ON case_results(run_id);
CREATE INDEX idx_case_results_case_id ON case_results(case_id);
CREATE INDEX idx_case_results_status ON case_results(status);
CREATE INDEX idx_case_results_created_at ON case_results(created_at DESC);
CREATE INDEX idx_case_results_tags ON case_results USING GIN(tags);

COMMENT ON TABLE case_results IS 'Individual test case results for granular analytics';
COMMENT ON COLUMN case_results.status IS 'Test status: passed, failed, or error';
COMMENT ON COLUMN case_results.score IS 'Score from 0.0 to 1.0';
COMMENT ON COLUMN case_results.matcher_type IS 'Type of matcher used (e.g., contains, json, semantic)';
