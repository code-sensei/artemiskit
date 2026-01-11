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
CREATE INDEX idx_case_results_passed ON case_results(passed);
CREATE INDEX idx_case_results_tags ON case_results USING GIN(tags);

-- Metrics history indexes
CREATE INDEX idx_metrics_history_project_date ON metrics_history(project, date DESC);
CREATE INDEX idx_metrics_history_scenario ON metrics_history(scenario);

-- Full-text search on scenario names (optional)
CREATE INDEX idx_runs_scenario_search ON runs USING GIN(to_tsvector('english', scenario));
