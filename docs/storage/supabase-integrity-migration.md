# Supabase evaluation-integrity migration validation

`003_evaluation_integrity.sql` upgrades the original relational schema with queryable integrity
counts and case-measurement status/evidence columns. It must be tested in a disposable database;
do not use this command as a substitute for reviewing a production migration plan.

## Local validation

Prerequisites:

- Docker running locally.
- The `postgres:17.5-alpine` image available locally, or network access for Docker to retrieve it.

Run:

```bash
bun run test:migration:integrity
```

The command starts a uniquely named temporary PostgreSQL container, applies migrations 001–003,
inserts representative pre-0.4 legacy rows before migration 003, and verifies:

- backfilled attempts, valid/invalid counts, and rate denominator;
- legacy `passed` values map to `passed`/`failed` statuses;
- integrity indexes exist;
- negative counts and unknown status values are rejected.

The container is removed on completion or failure. The command does not read project credentials,
connect to a Supabase project, or modify production data.
