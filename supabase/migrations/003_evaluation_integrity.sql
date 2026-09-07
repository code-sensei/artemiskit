-- Evaluation-integrity fields for manifest v1.1+.
--
-- The JSON run manifest remains the complete, versioned evidence record. These
-- columns make the most important validity facts queryable in Supabase without
-- reclassifying historical run outcomes.

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS total_attempts INTEGER,
  ADD COLUMN IF NOT EXISTS valid_evaluations INTEGER,
  ADD COLUMN IF NOT EXISTS invalid_evaluations INTEGER,
  ADD COLUMN IF NOT EXISTS outcome_rate_denominator INTEGER;

-- Historical relational rows predate measurement status. Preserve their former
-- total-case denominator rather than inventing unavailable evaluator evidence.
UPDATE runs
SET
  total_attempts = COALESCE(total_attempts, total_cases),
  valid_evaluations = COALESCE(valid_evaluations, total_cases),
  invalid_evaluations = COALESCE(invalid_evaluations, 0),
  outcome_rate_denominator = COALESCE(outcome_rate_denominator, total_cases);

ALTER TABLE runs
  ALTER COLUMN total_attempts SET NOT NULL,
  ALTER COLUMN valid_evaluations SET NOT NULL,
  ALTER COLUMN invalid_evaluations SET NOT NULL,
  ALTER COLUMN outcome_rate_denominator SET NOT NULL,
  ALTER COLUMN total_attempts SET DEFAULT 0,
  ALTER COLUMN valid_evaluations SET DEFAULT 0,
  ALTER COLUMN invalid_evaluations SET DEFAULT 0,
  ALTER COLUMN outcome_rate_denominator SET DEFAULT 0;

ALTER TABLE runs
  DROP CONSTRAINT IF EXISTS runs_evaluation_counts_nonnegative,
  ADD CONSTRAINT runs_evaluation_counts_nonnegative CHECK (
    total_attempts >= 0
    AND valid_evaluations >= 0
    AND invalid_evaluations >= 0
    AND outcome_rate_denominator >= 0
  );

CREATE INDEX IF NOT EXISTS idx_runs_invalid_evaluations
  ON runs(invalid_evaluations)
  WHERE invalid_evaluations > 0;

-- Some early installations have the original `passed`-only case table while
-- newer ArtemisKit clients already write these columns. IF NOT EXISTS makes
-- this migration safe for both shapes.
ALTER TABLE case_results
  ADD COLUMN IF NOT EXISTS case_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS attempts INTEGER,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS response TEXT,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB;

UPDATE case_results
SET
  status = COALESCE(status, CASE WHEN passed THEN 'passed' ELSE 'failed' END),
  attempts = COALESCE(attempts, 1);

ALTER TABLE case_results
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN attempts SET NOT NULL,
  ALTER COLUMN attempts SET DEFAULT 1;

ALTER TABLE case_results
  DROP CONSTRAINT IF EXISTS case_results_measurement_status,
  ADD CONSTRAINT case_results_measurement_status
    CHECK (status IN ('passed', 'failed', 'invalid', 'error'));

ALTER TABLE case_results
  DROP CONSTRAINT IF EXISTS case_results_attempts_positive,
  ADD CONSTRAINT case_results_attempts_positive CHECK (attempts >= 1);

CREATE INDEX IF NOT EXISTS idx_case_results_status ON case_results(status);
