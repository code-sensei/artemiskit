-- =============================================================================
-- ArtemisKit Supabase Analytics - Sample SQL Queries
-- =============================================================================
--
-- This file contains useful SQL queries for analyzing ArtemisKit data.
-- Run these in the Supabase SQL Editor or via any PostgreSQL client.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RUNS OVERVIEW
-- -----------------------------------------------------------------------------

-- Get recent runs with basic metrics
SELECT 
    run_id,
    scenario,
    model,
    success_rate,
    total_cases,
    passed_cases,
    failed_cases,
    median_latency_ms,
    started_at
FROM runs
WHERE project = 'my-project'
ORDER BY started_at DESC
LIMIT 20;

-- Get runs summary by scenario
SELECT 
    scenario,
    COUNT(*) as total_runs,
    AVG(success_rate) as avg_success_rate,
    AVG(median_latency_ms) as avg_latency,
    SUM(total_tokens) as total_tokens,
    MAX(started_at) as last_run
FROM runs
WHERE project = 'my-project'
GROUP BY scenario
ORDER BY total_runs DESC;

-- Get runs by model/provider comparison
SELECT 
    provider,
    model,
    COUNT(*) as total_runs,
    AVG(success_rate) as avg_success_rate,
    AVG(median_latency_ms) as avg_latency_ms,
    AVG(total_tokens::float / total_cases) as avg_tokens_per_case
FROM runs
WHERE project = 'my-project'
  AND started_at > NOW() - INTERVAL '30 days'
GROUP BY provider, model
ORDER BY avg_success_rate DESC;


-- -----------------------------------------------------------------------------
-- 2. CASE RESULTS ANALYSIS
-- -----------------------------------------------------------------------------

-- Get failed cases across all runs (debugging)
SELECT 
    cr.case_name,
    cr.reason,
    cr.error,
    cr.latency_ms,
    r.run_id,
    r.scenario,
    r.model,
    cr.created_at
FROM case_results cr
JOIN runs r ON cr.run_id = r.run_id
WHERE cr.status = 'failed'
  AND r.project = 'my-project'
ORDER BY cr.created_at DESC
LIMIT 50;

-- Find most commonly failing test cases
SELECT 
    case_id,
    case_name,
    COUNT(*) as failure_count,
    COUNT(*) FILTER (WHERE status = 'passed') as pass_count,
    COUNT(*) FILTER (WHERE status = 'failed') as fail_count,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'passed') / COUNT(*), 
        1
    ) as pass_rate
FROM case_results
WHERE run_id IN (
    SELECT run_id FROM runs WHERE project = 'my-project'
)
GROUP BY case_id, case_name
HAVING COUNT(*) > 5
ORDER BY pass_rate ASC
LIMIT 20;

-- Find flaky tests (pass rate between 10% and 90%)
SELECT 
    case_id,
    case_name,
    COUNT(*) as total_runs,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'passed') / COUNT(*), 
        1
    ) as pass_rate
FROM case_results
WHERE run_id IN (
    SELECT run_id FROM runs WHERE project = 'my-project'
)
GROUP BY case_id, case_name
HAVING 
    COUNT(*) >= 10 AND
    COUNT(*) FILTER (WHERE status = 'passed') > COUNT(*) * 0.1 AND
    COUNT(*) FILTER (WHERE status = 'passed') < COUNT(*) * 0.9
ORDER BY pass_rate ASC;

-- Analyze cases by tag
SELECT 
    unnest(tags) as tag,
    COUNT(*) as total_cases,
    COUNT(*) FILTER (WHERE status = 'passed') as passed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'passed') / COUNT(*), 
        1
    ) as pass_rate,
    AVG(latency_ms) as avg_latency
FROM case_results
WHERE run_id IN (
    SELECT run_id FROM runs WHERE project = 'my-project'
)
GROUP BY tag
ORDER BY total_cases DESC;

-- Slowest test cases (performance investigation)
SELECT 
    case_id,
    case_name,
    AVG(latency_ms) as avg_latency,
    MAX(latency_ms) as max_latency,
    MIN(latency_ms) as min_latency,
    STDDEV(latency_ms) as stddev_latency,
    COUNT(*) as run_count
FROM case_results
WHERE run_id IN (
    SELECT run_id FROM runs WHERE project = 'my-project'
)
GROUP BY case_id, case_name
HAVING COUNT(*) >= 5
ORDER BY avg_latency DESC
LIMIT 20;


