# ADR-002 — PostgreSQL Migration and Test Database Policy

- **Status:** Accepted by Owner — implementation remains limited to approved CP-00 task contracts.
- **Date:** 2026-09-30
- **Depends on:** ADR-001

## Context

CLP uses PostgreSQL as its relational system of record. CP-00 requires clean database migration from zero, inspectable migration state, deterministic isolated test data, and no premature learning-domain schema. Local development/test uses Docker Compose. Schema changes must have migration, tests, and recovery/rollback consideration.

## Decision

### Database environments

- Docker Compose is the standard local development and integration-test topology. Application/database credentials are environment variables or local secrets, never committed.
- Development, test and production use separate databases/credentials. Tests never target a developer's shared development database or production-like credentials.
- Integration tests use an isolated disposable PostgreSQL database. Its name/connection is derived from test configuration, validated as non-production, and destroyed/reset only by the test harness.

### ORM and migrations

- Prisma is the proposed TypeScript ORM/migration tool, pinned in the future lockfile only after implementation starts. A different tool requires an ADR amendment or explicit Owner-approved task change.
- Schema definitions and migration files are versioned together. Applied migration files are immutable: never edit an already-applied migration to disguise a schema change.
- Migration history is append-only in normal operation. Forward corrective migrations are preferred over destructive down migrations.
- Every migration must be reviewed, run from an empty database in automated validation, and have recovery/rollback notes proportional to its risk.
- Raw parameterized SQL is permitted only inside infrastructure repositories for a measured ORM limitation or database-specific requirement; it must be tested and must not bypass module/application boundaries.

### CP-00 schema scope

Allowed CP-00 persistence is limited to foundation/identity/session/role/bootstrap/audit metadata required for the approved task contracts.

Forbidden until later checkpoints: course/unit/lesson, Chinese learning-item, exercise, learning-event, mastery, scheduling, reporting/analytics and AI-domain tables. Placeholder modules do not justify speculative tables.

### Transactions and consistency

- Application services define transaction boundaries; web controllers and domain entities do not own raw transaction control.
- Each identity/session/RBAC state change has an explicit atomicity requirement in its task contract.
- Future learning-event append and projection rebuild rules are documented now but no event-store implementation is added in CP-00.
- Isolation level/retry policy is selected per operation only when implementation evidence requires it; do not introduce global high isolation or retry loops by default.

### Test lifecycle and fixtures

- Unit tests do not require PostgreSQL where domain/application behavior can be verified in memory behind test doubles.
- Integration tests use real PostgreSQL to validate migrations, constraints, transaction behavior, session persistence and representative authorization routes.
- Test setup migrates an empty test database to current state; each test/worker gets deterministic data and cleanup that does not depend on test ordering.
- Factories/fixtures use synthetic identities and never contain real student data, secrets or production credentials.
- Seed data is distinct from fixtures. Non-production seed is deterministic. Production ADMIN bootstrap is a separate CP-00-11 task and must not recreate/overwrite an existing privileged account.

### Validation requirements after implementation begins

- migration status is inspectable;
- clean `zero → current` migration passes;
- test database lifecycle is deterministic;
- migration-related tests fail with non-zero exit code;
- CI (once selected) runs migration validation and integration tests without production secrets;
- backup/recovery notes are updated whenever a risky migration is proposed.

## Consequences

- Docker Compose gives repeatable local setup but requires a functioning container runtime; developers need documented preflight checks.
- Real PostgreSQL integration tests are slower than SQLite but protect against PostgreSQL-specific migration, constraint and transaction failures.
- Append-only migrations preserve auditability but require deliberate forward repair and recovery planning.
- CP-00 stays smaller by rejecting future learning-domain tables, even when adding them appears convenient.

## Alternatives considered

### SQLite as integration-test substitute

Rejected: it does not fully represent PostgreSQL SQL, constraint, migration or concurrency semantics required by this foundation.

### Shared development database for tests

Rejected: breaks isolation, determinism and safety.

### Down migrations as routine rollback mechanism

Rejected: database rollback with real data is not generally safe. Recovery plan and forward corrective migrations are the default; destructive actions need explicit approval.

### Schema-per-module/database-per-module

Deferred: the CP-00 modular monolith uses one PostgreSQL database and logical application boundaries. Separate databases require an ADR backed by scale/operational need.

## Open decisions

1. Exact Prisma version, migration command wrapper and test runner version after dependencies are pinned.
2. Production backup retention, restore objective and managed PostgreSQL provider after deployment target is selected.
3. Test parallelism/worker database naming after the test framework and CI provider are chosen.
4. Whether local development uses a persisted named Docker volume or explicit reset workflow; this must be documented before CLP-00-04.

## Non-goals

This ADR does not create Docker Compose, a Prisma schema, database migration, session table, seed script, test database, CI workflow or production database.

## Verification gate

Before Dev starts CLP-00-04/08, Năm/SOL must issue approved task contracts with exact file scope, selected package versions, environment variable names, cleanup commands, acceptance tests and recovery requirements.
