#!/usr/bin/env bash
#
# Exercise the evaluation-integrity migration against an isolated PostgreSQL
# container. This never connects to a configured Supabase project.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="artemiskit-integrity-migration-$$"
POSTGRES_IMAGE="${ARTEMISKIT_POSTGRES_IMAGE:-postgres:17.5-alpine}"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

require_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker must be running to execute the disposable migration test." >&2
    exit 1
  fi
}

psql_exec() {
  docker exec "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

assert_query() {
  local expected="$1"
  local query="$2"
  local actual
  actual="$(psql_exec -Atc "$query")"
  if [ "$actual" != "$expected" ]; then
    echo "Migration assertion failed." >&2
    echo "Expected: $expected" >&2
    echo "Actual:   $actual" >&2
    exit 1
  fi
}

require_docker

echo "Starting disposable PostgreSQL container..."
docker run --detach --rm --name "$CONTAINER_NAME" \
  --env POSTGRES_PASSWORD=artemiskit-test \
  "$POSTGRES_IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$CONTAINER_NAME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
  echo "Disposable PostgreSQL container did not become ready." >&2
  exit 1
fi

docker cp "$ROOT_DIR/supabase/migrations/001_initial_schema.sql" "$CONTAINER_NAME:/tmp/001.sql"
docker cp "$ROOT_DIR/supabase/migrations/002_indexes.sql" "$CONTAINER_NAME:/tmp/002.sql"
docker cp "$ROOT_DIR/supabase/migrations/003_evaluation_integrity.sql" "$CONTAINER_NAME:/tmp/003.sql"

echo "Applying legacy schema and representative legacy rows..."
psql_exec -f /tmp/001.sql >/dev/null
psql_exec -f /tmp/002.sql >/dev/null
psql_exec -c "
  INSERT INTO runs (
    run_id, project, scenario, provider, model, success_rate, total_cases,
    passed_cases, failed_cases, started_at, ended_at, manifest_path
  ) VALUES (
    'legacy-integrity-run', 'migration-test', 'legacy scenario', 'fixture', 'fixture-model',
    0.5, 2, 1, 1, NOW(), NOW(), 'runs/legacy-integrity-run.json'
  );
  INSERT INTO case_results (
    run_id, case_id, passed, score, matcher_type, latency_ms
  ) VALUES
    ('legacy-integrity-run', 'legacy-passed', TRUE, 1, 'contains', 1),
    ('legacy-integrity-run', 'legacy-failed', FALSE, 0, 'contains', 1);
" >/dev/null

echo "Applying evaluation-integrity migration..."
psql_exec -f /tmp/003.sql >/dev/null

assert_query "2|2|0|2" "
  SELECT total_attempts, valid_evaluations, invalid_evaluations, outcome_rate_denominator
  FROM runs WHERE run_id = 'legacy-integrity-run';
"
assert_query "legacy-failed|failed|1
legacy-passed|passed|1" "
  SELECT case_id, status, attempts FROM case_results
  WHERE run_id = 'legacy-integrity-run' ORDER BY case_id;
"
assert_query "idx_case_results_status|idx_runs_invalid_evaluations" "
  SELECT string_agg(indexname, '|' ORDER BY indexname)
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN ('idx_runs_invalid_evaluations', 'idx_case_results_status');
"

if psql_exec -c "UPDATE runs SET invalid_evaluations = -1 WHERE run_id = 'legacy-integrity-run';" >/dev/null 2>&1; then
  echo "Migration did not reject a negative integrity count." >&2
  exit 1
fi
if psql_exec -c "UPDATE case_results SET status = 'unavailable' WHERE case_id = 'legacy-passed';" >/dev/null 2>&1; then
  echo "Migration did not reject an unknown case status." >&2
  exit 1
fi

echo "✓ Evaluation-integrity migration passed on disposable PostgreSQL."