-- -----------------------------------------------------------------------------
-- 3. BASELINE & REGRESSION QUERIES
-- -----------------------------------------------------------------------------

-- Get all baselines with metrics
SELECT 
    scenario,
    run_id,
    success_rate,
    median_latency_ms,
    total_tokens,
    tag,
    created_at,
    created_by
FROM baselines
WHERE project = 'my-project'
ORDER BY created_at DESC;

-- Compare latest run against baseline
WITH latest_run AS (
    SELECT *
    FROM runs
    WHERE project = 'my-project'
      AND scenario = 'customer-support-agent'
    ORDER BY started_at DESC
    LIMIT 1
),
baseline AS (
    SELECT *
    FROM baselines
    WHERE project = 'my-project'
      AND scenario = 'customer-support-agent'
)
SELECT 
    'Baseline' as type,
    b.run_id,
    b.success_rate,
    b.median_latency_ms,
    b.created_at as timestamp
FROM baseline b
UNION ALL
SELECT 
    'Latest' as type,
    r.run_id,
    r.success_rate,
    r.median_latency_ms,
    r.started_at as timestamp
FROM latest_run r;

-- Detect regressions (runs with >5% drop from baseline)
SELECT 
    r.run_id,
    r.scenario,
    r.success_rate as current_rate,
    b.success_rate as baseline_rate,
    r.success_rate - b.success_rate as delta,
    r.started_at,
    r.git_branch,
    r.git_commit
FROM runs r
JOIN baselines b ON r.project = b.project AND r.scenario = b.scenario
WHERE r.project = 'my-project'
  AND r.success_rate < b.success_rate - 0.05  -- 5% threshold
ORDER BY r.started_at DESC
LIMIT 20;


-- -----------------------------------------------------------------------------
-- 4. METRICS TRENDING
-- -----------------------------------------------------------------------------

-- 7-day success rate trend
SELECT 
    date,
    avg_success_rate,
    total_runs,
    total_cases,
    avg_latency_ms
FROM metrics_history
WHERE project = 'my-project'
  AND scenario IS NULL  -- Project-wide metrics
ORDER BY date DESC
LIMIT 7;

-- Weekly aggregation
SELECT 
    DATE_TRUNC('week', date) as week,
    AVG(avg_success_rate) as avg_success_rate,
    SUM(total_runs) as total_runs,
    SUM(total_cases) as total_cases,
    AVG(avg_latency_ms) as avg_latency_ms,
    SUM(total_tokens) as total_tokens
FROM metrics_history
WHERE project = 'my-project'
  AND date > NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('week', date)
ORDER BY week DESC;

-- Month-over-month comparison
WITH current_month AS (
    SELECT 
        AVG(avg_success_rate) as success_rate,
        AVG(avg_latency_ms) as latency,
        SUM(total_runs) as runs
    FROM metrics_history
    WHERE project = 'my-project'
      AND date >= DATE_TRUNC('month', NOW())
),
previous_month AS (
    SELECT 
        AVG(avg_success_rate) as success_rate,
        AVG(avg_latency_ms) as latency,
        SUM(total_runs) as runs
    FROM metrics_history
    WHERE project = 'my-project'
      AND date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      AND date < DATE_TRUNC('month', NOW())
)
SELECT 
    'Current Month' as period,
    ROUND(c.success_rate::numeric * 100, 1) as success_rate_pct,
    c.latency as avg_latency_ms,
    c.runs as total_runs,
    NULL as change_pct
FROM current_month c
UNION ALL
SELECT 
    'Previous Month' as period,
    ROUND(p.success_rate::numeric * 100, 1) as success_rate_pct,
    p.latency as avg_latency_ms,
    p.runs as total_runs,
    ROUND((c.success_rate - p.success_rate)::numeric * 100, 2) as change_pct
FROM previous_month p, current_month c;


-- -----------------------------------------------------------------------------
-- 5. COST & USAGE ANALYTICS
-- -----------------------------------------------------------------------------

-- Token usage by model (cost estimation)
SELECT 
    model,
    SUM(total_tokens) as total_tokens,
    SUM(total_cases) as total_cases,
    ROUND(SUM(total_tokens)::numeric / SUM(total_cases), 0) as avg_tokens_per_case,
    -- Rough cost estimate (adjust rates for your models)
    CASE 
        WHEN model LIKE 'gpt-4%' THEN ROUND(SUM(total_tokens)::numeric / 1000 * 0.03, 2)
        WHEN model LIKE 'gpt-3.5%' THEN ROUND(SUM(total_tokens)::numeric / 1000 * 0.002, 2)
        WHEN model LIKE 'claude%' THEN ROUND(SUM(total_tokens)::numeric / 1000 * 0.015, 2)
        ELSE NULL
    END as estimated_cost_usd
FROM runs
WHERE project = 'my-project'
  AND started_at > NOW() - INTERVAL '30 days'
GROUP BY model
ORDER BY total_tokens DESC;

-- Daily token usage trend
SELECT 
    DATE(started_at) as date,
    SUM(total_tokens) as total_tokens,
    COUNT(*) as total_runs,
    ROUND(SUM(total_tokens)::numeric / COUNT(*), 0) as avg_tokens_per_run
FROM runs
WHERE project = 'my-project'
  AND started_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(started_at)
ORDER BY date DESC;


-- -----------------------------------------------------------------------------
-- 6. GIT & CI/CD ANALYTICS
-- -----------------------------------------------------------------------------

-- Success rate by git branch
SELECT 
    git_branch,
    COUNT(*) as total_runs,
    ROUND(AVG(success_rate)::numeric * 100, 1) as avg_success_rate,
    MAX(started_at) as last_run
FROM runs
WHERE project = 'my-project'
  AND git_branch IS NOT NULL
  AND started_at > NOW() - INTERVAL '30 days'
GROUP BY git_branch
ORDER BY total_runs DESC
LIMIT 20;

-- Commits with regressions
SELECT 
    git_commit,
    git_branch,
    scenario,
    success_rate,
    started_at,
    run_by
FROM runs
WHERE project = 'my-project'
  AND success_rate < 0.85  -- Below threshold
  AND started_at > NOW() - INTERVAL '7 days'
ORDER BY started_at DESC;

-- Run frequency by day of week (for capacity planning)
SELECT 
    TO_CHAR(started_at, 'Day') as day_of_week,
    EXTRACT(DOW FROM started_at) as day_num,
    COUNT(*) as total_runs,
    AVG(success_rate) as avg_success_rate
FROM runs
WHERE project = 'my-project'
  AND started_at > NOW() - INTERVAL '30 days'
GROUP BY TO_CHAR(started_at, 'Day'), EXTRACT(DOW FROM started_at)
ORDER BY day_num;


-- -----------------------------------------------------------------------------
-- 7. ALERTING QUERIES
-- -----------------------------------------------------------------------------

-- Check for recent failures (for alerting)
SELECT EXISTS (
    SELECT 1
    FROM runs
    WHERE project = 'my-project'
      AND success_rate < 0.80  -- Critical threshold
      AND started_at > NOW() - INTERVAL '1 hour'
) as has_critical_failures;

-- Get runs needing attention
SELECT 
    run_id,
    scenario,
    success_rate,
    failed_cases,
    started_at,
    git_branch,
    run_by
FROM runs
WHERE project = 'my-project'
  AND (
    success_rate < 0.85 OR  -- Below success threshold
    failed_cases > 10       -- Many failures
  )
  AND started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;


-- -----------------------------------------------------------------------------
-- 8. CLEANUP QUERIES
-- -----------------------------------------------------------------------------

-- Find old runs to archive (runs older than 90 days)
SELECT 
    run_id,
    scenario,
    started_at,
    manifest_path
FROM runs
WHERE project = 'my-project'
  AND started_at < NOW() - INTERVAL '90 days'
ORDER BY started_at ASC
LIMIT 100;

-- Count records by table (for capacity planning)
SELECT 
    'runs' as table_name, 
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('runs')) as size
FROM runs
WHERE project = 'my-project'
UNION ALL
SELECT 
    'case_results' as table_name, 
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('case_results')) as size
FROM case_results cr
JOIN runs r ON cr.run_id = r.run_id
WHERE r.project = 'my-project'
UNION ALL
SELECT 
    'metrics_history' as table_name, 
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('metrics_history')) as size
FROM metrics_history
WHERE project = 'my-project';


-- =============================================================================
-- END OF SAMPLE QUERIES
-- =============================================================================
